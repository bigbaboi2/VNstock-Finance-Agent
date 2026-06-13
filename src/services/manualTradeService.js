import axios from 'axios';
import chalk from 'chalk';
import ManualTrade from '../../models/ManualTrade.js';
import ExchangeConnection from '../../models/ExchangeConnection.js';
import {
    placeOrder,
    getOrderStatus,
    cancelOrder,
    getBalance,
    normalizeCryptoSymbol,
} from './exchangeBrokerService.js';
import { sendTelegramMessage } from './telegramService.js';

/**
 * MANUAL TRADE SERVICE — Lệnh /trade người dùng yêu cầu, khớp THẲNG ra sàn LIVE.
 * Tách biệt autoTradeEngine. Entry = LIMIT trên sàn; TP/SL = synthetic (monitor
 * gửi MARKET khi giá chạm). Hiện chỉ hỗ trợ CRYPTO SPOT LONG (BUY).
 *
 * Cú pháp:
 *   trade <mã> <long|short> <giá vào> <tp1,tp2,...> <sl> <số tiền $ | allbal> [option...]
 * Ví dụ:
 *   trade gmx long 5.552 5.609,5.715,6.115 5.273 100
 *   trade gmx long 5.552 5.609,5.715,6.115 5.273 tp1 allbal
 * Options:
 *   allbal     — vào hết số dư USDT (bỏ qua tham số số tiền)
 *   tp1/tp2/.. — sau khi đạt TP thứ n, dời SL về GIÁ VÀO (breakeven)
 */

let manualMonitorRunning = false;

const fetchSpotPrice = async (symbol) => {
    const res = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, { timeout: 8000 });
    return parseFloat(res.data.price);
};

/** Parse số: chấp nhận '.' là thập phân. Trả NaN nếu không hợp lệ. */
const parseNum = (s) => {
    const n = Number(String(s).trim());
    return Number.isFinite(n) ? n : NaN;
};

// ────────────────────────────────────────────────────────────────────
// PARSER
// ────────────────────────────────────────────────────────────────────
export const parseTradeCommand = (text = '') => {
    const cleaned = String(text).trim().replace(/^\/?trade\s+/i, '');
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (tokens.length < 5) {
        return { valid: false, error: 'Thiếu tham số. Cú pháp: /trade <mã> <long|short> <giá vào> <tp1,tp2,..> <sl> <số tiền|allbal> [option]' };
    }

    const [rawSymbol, rawSide, rawEntry, rawTpList, rawSl, ...rest] = tokens;

    // Side
    const sideLower = rawSide.toLowerCase();
    const isLong = ['long', 'buy', 'mua'].includes(sideLower);
    const isShort = ['short', 'sell', 'bán', 'ban'].includes(sideLower);
    if (!isLong && !isShort) {
        return { valid: false, error: `Hướng "${rawSide}" không hợp lệ. Dùng long/short.` };
    }

    // Prices
    const entryPrice = parseNum(rawEntry);
    const slPrice = parseNum(rawSl);
    const tpLevels = rawTpList.split(',').map(parseNum);
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) return { valid: false, error: `Giá vào "${rawEntry}" không hợp lệ.` };
    if (!Number.isFinite(slPrice) || slPrice <= 0) return { valid: false, error: `Giá SL "${rawSl}" không hợp lệ.` };
    if (tpLevels.some(t => !Number.isFinite(t) || t <= 0)) return { valid: false, error: `Danh sách TP "${rawTpList}" không hợp lệ (dùng dấu phẩy, không có khoảng trắng).` };

    // Options + amount + leverage
    let useAllBalance = false;
    let amountUSDT = 0;
    let moveSlAfterTp = 0;
    let leverage = 0;        // 0 = chưa chỉ định
    let forceFutures = false;
    const options = [];
    for (const tok of rest) {
        const t = tok.toLowerCase();
        if (t === 'allbal') { useAllBalance = true; options.push('allbal'); continue; }
        if (t === 'fut' || t === 'futures') { forceFutures = true; options.push('fut'); continue; }
        const levMatch = t.match(/^lev=?(\d+)$/);
        if (levMatch) {
            leverage = Number(levMatch[1]);
            if (leverage < 1 || leverage > 125) return { valid: false, error: `Đòn bẩy ${leverage}x không hợp lệ (1–125).` };
            options.push(`lev${leverage}`); continue;
        }
        const tpMatch = t.match(/^tp(\d+)$/);
        if (tpMatch) {
            const n = Number(tpMatch[1]);
            if (n < 1 || n > tpLevels.length) return { valid: false, error: `Option tp${n} không hợp lệ — chỉ có ${tpLevels.length} mức TP.` };
            moveSlAfterTp = n; options.push(t); continue;
        }
        const num = parseNum(String(tok).replace(/(usdt|usd|\$|u)$/i, '')); // chấp nhận 100, 100$, 100u
        if (Number.isFinite(num) && num > 0) { amountUSDT = num; continue; }
        return { valid: false, error: `Option "${tok}" không nhận dạng được.` };
    }

    if (!useAllBalance && amountUSDT <= 0) {
        return { valid: false, error: 'Thiếu số tiền (vốn ký quỹ). Nhập số USDT (vd: 100) hoặc dùng "allbal".' };
    }
    if (useAllBalance && amountUSDT > 0) {
        return { valid: false, error: 'Mâu thuẫn: dùng "allbal" thì không nhập số tiền.' };
    }

    // SHORT bắt buộc FUTURES; LONG dùng futures nếu có lev/fut, còn lại spot.
    const marketType = (isShort || forceFutures || leverage > 1) ? 'FUTURES' : 'SPOT';
    const effLeverage = marketType === 'FUTURES' ? (leverage > 0 ? leverage : 3) : 1; // futures mặc định 3x

    // Hợp lệ hướng giá
    if (isLong) {
        if (tpLevels.some(t => t <= entryPrice)) return { valid: false, error: 'Lệnh LONG: mọi TP phải > giá vào.' };
        if (slPrice >= entryPrice) return { valid: false, error: 'Lệnh LONG: SL phải < giá vào.' };
        tpLevels.sort((a, b) => a - b); // gần → xa
    } else {
        if (tpLevels.some(t => t >= entryPrice)) return { valid: false, error: 'Lệnh SHORT: mọi TP phải < giá vào.' };
        if (slPrice <= entryPrice) return { valid: false, error: 'Lệnh SHORT: SL phải > giá vào.' };
        tpLevels.sort((a, b) => b - a); // gần → xa (giảm dần)
    }

    return {
        valid: true,
        data: {
            symbolRaw: rawSymbol.toUpperCase(),
            direction: isLong ? 'LONG' : 'SHORT',
            side: isLong ? 'BUY' : 'SELL',         // side MỞ vị thế
            marketType, leverage: effLeverage, marginType: 'ISOLATED',
            entryPrice, tpLevels, slPrice,
            useAllBalance, amountUSDT, options, moveSlAfterTp,
        },
    };
};

// ────────────────────────────────────────────────────────────────────
// TẠO LỆNH
// ────────────────────────────────────────────────────────────────────
const resolveLiveConnection = async () => {
    const conns = await ExchangeConnection.find({ environment: 'LIVE', isActive: true });
    if (conns.length === 0) return { error: 'Không có kết nối sàn LIVE đang hoạt động. Hãy kết nối & test API key trước.' };
    if (conns.length > 1) return { error: `Có ${conns.length} kết nối LIVE active — tính năng tự chọn chỉ hỗ trợ 1. Hãy tắt bớt.` };
    return { conn: conns[0] };
};

export const createManualTrade = async ({ rawCommand, requestedBy = 'unknown' }) => {
    const parsed = parseTradeCommand(rawCommand);
    if (!parsed.valid) return { success: false, message: `❌ ${parsed.error}` };
    const d = parsed.data;
    const isFutures = d.marketType === 'FUTURES';

    const { conn, error: connErr } = await resolveLiveConnection();
    if (connErr) return { success: false, message: `❌ ${connErr}` };

    // SHORT chỉ chạy trên Binance Futures
    if (d.direction === 'SHORT' && String(conn.exchangeName).toUpperCase() !== 'BINANCE') {
        return { success: false, message: `❌ SHORT hiện chỉ hỗ trợ Binance Futures. Kết nối hiện tại: ${conn.exchangeName}.` };
    }

    const symbol = normalizeCryptoSymbol(d.symbolRaw);

    // Sanity giá vào vs giá thị trường (chống nhập sai định dạng số, vd 60.565 thay vì 60565)
    let curPrice;
    try {
        curPrice = await fetchSpotPrice(symbol);
    } catch (_) {
        return { success: false, message: `❌ Không lấy được giá ${symbol} từ sàn — kiểm tra lại mã.` };
    }
    const deviation = Math.abs(d.entryPrice - curPrice) / curPrice;
    if (deviation > 0.5) {
        return { success: false, message: `❌ Giá vào ${d.entryPrice} lệch ${(deviation * 100).toFixed(0)}% so với giá thị trường (${curPrice}). Kiểm tra định dạng số (dùng "." làm thập phân, vd BTC = 60565 không phải 60.565).` };
    }

    // Số vốn USDT (= ký quỹ với futures). Notional = vốn × đòn bẩy.
    let amountUSDT = d.amountUSDT;
    if (d.useAllBalance) {
        try {
            const balances = await getBalance(conn, d.marketType); // futures đọc ví futures
            amountUSDT = Math.floor((Number(balances.USDT) || 0) * 0.999 * 100) / 100;
        } catch (e) {
            return { success: false, message: `❌ Không đọc được số dư USDT (${d.marketType}): ${e.message}` };
        }
        if (amountUSDT <= 0) return { success: false, message: `❌ Số dư USDT (ví ${d.marketType}) trống — không thể dùng allbal.` };
    }

    const notionalUSDT = amountUSDT * d.leverage;
    const qty = notionalUSDT / d.entryPrice;

    const baseDoc = {
        requestedBy, rawCommand, exchangeConnectionId: conn._id, exchangeName: conn.exchangeName, environment: conn.environment,
        marketType: d.marketType, leverage: d.leverage, marginType: d.marginType,
        symbol, side: d.side, direction: d.direction,
        entryPrice: d.entryPrice, tpLevels: d.tpLevels, slPrice: d.slPrice, slOriginal: d.slPrice,
        useAllBalance: d.useAllBalance, amountUSDT, options: d.options, moveSlAfterTp: d.moveSlAfterTp,
    };

    // Đặt LIMIT mở vị thế tại giá vào (LONG=BUY, SHORT=SELL)
    const result = await placeOrder({
        connectionDoc: conn,
        symbol, side: d.side, qty,
        orderType: 'LIMIT', price: d.entryPrice,
        estimatedPrice: d.entryPrice, purpose: 'ENTRY',
        marketType: d.marketType, leverage: d.leverage, marginType: d.marginType,
    });

    if (!result.success) {
        await ManualTrade.create({ ...baseDoc, status: 'FAILED', errorMessage: String(result.reason || 'unknown') });
        return { success: false, message: `❌ Đặt lệnh thất bại: ${result.reason}` };
    }

    const filledNow = result.exchangeOrderDoc?.status === 'FILLED' || result.filledQuantity > 0;
    const doc = await ManualTrade.create({
        ...baseDoc,
        status: filledNow ? 'OPEN' : 'PENDING_ENTRY',
        entryOrderId: result.externalOrderId,
        filledQty: filledNow ? (result.filledQuantity || result.finalQty) : 0,
        filledPrice: filledNow ? (result.filledPrice || d.entryPrice) : 0,
        remainingQty: filledNow ? (result.filledQuantity || result.finalQty) : 0,
        filledAt: filledNow ? new Date() : null,
    });

    const tpStr = d.tpLevels.join(', ');
    const optStr = d.options.length ? ` | Options: ${d.options.join(', ')}` : '';
    const mkt = isFutures ? `FUTURES ${d.leverage}x ${d.marginType}` : 'SPOT';
    const msg = `${d.direction === 'LONG' ? '🟢' : '🔴'} [MANUAL ${conn.exchangeName} · ${mkt}] Đã đặt lệnh ${doc.status === 'OPEN' ? 'KHỚP' : 'CHỜ KHỚP'}\n`
        + `Người yêu cầu: @${requestedBy}\n`
        + `${d.direction} ${symbol} @ ${d.entryPrice}\n`
        + `Vốn ký quỹ: ${amountUSDT}$ | Notional: ${notionalUSDT.toFixed(2)}$ (${result.finalQty || qty.toFixed(6)})\n`
        + `TP: ${tpStr} | SL: ${d.slPrice}${optStr}\n`
        + `OrderID: ${result.externalOrderId}`;
    await sendTelegramMessage(msg, { parseMode: 'none' }).catch(() => {});
    console.log(chalk.bgMagenta.white(`  [MANUAL TRADE] @${requestedBy} ${d.direction} ${symbol} @ ${d.entryPrice} | ${mkt} | ký quỹ ${amountUSDT}$ | TP ${tpStr} | SL ${d.slPrice}`));

    return { success: true, message: msg, manualTradeId: doc._id };
};

// ────────────────────────────────────────────────────────────────────
// MONITOR — kiểm tra fill entry, TP scale-out, SL, dời SL breakeven
// ────────────────────────────────────────────────────────────────────
export const monitorManualTrades = async () => {
    if (manualMonitorRunning) return;
    manualMonitorRunning = true;
    try {
        const trades = await ManualTrade.find({ status: { $in: ['PENDING_ENTRY', 'OPEN'] } });
        for (const t of trades) {
            try {
                const conn = await ExchangeConnection.findById(t.exchangeConnectionId);
                if (!conn) continue;

                // 1) Chờ entry fill
                if (t.status === 'PENDING_ENTRY') {
                    const st = await getOrderStatus({ connectionDoc: conn, externalOrderId: t.entryOrderId, symbol: t.symbol }).catch(() => null);
                    if (st?.success && st.status === 'FILLED') {
                        t.status = 'OPEN';
                        t.filledQty = st.filledQty || t.filledQty;
                        t.filledPrice = st.filledPrice || t.entryPrice;
                        t.remainingQty = t.filledQty;
                        t.filledAt = new Date();
                        await t.save();
                        await sendTelegramMessage(`✅ [MANUAL] Entry KHỚP: ${t.symbol} @ ${t.filledPrice} (${t.filledQty})`, { parseMode: 'none' }).catch(() => {});
                    }
                    continue;
                }

                // 2) OPEN → quản lý TP/SL theo HƯỚNG
                const price = await fetchSpotPrice(t.symbol);
                if (!Number.isFinite(price) || t.remainingQty <= 0) continue;

                const isLong = t.direction === 'LONG';
                const exitSide = isLong ? 'SELL' : 'BUY';     // đóng vị thế
                const isFut = t.marketType === 'FUTURES';
                const hitSL = isLong ? price <= t.slPrice : price >= t.slPrice;

                // SL trước (ưu tiên bảo vệ vốn)
                if (hitSL) {
                    const ex = await placeOrder({
                        connectionDoc: conn, symbol: t.symbol, side: exitSide,
                        qty: t.remainingQty, orderType: 'MARKET', estimatedPrice: price, purpose: 'EXIT',
                        marketType: t.marketType, reduceOnly: isFut, leverage: t.leverage,
                    });
                    if (ex.success) {
                        recordExit(t, ex.filledPrice || price, ex.finalQty || t.remainingQty);
                        t.remainingQty = 0;
                        const trailed = isLong ? t.slPrice > t.slOriginal : t.slPrice < t.slOriginal;
                        await finalizeClose(t, trailed ? 'SL_TRAILED_HIT' : 'SL_HIT');
                    }
                    continue;
                }

                // TP scale-out
                const numTps = t.tpLevels.length;
                const qtyPerTp = t.filledQty / numTps;
                let changed = false;
                for (let i = 0; i < numTps; i++) {
                    const level = i + 1;
                    if (t.tpFills.some(f => f.level === level)) continue;        // đã chốt
                    const hitTP = isLong ? price >= t.tpLevels[i] : price <= t.tpLevels[i];
                    if (!hitTP) continue;                                        // chưa tới

                    const isLast = i === numTps - 1 || t.remainingQty <= qtyPerTp * 1.001;
                    const exitQty = isLast ? t.remainingQty : Math.min(qtyPerTp, t.remainingQty);
                    const ex = await placeOrder({
                        connectionDoc: conn, symbol: t.symbol, side: exitSide,
                        qty: exitQty, orderType: 'MARKET', estimatedPrice: price, purpose: 'EXIT',
                        marketType: t.marketType, reduceOnly: isFut, leverage: t.leverage,
                    });
                    if (!ex.success) {
                        console.log(chalk.yellow(`  [MANUAL TP${level}] ${t.symbol} đóng phần thất bại: ${ex.reason}`));
                        continue;
                    }
                    const fp = ex.filledPrice || price;
                    const fq = ex.finalQty || exitQty;
                    t.tpFills.push({ level, targetPrice: t.tpLevels[i], filledPrice: fp, qty: fq, orderId: ex.externalOrderId, at: new Date() });
                    recordExit(t, fp, fq);
                    t.remainingQty = Math.max(0, t.remainingQty - fq);
                    changed = true;

                    // Dời SL về breakeven sau TP cấu hình (đúng hướng)
                    const slBetter = isLong ? t.slPrice < t.filledPrice : t.slPrice > t.filledPrice;
                    if (t.moveSlAfterTp && level >= t.moveSlAfterTp && slBetter) {
                        t.slPrice = t.filledPrice;
                        await sendTelegramMessage(`🔧 [MANUAL] ${t.symbol}: đạt TP${level} → dời SL về giá vào ${t.filledPrice} (breakeven).`, { parseMode: 'none' }).catch(() => {});
                    }
                    await sendTelegramMessage(`🎯 [MANUAL] ${t.symbol} chốt TP${level} @ ${fp} (${fq}). Còn lại: ${t.remainingQty.toFixed(6)}`, { parseMode: 'none' }).catch(() => {});
                }

                if (t.remainingQty <= 0) {
                    await finalizeClose(t, 'ALL_TP_HIT');
                } else if (changed) {
                    await t.save();
                }
            } catch (errOne) {
                console.log(chalk.yellow(`[MANUAL MONITOR] Lỗi xử lý ${t.symbol}: ${errOne.message}`));
            }
        }
    } finally {
        manualMonitorRunning = false;
    }
};

const recordExit = (t, exitPrice, qty) => {
    const isLong = t.direction === 'LONG';
    const pnl = (isLong ? (exitPrice - t.filledPrice) : (t.filledPrice - exitPrice)) * qty;
    t.realizedPnlUsdt = (Number(t.realizedPnlUsdt) || 0) + pnl;
};

const finalizeClose = async (t, reason) => {
    t.status = 'CLOSED';
    t.closeReason = reason;
    t.closedAt = new Date();
    const cost = t.filledPrice * t.filledQty;
    t.pnlPercent = cost > 0 ? Math.round((t.realizedPnlUsdt / cost) * 10000) / 100 : 0;
    await t.save();
    const icon = t.realizedPnlUsdt >= 0 ? '🤑' : '🩸';
    await sendTelegramMessage(
        `${icon} [MANUAL CLOSE] ${t.symbol} đóng (${reason})\nPnL: ${t.realizedPnlUsdt >= 0 ? '+' : ''}${t.realizedPnlUsdt.toFixed(2)}$ (${t.pnlPercent}%)`,
        { parseMode: 'none' }
    ).catch(() => {});
    console.log(chalk.bgYellow.black(`  [MANUAL CLOSE] ${t.symbol} ${reason} | PnL ${t.realizedPnlUsdt.toFixed(2)}$`));
};

// ────────────────────────────────────────────────────────────────────
// ĐÓNG THỦ CÔNG
// ────────────────────────────────────────────────────────────────────
export const closeManualTrade = async (symbolOrId, requestedBy = 'unknown') => {
    const sym = normalizeCryptoSymbol(symbolOrId);
    const t = await ManualTrade.findOne({
        $or: [{ symbol: sym }, { _id: mongoose_isId(symbolOrId) }],
        status: { $in: ['PENDING_ENTRY', 'OPEN'] },
    }).sort({ openedAt: -1 });
    if (!t) return { success: false, message: `❌ Không có lệnh manual nào đang mở cho ${sym}.` };

    const conn = await ExchangeConnection.findById(t.exchangeConnectionId);
    if (!conn) return { success: false, message: '❌ Không tìm thấy kết nối sàn của lệnh.' };

    if (t.status === 'PENDING_ENTRY') {
        await cancelOrder({ connectionDoc: conn, externalOrderId: t.entryOrderId, symbol: t.symbol }).catch(() => {});
        t.status = 'CANCELLED';
        t.closeReason = `Huỷ bởi @${requestedBy} (chưa khớp)`;
        t.closedAt = new Date();
        await t.save();
        return { success: true, message: `🚫 [MANUAL] Đã huỷ lệnh chờ ${t.symbol}.` };
    }

    if (t.remainingQty > 0) {
        const price = await fetchSpotPrice(t.symbol).catch(() => t.entryPrice);
        const exitSide = t.direction === 'LONG' ? 'SELL' : 'BUY';
        const ex = await placeOrder({
            connectionDoc: conn, symbol: t.symbol, side: exitSide,
            qty: t.remainingQty, orderType: 'MARKET', estimatedPrice: price, purpose: 'EXIT',
            marketType: t.marketType, reduceOnly: t.marketType === 'FUTURES', leverage: t.leverage,
        });
        if (!ex.success) return { success: false, message: `❌ Đóng thất bại: ${ex.reason} — kiểm tra thủ công trên sàn!` };
        recordExit(t, ex.filledPrice || price, ex.finalQty || t.remainingQty);
        t.remainingQty = 0;
    }
    await finalizeClose(t, `Đóng tay bởi @${requestedBy}`);
    return { success: true, message: `✅ [MANUAL] Đã đóng ${t.symbol}. PnL: ${t.realizedPnlUsdt >= 0 ? '+' : ''}${t.realizedPnlUsdt.toFixed(2)}$` };
};

/** Helper an toàn: chỉ trả ObjectId hợp lệ, tránh CastError khi truyền symbol. */
const mongoose_isId = (v) => (/^[a-f\d]{24}$/i.test(String(v)) ? v : null);

/** Danh sách lệnh manual đang mở — cho lệnh /manual. */
export const listOpenManualTrades = async () => {
    return ManualTrade.find({ status: { $in: ['PENDING_ENTRY', 'OPEN'] } }).sort({ openedAt: -1 }).lean();
};
