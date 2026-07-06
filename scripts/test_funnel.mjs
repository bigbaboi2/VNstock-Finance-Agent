import {
    createFunnelTracker,
    formatFunnelLogLines,
} from '../src/services/tradeFunnelService.js';

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const funnel = createFunnelTracker('CRYPTO');
funnel.record('scanned');
funnel.record('scanned');
funnel.record('weak');
funnel.record('setup', { type: 'NO_CLEAR_SETUP' });
funnel.record('live_gate', {
    symbol: 'SOLUSDT',
    score: 78,
    setup: 'EMA_PULLBACK',
    reason: 'qualityScore 78 < 82',
});

const summary = funnel.finalize({ liveOrdersWaiting: 1 });
assert(summary.scanned === 2, 'scanned count');
assert(summary.setup === 1, 'setup count');
assert(summary.setupReasons.NO_CLEAR_SETUP === 1, 'setup reason');
assert(summary.liveGate === 1, 'live gate count');
assert(summary.topCandidates.length === 1, 'top candidate');

const lines = formatFunnelLogLines(summary);
assert(lines[0].includes('CRYPTO FUNNEL'), 'format line');
assert(lines.some((l) => l.includes('NO_CLEAR_SETUP')), 'setup line');

console.log('✓ test_funnel passed');
console.log('  sample:', lines[0]);
