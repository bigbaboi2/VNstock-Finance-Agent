import {
    analyzeTechnicalSignal,
    buildTradePlanFromSignal,
} from '../src/services/autoTradeEngine.js';
import {
    applyQualityToSignal,
    detectEntrySetup,
    evaluateBreakoutRetestStrictBaseline,
    passesLiveQuantGate,
    resolveCryptoVolumeProfile,
} from '../src/services/entrySetupEngine.js';
import { resolveAdaptiveEligibility } from '../src/services/adaptiveEligibilityService.js';
import { DEFAULT_LONG_CORE_SYMBOLS, ENTRY_STRATEGY_VERSION } from '../src/services/autoTradeStrategyConstants.js';

const DAYS = Math.max(45, Number(process.env.REPLAY_DAYS) || 45);
const SYMBOLS = String(process.env.REPLAY_SYMBOLS || DEFAULT_LONG_CORE_SYMBOLS.join(','))
    .split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
const INTERVAL_MS = 15 * 60_000;
const PAGE_SIZE = 1000;
const ROUND_TRIP_COST_RATE = 0.0012; // fee + conservative slippage

const fetchKlines = async (symbol) => {
    const end = Date.now();
    let cursor = end - DAYS * 24 * 3600_000 - 2 * 24 * 3600_000;
    const rows = [];
    while (cursor < end) {
        const url = new URL('https://api.binance.com/api/v3/klines');
        url.searchParams.set('symbol', symbol);
        url.searchParams.set('interval', '15m');
        url.searchParams.set('startTime', String(cursor));
        url.searchParams.set('endTime', String(end));
        url.searchParams.set('limit', String(PAGE_SIZE));
        const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error(`${symbol}: Binance HTTP ${response.status}`);
        const page = await response.json();
        if (!page.length) break;
        for (const row of page) {
            rows.push({
                time: Number(row[0]) / 1000,
                open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]),
                volume: Number(row[5]), takerBuyVolume: Number(row[9]),
            });
        }
        const next = Number(page.at(-1)[0]) + INTERVAL_MS;
        if (next <= cursor || page.length < PAGE_SIZE) break;
        cursor = next;
    }
    return [...new Map(rows.map((row) => [row.time, row])).values()].sort((a, b) => a.time - b.time);
};

const ema = (values, period) => {
    if (values.length < period) return null;
    const k = 2 / (period + 1);
    let value = values.slice(0, period).reduce((sum, n) => sum + n, 0) / period;
    for (const n of values.slice(period)) value = n * k + value * (1 - k);
    return value;
};

const resolveHtf = (candles) => {
    const hourly = [];
    for (let i = 0; i + 3 < candles.length; i += 4) hourly.push(candles[i + 3].close);
    const fast = ema(hourly.slice(-80), 21);
    const slow = ema(hourly.slice(-80), 50);
    if (!(fast && slow)) return 'NEUTRAL';
    return fast > slow ? 'UP' : fast < slow ? 'DOWN' : 'NEUTRAL';
};

const simulateOutcome = (candles, index, direction, plan) => {
    const isLong = direction === 'LONG';
    const entry = plan.entryPrice;
    const stop = plan.stopLossPrice;
    const target = plan.takeProfitPrice;
    const risk = Math.abs(entry - stop);
    let exit = candles[Math.min(candles.length - 1, index + 48)].close;
    for (const candle of candles.slice(index + 1, index + 49)) {
        const hitStop = isLong ? candle.low <= stop : candle.high >= stop;
        const hitTarget = isLong ? candle.high >= target : candle.low <= target;
        if (hitStop || hitTarget) {
            exit = hitStop ? stop : target; // conservative when both touch in one candle
            break;
        }
    }
    const grossR = (isLong ? exit - entry : entry - exit) / risk;
    return grossR - (entry * ROUND_TRIP_COST_RATE / risk);
};

const summarize = (trades) => {
    const grossProfit = trades.filter((r) => r > 0).reduce((s, r) => s + r, 0);
    const grossLoss = Math.abs(trades.filter((r) => r < 0).reduce((s, r) => s + r, 0));
    let equity = 0;
    let peak = 0;
    let maxDrawdownR = 0;
    for (const r of trades) {
        equity += r;
        peak = Math.max(peak, equity);
        maxDrawdownR = Math.max(maxDrawdownR, peak - equity);
    }
    return {
        trades: trades.length,
        expectancyR: trades.length ? equity / trades.length : 0,
        profitFactor: grossLoss ? grossProfit / grossLoss : (grossProfit ? Infinity : 0),
        winRate: trades.length ? trades.filter((r) => r > 0).length / trades.length : 0,
        maxDrawdownR,
    };
};

const main = async () => {
    const results = [];
    const aggregateReturns = [];
    const aggregateBySetup = new Map();
    for (const symbol of SYMBOLS) {
        const candles = await fetchKlines(symbol);
        let strictCandidates = 0;
        const returns = [];
        const candidates = [];
        const bySetup = new Map();
        for (let i = 220; i < candles.length - 48; i += 1) {
            const window = candles.slice(Math.max(0, i - 119), i + 1);
            const signalBase = analyzeTechnicalSignal(window, 50, 'neutral', 0);
            signalBase.symbol = symbol;
            if (!['LONG', 'SHORT'].includes(signalBase.direction) || !(signalBase.atr > 0)) continue;
            const htfTrend = resolveHtf(candles.slice(Math.max(0, i - 400), i + 1));
            const regime = htfTrend === 'UP' ? 'RISK_ON' : htfTrend === 'DOWN' ? 'RISK_OFF' : 'NEUTRAL';
            const strictSetup = evaluateBreakoutRetestStrictBaseline(signalBase, window);
            if (strictSetup.valid && buildTradePlanFromSignal(
                'CRYPTO', signalBase, { price: signalBase.entryPrice }, { maxRisk: { CRYPTO: 0.04 } }, { minRR: 1.8 },
            )) strictCandidates += 1;
            const setup = detectEntrySetup('CRYPTO', signalBase, htfTrend, window, {});
            if (!setup.valid) continue;
            const signal = applyQualityToSignal({ ...signalBase, assetType: 'CRYPTO', symbol }, setup, {});
            signal.breakdown = { ...signal.breakdown, htfTrend };
            const profile = resolveCryptoVolumeProfile({ symbol, direction: signal.direction, marketCondition: regime });
            const adaptive = resolveAdaptiveEligibility({ assetType: 'CRYPTO', symbol, setupType: setup.type, direction: signal.direction, marketCondition: regime });
            const gate = passesLiveQuantGate(setup, signal, {
                effectiveQualityFloor: adaptive.effectiveQualityFloor,
                effectiveEdgeFloor: adaptive.effectiveEdgeFloor,
                minVolume: profile.volumeFloor,
                maxVolume: profile.maxVolume,
            });
            if (!gate.pass) continue;
            const plan = buildTradePlanFromSignal(
                'CRYPTO', signal, { price: signal.entryPrice }, { maxRisk: { CRYPTO: 0.04 } }, { minRR: 1.8 },
            );
            if (!plan) continue;
            const r = simulateOutcome(candles, i, signal.direction, plan);
            returns.push(r);
            aggregateReturns.push(r);
            if (!aggregateBySetup.has(setup.type)) aggregateBySetup.set(setup.type, []);
            aggregateBySetup.get(setup.type).push(r);
            candidates.push({
                time: new Date(candles[i].time * 1000).toISOString(), setup: setup.type, direction: signal.direction,
                r: Math.round(r * 1000) / 1000, quality: signal.score, edge: signal.breakdown.edge,
                volume: signal.volumeSurge, rsi: signal.rsi, entryDistanceAtr: setup.entryDistanceAtr ?? null,
                setupScore: setup.setupScore, pattern: setup.setupPattern || null,
            });
            if (!bySetup.has(setup.type)) bySetup.set(setup.type, []);
            bySetup.get(setup.type).push(r);
        }
        results.push({
            symbol,
            candles: candles.length,
            strictCandidates,
            v3: summarize(returns),
            bySetup: Object.fromEntries([...bySetup].map(([key, value]) => [key, summarize(value)])),
            candidates,
        });
    }
    const totals = results.reduce((acc, row) => {
        acc.strictCandidates += row.strictCandidates;
        acc.v3Candidates += row.v3.trades;
        return acc;
    }, { strictCandidates: 0, v3Candidates: 0 });
    const report = {
        strategyVersion: ENTRY_STRATEGY_VERSION,
        days: DAYS,
        symbols: SYMBOLS,
        assumptions: { timeframe: '15m', maxHoldBars: 48, plannedRR: 1.8, roundTripCostRate: ROUND_TRIP_COST_RATE, sameCandleCollision: 'STOP_FIRST' },
        totals: { ...totals, candidateMultipleVsStrictBreakout: totals.strictCandidates ? totals.v3Candidates / totals.strictCandidates : null },
        overall: summarize(aggregateReturns),
        overallBySetup: Object.fromEntries([...aggregateBySetup].map(([key, value]) => [key, summarize(value)])),
        results,
    };
    if (process.env.REPLAY_COMPACT === '1') delete report.results;
    console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
