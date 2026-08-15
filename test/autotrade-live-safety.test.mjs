import assert from 'node:assert/strict';
import test from 'node:test';
import {
    canUseCohortQuota,
    buildTradePlanFromSignal,
    deriveResearchDirection,
    computeAiPriorityAdjustment,
    ensureTradePriceInvariant,
    getQuoteDivergencePct,
    hasValidTradePriceInvariant,
    rebaseTradeLevelsFromFill,
    resolveAiPermissionFromResponse,
    selectExecutionCohort,
    buildEntryTriggerKey,
    claimEntryTrigger,
    analyzeTechnicalSignal,
} from '../src/services/autoTradeEngine.js';
import {
    computeQualityScore,
    detectEntrySetup,
    evaluateBreakoutRetest,
    evaluateVwapReclaim,
    evaluateShortContinuation,
    resolveCryptoVolumeProfile,
    resolveRegimeAdjustments,
    getLiveQualityMinForSetup,
    getLiveEdgeMinForSetup,
    passesLiveQuantGate,
    validateEntryQuote,
} from '../src/services/entrySetupEngine.js';
import {
    evaluateLiveCircuitBreaker,
    evaluateSetupSymbolCooldown,
    resolveLossRiskState,
} from '../src/services/liveStrategyGuardService.js';
import { computeLivePnlFromOrderList } from '../src/services/livePnlService.js';
import { resolveRetryAfterMs } from '../src/services/aiSignalCandidateService.js';
import { computeProviderBackoffMs } from '../src/services/multiProviderRouter.js';
import { resolveSetupPerformancePenalty } from '../src/services/symbolExpectancyService.js';
import { resolveAdaptiveEligibility } from '../src/services/adaptiveEligibilityService.js';

test('NEXO-style market/testnet mismatch is detected for telemetry', () => {
    const divergence = getQuoteDivergencePct(0.740, 0.723);
    assert.ok(divergence > 2);
});

test('research rescues a directional neutral signal without relaxing its edge', () => {
    assert.deepEqual(
        deriveResearchDirection({ breakdown: { longScore: 62, shortScore: 40 } }),
        { direction: 'LONG', score: 62, edge: 22 },
    );
    assert.equal(deriveResearchDirection({ breakdown: { longScore: 62, shortScore: 49 } }), null);
});

test('research cannot rescue a failed LIVE candidate into execution', () => {
    assert.equal(selectExecutionCohort({ corePass: false, researchPass: true, requiresLiveQuality: true }), null);
    assert.equal(selectExecutionCohort({ corePass: false, researchPass: true, requiresLiveQuality: false }), 'RESEARCH');
    assert.equal(selectExecutionCohort({ corePass: true, researchPass: true, requiresLiveQuality: true }), 'CORE');
});

test('breakout retest requires a real breakout candle and a separate held retest', () => {
    const history = Array.from({ length: 23 }, (_, i) => ({
        open: 99.4, high: i === 10 ? 100 : 99.8, low: 99.0, close: 99.5, volume: 100,
    }));
    const breakout = { open: 99.8, high: 100.55, low: 99.75, close: 100.4, volume: 200 };
    const retest = { open: 100.08, high: 100.35, low: 99.9, close: 100.2, volume: 150 };
    const signal = { atr: 1, volumeSurge: 2.2 };

    assert.equal(evaluateBreakoutRetest(signal, [...history, breakout, retest]).valid, true);
    assert.equal(evaluateBreakoutRetest(signal, [
        ...history,
        { ...breakout, open: 100.0, close: 100.08 },
        retest,
    ]).valid, false);
});

test('breakout retest accepts a breakout up to three candles back', () => {
    const history = Array.from({ length: 24 }, (_, i) => ({ time: i, open: 99.4, high: i === 8 ? 100 : 99.8, low: 99, close: 99.5 }));
    const breakout = { time: 24, open: 99.8, high: 100.6, low: 99.7, close: 100.4 };
    const retest = { time: 25, open: 100.2, high: 100.4, low: 99.8, close: 100.1 };
    const hold = { time: 26, open: 100.1, high: 100.5, low: 100.0, close: 100.3 };
    const result = evaluateBreakoutRetest({ atr: 1, volumeSurge: 2 }, [...history, breakout, retest, hold]);
    assert.equal(result.valid, true);
    assert.equal(result.setupPattern, 'BREAKOUT_RETEST_1_3');
});

test('VWAP reclaim accepts two closes or cross-and-retest, but rejects climax', () => {
    const base = { vwap: 100, entryPrice: 100.2, atr: 1, volumeSurge: 1.3 };
    assert.equal(evaluateVwapReclaim(base, [
        { close: 99.8 }, { low: 100.05, close: 100.1 }, { low: 100.1, close: 100.2 },
    ]).valid, true);
    assert.equal(evaluateVwapReclaim({ ...base, entryPrice: 100.25 }, [
        { close: 99.8 }, { high: 100.2, close: 100.15 }, { low: 99.98, close: 100.25 },
    ]).setupPattern, 'CROSS_RETEST');
    assert.equal(evaluateVwapReclaim({ ...base, volumeSurge: 4.1 }, [{}, {}, {}]).reason, 'VWAP_VOLUME_CLIMAX');
});

test('trend pullback accepts two improving closes and stays within one ATR', () => {
    const candles = Array.from({ length: 27 }, (_, i) => ({ time: i, open: 99.5, high: 100.2, low: 99.2, close: 99.7 }));
    candles.push(
        { time: 27, open: 99.5, high: 100, low: 99.1, close: 99.6 },
        { time: 28, open: 99.6, high: 100.2, low: 99.3, close: 99.8 },
        { time: 29, open: 99.8, high: 100.5, low: 99.5, close: 100.05 },
    );
    const setup = detectEntrySetup('CRYPTO', {
        direction: 'LONG', entryPrice: 100.05, ema21: 99.5, atr: 1, rsi: 58,
        stochRSI: { k: 50 }, volumeSurge: 1.3, breakdown: { macdLong: 70 },
    }, 'UP', candles, {});
    assert.equal(setup.type, 'TREND_PULLBACK');
    assert.equal(setup.setupPattern, 'TWO_RISING_CLOSES');
});

test('short continuation accepts failed breakdown retest', () => {
    const history = Array.from({ length: 24 }, (_, i) => ({ time: i, open: 101, high: 101.3, low: i === 5 ? 100 : 100.3, close: 100.8 }));
    const result = evaluateShortContinuation({
        direction: 'SHORT', entryPrice: 99.6, ema21: 102, atr: 1, rsi: 60,
        volumeSurge: 2, breakdown: { macdShort: 75 },
    }, 'DOWN', [
        ...history,
        { time: 24, open: 100.2, high: 100.3, low: 99.5, close: 99.7 },
        { time: 25, open: 99.7, high: 100.1, low: 99.4, close: 99.6 },
        { time: 26, open: 99.6, high: 99.9, low: 99.2, close: 99.5 },
    ], {});
    assert.equal(result.valid, true);
    assert.equal(result.setupPattern, 'BREAKDOWN_RETEST');
});

test('setup, symbol tier and regime matrix resolves V3 floors', () => {
    assert.equal(getLiveQualityMinForSetup('BREAKOUT_RETEST'), 80);
    assert.equal(getLiveEdgeMinForSetup('VWAP_RECLAIM'), 24);
    assert.deepEqual(resolveRegimeAdjustments({ marketCondition: 'RISK_OFF', direction: 'LONG' }), {
        regime: 'RISK_OFF', qualityAdj: 4, edgeAdj: 4, volumeAdj: 0.2,
    });
    const core = resolveCryptoVolumeProfile({ symbol: 'BTCUSDT', direction: 'LONG', marketCondition: 'RISK_ON' });
    const alt = resolveCryptoVolumeProfile({ symbol: 'DOGEUSDT', direction: 'LONG', marketCondition: 'NEUTRAL' });
    assert.equal(core.tier, 'CORE');
    assert.equal(core.volumeFloor, 1);
    assert.equal(alt.tier, 'ALT');
    assert.equal(alt.volumeFloor, 1.3);
});

test('full setup x core/alt x regime gate matrix is internally consistent', () => {
    const setups = ['BREAKOUT_RETEST', 'VWAP_RECLAIM', 'EMA_PULLBACK', 'TREND_PULLBACK', 'SHORT_CONTINUATION'];
    const regimes = ['RISK_ON', 'NEUTRAL', 'RISK_OFF'];
    for (const setupType of setups) {
        const direction = setupType === 'SHORT_CONTINUATION' ? 'SHORT' : 'LONG';
        for (const symbol of ['BTCUSDT', 'DOGEUSDT']) {
            for (const marketCondition of regimes) {
                const profile = resolveCryptoVolumeProfile({ symbol, direction, marketCondition });
                const gate = resolveAdaptiveEligibility({ assetType: 'CRYPTO', symbol, setupType, direction, marketCondition });
                assert.ok(gate.effectiveQualityFloor >= getLiveQualityMinForSetup(setupType));
                assert.ok(gate.effectiveEdgeFloor >= getLiveEdgeMinForSetup(setupType));
                assert.equal(profile.tier, symbol === 'BTCUSDT' ? 'CORE' : 'ALT');
                assert.ok(profile.volumeFloor >= (profile.tier === 'CORE' ? 1 : 1.2));
                assert.equal(profile.maxVolume, 4);
            }
        }
    }
});

test('trigger candle dedupe key includes direction and setup', () => {
    const parts = { symbol: 'BTCUSDT', direction: 'LONG', setupType: 'VWAP_RECLAIM', triggerCandleTime: 1_700_000_000 };
    assert.match(buildEntryTriggerKey(parts), /^BTCUSDT\|LONG\|VWAP_RECLAIM\|/);
    assert.equal(claimEntryTrigger(parts, 1_700_000_000_000).claimed, true);
    assert.equal(claimEntryTrigger(parts, 1_700_000_000_001).claimed, false);
});

test('setup degrades only after 20 official V3 samples and recovers on positive rolling metrics', () => {
    assert.equal(resolveSetupPerformancePenalty({ n: 19, profitFactor: 0.5, expectancyR: -0.5 }).degraded, false);
    assert.deepEqual(resolveSetupPerformancePenalty({ n: 20, profitFactor: 0.89, expectancyR: 0.1 }), {
        setupAdj: 2, edgeAdj: 2, sizeMult: 0.5, degraded: true,
    });
    assert.equal(resolveSetupPerformancePenalty(
        { n: 25, profitFactor: 0.95, expectancyR: -0.05 },
        { wasDegraded: true },
    ).degraded, true);
    assert.equal(resolveSetupPerformancePenalty({ n: 25, profitFactor: 1.1, expectancyR: 0.05 }).degraded, false);
});

test('HTF UP alone is no longer enough to create TREND_PULLBACK', () => {
    const candles = Array.from({ length: 30 }, () => ({ open: 99.8, high: 100.2, low: 99.6, close: 100 }));
    const setup = detectEntrySetup('CRYPTO', {
        direction: 'LONG', entryPrice: 100, ema21: 95, atr: 1, rsi: 60,
        stochRSI: { k: 50 }, volumeSurge: 1.8, breakdown: { macdLong: 70 },
    }, 'UP', candles, {});
    assert.equal(setup.valid, false);
    assert.equal(setup.type, 'NO_CLEAR_SETUP');
});

test('technical signal exposes EMA21 required by pullback detectors', () => {
    const candles = Array.from({ length: 100 }, (_, i) => ({
        time: i * 900, open: 100 + i * 0.1, high: 100.4 + i * 0.1,
        low: 99.7 + i * 0.1, close: 100.1 + i * 0.1, volume: 100 + i,
    }));
    const signal = analyzeTechnicalSignal(candles);
    assert.ok(Number.isFinite(signal.ema21));
    assert.ok(Number.isFinite(signal.ema50));
});

test('SHORT_CONTINUATION requires an EMA pullback and bearish trigger', () => {
    const history = Array.from({ length: 28 }, () => ({ open: 101, high: 101.2, low: 100.7, close: 100.9 }));
    const prev = { open: 101, high: 101.2, low: 100.6, close: 100.8 };
    const trigger = { open: 100.9, high: 101.0, low: 100.2, close: 100.4 };
    const setup = detectEntrySetup('CRYPTO', {
        direction: 'SHORT', entryPrice: 100.5, ema21: 100.8, atr: 1, rsi: 60,
        volumeSurge: 2.0, breakdown: { macdShort: 75 },
    }, 'DOWN', [...history, prev, trigger], {});
    assert.equal(setup.type, 'SHORT_CONTINUATION');

    const noTrigger = detectEntrySetup('CRYPTO', {
        direction: 'SHORT', entryPrice: 100.5, ema21: 100.8, atr: 1, rsi: 60,
        volumeSurge: 2.0, breakdown: { macdShort: 75 },
    }, 'DOWN', [...history, prev, { ...trigger, close: 100.7 }], {});
    assert.equal(noTrigger.type, 'SHORT');
    assert.equal(passesLiveQuantGate(noTrigger, {
        assetType: 'CRYPTO', direction: 'SHORT', volumeSurge: 2, score: 95,
        breakdown: { qualityScore: 95, edge: 45, confluenceCount: 5, htfTrend: 'DOWN', macdShort: 90, adx: 30 },
    }).pass, false);
});

test('realtime quote must remain inside the confirmed entry zone', () => {
    const setup = { minEntryPrice: 100.03, maxEntryPrice: 100.50 };
    assert.equal(validateEntryQuote(setup, {}, { price: 100.2, fetchedAt: new Date() }).valid, true);
    assert.equal(validateEntryQuote(setup, {}, { price: 100.8, fetchedAt: new Date() }).valid, false);
});

test('volume climax does not receive a stronger confluence score', () => {
    const entrySetup = { setupScore: 90 };
    const base = { direction: 'LONG', breakdown: { trendLong: 80, macdLong: 80, obvLong: 75 } };
    const healthy = computeQualityScore(entrySetup, { ...base, volumeSurge: 2.2 });
    const climax = computeQualityScore(entrySetup, { ...base, volumeSurge: 5.0 });
    assert.ok(healthy.confluenceScore > climax.confluenceScore);
    assert.ok(healthy.qualityScore > climax.qualityScore);
});

test('LIVE crypto trade plan is constructed at the configured minimum RR', () => {
    const plan = buildTradePlanFromSignal(
        'CRYPTO',
        { direction: 'LONG', atr: 1 },
        { price: 100 },
        { maxRisk: { CRYPTO: 0.04 } },
        { minRR: 1.8 },
    );
    const risk = plan.entryPrice - plan.stopLossPrice;
    const reward = plan.takeProfitPrice - plan.entryPrice;
    assert.ok(reward / risk >= 1.79);
});

test('AI soft veto reduces priority but does not reject the candidate', () => {
    const permission = resolveAiPermissionFromResponse(JSON.stringify({
        verdict: 'VETO', confidence: 75, hardVeto: false, reason: 'Thiếu một xác nhận phụ.',
    }));
    assert.equal(permission.confirmed, true);
    assert.equal(permission.softVeto, true);
    assert.equal(permission.hardVeto, false);
    assert.equal(computeAiPriorityAdjustment(permission, 8), -6);
});

test('AI hard veto remains an absolute rejection', () => {
    const permission = resolveAiPermissionFromResponse(JSON.stringify({
        verdict: 'VETO', confidence: 90, hardVeto: true, reason: 'Fake breakout rõ.',
    }));
    assert.equal(permission.confirmed, false);
    assert.equal(permission.hardVeto, true);
});

test('AI does not create a hard veto from an explicitly negated risk', () => {
    const permission = resolveAiPermissionFromResponse(JSON.stringify({
        verdict: 'CONFIRM', confidence: 80, hardVeto: false, reason: 'Không có dấu hiệu ngược xu hướng hoặc fake breakout.',
    }));
    assert.equal(permission.confirmed, true);
    assert.equal(permission.hardVeto, false);
});

test('provider and candidate retry use dynamic capped backoff', () => {
    assert.equal(computeProviderBackoffMs('groq', 1), 30_000);
    assert.equal(computeProviderBackoffMs('groq', 2), 45_000);
    assert.equal(computeProviderBackoffMs('gemini_flash', 1), 90_000);
    assert.equal(computeProviderBackoffMs('groq', 20), 300_000);
    assert.equal(resolveRetryAfterMs({ retryAfterMs: 45_000 }, 1), 45_000);
    assert.equal(resolveRetryAfterMs({}, 20), 300_000);
});

test('ENTRY_V3 has no daily entry quota', () => {
    assert.equal(canUseCohortQuota({ day: { CORE: 999, RESEARCH: 999 }, week: { CORE: 999, RESEARCH: 999 } }, 'CORE'), true);
});

test('rebasing from an exchange fill preserves LONG TP/SL invariant', () => {
    const trade = {
        assetType: 'CRYPTO', direction: 'LONG', entryPrice: 0.734,
        stopLossPrice: 0.728, takeProfitPrice: 0.746,
        takeProfit1Price: 0.740, peakPrice: 0.734,
    };
    rebaseTradeLevelsFromFill(trade, 0.725);
    assert.equal(hasValidTradePriceInvariant(trade), true);
    assert.ok(trade.stopLossPrice < trade.entryPrice && trade.entryPrice < trade.takeProfitPrice);
});

test('invalid levels are repaired before a LIVE position is monitored', () => {
    const trade = {
        assetType: 'CRYPTO', direction: 'LONG', entryPrice: 0.725,
        stopLossPrice: 0.728, takeProfitPrice: 0.737,
        takeProfit1Price: 0.730,
    };
    assert.equal(hasValidTradePriceInvariant(trade), false);
    assert.equal(ensureTradePriceInvariant(trade), true);
});

test('official PnL is calculated from ENTRY/EXIT fills rather than signal quotes', () => {
    const result = computeLivePnlFromOrderList(
        { symbol: 'NEXOUSDT', direction: 'LONG', assetType: 'CRYPTO' },
        [
            { purpose: 'ENTRY', side: 'BUY', filledQuantity: 100, filledPrice: 0.725, feeUSDT: 0.01 },
            { purpose: 'EXIT', side: 'SELL', filledQuantity: 100, filledPrice: 0.723, feeUSDT: 0.01 },
        ],
        25_400,
        { quietFeeWarn: true },
    );
    assert.equal(result.eligible, true);
    assert.equal(result.source, 'LIVE_FILLS_NET_FEE');
    assert.ok(result.pnlUSDT < 0);
    assert.equal(result.exitPrice, 0.723);
});

test('daily package loss trips the circuit breaker without changing allocation', () => {
    const now = new Date();
    const order = {
        totalCapital: 10_000_000,
        allocationPercent: 26,
        maxConcurrentOrders: 3,
        tradeAllocations: [{ executionMode: 'LIVE', closedAt: now, pnl: -250_000 }],
    };
    const result = evaluateLiveCircuitBreaker(order);
    assert.equal(result.blocked, true);
    assert.equal(result.code, 'DAILY_LOSS_LIMIT');
    assert.equal(order.allocationPercent, 26);
    assert.equal(order.maxConcurrentOrders, 3);
});

test('two losses reduce package size and a positive close restores it', () => {
    const losses = resolveLossRiskState([
        { pnl: -10, closedAt: new Date('2026-07-30T04:00:00Z') },
        { pnl: -20, closedAt: new Date('2026-07-30T03:00:00Z') },
    ]);
    assert.equal(losses.consecutiveLosses, 2);
    assert.equal(losses.sizeMultiplier, 0.5);

    const recovered = resolveLossRiskState([
        { pnl: 5, closedAt: new Date('2026-07-30T05:00:00Z') },
        { pnl: -10, closedAt: new Date('2026-07-30T04:00:00Z') },
        { pnl: -20, closedAt: new Date('2026-07-30T03:00:00Z') },
    ]);
    assert.equal(recovered.consecutiveLosses, 0);
    assert.equal(recovered.sizeMultiplier, 1);
});

test('loss cooldown blocks only the same setup, symbol and direction', () => {
    const now = new Date('2026-07-30T05:30:00Z');
    const order = {
        tradeAllocations: [
            { executionMode: 'LIVE', setup: 'TREND_PULLBACK', symbol: 'ONDOUSDT', direction: 'LONG', pnl: -10, closedAt: new Date('2026-07-30T05:20:00Z') },
            { executionMode: 'LIVE', setup: 'TREND_PULLBACK', symbol: 'ONDOUSDT', direction: 'LONG', pnl: -20, closedAt: new Date('2026-07-30T05:00:00Z') },
        ],
    };
    assert.equal(evaluateSetupSymbolCooldown(order, { setup: 'TREND_PULLBACK', symbol: 'ONDOUSDT', direction: 'LONG', now }).blocked, true);
    assert.equal(evaluateSetupSymbolCooldown(order, { setup: 'TREND_PULLBACK', symbol: 'UNIUSDT', direction: 'LONG', now }).blocked, false);
    assert.equal(evaluateSetupSymbolCooldown(order, { setup: 'TREND_PULLBACK', symbol: 'ONDOUSDT', direction: 'SHORT', now }).blocked, false);
});
