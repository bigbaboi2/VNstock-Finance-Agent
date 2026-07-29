import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ensureTradePriceInvariant,
    getQuoteDivergencePct,
    hasValidTradePriceInvariant,
    rebaseTradeLevelsFromFill,
} from '../src/services/autoTradeEngine.js';
import { evaluateLiveCircuitBreaker } from '../src/services/liveStrategyGuardService.js';
import { computeLivePnlFromOrderList } from '../src/services/livePnlService.js';

test('NEXO-style market/testnet mismatch exceeds the default execution guard', () => {
    const divergence = getQuoteDivergencePct(0.740, 0.723);
    assert.ok(divergence > 0.35);
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
