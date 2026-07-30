import assert from 'node:assert/strict';
import test from 'node:test';
import {
    canUseCohortQuota,
    deriveResearchDirection,
    computeAiPriorityAdjustment,
    ensureTradePriceInvariant,
    getQuoteDivergencePct,
    hasValidTradePriceInvariant,
    rebaseTradeLevelsFromFill,
    resolveAiPermissionFromResponse,
} from '../src/services/autoTradeEngine.js';
import {
    evaluateLiveCircuitBreaker,
    evaluateSetupSymbolCooldown,
    resolveLossRiskState,
} from '../src/services/liveStrategyGuardService.js';
import { computeLivePnlFromOrderList } from '../src/services/livePnlService.js';
import { resolveRetryAfterMs } from '../src/services/aiSignalCandidateService.js';
import { computeProviderBackoffMs } from '../src/services/multiProviderRouter.js';

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

test('rolling quota never lets Research exceed 40 percent', () => {
    assert.equal(canUseCohortQuota({ day: { CORE: 6, RESEARCH: 3 }, week: { CORE: 6, RESEARCH: 3 } }, 'RESEARCH'), true);
    assert.equal(canUseCohortQuota({ day: { CORE: 6, RESEARCH: 4 }, week: { CORE: 6, RESEARCH: 4 } }, 'RESEARCH'), false);
    assert.equal(canUseCohortQuota({ day: { CORE: 11, RESEARCH: 8 }, week: { CORE: 11, RESEARCH: 8 } }, 'CORE'), true);
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
