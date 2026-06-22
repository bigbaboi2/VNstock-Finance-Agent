import chalk from 'chalk';
import AutoTrade from '../../models/AutoTrade.js';
import ExchangeConnection from '../../models/ExchangeConnection.js';
import ExchangeOrder from '../../models/ExchangeOrder.js';
import Setting from '../../models/Setting.js';
import { getAdapter } from './exchangeAdapters/index.js';
import { decrypt } from './encryptionService.js';
import { sendTelegramMessage } from './telegramService.js';

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
            `⚠️ <b>[BROKER] Test connection FAILED</b>\nUser: ${connectionDoc.username}\nSàn: ${connectionDoc.exchangeName} (${connectionDoc.environment})\nLỗi: ${result.message}`
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
    if (notionalUSDT > limits.maxOrderValueUSDT) {
        const doc = await logOrder({ status: 'FAILED', notionalUSDT, errorMessage: `Giá trị lệnh ~${notionalUSDT.toFixed(0)} USDT vượt ngưỡng an toàn ${limits.maxOrderValueUSDT} USDT.` });
        return { success: false, reason: 'MAX_ORDER_VALUE_EXCEEDED', exchangeOrderDoc: doc };
    }
    if (symbolInfo.minNotional && notionalUSDT < symbolInfo.minNotional) {
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
            `🔴 <b>[BROKER] Lệnh LIVE thất bại</b>\nUser: ${connectionDoc.username} | Sàn: ${connectionDoc.exchangeName} (${connectionDoc.environment})\n${side} ${finalQty} ${normalizedSymbol}\nLỗi: ${result.message}`
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

/** Lấy trạng thái lệnh từ sàn + đồng bộ vào ExchangeOrder log */
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
        if (trade.assetType !== 'CRYPTO') {
            return { success: false, message: 'Live execution hiện chỉ hỗ trợ CRYPTO.' };
        }
        const isLong = trade.direction === 'LONG' || trade.direction === 'MUA';

        const connectionDoc = await ExchangeConnection.findById(userOrder.exchangeConnectionId);
        if (!connectionDoc || connectionDoc.username !== userOrder.username) {
            return { success: false, message: 'Không tìm thấy kết nối sàn hợp lệ của user.' };
        }

        // SHORT auto: cần FUTURES + flag bật (MẶC ĐỊNH TẮT để an toàn — engine chưa có edge).
        let marketType = 'SPOT';
        let leverage = 1;
        let orderSide = 'BUY';
        if (!isLong) {
            const flag = await Setting.findOne({ key: 'autoFuturesShortEnabled' });
            const enabled = flag && (flag.value === true || flag.value === 'true' || flag.value === 1);
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

        // Tính qty từ vốn (VND) → USDT → coin. Notional giữ = vốn (đòn bẩy chỉ giảm ký quỹ).
        const effectiveCapital = Number(capitalVnd) > 0 ? Number(capitalVnd) : Number(userOrder.capital);
        const capitalUSDT = effectiveCapital / (usdVndRate || 25400);
        const qty = capitalUSDT / Number(trade.entryPrice);

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
            return { success: false, message: `Live entry thất bại: ${result.reason}` };
        }

        sendTelegramMessage(
            `${isLong ? '🟢' : '🔴'} <b>[LIVE ${connectionDoc.environment}${marketType === 'FUTURES' ? ' · FUTURES ' + leverage + 'x' : ''}] Đã vào lệnh thực</b>\nUser: ${userOrder.username} | Sàn: ${connectionDoc.exchangeName}\n${orderSide} ${result.finalQty} ${normalizeCryptoSymbol(trade.symbol)} @ ~${trade.entryPrice}\nOrderID: ${result.externalOrderId}`
        ).catch(() => {});

        return {
            success: true,
            message: `Lệnh LIVE đã gửi ra ${connectionDoc.exchangeName} (${connectionDoc.environment}). OrderID: ${result.externalOrderId}`,
            externalOrderId: result.externalOrderId,
            filledPrice: result.filledPrice,
            finalQty: result.finalQty,
            exchangeConnectionId: connectionDoc._id,
            marketType, leverage,
        };
    } catch (err) {
        console.log(chalk.red(`  [BROKER] executeLiveEntry lỗi: ${err.message}`));
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
            results.push(result);

            if (result.success) {
                sendTelegramMessage(
                    `🟡 <b>[LIVE ${connectionDoc.environment}] Đã đóng vị thế thực</b>\nUser: ${entry.username} | Sàn: ${entry.exchangeName}\n${exitSide} ${result.finalQty} ${entry.symbol}\nLý do: ${exitReason}`
                ).catch(() => {});
            }
        }
        const allOk = results.every(r => r.success);
        return { success: allOk, message: allOk ? 'Đã đóng toàn bộ vị thế live.' : 'Một số lệnh exit live thất bại — kiểm tra ExchangeOrder log.' };
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
            results.push(result);

            if (result.success) {
                sendTelegramMessage(
                    `🎯 <b>[LIVE ${connectionDoc.environment}] Chốt một phần (TP1)</b>\nUser: ${entry.username} | ${exitSide} ${result.finalQty} ${entry.symbol}\nLý do: ${exitReason}`
                ).catch(() => {});
            }
        }
        const allOk = results.length > 0 && results.every(r => r.success);
        return { success: allOk, message: allOk ? `Đã chốt ${Math.round(frac * 100)}% vị thế live.` : 'Một phần lệnh chốt TP1 thất bại — kiểm tra ExchangeOrder log.' };
    } catch (err) {
        console.log(chalk.red(`  [BROKER] executeLivePartialExit lỗi: ${err.message}`));
        return { success: false, message: err.message };
    }
};
