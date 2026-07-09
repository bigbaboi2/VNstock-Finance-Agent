import chalk from 'chalk';
import AutoTrade from '../../models/AutoTrade.js';
import ExchangeConnection from '../../models/ExchangeConnection.js';
import ExchangeOrder from '../../models/ExchangeOrder.js';
import Setting from '../../models/Setting.js';
import { getAdapter } from './exchangeAdapters/index.js';
import { decrypt } from './encryptionService.js';
import { sendTelegramMessage, escapeHtml } from './telegramService.js';
import { isSymbolTradableOnConnection } from './testnetSymbolGate.js';
import { appendAuditEvent } from './auditLogService.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const FILL_POLL_MS = Number(process.env.AUTODUCK_LIVE_FILL_POLL_MS) || 2000;
const FILL_POLL_TIMEOUT_MS = Number(process.env.AUTODUCK_LIVE_FILL_TIMEOUT_MS) || 25000;

/**
 * Tính PnL LIVE từ ExchangeOrder fills thực (ENTRY vs EXIT).
 * @returns {{ pnlPercent, pnl, exitPrice, entryPrice, source }|null}
 */
export const computeLivePnlFromExchangeOrders = async (trade, usdVndRate = 25400) => {
    const isLong = trade.direction === 'LONG' || trade.direction === 'MUA';
    const entrySide = isLong ? 'BUY' : 'SELL';
    const exitSide = isLong ? 'SELL' : 'BUY';

    const orders = await ExchangeOrder.find({
        autoTradeId: trade._id,
        status: { $in: ['FILLED', 'PARTIAL'] },
    }).lean();

    let entryQty = 0;
    let entryNotional = 0;
    let exitQty = 0;
    let exitNotional = 0;

    for (const o of orders) {
        const qty = Number(o.filledQuantity) || 0;
        const px = Number(o.filledPrice) || 0;
        if (qty <= 0 || px <= 0) continue;
        if (o.purpose === 'ENTRY' && o.side === entrySide) {
            entryQty += qty;
            entryNotional += qty * px;
        } else if (o.purpose === 'EXIT' && o.side === exitSide) {
            exitQty += qty;
            exitNotional += qty * px;
        }
    }

    if (entryQty <= 0 || entryNotional <= 0 || exitQty <= 0) return null;

    const avgEntry = entryNotional / entryQty;
    const avgExit = exitNotional / exitQty;
    
    // Sửa lỗi tính PnL cho lệnh SHORT
    const netPnlUSDT = isLong 
        ? exitNotional - entryNotional 
        : entryNotional - exitNotional;
        
    const pnlPercent = (netPnlUSDT / entryNotional) * 100;
    
    const isVNStock = trade.assetType === 'VN_STOCK' || trade.marketType === 'VN_STOCK';
    
    // AutoTrade.pnl luôn lưu bằng VNĐ trên toàn hệ thống để cộng dồn portfolio.
    const pnlValue = isVNStock 
        ? Math.round((Number(trade.investedAmount) || Math.round(entryNotional * usdVndRate)) * (pnlPercent / 100))
        : Math.round(netPnlUSDT * usdVndRate);

    return {
        pnlPercent: Math.round(pnlPercent * 100) / 100,
        pnl: pnlValue,
        exitPrice: avgExit,
        entryPrice: avgEntry,
        source: 'LIVE_FILLS'
    };
};

const confirmBrokerFill = async ({ connectionDoc, result, symbol }) => {
    if (!result?.success || !result.externalOrderId) return result;
    const fillResult = await waitForOrderFill({
        connectionDoc,
        externalOrderId: result.externalOrderId,
        symbol,
        initial: {
            status: result.exchangeOrderDoc?.status,
            filledPrice: result.filledPrice,
            filledQuantity: result.filledQuantity,
        },
    });
    return {
        ...result,
        filledPrice: fillResult.filledPrice || result.filledPrice,
        filledQuantity: fillResult.filledQuantity || result.filledQuantity,
        fillConfirmed: fillResult.fillConfirmed !== false,
    };
};

/**
 * EXCHANGE BROKER SERVICE — Business logic trung tâm cho live trading.
 * - Decrypt key CHỈ trong memory, ngay trước khi gọi sàn.
 * - Mọi lệnh live đều ghi ExchangeOrder log, kể cả FAILED.
 * - Safety guards: MAX_LIVE_ORDER_VALUE_USDT, MAX_LIVE_ORDERS_PER_USER.
 */

const getSafetyLimits = () => ({
    maxOrderValueUSDT: Number(process.env.MAX_LIVE_ORDER_VALUE_USDT) || 10000,
    maxLiveOrdersPerUser: Number(process.env.MAX_LIVE_ORDERS_PER_USER) || 5,
});

/** Decrypt credentials trong memory — không bao giờ return ra ngoài service này */
const getCredentials = (connectionDoc) => ({
    apiKey: decrypt(connectionDoc.apiKeyEncrypted),
    secret: decrypt(connectionDoc.secretEncrypted),
    passphrase: connectionDoc.passphraseEncrypted ? decrypt(connectionDoc.passphraseEncrypted) : null,
});

/** Chuẩn hóa symbol crypto: BTC → BTCUSDT, BTCUSDT giữ nguyên */
export const normalizeCryptoSymbol = (symbol) => {
    const s = String(symbol).toUpperCase().replace(/-/g, '');
    return s.endsWith('USDT') ? s : `${s}USDT`;
};

/** Làm tròn qty xuống theo stepSize của sàn */
const roundQtyToStep = (qty, stepSize) => {
    if (!stepSize || stepSize <= 0) return qty;
    const precision = Math.max(0, Math.round(-Math.log10(stepSize)));
    return Math.floor(qty / stepSize) * stepSize > 0
        ? +(Math.floor(qty / stepSize) * stepSize).toFixed(precision)
        : 0;
};

// ────────────────────────────────────────────────────────────────────
// PUBLIC API
// ────────────────────────────────────────────────────────────────────

/** Test kết nối + lấy balance, KHÔNG gửi lệnh. Cập nhật snapshot vào doc. */
export const testConnection = async (connectionDoc) => {
    const adapter = getAdapter(connectionDoc.exchangeName);
    const creds = getCredentials(connectionDoc);
    const result = await adapter.testConnection(creds.apiKey, creds.secret, creds.passphrase, connectionDoc.environment);

    connectionDoc.lastTestedAt = new Date();
    connectionDoc.lastTestStatus = result.success ? 'OK' : 'FAILED';
    connectionDoc.lastTestMessage = result.message || '';
    connectionDoc.lastTestLatencyMs = result.latencyMs ?? null;
    if (result.success) {
        connectionDoc.permissions = result.permissions;
        connectionDoc.balanceSnapshot = result.balances;
        connectionDoc.balanceUpdatedAt = new Date();
    }
    await connectionDoc.save();

    if (!result.success) {
        sendTelegramMessage(
            `⚠️ <b>[BROKER] Test connection FAILED</b>\nUser: ${escapeHtml(connectionDoc.username)}\nSàn: ${escapeHtml(connectionDoc.exchangeName)} (${escapeHtml(connectionDoc.environment)})\nLỗi: ${escapeHtml(result.message)}`,
            { parseMode: 'HTML' }
        ).catch(() => {});
    }
    return result;
};

/** Lấy balance realtime từ sàn (không dùng cache) */
export const getBalance = async (connectionDoc, marketType = 'SPOT') => {
    const adapter = getAdapter(connectionDoc.exchangeName, marketType);
    const creds = getCredentials(connectionDoc);
    const balances = await adapter.getBalance(creds.apiKey, creds.secret, creds.passphrase, connectionDoc.environment);
    connectionDoc.balanceSnapshot = balances;
    connectionDoc.balanceUpdatedAt = new Date();
    await connectionDoc.save();
    return balances;
};

/**
 * Validate + gửi lệnh ra sàn + ghi log.
 * @returns { success, externalOrderId?, filledPrice?, filledQuantity?, exchangeOrderDoc, reason? }
 */
export const placeOrder = async ({
    connectionDoc, symbol, side, qty, orderType = 'MARKET', price = null,
    estimatedPrice = 0, purpose = 'ENTRY', autoTradeId = null, userOrderId = null,
    marketType = 'SPOT', reduceOnly = false, leverage = null, marginType = 'ISOLATED',
}) => {
    const limits = getSafetyLimits();
    const normalizedSymbol = normalizeCryptoSymbol(symbol);
    const isFutures = String(marketType).toUpperCase() === 'FUTURES';

    const logOrder = async (fields) => {
        const doc = new ExchangeOrder({
            autoTradeId, userOrderId,
            exchangeConnectionId: connectionDoc._id,
            username: connectionDoc.username,
            exchangeName: connectionDoc.exchangeName,
            environment: connectionDoc.environment,
            symbol: normalizedSymbol,
            side, orderType, purpose,
            quantity: qty,
            price,
            marketType: isFutures ? 'FUTURES' : 'SPOT',
            leverage: leverage || 1,
            direction: isFutures 
                ? (purpose === 'ENTRY' ? (side === 'BUY' ? 'LONG' : 'SHORT') : (side === 'BUY' ? 'SHORT' : 'LONG')) 
                : (side === 'BUY' ? 'MUA' : 'BÁN'),
            ...fields,
        });
        await doc.save();
        return doc;
    };

    // ── VALIDATE ──
    if (!connectionDoc.isActive) {
        const doc = await logOrder({ status: 'FAILED', errorMessage: 'Kết nối đang bị tắt (isActive=false).' });
        return { success: false, reason: 'CONNECTION_INACTIVE', exchangeOrderDoc: doc };
    }
    if (!connectionDoc.permissions?.includes('TRADE')) {
        const doc = await logOrder({ status: 'FAILED', errorMessage: 'API key không có quyền TRADE.' });
        return { success: false, reason: 'NO_TRADE_PERMISSION', exchangeOrderDoc: doc };
    }
    if (connectionDoc.environment === 'LIVE') {
        console.log(chalk.bgRed.white(`  [LIVE ⚠️] Đang gửi lệnh THẬT ra ${connectionDoc.exchangeName} cho user ${connectionDoc.username}`));
    }

    const adapter = getAdapter(connectionDoc.exchangeName, marketType);
    const creds = getCredentials(connectionDoc);

    // ── FUTURES: đặt chế độ ký quỹ + đòn bẩy trước khi MỞ vị thế (bỏ qua khi đóng/reduceOnly) ──
    if (isFutures && !reduceOnly && typeof adapter.setLeverage === 'function') {
        await adapter.setMarginType?.(creds.apiKey, creds.secret, creds.passphrase, connectionDoc.environment, { symbol: normalizedSymbol, marginType }).catch(() => {});
        const levRes = await adapter.setLeverage(creds.apiKey, creds.secret, creds.passphrase, connectionDoc.environment, { symbol: normalizedSymbol, leverage: leverage || 1 });
        if (!levRes.success) {
            const doc = await logOrder({ status: 'FAILED', errorMessage: `Không đặt được đòn bẩy ${leverage}x: ${levRes.message}` });
            return { success: false, reason: 'LEVERAGE_FAILED', exchangeOrderDoc: doc };
        }
    }

    // ── Symbol info: tồn tại? min qty? step size? ──
    const symbolInfo = await adapter.getSymbolInfo(normalizedSymbol, connectionDoc.environment);
    if (!symbolInfo.exists) {
        const hint = connectionDoc.environment === 'TESTNET'
            ? ` (Lưu ý: Testnet ${connectionDoc.exchangeName} chỉ hỗ trợ một số cặp chính như BTC/ETH/BNB — nhiều altcoin không có. Tín hiệu này vẫn chạy mô phỏng để training AI.)`
            : '';
        const doc = await logOrder({ status: 'FAILED', errorMessage: `Symbol ${normalizedSymbol} không giao dịch được trên ${connectionDoc.exchangeName}.${hint}` });
        return { success: false, reason: 'INVALID_SYMBOL', exchangeOrderDoc: doc };
    }

    let finalQty = roundQtyToStep(qty, symbolInfo.stepSize);
    if (finalQty <= 0 || (symbolInfo.minQty && finalQty < symbolInfo.minQty)) {
        const doc = await logOrder({ status: 'FAILED', errorMessage: `Khối lượng ${qty} nhỏ hơn min qty (${symbolInfo.minQty}) của sàn.` });
        return { success: false, reason: 'QTY_TOO_SMALL', exchangeOrderDoc: doc };
    }

    // ── Safety guard: giá trị lệnh tối đa ──
    const refPrice = price || estimatedPrice || 0;
    const notionalUSDT = finalQty * refPrice;
    if (refPrice > 0 && notionalUSDT > limits.maxOrderValueUSDT) {
        const doc = await logOrder({ status: 'FAILED', notionalUSDT, errorMessage: `Giá trị lệnh ~${notionalUSDT.toFixed(0)} USDT vượt ngưỡng an toàn ${limits.maxOrderValueUSDT} USDT.` });
        return { success: false, reason: 'MAX_ORDER_VALUE_EXCEEDED', exchangeOrderDoc: doc };
    }
    if (refPrice > 0 && symbolInfo.minNotional && notionalUSDT < symbolInfo.minNotional) {
        const doc = await logOrder({ status: 'FAILED', notionalUSDT, errorMessage: `Giá trị lệnh ~${notionalUSDT.toFixed(2)} USDT nhỏ hơn min notional (${symbolInfo.minNotional}) của sàn.` });
        return { success: false, reason: 'MIN_NOTIONAL', exchangeOrderDoc: doc };
    }

    // ── Safety guard: số lệnh AutoTrade LIVE đang mở/user (chỉ check khi ENTRY) ──
    if (purpose === 'ENTRY' && autoTradeId) {
        const liveOpenCount = await AutoTrade.countDocuments({
            exchangeConnectionId: connectionDoc._id,
            executionMode: 'LIVE',
            status: { $in: ['OPEN', 'PENDING'] },
        });
        if (liveOpenCount >= limits.maxLiveOrdersPerUser) {
            const doc = await logOrder({ status: 'FAILED', errorMessage: `Đã chạm giới hạn số lệnh live (${limits.maxLiveOrdersPerUser}).` });
            return { success: false, reason: 'MAX_LIVE_ORDERS', exchangeOrderDoc: doc };
        }
    }

    // ── Balance check ──
    try {
        const balances = await adapter.getBalance(creds.apiKey, creds.secret, creds.passphrase, connectionDoc.environment);
        connectionDoc.balanceSnapshot = balances;
        connectionDoc.balanceUpdatedAt = new Date();
        await connectionDoc.save();

        if (isFutures) {
            // FUTURES: cả BUY/SELL mở vị thế đều dùng ký quỹ USDT = notional / đòn bẩy.
            // Lệnh đóng (reduceOnly) không cần ký quỹ thêm → bỏ qua check.
            if (!reduceOnly) {
                const usdtMargin = balances.USDT || 0;
                const requiredMargin = (notionalUSDT / Math.max(1, leverage || 1)) * 1.02; // buffer phí + funding
                if (usdtMargin < requiredMargin) {
                    const doc = await logOrder({ status: 'FAILED', notionalUSDT, errorMessage: `Ký quỹ Futures USDT (${usdtMargin.toFixed(2)}) không đủ — cần ~${requiredMargin.toFixed(2)} cho ${notionalUSDT.toFixed(2)} USDT @ ${leverage || 1}x.` });
                    return { success: false, reason: 'INSUFFICIENT_MARGIN', exchangeOrderDoc: doc };
                }
            }
        } else if (side === 'BUY') {
            const usdtBalance = balances.USDT || 0;
            if (usdtBalance < notionalUSDT * 1.001) { // buffer phí
                const doc = await logOrder({ status: 'FAILED', notionalUSDT, errorMessage: `Số dư USDT (${usdtBalance.toFixed(2)}) không đủ cho lệnh ~${notionalUSDT.toFixed(2)} USDT.` });
                return { success: false, reason: 'INSUFFICIENT_BALANCE', exchangeOrderDoc: doc };
            }
        } else {
            const baseAsset = normalizedSymbol.replace(/USDT$/, '');
            const baseBalance = balances[baseAsset] || 0;
            if (baseBalance < finalQty) {
                // bán tối đa số đang có (trường hợp phí ăn vào lượng coin đã mua)
                finalQty = roundQtyToStep(baseBalance, symbolInfo.stepSize);
                if (finalQty <= 0 || (symbolInfo.minQty && finalQty < symbolInfo.minQty)) {
                    const doc = await logOrder({ status: 'FAILED', errorMessage: `Số dư ${baseAsset} (${baseBalance}) không đủ để đóng vị thế.` });
                    return { success: false, reason: 'INSUFFICIENT_BALANCE', exchangeOrderDoc: doc };
                }
            }
        }
    } catch (balErr) {
        const doc = await logOrder({ status: 'FAILED', errorMessage: `Không lấy được balance: ${balErr.message}` });
        return { success: false, reason: 'BALANCE_CHECK_FAILED', exchangeOrderDoc: doc };
    }

    // ── GỬI LỆNH ──
    const result = await adapter.placeOrder(creds.apiKey, creds.secret, creds.passphrase, connectionDoc.environment, {
        symbol: normalizedSymbol, side, qty: finalQty, orderType, price, reduceOnly,
    });

    if (!result.success) {
        const doc = await logOrder({ status: 'FAILED', notionalUSDT, errorMessage: result.message, rawResponse: result.rawResponse });
        sendTelegramMessage(
            `🔴 <b>[BROKER] Lệnh LIVE thất bại</b>\nUser: ${escapeHtml(connectionDoc.username)} | Sàn: ${escapeHtml(connectionDoc.exchangeName)} (${escapeHtml(connectionDoc.environment)})\n${escapeHtml(side)} ${finalQty} ${escapeHtml(normalizedSymbol)}\nLỗi: ${escapeHtml(result.message)}`,
            { parseMode: 'HTML' }
        ).catch(() => {});
        return { success: false, reason: result.message, exchangeOrderDoc: doc };
    }

    const doc = await logOrder({
        externalOrderId: result.externalOrderId,
        status: result.status || 'PENDING',
        filledPrice: result.filledPrice,
        filledQuantity: result.filledQuantity || 0,
        notionalUSDT,
        filledAt: result.status === 'FILLED' ? new Date() : null,
        rawResponse: result.rawResponse,
    });

    console.log(chalk.bgGreen.black(
        `  [BROKER ${connectionDoc.environment}] ${side} ${finalQty} ${normalizedSymbol} → ${connectionDoc.exchangeName} | OrderID: ${result.externalOrderId} | Status: ${result.status}`
    ));

    return {
        success: true,
        externalOrderId: result.externalOrderId,
        filledPrice: result.filledPrice,
        filledQuantity: result.filledQuantity,
        finalQty,
        exchangeOrderDoc: doc,
    };
};

/** Hủy lệnh đang pending */
export const cancelOrder = async ({ connectionDoc, externalOrderId, symbol }) => {
    const adapter = getAdapter(connectionDoc.exchangeName);
    const creds = getCredentials(connectionDoc);
    const result = await adapter.cancelOrder(creds.apiKey, creds.secret, creds.passphrase, connectionDoc.environment, {
        externalOrderId, symbol: normalizeCryptoSymbol(symbol),
    });
    if (result.success) {
        await ExchangeOrder.updateOne({ externalOrderId }, { status: 'CANCELLED' });
    }
    return result;
};

/** Poll sàn cho đến khi lệnh FILLED/PARTIAL hoặc timeout. */
export const waitForOrderFill = async ({ connectionDoc, externalOrderId, symbol, initial = {} }) => {
    if (initial.status === 'FILLED' && initial.filledPrice) {
        return { ...initial, fillConfirmed: true };
    }

    const deadline = Date.now() + FILL_POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
        await sleep(FILL_POLL_MS);
        const status = await getOrderStatus({ connectionDoc, externalOrderId, symbol });
        if (!status.success) continue;
        appendAuditEvent('broker', {
            exchange: connectionDoc.exchangeName,
            environment: connectionDoc.environment,
            symbol: normalizeCryptoSymbol(symbol),
            externalOrderId,
            status: status.status,
            filledQty: status.filledQty || 0,
        }, {
            event: 'live_fill_poll',
            source: 'exchangeBrokerService',
        }).catch(() => {});

        if (status.status === 'FILLED' || status.status === 'PARTIAL') {
            const filledQty = status.filledQty || initial.filledQuantity || 0;
            if (filledQty > 0) {
                return {
                    ...initial,
                    status: status.status,
                    filledPrice: status.filledPrice || initial.filledPrice,
                    filledQuantity: filledQty,
                    fillConfirmed: true,
                };
            }
        }
        if (['CANCELED', 'REJECTED', 'EXPIRED', 'FAILED'].includes(status.status)) {
            return {
                success: false,
                fillConfirmed: false,
                message: `Lệnh ${status.status} trên sàn`,
            };
        }
    }

    return {
        ...initial,
        fillConfirmed: false,
        message: initial.message || `Chưa xác nhận fill sau ${FILL_POLL_TIMEOUT_MS / 1000}s`,
    };
};

export const getOrderStatus = async ({ connectionDoc, externalOrderId, symbol }) => {
    const adapter = getAdapter(connectionDoc.exchangeName);
    const creds = getCredentials(connectionDoc);
    const result = await adapter.getOrderStatus(creds.apiKey, creds.secret, creds.passphrase, connectionDoc.environment, {
        externalOrderId, symbol: normalizeCryptoSymbol(symbol),
    });
    if (result.success) {
        await ExchangeOrder.updateOne(
            { externalOrderId },
            {
                status: result.status,
                filledQuantity: result.filledQty,
                filledPrice: result.filledPrice,
                ...(result.status === 'FILLED' ? { filledAt: new Date() } : {}),
            }
        );
    }
    return result;
};

// ────────────────────────────────────────────────────────────────────
// LIVE EXECUTION HOOKS — autoTradeEngine gọi 2 hàm này
// ────────────────────────────────────────────────────────────────────

/**
 * Vào lệnh LIVE cho 1 UserOrder đã match với AutoTrade signal.
 * Chỉ hỗ trợ CRYPTO spot, hướng LONG/MUA (spot không SHORT được).
 * @returns { success, message, externalOrderId?, filledPrice?, finalQty? }
 */
export const executeLiveEntry = async ({ userOrder, trade, usdVndRate, capitalVnd = null }) => {
    try {
        const isLong = trade.direction === 'LONG' || trade.direction === 'MUA';

        const connectionDoc = await ExchangeConnection.findById(userOrder.exchangeConnectionId);
        if (!connectionDoc || connectionDoc.username !== userOrder.username) {
            return { success: false, message: 'Không tìm thấy kết nối sàn hợp lệ của user.' };
        }

        if (trade.assetType === 'VN_STOCK' && connectionDoc.exchangeName !== 'DNSE') {
            return { success: false, message: 'Live execution VN_STOCK hiện chỉ hỗ trợ sàn DNSE.' };
        } else if (trade.assetType !== 'CRYPTO' && trade.assetType !== 'VN_STOCK') {
            return { success: false, message: 'Live execution hiện chỉ hỗ trợ CRYPTO và VN_STOCK.' };
        }

        const direction = trade.direction === 'SHORT' || trade.direction === 'BÁN' ? 'SHORT' : 'LONG';
        if (connectionDoc.environment === 'TESTNET') {
            const symbolCheck = await isSymbolTradableOnConnection(connectionDoc, trade.symbol, direction);
            if (!symbolCheck.supported) {
                return {
                    success: false,
                    message: `[TESTNET GATE] ${symbolCheck.reason || 'Symbol không hỗ trợ trên testnet'}`,
                };
            }
        }

        // SHORT auto: cần FUTURES + flag bật (MẶC ĐỊNH TẮT để an toàn — engine chưa có edge).
        let marketType = 'SPOT';
        let leverage = 1;
        let orderSide = 'BUY';
        if (!isLong) {
            const flag = await Setting.findOne({ key: 'autoFuturesShortEnabled' });
            const envFallback = process.env.AUTODUCK_AUTO_FUTURES_SHORT_ENABLED === 'true';
            const enabled = Boolean(flag && (flag.value === true || flag.value === 'true' || flag.value === 1)) || envFallback;
            if (!enabled) {
                return { success: false, message: 'SHORT auto đang TẮT (autoFuturesShortEnabled=false) — theo dõi simulated.' };
            }
            if (String(connectionDoc.exchangeName).toUpperCase() !== 'BINANCE') {
                return { success: false, message: 'SHORT auto chỉ hỗ trợ Binance Futures.' };
            }
            marketType = 'FUTURES';
            leverage = Number(process.env.AUTO_FUTURES_LEVERAGE) || 3;
            orderSide = 'SELL';
        }

        // Giới hạn số lệnh LIVE đang mở của user (đếm trên AutoTrade gắn user)
        const limits = getSafetyLimits();
        const openLiveEntries = await ExchangeOrder.countDocuments({
            username: userOrder.username, purpose: 'ENTRY',
            status: { $in: ['PENDING', 'PARTIAL'] },
        });
        if (openLiveEntries >= limits.maxLiveOrdersPerUser) {
            return { success: false, message: `Đã chạm giới hạn ${limits.maxLiveOrdersPerUser} lệnh live đang chờ.` };
        }

        // Tính qty
        const effectiveCapital = Number(capitalVnd) > 0 ? Number(capitalVnd) : Number(userOrder.capital);
        let qty;
        if (trade.assetType === 'VN_STOCK') {
            // Cổ phiếu Việt Nam: vốn là VNĐ, mua theo lô 100
            const maxShares = effectiveCapital / Number(trade.entryPrice);
            qty = Math.floor(maxShares / 100) * 100;
            if (qty <= 0) {
                return { success: false, message: `Vốn ${effectiveCapital.toLocaleString()} VNĐ không đủ mua 1 lô (100) cổ phiếu giá ${trade.entryPrice}.` };
            }
        } else {
            // Crypto: vốn quy ra USDT
            const capitalUSDT = effectiveCapital / (usdVndRate || 25400);
            qty = capitalUSDT / Number(trade.entryPrice);
        }

        const result = await placeOrder({
            connectionDoc,
            symbol: trade.symbol,
            side: orderSide,
            qty,
            orderType: 'MARKET',
            estimatedPrice: Number(trade.entryPrice),
            purpose: 'ENTRY',
            autoTradeId: trade._id,
            userOrderId: userOrder._id,
            marketType, leverage,
        });

        if (!result.success) {
            appendAuditEvent('live_execution', {
                username: userOrder.username,
                symbol: trade.symbol,
                direction: trade.direction,
                exchangeConnectionId: String(userOrder.exchangeConnectionId || ''),
                reason: result.reason,
            }, {
                event: 'live_entry_place_failed',
                level: 'warn',
                source: 'exchangeBrokerService',
            }).catch(() => {});
            return { success: false, message: `Live entry thất bại: ${result.reason}` };
        }

        const fillResult = await waitForOrderFill({
            connectionDoc,
            externalOrderId: result.externalOrderId,
            symbol: trade.symbol,
            initial: {
                success: true,
                message: `Lệnh LIVE đã gửi ra ${connectionDoc.exchangeName} (${connectionDoc.environment}). OrderID: ${result.externalOrderId}`,
                externalOrderId: result.externalOrderId,
                filledPrice: result.filledPrice,
                filledQuantity: result.filledQuantity || result.finalQty,
                status: result.status,
            },
        });

        if (!fillResult.fillConfirmed) {
            appendAuditEvent('live_execution', {
                username: userOrder.username,
                symbol: trade.symbol,
                externalOrderId: result.externalOrderId,
                reason: fillResult.message,
            }, {
                event: 'live_entry_fill_unconfirmed',
                level: 'warn',
                source: 'exchangeBrokerService',
            }).catch(() => {});
            return {
                success: false,
                fillConfirmed: false,
                message: fillResult.message || 'Không xác nhận được fill từ sàn',
                externalOrderId: result.externalOrderId,
            };
        }

        sendTelegramMessage(
            `${isLong ? '🟢' : '🔴'} <b>[LIVE ${escapeHtml(connectionDoc.environment)}${marketType === 'FUTURES' ? ' · FUTURES ' + leverage + 'x' : ''}] Đã vào lệnh thực</b>\nUser: ${escapeHtml(userOrder.username)} | Sàn: ${escapeHtml(connectionDoc.exchangeName)}\n${escapeHtml(orderSide)} ${fillResult.filledQuantity || result.finalQty} ${escapeHtml(normalizeCryptoSymbol(trade.symbol))} @ ~${fillResult.filledPrice || trade.entryPrice}\nOrderID: ${escapeHtml(result.externalOrderId)}`,
            { parseMode: 'HTML' }
        ).catch(() => {});

        return {
            success: true,
            fillConfirmed: true,
            message: fillResult.message,
            externalOrderId: result.externalOrderId,
            filledPrice: fillResult.filledPrice,
            filledQuantity: fillResult.filledQuantity || result.finalQty,
            finalQty: fillResult.filledQuantity || result.finalQty,
            exchangeConnectionId: connectionDoc._id,
            marketType,
            leverage,
            environment: connectionDoc.environment,
        };
    } catch (err) {
        console.log(chalk.red(`  [BROKER] executeLiveEntry lỗi: ${err.message}`));
        appendAuditEvent('live_execution', {
            symbol: trade?.symbol,
            username: userOrder?.username,
            reason: err.message,
        }, {
            event: 'live_entry_exception',
            level: 'warn',
            source: 'exchangeBrokerService',
        }).catch(() => {});
        return { success: false, message: err.message };
    }
};

/**
 * Đóng vị thế LIVE khi engine đóng AutoTrade.
 * Bán toàn bộ lượng coin đã mua trong các ENTRY orders gắn với autoTradeId.
 */
export const executeLiveExit = async ({ trade, exitReason }) => {
    try {
        const isLong = trade.direction === 'LONG' || trade.direction === 'MUA';
        const isFut = trade.marketType === 'FUTURES' || !isLong; // short luôn futures
        const exitSide = isLong ? 'SELL' : 'BUY';                 // đóng vị thế = chiều ngược

        // Entry side: long mở bằng BUY, short mở bằng SELL.
        const entryOrders = await ExchangeOrder.find({
            autoTradeId: trade._id,
            purpose: 'ENTRY',
            side: isLong ? 'BUY' : 'SELL',
            status: { $in: ['FILLED', 'PARTIAL', 'PENDING'] },
        });
        if (entryOrders.length === 0) return { success: true, message: 'Không có lệnh live nào cần đóng.' };

        const results = [];
        const fills = [];
        for (const entry of entryOrders) {
            const connectionDoc = await ExchangeConnection.findById(entry.exchangeConnectionId);
            if (!connectionDoc) continue;

            // Sync trạng thái fill mới nhất trước khi exit
            if (entry.externalOrderId && entry.status !== 'FILLED') {
                await getOrderStatus({ connectionDoc, externalOrderId: entry.externalOrderId, symbol: entry.symbol }).catch(() => {});
            }
            const freshEntry = await ExchangeOrder.findById(entry._id);
            const qtyToClose = freshEntry.filledQuantity > 0 ? freshEntry.filledQuantity : freshEntry.quantity;
            if (qtyToClose <= 0) continue;

            const result = await placeOrder({
                connectionDoc,
                symbol: entry.symbol,
                side: exitSide,
                qty: qtyToClose,
                orderType: 'MARKET',
                estimatedPrice: Number(trade.exitPrice) || Number(trade.entryPrice),
                purpose: 'EXIT',
                autoTradeId: trade._id,
                userOrderId: entry.userOrderId,
                marketType: isFut ? 'FUTURES' : 'SPOT',
                reduceOnly: isFut,
                leverage: trade.leverage || 1,
            });
            const confirmed = await confirmBrokerFill({ connectionDoc, result, symbol: entry.symbol });
            results.push(confirmed);
            if (confirmed.success && confirmed.filledQuantity > 0) {
                fills.push({
                    filledPrice: confirmed.filledPrice,
                    filledQuantity: confirmed.filledQuantity,
                    side: exitSide,
                    purpose: 'EXIT',
                });
            }

            if (confirmed.success) {
                sendTelegramMessage(
                    `🟡 <b>[LIVE ${escapeHtml(connectionDoc.environment)}] Đã đóng vị thế thực</b>\nUser: ${escapeHtml(entry.username)} | Sàn: ${escapeHtml(entry.exchangeName)}\n${escapeHtml(exitSide)} ${result.finalQty} ${escapeHtml(entry.symbol)}\nLý do: ${escapeHtml(exitReason)}`,
                    { parseMode: 'HTML' }
                ).catch(() => {});
            }
        }
        const allOk = results.every(r => r.success);
        const exitNotional = fills.reduce((s, f) => s + (Number(f.filledPrice) || 0) * (Number(f.filledQuantity) || 0), 0);
        const exitQty = fills.reduce((s, f) => s + (Number(f.filledQuantity) || 0), 0);
        const avgExitPrice = exitQty > 0 ? exitNotional / exitQty : null;
        return {
            success: allOk,
            message: allOk ? 'Đã đóng toàn bộ vị thế live.' : 'Một số lệnh exit live thất bại — kiểm tra ExchangeOrder log.',
            fills,
            avgExitPrice,
            fillConfirmed: fills.length > 0,
        };
    } catch (err) {
        console.log(chalk.red(`  [BROKER] executeLiveExit lỗi: ${err.message}`));
        return { success: false, message: err.message };
    }
};

/**
 * Chốt MỘT PHẦN vị thế LIVE (Policy E — partial scale-out tại TP1).
 * Bán `fraction` × khối lượng đã khớp của các ENTRY orders gắn autoTradeId.
 * An toàn: spot dùng guard "bán tối đa số dư"; futures dùng reduceOnly (không lật vị thế).
 * Lưu ý: nếu phần bán < minQty/minNotional của sàn, lệnh sẽ FAILED → caller cảnh báo.
 */
export const executeLivePartialExit = async ({ trade, fraction, exitReason }) => {
    try {
        const frac = Number(fraction);
        if (!(frac > 0 && frac < 1)) return { success: false, message: `fraction không hợp lệ: ${fraction}` };

        const isLong = trade.direction === 'LONG' || trade.direction === 'MUA';
        const isFut = trade.marketType === 'FUTURES' || !isLong;
        const exitSide = isLong ? 'SELL' : 'BUY';

        const entryOrders = await ExchangeOrder.find({
            autoTradeId: trade._id,
            purpose: 'ENTRY',
            side: isLong ? 'BUY' : 'SELL',
            status: { $in: ['FILLED', 'PARTIAL', 'PENDING'] },
        });
        if (entryOrders.length === 0) return { success: true, message: 'Không có vị thế live để chốt một phần.' };

        const results = [];
        const fills = [];
        for (const entry of entryOrders) {
            const connectionDoc = await ExchangeConnection.findById(entry.exchangeConnectionId);
            if (!connectionDoc) continue;

            if (entry.externalOrderId && entry.status !== 'FILLED') {
                await getOrderStatus({ connectionDoc, externalOrderId: entry.externalOrderId, symbol: entry.symbol }).catch(() => {});
            }
            const freshEntry = await ExchangeOrder.findById(entry._id);
            const entryQty = freshEntry.filledQuantity > 0 ? freshEntry.filledQuantity : freshEntry.quantity;
            const partialQty = entryQty * frac;
            if (partialQty <= 0) continue;

            const result = await placeOrder({
                connectionDoc,
                symbol: entry.symbol,
                side: exitSide,
                qty: partialQty,
                orderType: 'MARKET',
                estimatedPrice: Number(trade.tp1FillPrice) || Number(trade.entryPrice),
                purpose: 'EXIT',
                autoTradeId: trade._id,
                userOrderId: entry.userOrderId,
                marketType: isFut ? 'FUTURES' : 'SPOT',
                reduceOnly: isFut,
                leverage: trade.leverage || 1,
            });
            const confirmed = await confirmBrokerFill({ connectionDoc, result, symbol: entry.symbol });
            results.push(confirmed);
            if (confirmed.success && confirmed.filledQuantity > 0) {
                fills.push({
                    filledPrice: confirmed.filledPrice,
                    filledQuantity: confirmed.filledQuantity,
                    side: exitSide,
                    purpose: 'EXIT',
                });
            }

            if (confirmed.success) {
                sendTelegramMessage(
                    `🎯 <b>[LIVE ${escapeHtml(connectionDoc.environment)}] Chốt một phần (TP1)</b>\nUser: ${escapeHtml(entry.username)} | ${escapeHtml(exitSide)} ${result.finalQty} ${escapeHtml(entry.symbol)}\nLý do: ${escapeHtml(exitReason)}`,
                    { parseMode: 'HTML' }
                ).catch(() => {});
            }
        }
        const allOk = results.length > 0 && results.every(r => r.success);
        const partialNotional = fills.reduce((s, f) => s + (Number(f.filledPrice) || 0) * (Number(f.filledQuantity) || 0), 0);
        const partialQty = fills.reduce((s, f) => s + (Number(f.filledQuantity) || 0), 0);
        const avgPartialPrice = partialQty > 0 ? partialNotional / partialQty : null;
        return {
            success: allOk,
            message: allOk ? `Đã chốt ${Math.round(frac * 100)}% vị thế live.` : 'Một phần lệnh chốt TP1 thất bại — kiểm tra ExchangeOrder log.',
            fills,
            avgPartialPrice,
            filledPrice: avgPartialPrice,
            filledQuantity: partialQty,
            fillConfirmed: partialQty > 0,
        };
    } catch (err) {
        console.log(chalk.red(`  [BROKER] executeLivePartialExit lỗi: ${err.message}`));
        return { success: false, message: err.message };
    }
};

/**
 * Bán toàn bộ số dư của một asset (khác USDT) sang USDT trên SPOT.
 * Dùng cho tính năng thanh lý thủ công trên UI.
 */
export const sellAssetToUSDT = async (connectionDoc, asset) => {
    try {
        if (!asset || String(asset).toUpperCase() === 'USDT') {
            return { success: false, message: 'Không thể thanh lý USDT.' };
        }
        const normalizedAsset = String(asset).toUpperCase();

        // 1. Lấy balance mới nhất
        const balances = await getBalance(connectionDoc, 'SPOT');
        const balance = balances[normalizedAsset] || 0;
        if (balance <= 0) {
            return { success: false, message: `Số dư ${normalizedAsset} đang bằng 0.` };
        }

        const symbol = `${normalizedAsset}USDT`;

        // 2. Gửi lệnh MARKET SELL toàn bộ lượng đang có
        // Hàm placeOrder đã xử lý: check minQty, check symbol exists, stepSize...
        const result = await placeOrder({
            connectionDoc,
            symbol,
            side: 'SELL',
            qty: balance,
            orderType: 'MARKET',
            purpose: 'MANUAL_LIQUIDATE',
            marketType: 'SPOT' // Luôn thanh lý spot balance
        });

        if (!result.success) {
            return { success: false, message: result.reason || 'Lệnh bán thất bại.' };
        }

        // Đợi confirm fill 
        const fillResult = await waitForOrderFill({
            connectionDoc,
            externalOrderId: result.externalOrderId,
            symbol,
            initial: { success: true }
        });

        // Lấy lại balance sau khi bán để UI cập nhật ngay
        await getBalance(connectionDoc, 'SPOT');

        if (fillResult.fillConfirmed) {
             return { success: true, message: `Đã bán thành công ${result.finalQty} ${normalizedAsset} sang USDT.` };
        } else {
             return { success: true, message: `Lệnh bán đã gửi nhưng chưa xác nhận khớp: ${fillResult.message}` };
        }
    } catch (err) {
        console.error(`[sellAssetToUSDT] lỗi:`, err);
        return { success: false, message: `Lỗi hệ thống: ${err.message}` };
    }
};
