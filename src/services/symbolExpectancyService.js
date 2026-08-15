/**
 * Per-symbol / per-setup expectancy from closed AutoTrades (runtime cache).
 * Feeds PriorityScore + adaptive eligibility — no new collections.
 */
import AutoTrade from '../../models/AutoTrade.js';
import { getAutoDuckNumber } from './autoDuckConfigService.js';
import { ENTRY_STRATEGY_VERSION, OFFICIAL_LIVE_PNL_SOURCE } from './autoTradeStrategyConstants.js';

const CACHE_TTL_MS = 10 * 60_000;
let cache = { loadedAt: 0, bySymbol: new Map(), bySetup: new Map(), bySymbolSetup: new Map() };
const degradedSetupKeys = new Set();

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const lookbackDays = () => getAutoDuckNumber('AUTODUCK_EXPECTANCY_LOOKBACK_DAYS') || 45;

const emptyBucket = () => ({ n: 0, wins: 0, totalPnlPct: 0, avgPnlPct: 0, winRate: 0.5, profitFactor: 0, expectancyR: 0 });

const finalize = (b) => {
    if (!b.n) return emptyBucket();
    return {
        n: b.n,
        wins: b.wins,
        totalPnlPct: Math.round(b.totalPnlPct * 100) / 100,
        avgPnlPct: Math.round((b.totalPnlPct / b.n) * 100) / 100,
        winRate: Math.round((b.wins / b.n) * 1000) / 1000,
        profitFactor: b.grossLoss > 0 ? Math.round((b.grossProfit / b.grossLoss) * 100) / 100 : (b.grossProfit > 0 ? Infinity : 0),
        expectancyR: b.riskSamples ? Math.round((b.totalR / b.riskSamples) * 1000) / 1000 : 0,
    };
};

export const refreshSymbolExpectancyCache = async ({ force = false } = {}) => {
    if (!force && cache.loadedAt && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
        return cache;
    }
    const since = new Date(Date.now() - lookbackDays() * 24 * 3600_000);
    const trades = await AutoTrade.find({
        status: 'CLOSED',
        closedAt: { $gte: since },
        executionMode: 'LIVE',
        strategyVersion: ENTRY_STRATEGY_VERSION,
        pnlSource: OFFICIAL_LIVE_PNL_SOURCE,
    })
        .select('symbol assetType pnlPercent entryPrice stopLossPrice setupType signalBreakdown.entrySetup')
        .lean();

    const bySymbol = new Map();
    const bySetup = new Map();
    const bySymbolSetup = new Map();

    const bump = (map, key, pnl, riskR) => {
        if (!key) return;
        if (!map.has(key)) map.set(key, { n: 0, wins: 0, totalPnlPct: 0, grossProfit: 0, grossLoss: 0, totalR: 0, riskSamples: 0 });
        const b = map.get(key);
        b.n += 1;
        b.totalPnlPct += Number(pnl) || 0;
        if ((Number(pnl) || 0) > 0) {
            b.wins += 1;
            b.grossProfit += Number(pnl) || 0;
        } else if ((Number(pnl) || 0) < 0) b.grossLoss += Math.abs(Number(pnl) || 0);
        if (Number.isFinite(riskR)) {
            b.totalR += riskR;
            b.riskSamples += 1;
        }
    };

    for (const t of trades) {
        const pnl = t.pnlPercent;
        const setup = t.setupType || t.signalBreakdown?.entrySetup || 'UNKNOWN';
        const riskPct = Number(t.entryPrice) > 0 && Number(t.stopLossPrice) > 0
            ? Math.abs(Number(t.entryPrice) - Number(t.stopLossPrice)) / Number(t.entryPrice) * 100
            : 0;
        const riskR = riskPct > 0 ? (Number(pnl) || 0) / riskPct : null;
        bump(bySymbol, `${t.assetType}|${t.symbol}`, pnl, riskR);
        bump(bySetup, `${t.assetType}|${setup}`, pnl, riskR);
        bump(bySymbolSetup, `${t.assetType}|${t.symbol}|${setup}`, pnl, riskR);
    }

    for (const [k, v] of bySymbol) bySymbol.set(k, finalize(v));
    for (const [k, v] of bySetup) bySetup.set(k, finalize(v));
    for (const [k, v] of bySymbolSetup) bySymbolSetup.set(k, finalize(v));

    cache = { loadedAt: Date.now(), bySymbol, bySetup, bySymbolSetup };
    return cache;
};

export const getSymbolExpectancy = (assetType, symbol) => {
    const key = `${assetType}|${symbol}`;
    return cache.bySymbol.get(key) || emptyBucket();
};

export const getSetupExpectancy = (assetType, setupType) => {
    const key = `${assetType}|${setupType}`;
    return cache.bySetup.get(key) || emptyBucket();
};

export const getSymbolSetupExpectancy = (assetType, symbol, setupType) => {
    const key = `${assetType}|${symbol}|${setupType}`;
    return cache.bySymbolSetup.get(key) || emptyBucket();
};

/**
 * Map expectancy → 0–100 score for PriorityScore.
 * Neutral 50 when sample too small.
 */
export const symbolExpectancyToScore = (stats, minN = 5) => {
    if (!stats || stats.n < minN) return 50;
    // WR 40%→30, 50%→50, 60%→70; expectancy% ±2 → ±20
    const wrPart = clamp(50 + (stats.winRate - 0.5) * 200, 15, 90);
    const expPart = clamp(50 + stats.avgPnlPct * 10, 15, 90);
    return Math.round(wrPart * 0.55 + expPart * 0.45);
};

export const resolveSetupPerformancePenalty = (stats = {}, { wasDegraded = false } = {}) => {
    const enoughSamples = Number(stats.n) >= 20;
    const newlyDegraded = enoughSamples
        && (Number(stats.profitFactor) < 0.9 || Number(stats.expectancyR) <= -0.1);
    const recovered = enoughSamples
        && Number(stats.profitFactor) >= 1
        && Number(stats.expectancyR) > 0;
    const degraded = newlyDegraded || (wasDegraded && !recovered);
    return degraded
        ? { setupAdj: 2, edgeAdj: 2, sizeMult: 0.5, degraded: true }
        : { setupAdj: 0, edgeAdj: 0, sizeMult: 1, degraded: false };
};

/**
 * Adjustments for adaptive floor (symbolAdj / setupAdj).
 * Positive = harder entry; negative = easier (within band).
 */
export const resolveExpectancyAdj = (assetType, symbol, setupType) => {
    const sym = getSymbolExpectancy(assetType, symbol);
    const setup = getSetupExpectancy(assetType, setupType);
    let symbolAdj = 0;
    let setupAdj = 0;
    let edgeAdj = 0;
    let sizeMult = 1;

    if (sym.n >= 8) {
        if (sym.winRate < 0.45 || sym.avgPnlPct < -0.3) {
            symbolAdj = sym.avgPnlPct < -0.6 ? 3 : 2;
            sizeMult = Math.min(sizeMult, 0.7);
        } else if (sym.winRate >= 0.55 && sym.avgPnlPct > 0.15) {
            symbolAdj = sym.avgPnlPct > 0.4 ? -2 : -1;
        }
    }

    const setupKey = `${assetType}|${setupType}`;
    const setupPenalty = resolveSetupPerformancePenalty(setup, { wasDegraded: degradedSetupKeys.has(setupKey) });
    if (setupPenalty.degraded) degradedSetupKeys.add(setupKey);
    else degradedSetupKeys.delete(setupKey);
    setupAdj = setupPenalty.setupAdj;
    edgeAdj = setupPenalty.edgeAdj;
    sizeMult = Math.min(sizeMult, setupPenalty.sizeMult);

    return { symbolAdj, setupAdj, edgeAdj, sizeMult, symbolStats: sym, setupStats: setup };
};
