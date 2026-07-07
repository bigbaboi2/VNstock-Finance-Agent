import AutoTrade from '../../models/AutoTrade.js';
import ManualTrade from '../../models/ManualTrade.js';
import AiBehavior from '../../models/AiBehavior.js';

/** @returns {'win'|'loss'|'breakeven'} */
export const classifyOutcome = (pnlValue, pnlPercent = null) => {
    const pct = pnlPercent != null ? Number(pnlPercent) : Number(pnlValue);
    if (!Number.isFinite(pct)) return 'breakeven';
    if (pct > 0) return 'win';
    if (pct < 0) return 'loss';
    return 'breakeven';
};

/** Expectancy từ danh sách PnL (VND hoặc %). */
export const computeExpectancyStats = (items, { getPnl = (x) => x, unit = 'pct' } = {}) => {
    if (!items?.length) {
        return { winRate: 0, avgWin: 0, avgLoss: 0, expectancy: 0, unit, n: 0 };
    }
    const wins = items.filter((i) => getPnl(i) > 0);
    const losses = items.filter((i) => getPnl(i) < 0);
    const winRate = wins.length / items.length;
    const avgWin = wins.length ? wins.reduce((s, i) => s + getPnl(i), 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, i) => s + getPnl(i), 0) / losses.length : 0;
    const expectancy = winRate * avgWin + (1 - winRate) * avgLoss;
    const round = unit === 'vnd' ? (n) => Math.round(n) : (n) => Math.round(n * 100) / 100;
    return {
        n: items.length,
        winRate: Math.round(winRate * 1000) / 10,
        avgWin: round(avgWin),
        avgLoss: round(avgLoss),
        expectancy: round(expectancy),
        unit,
    };
};

const emptyStats = (source = 'AUTO') => ({
    source,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    breakEven: 0,
    winRate: '0%',
    avgWinPnl: 0,
    avgLossPnl: 0,
    totalPnlPct: 0,
    totalPnlAmount: 0,
    currency: source === 'MANUAL' ? 'USDT' : 'VND',
});

const computeBasicStats = (trades, {
    source = 'AUTO',
    getPnlPercent = (t) => t.pnlPercent,
    getPnlAmount = (t) => t.pnl,
} = {}) => {
    if (!trades.length) return { ...emptyStats(source), error: 'Không có lệnh đóng trong khoảng thời gian này.' };

    const wins = trades.filter(t => classifyOutcome(getPnlAmount(t), getPnlPercent(t)) === 'win');
    const losses = trades.filter(t => classifyOutcome(getPnlAmount(t), getPnlPercent(t)) === 'loss');
    const breakEven = trades.length - wins.length - losses.length;
    const winRate = Math.round((wins.length / trades.length) * 1000) / 10;

    return {
        source,
        totalTrades: trades.length,
        wins: wins.length,
        losses: losses.length,
        breakEven,
        winRate: `${winRate}%`,
        avgWinPnl: wins.length
            ? Math.round(wins.reduce((s, t) => s + getPnlPercent(t), 0) / wins.length * 100) / 100
            : 0,
        avgLossPnl: losses.length
            ? Math.round(losses.reduce((s, t) => s + getPnlPercent(t), 0) / losses.length * 100) / 100
            : 0,
        totalPnlPct: Math.round(trades.reduce((s, t) => s + getPnlPercent(t), 0) * 100) / 100,
        totalPnlAmount: Math.round(trades.reduce((s, t) => s + (Number(getPnlAmount(t)) || 0), 0) * 100) / 100,
        currency: source === 'MANUAL' ? 'USDT' : 'VND',
    };
};

export const mergeWinLossStats = (autoStats = {}, manualStats = {}) => {
    const a = autoStats.error ? emptyStats('AUTO') : autoStats;
    const m = manualStats.error ? emptyStats('MANUAL') : manualStats;
    const totalTrades = a.totalTrades + m.totalTrades;
    if (!totalTrades) return { ...emptyStats('COMBINED'), error: 'Không có lệnh đóng trong khoảng thời gian này.' };

    const wins = a.wins + m.wins;
    const losses = a.losses + m.losses;
    const breakEven = (a.breakEven || 0) + (m.breakEven || 0);
    const winRate = Math.round((wins / totalTrades) * 1000) / 10;

    return {
        source: 'COMBINED',
        totalTrades,
        wins,
        losses,
        breakEven,
        winRate: `${winRate}%`,
        autoTrades: a.totalTrades,
        manualTrades: m.totalTrades,
        autoWinRate: a.winRate,
        manualWinRate: m.winRate,
        autoPnlPct: a.totalPnlPct,
        manualPnlPct: m.totalPnlPct,
        autoPnlAmount: a.totalPnlAmount,
        manualPnlAmount: m.totalPnlAmount,
        currency: 'MIXED',
    };
};

export const summarizeAnalytics = (analytics) => {
    if (!analytics || analytics.error) return {};
    return {
        totalTrades: analytics.totalTrades,
        wins: analytics.wins,
        losses: analytics.losses,
        breakEven: analytics.breakEven || 0,
        winRate: analytics.winRate,
        avgWinPnl: analytics.avgWinPnl,
        avgLossPnl: analytics.avgLossPnl,
        totalPnlPct: analytics.totalPnlPct,
        totalPnlAmount: analytics.totalPnlAmount,
        currency: analytics.currency || 'VND',
        source: analytics.source,
    };
};

export const getTradeAnalytics = async ({ days = 30, assetType = null, executionMode = null } = {}) => {
    const since = new Date(Date.now() - days * 24 * 3600_000);
    const query = { closedAt: { $gte: since }, status: 'CLOSED' };
    if (assetType) query.assetType = assetType;
    if (executionMode === 'LIVE') query.executionMode = 'LIVE';
    else if (executionMode === 'SIMULATED') query.executionMode = { $ne: 'LIVE' };

    const trades = await AutoTrade.find(query).lean();
    if (!trades.length) return { error: 'Không có lệnh đóng trong khoảng thời gian này.', source: 'AUTO' };

    const basic = computeBasicStats(trades, { source: 'AUTO' });

    const byExitTag = trades.reduce((acc, t) => {
        const tag = t.exitTag
            || t.aiReportSnapshot?.match(/exitTag=([A-Z_]+)/)?.[1]
            || (classifyOutcome(t.pnl, t.pnlPercent) === 'win' ? 'TP_HIT' : 'SL_HIT');
        if (!acc[tag]) acc[tag] = { count: 0, wins: 0, totalPnl: 0 };
        acc[tag].count++;
        if (classifyOutcome(t.pnl, t.pnlPercent) === 'win') acc[tag].wins++;
        acc[tag].totalPnl += t.pnlPercent;
        return acc;
    }, {});

    const byScore = { lt65: { count: 0, wins: 0 }, s65_72: { count: 0, wins: 0 }, s72_80: { count: 0, wins: 0 }, gt80: { count: 0, wins: 0 } };
    for (const t of trades) {
        const s = t.aiScore || 0;
        const bucket = s < 65 ? 'lt65' : s < 72 ? 's65_72' : s < 80 ? 's72_80' : 'gt80';
        byScore[bucket].count++;
        if (classifyOutcome(t.pnl, t.pnlPercent) === 'win') byScore[bucket].wins++;
    }

    const aiLogs = await AiBehavior.find({ createdAt: { $gte: since } }).lean();
    const aiWins = aiLogs.filter(l => l.tags?.includes('WIN_SIGNAL'));
    const aiLosses = aiLogs.filter(l => l.tags?.includes('LOSS_SIGNAL'));

    const byHoldTime = trades.reduce((acc, t) => {
        const holdH = t.openedAt && t.closedAt
            ? (new Date(t.closedAt) - new Date(t.openedAt)) / 3600_000
            : 0;
        const bucket = holdH < 1 ? 'lt1h' : holdH < 6 ? '1h_6h' : holdH < 24 ? '6h_24h' : 'gt24h';
        if (!acc[bucket]) acc[bucket] = { count: 0, totalPnl: 0 };
        acc[bucket].count++;
        acc[bucket].totalPnl += t.pnlPercent;
        return acc;
    }, {});

    const byAsset = ['CRYPTO', 'VN_STOCK', 'DERIVATIVES'].map((asset) => {
        const subset = trades.filter(t => t.assetType === asset);
        if (!subset.length) return { asset, count: 0, winRate: 'N/A', totalPnlPct: 0 };
        const w = subset.filter(t => classifyOutcome(t.pnl, t.pnlPercent) === 'win').length;
        return {
            asset,
            count: subset.length,
            winRate: `${Math.round((w / subset.length) * 1000) / 10}%`,
            totalPnlPct: Math.round(subset.reduce((s, t) => s + t.pnlPercent, 0) * 100) / 100,
        };
    });

    return {
        ...basic,
        period: `${days} ngày gần nhất`,
        assetType: assetType || 'ALL',
        executionMode: executionMode || 'ALL',
        byExitTag: Object.entries(byExitTag).map(([tag, d]) => ({
            tag,
            count: d.count,
            winRate: `${Math.round((d.wins / d.count) * 1000) / 10}%`,
            avgPnl: Math.round(d.totalPnl / d.count * 100) / 100,
        })),
        byScoreBucket: Object.entries(byScore).map(([bucket, d]) => ({
            bucket,
            count: d.count,
            winRate: d.count > 0 ? `${Math.round((d.wins / d.count) * 1000) / 10}%` : 'N/A',
        })),
        byHoldTime: Object.entries(byHoldTime).map(([bucket, d]) => ({
            bucket,
            count: d.count,
            avgPnl: Math.round(d.totalPnl / d.count * 100) / 100,
        })),
        aiLearning: {
            totalLogs: aiLogs.length,
            wins: aiWins.length,
            losses: aiLosses.length,
        },
        byAsset,
        generatedAt: new Date().toISOString(),
    };
};

export const getManualTradeAnalytics = async ({ days = 30 } = {}) => {
    const since = new Date(Date.now() - days * 24 * 3600_000);
    const trades = await ManualTrade.find({ status: 'CLOSED', closedAt: { $gte: since } }).lean();
    return computeBasicStats(trades, {
        source: 'MANUAL',
        getPnlPercent: (t) => t.pnlPercent,
        getPnlAmount: (t) => t.realizedPnlUsdt,
    });
};

export const hasManualTradeHistory = async () => {
    const count = await ManualTrade.countDocuments({ status: 'CLOSED' });
    return count > 0;
};

export const getUnifiedTradeAnalytics = async ({ days = 30 } = {}) => {
    const [autoTotal, autoLive, autoSim, manual, hasManualEver] = await Promise.all([
        getTradeAnalytics({ days }),
        getTradeAnalytics({ days, executionMode: 'LIVE' }),
        getTradeAnalytics({ days, executionMode: 'SIMULATED' }),
        getManualTradeAnalytics({ days }),
        hasManualTradeHistory(),
    ]);

    const combined = hasManualEver
        ? mergeWinLossStats(autoTotal, manual)
        : (autoTotal.error ? mergeWinLossStats(emptyStats('AUTO'), emptyStats('MANUAL')) : { ...autoTotal, source: 'COMBINED', autoTrades: autoTotal.totalTrades, manualTrades: 0 });

    return {
        days,
        hasManualEver,
        combined,
        auto: {
            total: autoTotal,
            live: autoLive,
            sim: autoSim,
        },
        manual,
        generatedAt: new Date().toISOString(),
    };
};

const getVnDayStart = () => {
    const vnStart = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    vnStart.setHours(0, 0, 0, 0);
    return vnStart;
};

export const getTodayClosedTradesSummary = async () => {
    const vnStart = getVnDayStart();
    const [autoTrades, manualTrades, hasManualEver] = await Promise.all([
        AutoTrade.find({ status: 'CLOSED', closedAt: { $gte: vnStart } }).lean(),
        ManualTrade.find({ status: 'CLOSED', closedAt: { $gte: vnStart } }).lean(),
        hasManualTradeHistory(),
    ]);

    const summarizeAuto = (list) => computeBasicStats(list, { source: 'AUTO' });

    const live = summarizeAuto(autoTrades.filter(t => t.executionMode === 'LIVE'));
    const sim = summarizeAuto(autoTrades.filter(t => t.executionMode !== 'LIVE'));
    const auto = summarizeAuto(autoTrades);
    const manual = computeBasicStats(manualTrades, {
        source: 'MANUAL',
        getPnlPercent: (t) => t.pnlPercent,
        getPnlAmount: (t) => t.realizedPnlUsdt,
    });

    const combined = hasManualEver
        ? mergeWinLossStats(auto, manual)
        : (auto.error ? emptyStats('COMBINED') : { ...auto, source: 'COMBINED', autoTrades: auto.totalTrades, manualTrades: 0 });

    return {
        hasManualEver,
        combined: summarizeAnalytics(combined),
        auto: summarizeAnalytics(auto),
        manual: summarizeAnalytics(manual),
        live: summarizeAnalytics(live),
        sim: summarizeAnalytics(sim),
        trades: autoTrades,
        manualTrades,
    };
};
