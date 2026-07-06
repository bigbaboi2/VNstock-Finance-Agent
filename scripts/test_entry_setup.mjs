import {
    detectEntrySetup,
    computeQualityScore,
    passesLiveQuantGate,
    passesSimQuantGate,
    LIVE_SETUP_WHITELIST,
} from '../src/services/entrySetupEngine.js';

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const baseLongSignal = {
    direction: 'LONG',
    entryPrice: 100,
    ema21: 99.5,
    atr: 2,
    rsi: 45,
    volumeSurge: 1.6,
    vwap: 99,
    bollinger: { lower: 95, upper: 105 },
    stochRSI: { k: 40 },
    breakdown: {
        longScore: 82,
        shortScore: 40,
        edge: 42,
        trendLong: 85,
        macdLong: 75,
        obvLong: 70,
        adx: 22,
    },
};

const emaPullback = detectEntrySetup('CRYPTO', baseLongSignal, 'UP', []);
assert(emaPullback.valid && emaPullback.type === 'EMA_PULLBACK', 'EMA_PULLBACK expected');

const withQuality = {
    ...baseLongSignal,
    breakdown: {
        ...baseLongSignal.breakdown,
        ...computeQualityScore(emaPullback, baseLongSignal),
    },
    score: computeQualityScore(emaPullback, baseLongSignal).qualityScore,
};

const live = passesLiveQuantGate(emaPullback, withQuality);
assert(live.pass, `LIVE gate should pass: ${live.reason}`);

const blocked = detectEntrySetup('CRYPTO', { ...baseLongSignal, rsi: 80, stochRSI: { k: 90 } }, 'UP', []);
assert(!blocked.valid && blocked.type === 'BLOCK_EXTENDED', 'BLOCK_EXTENDED expected');

console.log('✓ entrySetupEngine tests passed');
console.log('  LIVE whitelist:', [...LIVE_SETUP_WHITELIST].join(', '));
