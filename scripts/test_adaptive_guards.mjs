import { computeAdaptiveGuardFromTrades } from '../src/services/autoTradeEngine.js';

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const simLosses = Array.from({ length: 15 }, (_, i) => ({
    aiScore: 70 + i,
    pnlPercent: -1,
    executionMode: 'SIMULATED',
}));

const liveWins = Array.from({ length: 15 }, (_, i) => ({
    aiScore: 82 + (i % 3),
    pnlPercent: 2,
    executionMode: 'LIVE',
}));

const simGuard = computeAdaptiveGuardFromTrades(simLosses);
const liveGuard = computeAdaptiveGuardFromTrades(liveWins);

assert(simGuard.scoreFloor >= 76, 'SIM guard phải siết khi toàn lỗ');
assert(liveGuard.scoreFloor === 0, 'LIVE guard không bị ảnh hưởng bởi SIM losses');

console.log('✓ test_adaptive_guards passed');
console.log(`  SIM floor=${simGuard.scoreFloor} n=${simGuard.sample}`);
console.log(`  LIVE floor=${liveGuard.scoreFloor} n=${liveGuard.sample}`);
