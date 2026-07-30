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
    const executionEntries = await ExchangeOrder.find({
        purpose: 'ENTRY',
        autoTradeId: { $ne: null },
        status: { $in: ['FILLED', 'PARTIAL'] },
    }).select('autoTradeId').lean();
    const ids = [...new Set(executionEntries.map((row) => String(row.autoTradeId)))];
    if (!ids.length) return {};

    const trades = await AutoTrade.find({
        _id: { $in: ids },
        status: 'CLOSED',
        executionMode: 'LIVE',
        pnlSource: { $in: officialSources },
    }).select('signalBreakdown.entrySetup cohort direction marketPnl marketPnlPercent markSimPnl markSimPnlPercent pnl pnlPercent closedAt').lean();

    const bySetup = {};
    for (const trade of trades) {
        const setup = trade.signalBreakdown?.entrySetup || 'UNKNOWN';
        const cohort = trade.cohort || 'CORE';
        const direction = trade.direction || 'LONG';
        const profileKey = `${setup}|${cohort}|${direction}`;
        const pct = marketPct(trade);
        if (pct == null) continue;
        if (!bySetup[profileKey]) bySetup[profileKey] = [];
        bySetup[profileKey].push({ pct, pnl: marketValue(trade), closedAt: trade.closedAt, setup, cohort, direction });
    }

    const minTrades = Math.max(1, getAutoDuckNumber('AUTODUCK_LIVE_READINESS_MIN_TRADES') || 60);
    const minWinRate = getAutoDuckNumber('AUTODUCK_LIVE_READINESS_MIN_WIN_RATE') || 55;
    const minProfitFactor = getAutoDuckNumber('AUTODUCK_LIVE_READINESS_MIN_PROFIT_FACTOR') || 1.25;
    return Object.fromEntries(Object.entries(bySetup).map(([profileKey, rows]) => {
        const { setup, cohort, direction } = rows[0];
        const wins = rows.filter((row) => row.pct > 0);
        const losses = rows.filter((row) => row.pct < 0);
        const grossProfit = wins.reduce((sum, row) => sum + row.pct, 0);
        const grossLoss = Math.abs(losses.reduce((sum, row) => sum + row.pct, 0));
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
        const pnl = rows.reduce((sum, row) => sum + row.pnl, 0);
        const winRate = rows.length ? wins.length / rows.length * 100 : 0;
        const ready = rows.length >= minTrades && winRate >= minWinRate && profitFactor >= minProfitFactor && pnl > 0;
        return [profileKey, {
            setup,
            cohort,
            direction,
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
    return Object.values(snapshot).find((row) => row.setup === setup) || {
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

export const resolveLossRiskState = (rows = []) => {
    let consecutiveLosses = 0;
    let lastPositiveAt = null;
    for (const row of rows) {
        const pnl = Number(row.pnl) || 0;
        if (pnl > 0) {
            lastPositiveAt = row.closedAt || null;
            break;
        }
        if (pnl < 0) consecutiveLosses += 1;
    }
    const configured = getAutoDuckNumber('AUTODUCK_LOSS_SIZE_MULTIPLIER');
    const lossMultiplier = Number.isFinite(configured) && configured > 0 && configured <= 1 ? configured : 0.5;
    return { consecutiveLosses, sizeMultiplier: consecutiveLosses >= 2 ? lossMultiplier : 1, lastPositiveAt };
};

export const evaluateLiveCircuitBreaker = (userOrder) => {
    const allocations = (userOrder?.tradeAllocations || [])
        .filter((row) => row?.executionMode === 'LIVE' && row?.closedAt)
        .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
    const dayStart = startOfIctDay();
    const dailyPnl = allocations
        .filter((row) => new Date(row.closedAt) >= dayStart)
        .reduce((sum, row) => sum + (Number(row.pnl) || 0), 0);
    const capital = Number(userOrder?.totalCapital) || Number(userOrder?.capital) || 0;
    const dailyLossLimitPct = Math.max(0, getAutoDuckNumber('AUTODUCK_LIVE_DAILY_LOSS_LIMIT_PCT') || 0);
    const risk = resolveLossRiskState(allocations);
    if (capital > 0 && dailyLossLimitPct > 0 && dailyPnl <= -(capital * dailyLossLimitPct / 100)) {
        return {
            blocked: true,
            code: 'DAILY_LOSS_LIMIT',
            reason: `Circuit breaker: PnL hôm nay ${Math.round(dailyPnl).toLocaleString('vi-VN')}đ chạm giới hạn -${dailyLossLimitPct}%`,
            until: new Date(dayStart.getTime() + 24 * 3600_000),
            dailyPnl,
            ...risk,
        };
    }
    return { blocked: false, until: null, dailyPnl, ...risk };
};

export const evaluateSetupSymbolCooldown = (userOrder, { setup, symbol, direction, now = new Date() } = {}) => {
    const rows = (userOrder?.tradeAllocations || [])
        .filter((row) => row?.executionMode === 'LIVE' && row?.closedAt
            && String(row.symbol || '').toUpperCase() === String(symbol || '').toUpperCase()
            && String(row.direction || '').toUpperCase() === String(direction || '').toUpperCase()
            && String(row.setup || '') === String(setup || ''))
        .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
    let losses = 0;
    for (const row of rows) {
        const pnl = Number(row.pnl) || 0;
        if (pnl > 0) break;
        if (pnl < 0) losses += 1;
        if (losses >= 2) break;
    }
    if (losses < 2 || !rows[0]?.closedAt) return { blocked: false, losses, until: null };
    const minutes = Math.max(0, getAutoDuckNumber('AUTODUCK_COMBO_LOSS_COOLDOWN_MINUTES') || 60);
    const until = new Date(new Date(rows[0].closedAt).getTime() + minutes * 60_000);
    return { blocked: until > now, losses, until, code: 'SETUP_SYMBOL_DIRECTION_COOLDOWN' };
};
