import AutoTrade from '../../models/AutoTrade.js';
import ExchangeOrder from '../../models/ExchangeOrder.js';
import { getAutoDuckNumber } from './autoDuckConfigService.js';

const officialSources = ['LIVE_FILLS', 'LIVE_FILLS_NET_FEE'];

const startOfIctDay = () => {
    const now = new Date();
    const ict = new Date(now.getTime() + 7 * 3600_000);
    return new Date(Date.UTC(ict.getUTCFullYear(), ict.getUTCMonth(), ict.getUTCDate()) - 7 * 3600_000);
};

const marketPct = (trade) => {
    for (const value of [trade.marketPnlPercent, trade.markSimPnlPercent, trade.pnlPercent]) {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
    }
    return null;
};

const marketValue = (trade) => {
    for (const value of [trade.marketPnl, trade.markSimPnl, trade.pnl]) {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
    }
    return 0;
};

export const getLiveReadinessSnapshot = async () => {
    const testnetEntries = await ExchangeOrder.find({
        purpose: 'ENTRY',
        environment: 'TESTNET',
        autoTradeId: { $ne: null },
        status: { $in: ['FILLED', 'PARTIAL'] },
    }).select('autoTradeId').lean();
    const ids = [...new Set(testnetEntries.map((row) => String(row.autoTradeId)))];
    if (!ids.length) return {};

    const trades = await AutoTrade.find({
        _id: { $in: ids },
        status: 'CLOSED',
        executionMode: 'LIVE',
        pnlSource: { $in: officialSources },
    }).select('signalBreakdown.entrySetup marketPnl marketPnlPercent markSimPnl markSimPnlPercent pnl pnlPercent closedAt').lean();

    const bySetup = {};
    for (const trade of trades) {
        const setup = trade.signalBreakdown?.entrySetup || 'UNKNOWN';
        const pct = marketPct(trade);
        if (pct == null) continue;
        if (!bySetup[setup]) bySetup[setup] = [];
        bySetup[setup].push({ pct, pnl: marketValue(trade), closedAt: trade.closedAt });
    }

    const minTrades = Math.max(1, getAutoDuckNumber('AUTODUCK_LIVE_READINESS_MIN_TRADES') || 60);
    const minWinRate = getAutoDuckNumber('AUTODUCK_LIVE_READINESS_MIN_WIN_RATE') || 55;
    const minProfitFactor = getAutoDuckNumber('AUTODUCK_LIVE_READINESS_MIN_PROFIT_FACTOR') || 1.25;
    return Object.fromEntries(Object.entries(bySetup).map(([setup, rows]) => {
        const wins = rows.filter((row) => row.pct > 0);
        const losses = rows.filter((row) => row.pct < 0);
        const grossProfit = wins.reduce((sum, row) => sum + row.pct, 0);
        const grossLoss = Math.abs(losses.reduce((sum, row) => sum + row.pct, 0));
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
        const pnl = rows.reduce((sum, row) => sum + row.pnl, 0);
        const winRate = rows.length ? wins.length / rows.length * 100 : 0;
        const ready = rows.length >= minTrades && winRate >= minWinRate && profitFactor >= minProfitFactor && pnl > 0;
        return [setup, {
            setup,
            ready,
            trades: rows.length,
            wins: wins.length,
            winRate: Math.round(winRate * 100) / 100,
            profitFactor: Number.isFinite(profitFactor) ? Math.round(profitFactor * 100) / 100 : null,
            pnl: Math.round(pnl),
            criteria: { minTrades, minWinRate, minProfitFactor, positivePnl: true },
        }];
    }));
};

export const getSetupReadiness = async (setup) => {
    const snapshot = await getLiveReadinessSnapshot();
    return snapshot[setup] || {
        setup,
        ready: false,
        trades: 0,
        wins: 0,
        winRate: 0,
        profitFactor: 0,
        pnl: 0,
        criteria: {
            minTrades: Math.max(1, getAutoDuckNumber('AUTODUCK_LIVE_READINESS_MIN_TRADES') || 60),
            minWinRate: getAutoDuckNumber('AUTODUCK_LIVE_READINESS_MIN_WIN_RATE') || 55,
            minProfitFactor: getAutoDuckNumber('AUTODUCK_LIVE_READINESS_MIN_PROFIT_FACTOR') || 1.25,
            positivePnl: true,
        },
    };
};

// Package circuit breaker
export const evaluateLiveCircuitBreaker = (userOrder) => {
    const allocations = (userOrder?.tradeAllocations || [])
        .filter((row) => row?.executionMode === 'LIVE' && row?.closedAt)
        .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
    const dayStart = startOfIctDay();
    const daily = allocations.filter((row) => new Date(row.closedAt) >= dayStart);
    const dailyPnl = daily.reduce((sum, row) => sum + (Number(row.pnl) || 0), 0);
    const capital = Number(userOrder?.totalCapital) || Number(userOrder?.capital) || 0;
    const dailyLossLimitPct = Math.max(0, getAutoDuckNumber('AUTODUCK_LIVE_DAILY_LOSS_LIMIT_PCT') || 0);
    const dailyLimit = capital * dailyLossLimitPct / 100;

    let consecutiveLosses = 0;
    for (const row of allocations) {
        if ((Number(row.pnl) || 0) < 0) consecutiveLosses += 1;
        else break;
    }
    const consecutiveLimit = Math.max(0, Math.floor(getAutoDuckNumber('AUTODUCK_LIVE_CONSECUTIVE_LOSS_LIMIT') || 0));
    const nextIctDay = new Date(dayStart.getTime() + 24 * 3600_000);

    if (dailyLossLimitPct > 0 && dailyPnl <= -dailyLimit) {
        return { blocked: true, code: 'DAILY_LOSS_LIMIT', reason: `Circuit breaker: PnL hôm nay ${Math.round(dailyPnl).toLocaleString('vi-VN')}đ chạm giới hạn -${dailyLossLimitPct}%`, until: nextIctDay, dailyPnl, consecutiveLosses };
    }
    if (consecutiveLimit > 0 && consecutiveLosses >= consecutiveLimit) {
        return { blocked: true, code: 'CONSECUTIVE_LOSSES', reason: `Circuit breaker: ${consecutiveLosses} lệnh LIVE thua liên tiếp (giới hạn ${consecutiveLimit})`, until: nextIctDay, dailyPnl, consecutiveLosses };
    }
    return { blocked: false, until: null, dailyPnl, consecutiveLosses };
};
