/**
 * Historical breakout similarity → PriorityScore component only (never bypasses gates).
 * Rule-based: range expansion + volume surge + retest signature vs past events on same symbol.
 */
const MIN_EVENTS = 5;
const LOOKBACK_BARS = 120;

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/**
 * Detect historical breakout-like bars (index = bar after breakout).
 * Long: close breaks prior N-bar high with vol surge, then optional retest within 3 bars.
 */
const findBreakoutEvents = (candles, { lookback = 20, volMult = 1.5 } = {}) => {
    if (!Array.isArray(candles) || candles.length < lookback + 10) return [];
    const events = [];
    const start = Math.max(lookback + 1, candles.length - LOOKBACK_BARS);
    for (let i = start; i < candles.length - 4; i++) {
        const window = candles.slice(i - lookback, i);
        const priorHigh = Math.max(...window.map((c) => c.high));
        const avgVol = window.reduce((s, c) => s + (c.volume || 0), 0) / lookback || 1;
        const bar = candles[i];
        const volOk = (bar.volume || 0) >= avgVol * volMult;
        const broke = bar.close > priorHigh && bar.close > bar.open;
        if (!broke || !volOk) continue;

        // Forward outcome over next 8 bars (simple): max favorable / adverse vs breakout close
        const entry = bar.close;
        let maxUp = 0;
        let maxDown = 0;
        for (let j = i + 1; j <= Math.min(i + 8, candles.length - 1); j++) {
            maxUp = Math.max(maxUp, (candles[j].high - entry) / entry);
            maxDown = Math.max(maxDown, (entry - candles[j].low) / entry);
        }
        const win = maxUp >= 0.012 && maxUp > maxDown * 0.9;
        const loss = maxDown >= 0.012 && maxDown > maxUp;
        events.push({
            index: i,
            entry,
            volRatio: (bar.volume || 0) / avgVol,
            rangePct: (bar.high - bar.low) / entry,
            outcome: win ? 1 : loss ? -1 : 0,
        });
    }
    return events;
};

const currentSignature = (candles, lookback = 20) => {
    if (!candles || candles.length < lookback + 2) return null;
    const i = candles.length - 1;
    const window = candles.slice(i - lookback, i);
    const priorHigh = Math.max(...window.map((c) => c.high));
    const avgVol = window.reduce((s, c) => s + (c.volume || 0), 0) / lookback || 1;
    const bar = candles[i];
    const prev = candles[i - 1];
    return {
        distToHigh: (bar.close - priorHigh) / priorHigh,
        volRatio: (bar.volume || 0) / avgVol,
        rangePct: (bar.high - bar.low) / (bar.close || 1),
        reclaim: prev && prev.close <= priorHigh && bar.close > priorHigh,
        nearHigh: bar.close >= priorHigh * 0.995,
    };
};

const similarity = (sig, event, candles, lookback = 20) => {
    if (!sig || !event) return 0;
    const evBar = candles[event.index];
    if (!evBar) return 0;
    const window = candles.slice(Math.max(0, event.index - lookback), event.index);
    if (window.length < 5) return 0;
    const priorHigh = Math.max(...window.map((c) => c.high));
    const evDist = (evBar.close - priorHigh) / priorHigh;
    const distScore = 1 - Math.min(1, Math.abs(sig.distToHigh - evDist) / 0.02);
    const volScore = 1 - Math.min(1, Math.abs(sig.volRatio - event.volRatio) / 2);
    const rangeScore = 1 - Math.min(1, Math.abs(sig.rangePct - event.rangePct) / 0.02);
    return clamp01(distScore * 0.4 + volScore * 0.35 + rangeScore * 0.25);
};

/**
 * @returns {{ affinity: number, score: number, n: number, wins: number, losses: number, note: string }}
 * affinity 0–1, score 0–100 (50 = neutral). Cap contribution handled by PriorityScore weights.
 */
export const computeBreakoutAffinity = (candles, { direction = 'LONG' } = {}) => {
    const isLong = direction === 'LONG' || direction === 'MUA';
    if (!isLong) {
        return { affinity: 0.5, score: 50, n: 0, wins: 0, losses: 0, note: 'short_neutral' };
    }
    const events = findBreakoutEvents(candles);
    const wins = events.filter((e) => e.outcome === 1).length;
    const losses = events.filter((e) => e.outcome === -1).length;
    if (events.length < MIN_EVENTS || wins === 0 || losses === 0) {
        return {
            affinity: 0.5,
            score: 50,
            n: events.length,
            wins,
            losses,
            note: events.length < MIN_EVENTS ? 'insufficient_events' : 'one_sided_outcomes',
        };
    }

    const sig = currentSignature(candles);
    if (!sig || (!sig.nearHigh && !sig.reclaim && sig.distToHigh < -0.01)) {
        return {
            affinity: 0.45,
            score: 45,
            n: events.length,
            wins,
            losses,
            note: 'no_current_breakout_shape',
        };
    }

    // Outcome-weighted similarity to past events
    let wSum = 0;
    let sSum = 0;
    for (const ev of events) {
        const sim = similarity(sig, ev, candles);
        if (sim < 0.35) continue;
        const weight = 0.5 + sim * 0.5;
        const signed = ev.outcome; // -1, 0, 1
        sSum += sim * signed * weight;
        wSum += weight;
    }
    if (wSum <= 0) {
        return { affinity: 0.5, score: 50, n: events.length, wins, losses, note: 'no_similar_events' };
    }
    // Map weighted outcome ∈ [-1,1] → affinity ∈ [0,1]
    const raw = sSum / wSum;
    const affinity = clamp01(0.5 + raw * 0.45);
    const score = Math.round(affinity * 100);
    return {
        affinity,
        score,
        n: events.length,
        wins,
        losses,
        note: `sim_weighted raw=${raw.toFixed(2)}`,
    };
};
