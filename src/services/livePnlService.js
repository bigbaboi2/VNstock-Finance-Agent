/** LIVE PnL from ExchangeOrder fills (net fee when feeUSDT > 0). */
import chalk from 'chalk';
import AutoTrade from '../../models/AutoTrade.js';
import ExchangeOrder from '../../models/ExchangeOrder.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const r8 = (n) => Math.round((Number(n) || 0) * 1e8) / 1e8;

const paleYellow = chalk.hex('#E8D48B');

const logMissingFeeOnce = (symbol) => {
    console.log(paleYellow(
        `[LIVE PnL] ${symbol}: feeUSDT=0 — PnL gross-only (LIVE_FILLS). Kiểm tra ExchangeOrder.feeUSDT.`
    ));
};

const resolveUsdVndRate = async () => {
    try {
        const { getUsdVndRate } = await import('./autoTradeEngine.js');
        return await getUsdVndRate();
    } catch {
        return 25400;
    }
};

/** @param {{ quietFeeWarn?: boolean }} [opts] */
export const computeLivePnlFromOrderList = (trade, orders, usdVndRate = 25400, opts = {}) => {
    const { quietFeeWarn = false } = opts;
    const isLong = trade.direction === 'LONG' || trade.direction === 'MUA';
    const entrySide = isLong ? 'BUY' : 'SELL';
    const exitSide = isLong ? 'SELL' : 'BUY';

    let entryQty = 0;
    let entryNotional = 0;
    let exitQty = 0;
    let exitNotional = 0;
    let feeUSDT = 0;

    for (const o of orders || []) {
        const qty = Number(o.filledQuantity) || 0;
        const px = Number(o.filledPrice) || 0;
        feeUSDT += Number(o.feeUSDT) || 0;
        if (qty <= 0 || px <= 0) continue;
        if (o.purpose === 'ENTRY' && o.side === entrySide) {
            entryQty += qty;
            entryNotional += qty * px;
        } else if (o.purpose === 'EXIT' && o.side === exitSide) {
            exitQty += qty;
            exitNotional += qty * px;
        }
    }

    if (entryQty <= 0 || entryNotional <= 0 || exitQty <= 0) {
        return {
            eligible: false,
            reason: 'NO_FILLS',
            entryQty,
            exitQty,
            entryNotional: r8(entryNotional),
            exitNotional: r8(exitNotional),
            feeUSDT: r8(feeUSDT),
        };
    }

    const avgEntry = entryNotional / entryQty;
    const avgExit = exitNotional / exitQty;
    // Cost basis cho phần đã bán (không so full entry notional khi mới chốt TP1)
    const costBasis = avgEntry * exitQty;
    const grossPnlUSDT = isLong
        ? exitNotional - costBasis
        : costBasis - exitNotional;
    const netPnlUSDT = grossPnlUSDT - feeUSDT;
    const pnlPercent = costBasis > 0 ? (netPnlUSDT / costBasis) * 100 : 0;

    if (!(feeUSDT > 0) && !quietFeeWarn) {
        logMissingFeeOnce(trade.symbol || trade._id);
    }

    const isVNStock = trade.assetType === 'VN_STOCK' || trade.marketType === 'VN_STOCK';
    const soldFraction = entryQty > 0 ? Math.min(1, exitQty / entryQty) : 0;
    const pnlVND = isVNStock
        ? Math.round((Number(trade.investedAmount) || Math.round(entryNotional * usdVndRate)) * soldFraction * (pnlPercent / 100))
        : Math.round(netPnlUSDT * usdVndRate);

    const remainingQty = Math.max(0, entryQty - exitQty);
    const fullyClosed = remainingQty <= entryQty * 1e-8 || remainingQty < 1e-8;

    return {
        eligible: true,
        reason: null,
        pnlPercent: Math.round(pnlPercent * 100) / 100,
        pnl: pnlVND,
        pnlVND,
        pnlUSDT: r8(netPnlUSDT),
        exitPrice: avgExit,
        entryPrice: avgEntry,
        source: feeUSDT > 0 ? 'LIVE_FILLS_NET_FEE' : 'LIVE_FILLS',
        feeUSDT: r8(feeUSDT),
        grossPnlUSDT: r8(grossPnlUSDT),
        entryQty,
        exitQty,
        remainingQty,
        fullyClosed,
        entryNotional: r8(entryNotional),
        exitNotional: r8(exitNotional),
        costBasis: r8(costBasis),
    };
};

export const computeLivePnlFromExchangeOrders = async (trade, usdVndRate = 25400, opts = {}) => {
    if (!trade?._id) return { eligible: false, reason: 'NO_TRADE' };
    if (trade.executionMode && trade.executionMode !== 'LIVE') {
        return { eligible: false, reason: 'NOT_LIVE' };
    }
    const orders = await ExchangeOrder.find({
        autoTradeId: trade._id,
        status: { $in: ['FILLED', 'PARTIAL'] },
    }).lean();
    return computeLivePnlFromOrderList(trade, orders, usdVndRate, opts);
};

/** Lượng còn lại cần bán: entryFilled − Σ exitFilled */
export const getLiveExitRemainingQty = async (tradeId, { isLong = true } = {}) => {
    const entrySide = isLong ? 'BUY' : 'SELL';
    const exitSide = isLong ? 'SELL' : 'BUY';
    const orders = await ExchangeOrder.find({
        autoTradeId: tradeId,
        status: { $in: ['FILLED', 'PARTIAL'] },
        purpose: { $in: ['ENTRY', 'EXIT'] },
    }).lean();

    let entryQty = 0;
    let exitQty = 0;
    for (const o of orders) {
        const qty = Number(o.filledQuantity) || 0;
        if (qty <= 0) continue;
        if (o.purpose === 'ENTRY' && o.side === entrySide) entryQty += qty;
        if (o.purpose === 'EXIT' && o.side === exitSide) exitQty += qty;
    }
    return {
        entryQty,
        exitQty,
        remainingQty: Math.max(0, entryQty - exitQty),
    };
};

/**
 * Tổng PnL LIVE official.
 * @param {{ username?: string|null, tradeIds?: Array|null }} opts
 *   - username: giới hạn theo ExchangeOrder của user (all-time trên broker)
 *   - tradeIds: giới hạn theo danh sách AutoTrade id (vd. gói UserOrder còn tồn tại)
 */
export const sumLiveRealizedPnl = async ({ username = null, tradeIds: tradeIdsFilter = null } = {}) => {
    const empty = {
        totalPnlUSDT: 0,
        totalPnlVND: 0,
        eligibleCount: 0,
        winCount: 0,
        winRate: 0,
        usdVndRate: await resolveUsdVndRate(),
        byTrade: [],
    };

    const usdVndRate = empty.usdVndRate;

    let tradeIds = tradeIdsFilter != null
        ? [...new Set((tradeIdsFilter || []).filter(Boolean).map(id => String(id)))]
        : null;

    if (tradeIds == null && username) {
        const orderTradeIds = await ExchangeOrder.distinct('autoTradeId', {
            username,
            autoTradeId: { $ne: null },
            status: { $in: ['FILLED', 'PARTIAL'] },
        });
        tradeIds = orderTradeIds.filter(Boolean).map(id => String(id));
    }

    if (tradeIds != null && tradeIds.length === 0) {
        return empty;
    }

    const tradeQuery = {
        status: 'CLOSED',
        executionMode: 'LIVE',
    };
    if (tradeIds) {
        tradeQuery._id = { $in: tradeIds };
    }

    const trades = await AutoTrade.find(tradeQuery).lean();
    let totalPnlUSDT = 0;
    let totalPnlVND = 0;
    let eligibleCount = 0;
    let winCount = 0;
    let missingFeeCount = 0;
    const byTrade = [];

    for (const t of trades) {
        // Ưu tiên đã persist pnlSource fill; vẫn recomputed để thống nhất
        const result = await computeLivePnlFromExchangeOrders(t, usdVndRate, { quietFeeWarn: true });
        if (!result.eligible) continue;
        eligibleCount += 1;
        if (!(Number(result.feeUSDT) > 0)) missingFeeCount += 1;
        if (result.pnlUSDT > 0) winCount += 1;
        totalPnlUSDT += result.pnlUSDT;
        totalPnlVND += result.pnlVND;
        byTrade.push({
            autoTradeId: String(t._id),
            symbol: t.symbol,
            pnlUSDT: result.pnlUSDT,
            pnlVND: result.pnlVND,
            pnlPercent: result.pnlPercent,
            source: result.source,
        });
    }

    if (missingFeeCount > 0) {
        console.log(paleYellow(
            `[LIVE PnL] ${missingFeeCount}/${eligibleCount} lệnh CLOSED thiếu feeUSDT → gross (LIVE_FILLS). `
            + `Backfill: node src/tools/backfillExchangeFees.js --apply`
        ));
    }

    return {
        totalPnlUSDT: r8(totalPnlUSDT),
        totalPnlVND: Math.round(totalPnlVND),
        eligibleCount,
        winCount,
        winRate: eligibleCount > 0 ? Math.round((winCount / eligibleCount) * 100) : 0,
        usdVndRate,
        byTrade,
        missingFeeCount,
    };
};

/**
 * Trade id thuộc các gói UserOrder LIVE còn tồn tại (chưa bị xóa).
 * Dùng để tách “PnL gói hiện tại” khỏi “PnL tổng từ đầu”.
 */
export const listCurrentPackageLiveTradeIds = async (username) => {
    const UserOrder = (await import('../../models/UserOrder.js')).default;
    const packages = await UserOrder.find({
        username,
        executionMode: 'LIVE',
    }).select('_id status allocationMode tradeAllocations totalCapital realizedPnl').lean();

    const tradeIds = [];
    for (const p of packages) {
        for (const a of p.tradeAllocations || []) {
            if (!a.trade) continue;
            if (a.matchStatus === 'UNMATCHED') continue;
            if (a.executionMode && a.executionMode !== 'LIVE') continue;
            tradeIds.push(String(a.trade));
        }
    }
    return {
        tradeIds: [...new Set(tradeIds)],
        packageCount: packages.length,
        packages: packages.map(p => ({
            id: String(p._id),
            status: p.status,
            allocationMode: p.allocationMode,
        })),
    };
};

/** Lọc summary all-time theo set trade id (tránh tính lại fill). */
export const filterLivePnlSummaryByTradeIds = (summary, tradeIds) => {
    const idSet = new Set((tradeIds || []).map(String));
    const byTrade = (summary?.byTrade || []).filter(t => idSet.has(String(t.autoTradeId)));
    let totalPnlUSDT = 0;
    let totalPnlVND = 0;
    let winCount = 0;
    for (const t of byTrade) {
        totalPnlUSDT += Number(t.pnlUSDT) || 0;
        totalPnlVND += Number(t.pnlVND) || 0;
        if ((Number(t.pnlUSDT) || 0) > 0) winCount += 1;
    }
    const eligibleCount = byTrade.length;
    return {
        totalPnlUSDT: r8(totalPnlUSDT),
        totalPnlVND: Math.round(totalPnlVND),
        eligibleCount,
        winCount,
        winRate: eligibleCount > 0 ? Math.round((winCount / eligibleCount) * 100) : 0,
        usdVndRate: summary?.usdVndRate,
        byTrade,
    };
};

/**
 * Map autoTradeId → official fill PnL (USDT) cho gắn order log.
 */
export const mapLivePnlByTradeIds = async (tradeIds, usdVndRate) => {
    const rate = usdVndRate || await resolveUsdVndRate();
    const ids = [...new Set((tradeIds || []).filter(Boolean).map(String))];
    const map = {};
    if (ids.length === 0) return map;

    const trades = await AutoTrade.find({
        _id: { $in: ids },
        executionMode: 'LIVE',
    }).lean();

    let missingFeeCount = 0;
    for (const t of trades) {
        const result = await computeLivePnlFromExchangeOrders(t, rate, { quietFeeWarn: true });
        if (!result.eligible) {
            map[String(t._id)] = {
                eligible: false,
                markSimPnl: t.markSimPnl ?? null,
                markSimPnlPercent: t.markSimPnlPercent ?? null,
            };
            continue;
        }
        if (!(Number(result.feeUSDT) > 0)) missingFeeCount += 1;
        map[String(t._id)] = {
            eligible: true,
            livePnlUSDT: result.pnlUSDT,
            livePnlVND: result.pnlVND,
            livePnlPercent: result.pnlPercent,
            source: result.source,
            fullyClosed: result.fullyClosed,
        };
    }
    if (missingFeeCount > 0) {
        console.log(paleYellow(
            `[LIVE PnL] map: ${missingFeeCount} trade thiếu feeUSDT (gross). `
            + `Backfill: node src/tools/backfillExchangeFees.js --apply`
        ));
    }
    return map;
};
