/**
 * Setup detection + setup-aware quality scoring for AutoDuck entry funnel.
 */
import {
    getAutoDuckBoolean,
    getAutoDuckNumber,
} from './autoDuckConfigService.js';

const BASE_LIVE_SETUPS = [
    'EMA_PULLBACK',
    'TREND_PULLBACK',
    'VWAP_RECLAIM',
    'BREAKOUT_RETEST',
];

export const getLiveSetupWhitelist = () => {
    const set = new Set(BASE_LIVE_SETUPS);
    if (getAutoDuckBoolean('AUTODUCK_LIVE_ALLOW_SHORT_CONTINUATION')) set.add('SHORT_CONTINUATION');
    if (getAutoDuckBoolean('AUTODUCK_LIVE_ALLOW_SHORT_FALLBACK')) set.add('SHORT');
    return set;
};

/** Snapshot at import for any legacy importers; prefer getLiveSetupWhitelist(). */
export const LIVE_SETUP_WHITELIST = getLiveSetupWhitelist();

export const IDLE_PROBE_SETUP_WHITELIST = new Set([
    'EMA_PULLBACK',
    'TREND_PULLBACK',
    'MEAN_REVERSION',
    'VWAP_RECLAIM',
]);

export const getLiveQualityMin = () => getAutoDuckNumber('AUTODUCK_LIVE_QUALITY_MIN') || 82;
export const getSimQualityMin = () => getAutoDuckNumber('AUTODUCK_SIM_QUALITY_MIN') || 72;
export const getLiveConfluenceMin = () => getAutoDuckNumber('AUTODUCK_LIVE_CONFLUENCE_MIN') || 3;
export const getSimConfluenceMin = () => getAutoDuckNumber('AUTODUCK_SIM_CONFLUENCE_MIN') || 2;
export const getLiveEdgeMin = () => getAutoDuckNumber('AUTODUCK_LIVE_EDGE_MIN') || 28;
export const getSimEdgeMin = () => getAutoDuckNumber('AUTODUCK_SIM_EDGE_MIN') || 22;

/** @deprecated Prefer getters — kept for import compatibility */
export const LIVE_QUALITY_MIN = 82;
export const SIM_QUALITY_MIN = 72;
export const LIVE_CONFLUENCE_MIN = 3;
export const SIM_CONFLUENCE_MIN = 2;
export const LIVE_EDGE_MIN = 28;
export const SIM_EDGE_MIN = 22;

/** Code default floor when Setting/env override is unset (0). Tuned for ~5 LIVE fills/day.
 * 2026-07-27: lowered 86→84 to increase sample size for monitoring. Override via Setting.
 */
export const VWAP_RECLAIM_LIVE_QUALITY_DEFAULT = 84;
const VWAP_CLOSE_CONFIRM_MULT = 1.0;
const VWAP_VOL_CONFIRM = 1.45;
const VWAP_VOL_SCORE_STRONG = 1.6;

const setupOverrideOr = (key, fallback) => {
    const v = getAutoDuckNumber(key);
    return Number.isFinite(v) && v > 0 ? v : fallback;
};

/** Ngưỡng quality LIVE theo setup (override config, mặc định = LIVE quality global). */
export const getLiveQualityMinForSetup = (setupType) => {
    const globalMin = getLiveQualityMin();
    const map = {
        EMA_PULLBACK: setupOverrideOr('AUTODUCK_LIVE_MIN_QUALITY_EMA_PULLBACK', globalMin),
        // VWAP reclaim still needs a higher bar than generic setups (near-VWAP
        // + volume is common), but 90 starved LIVE fills. Default 84 balances
        // sample size (~5/day target) vs quality; Setting/env can override.
        VWAP_RECLAIM: setupOverrideOr(
            'AUTODUCK_LIVE_MIN_QUALITY_VWAP_RECLAIM',
            Math.max(globalMin, VWAP_RECLAIM_LIVE_QUALITY_DEFAULT)
        ),
        // BREAKOUT_RETEST: WR=60% (7-day data) → lower bar from 86→82 to increase throughput.
        BREAKOUT_RETEST: setupOverrideOr('AUTODUCK_LIVE_MIN_QUALITY_BREAKOUT_RETEST', Math.max(globalMin, 82)),
        // TREND_PULLBACK: lower bar to 80 to generate more samples (was equal to globalMin=82).
        TREND_PULLBACK: setupOverrideOr('AUTODUCK_LIVE_MIN_QUALITY_TREND_PULLBACK', Math.max(globalMin - 2, 80)),
        SHORT_CONTINUATION: setupOverrideOr('AUTODUCK_LIVE_MIN_QUALITY_SHORT_CONTINUATION', globalMin),
        SHORT: setupOverrideOr('AUTODUCK_LIVE_MIN_QUALITY_SHORT', globalMin + 2),
    };
    return map[setupType] ?? globalMin;
};

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export const computeConfluenceScore = (signal, direction) => {
    const b = signal?.breakdown || {};
    const isLong = direction === 'LONG' || direction === 'MUA';
    let agree = 0;

    const trend = isLong ? b.trendLong : b.trendShort;
    if (trend >= 65) agree++;

    const macd = isLong ? b.macdLong : b.macdShort;
    if (macd >= 65) agree++;

    if ((signal.volumeSurge || 0) >= 1.4) agree++;

    const obv = isLong ? b.obvLong : b.obvShort;
    if (obv >= 60) agree++;

    return agree;
};

export const computeContextScore = (signal) => {
    const longBias = signal?.breakdown?.contextLongBias || 0;
    const shortBias = signal?.breakdown?.contextShortBias || 0;
    const bias = Math.max(longBias, shortBias);
    return clamp(50 + bias * 4);
};

const scoreEmaPullback = (signal, htfTrend) => {
    const rsi = signal.rsi ?? 50;
    const price = signal.entryPrice;
    const ema21 = signal.ema21;
    const atr = signal.atr || price * 0.02;
    const hist = signal.breakdown?.macdLong >= 65 ? 1 : 0;
    let s = 55;
    if (htfTrend === 'UP') s += 15;
    if (ema21 && Math.abs(price - ema21) <= atr * 1.5) s += 15;
    if (rsi >= 38 && rsi <= 52) s += 12;
    if (hist) s += 8;
    return clamp(s);
};

const scoreVwapReclaim = (signal, htfTrend) => {
    const vwap = signal.vwap;
    const price = signal.entryPrice;
    const rsi = signal.rsi ?? 50;
    const macdLong = signal.breakdown?.macdLong ?? 50;
    const volumeSurge = signal.volumeSurge || 0;
    let s = 45;
    if (htfTrend === 'UP') s += 15;
    // Hold above VWAP still scores; stricter close (>=1.001) keeps the full bonus.
    if (vwap && price >= vwap * VWAP_CLOSE_CONFIRM_MULT && price <= vwap * 1.008) {
        s += price >= vwap * 1.001 ? 15 : 10;
    }
    // Confirm gate uses ~1.45; keep stronger bonus for classic 1.6x participation.
    if (volumeSurge >= VWAP_VOL_SCORE_STRONG) s += 12;
    else if (volumeSurge >= VWAP_VOL_CONFIRM) s += 8;
    else if (volumeSurge >= 1.4) s += 4;
    if (rsi >= 50 && rsi <= 64) s += 6;
    if (macdLong >= 70) s += 7;
    return clamp(s);
};

const scoreBreakoutRetest = (signal, candles) => {
    if (!candles || candles.length < 25) return 40;
    const closes = candles.map(c => c.close);
    const resistance = Math.max(...closes.slice(-22, -2));
    const price = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    let s = 45;
    if (prev > resistance && price >= resistance * 0.995 && price <= resistance * 1.02) s += 35;
    if ((signal.volumeSurge || 0) >= 1.5) s += 15;
    return clamp(s);
};

const scoreMeanReversion = (signal) => {
    const rsi = signal.rsi ?? 50;
    const k = signal.stochRSI?.k ?? 50;
    let s = 45;
    if (rsi < 35 || k < 25) s += 25;
    if (signal.bollinger && signal.entryPrice <= signal.bollinger.lower * 1.01) s += 15;
    return clamp(s);
};

const scoreLiquiditySweep = (candles, signal) => {
    if (!candles || candles.length < 5) return 35;
    const last = candles[candles.length - 1];
    const rangeLow = Math.min(...candles.slice(-10).map(c => c.low));
    const wickSweep = last.low < rangeLow * 0.998 && last.close > last.open;
    let s = 40;
    if (wickSweep) s += 25;
    if ((signal.rsi ?? 50) < 35) s += 15;
    return clamp(s);
};

const scoreShortContinuation = (signal, htfTrend, executionContext = {}) => {
    const rsi = signal.rsi ?? 50;
    const funding = Number(executionContext?.derivatives?.fundingRatePct);
    let s = 50;
    if (htfTrend === 'DOWN') s += 20;
    if (rsi >= 55 && rsi <= 68) s += 12;
    if (Number.isFinite(funding) && funding > 0.05) s += 10;
    return clamp(s);
};

/**
 * Detect entry setup. Replaces legacy classifyEntrySetup for CRYPTO.
 */
export const detectEntrySetup = (asset, signal, htfTrend, candles = [], executionContext = {}) => {
    if (asset !== 'CRYPTO') {
        return { valid: true, type: signal.direction || 'DEFAULT', note: '', setupScore: 70 };
    }

    const rsi = signal.rsi ?? 50;
    const k = signal.stochRSI?.k ?? 50;
    const price = signal.entryPrice;
    const vwap = signal.vwap;
    const boll = signal.bollinger;
    const direction = signal.direction;

    if (direction === 'LONG') {
        if (htfTrend === 'DOWN') {
            return { valid: false, type: 'BLOCK_HTF_DOWN', note: 'HTF 1h giảm — không long ngược xu hướng lớn', setupScore: 0 };
        }

        const extendedAboveVwap = vwap ? price > vwap * 1.04 : false;
        // 2026-07-27: raised RSI 72→76 and StochK 88→90.
        // In crypto bull phases RSI 72-75 is normal momentum — old threshold caused 363 false BLOCK_EXTENDED/week.
        if (rsi > 76 || k > 90 || extendedAboveVwap) {
            return { valid: false, type: 'BLOCK_EXTENDED', note: `Quá căng (RSI ${rsi.toFixed(1)}, K ${k})`, setupScore: 0 };
        }

        const ema21 = signal.ema21;
        const atr = signal.atr || price * 0.02;
        const nearEma21 = ema21 && Math.abs(price - ema21) <= atr * 1.5;
        const macdBull = (signal.breakdown?.macdLong ?? 50) >= 65;

        if (htfTrend === 'UP' && nearEma21 && rsi >= 38 && rsi <= 52 && macdBull) {
            return {
                valid: true,
                type: 'EMA_PULLBACK',
                note: 'HTF UP + pullback EMA21 + RSI vùng vàng',
                setupScore: scoreEmaPullback(signal, htfTrend),
            };
        }

        // Near-VWAP is a *candidate* only. Confirmed reclaim → VWAP_RECLAIM;
        // unconfirmed → fall through to BREAKOUT / TREND_PULLBACK / EMA-class
        // detectors. Hard BLOCK_VWAP_UNCONFIRMED starved LIVE fills (0–1/day).
        const vwapCandidate = htfTrend === 'UP' && vwap
            && price >= vwap * 0.998 && price <= vwap * 1.02
            && (signal.volumeSurge || 0) >= 1.4;
        if (vwapCandidate) {
            const recent = (candles || []).slice(-4);
            const last = recent.at(-1);
            const lastClose = Number(last?.close);
            const lastOpen = Number(last?.open);
            const reclaimedFromBelow = recent.slice(0, -1).some((c) => Number(c?.close) <= vwap);
            const closedAboveVwap = Number.isFinite(lastClose) && lastClose >= vwap * VWAP_CLOSE_CONFIRM_MULT;
            const bullishClose = !Number.isFinite(lastOpen) || lastClose >= lastOpen;
            const strongVolume = (signal.volumeSurge || 0) >= VWAP_VOL_CONFIRM;

            if (reclaimedFromBelow && closedAboveVwap && bullishClose && strongVolume) {
                return {
                    valid: true,
                    type: 'VWAP_RECLAIM',
                    note: 'Reclaim VWAP với volume xác nhận',
                    setupScore: scoreVwapReclaim(signal, htfTrend),
                };
            }
            // Unconfirmed near-VWAP: skip VWAP label, continue other detectors.
        }

        const boScore = scoreBreakoutRetest(signal, candles);
        if (boScore >= 70) {
            return { valid: true, type: 'BREAKOUT_RETEST', note: 'Breakout + retest', setupScore: boScore };
        }

        if (htfTrend === 'UP') {
            return {
                valid: true,
                type: 'TREND_PULLBACK',
                note: 'HTF 1h tăng (pullback rộng)',
                setupScore: scoreEmaPullback(signal, htfTrend) - 8,
            };
        }

        const nearLowerBand = boll ? price <= boll.lower * 1.01 : false;
        if ((rsi < 35 || k < 25) && (nearLowerBand || rsi < 30)) {
            return {
                valid: true,
                type: 'MEAN_REVERSION',
                note: 'Quá bán gần đáy band',
                setupScore: scoreMeanReversion(signal),
            };
        }

        const sweepScore = scoreLiquiditySweep(candles, signal);
        if (sweepScore >= 65) {
            return { valid: true, type: 'LIQUIDITY_SWEEP', note: 'Sweep đáy + hồi', setupScore: sweepScore };
        }

        return { valid: false, type: 'NO_CLEAR_SETUP', note: 'Không setup rõ', setupScore: 0 };
    }

    if (direction === 'SHORT') {
        const sc = scoreShortContinuation(signal, htfTrend, executionContext);
        if (sc >= 60) {
            return { valid: true, type: 'SHORT_CONTINUATION', note: 'HTF down + momentum short', setupScore: sc };
        }
        return { valid: true, type: 'SHORT', note: 'Short mặc định', setupScore: sc };
    }

    return { valid: true, type: direction || 'DEFAULT', note: '', setupScore: 50 };
};

export const computeQualityScore = (entrySetup, signal, executionContext = {}) => {
    const setupScore = entrySetup.setupScore ?? 50;
    const confluence = computeConfluenceScore(signal, signal.direction);
    const confluenceScore = clamp(confluence * 25);
    const contextScore = computeContextScore(signal);
    const qualityScore = Math.round(
        setupScore * 0.55 + confluenceScore * 0.30 + contextScore * 0.15
    );
    return {
        qualityScore: clamp(qualityScore),
        setupScore,
        confluenceScore,
        confluenceCount: confluence,
        contextScore,
    };
};

export const applyQualityToSignal = (signal, entrySetup, executionContext = {}) => {
    const scores = computeQualityScore(entrySetup, signal, executionContext);
    return {
        ...signal,
        score: scores.qualityScore,
        breakdown: {
            ...signal.breakdown,
            ...scores,
            entrySetup: entrySetup.type,
            legacyScore: signal.score,
        },
    };
};

/**
 * @param {object} entrySetup
 * @param {object} signal
 * @param {object} [opts]
 * @param {number} [opts.effectiveQualityFloor] — adaptive band floor (overrides setup static min)
 * @param {number} [opts.effectiveEdgeFloor] — adaptive edge floor
 */
export const passesLiveQuantGate = (entrySetup, signal, opts = {}) => {
    const type = entrySetup?.type;
    const liveWhitelist = getLiveSetupWhitelist();
    if (!liveWhitelist.has(type)) return { pass: false, reason: `setup ${type} không trong LIVE whitelist` };
    if (type === 'MEAN_REVERSION' && (signal.breakdown?.qualityScore ?? signal.score) < 85) {
        return { pass: false, reason: 'MEAN_REVERSION cần qualityScore >= 85 cho LIVE' };
    }
    const q = signal.breakdown?.qualityScore ?? signal.score;
    const edge = signal.breakdown?.edge ?? 0;
    const conf = signal.breakdown?.confluenceCount ?? computeConfluenceScore(signal, signal.direction);
    const adx = signal.breakdown?.adx ?? signal.adx?.adx ?? 0;
    if (adx < 18 && edge < 30) return { pass: false, reason: `ADX ${adx} thấp + edge ${edge} yếu` };
    const staticMin = getLiveQualityMinForSetup(type);
    const minQuality = Number.isFinite(opts.effectiveQualityFloor) && opts.effectiveQualityFloor > 0
        ? opts.effectiveQualityFloor
        : staticMin;
    const liveConfMin = getLiveConfluenceMin();
    const liveEdgeMin = Number.isFinite(opts.effectiveEdgeFloor) && opts.effectiveEdgeFloor > 0
        ? opts.effectiveEdgeFloor
        : getLiveEdgeMin();
    if (q < minQuality) return { pass: false, reason: `qualityScore ${q} < ${minQuality}` };
    if (conf < liveConfMin) return { pass: false, reason: `confluence ${conf} < ${liveConfMin}` };
    if (edge < liveEdgeMin) return { pass: false, reason: `edge ${edge} < ${liveEdgeMin}` };
    return {
        pass: true,
        reason: 'LIVE quant gate OK',
        minQuality,
        liveEdgeMin,
        staticMin,
    };
};

export const passesSimQuantGate = (entrySetup, signal) => {
    if (!entrySetup?.valid) return { pass: false, reason: 'setup invalid' };
    const q = signal.breakdown?.qualityScore ?? signal.score;
    const edge = signal.breakdown?.edge ?? 0;
    const conf = signal.breakdown?.confluenceCount ?? computeConfluenceScore(signal, signal.direction);
    const simQ = getSimQualityMin();
    const simConf = getSimConfluenceMin();
    const simEdge = getSimEdgeMin();
    if (q < simQ) return { pass: false, reason: `qualityScore ${q} < ${simQ}` };
    if (conf < simConf) return { pass: false, reason: `confluence ${conf} < ${simConf}` };
    if (edge < simEdge) return { pass: false, reason: `edge ${edge} < ${simEdge}` };
    return { pass: true, reason: 'SIM quant gate OK' };
};

export const passesResearchQuantGate = (entrySetup, signal) => {
    if (!entrySetup?.valid) return { pass: false, reason: 'setup invalid' };
    const type = entrySetup.type;
    if (!getLiveSetupWhitelist().has(type)) {
        return { pass: false, reason: `setup ${type} không trong whitelist` };
    }
    const q = signal.breakdown?.qualityScore ?? signal.score ?? 0;
    const edge = signal.breakdown?.edge ?? 0;
    const conf = signal.breakdown?.confluenceCount ?? computeConfluenceScore(signal, signal.direction);
    const minQuality = getAutoDuckNumber('AUTODUCK_RESEARCH_QUALITY_MIN') || 70;
    const minEdge = getAutoDuckNumber('AUTODUCK_RESEARCH_EDGE_MIN') || 18;
    const minConfluence = getAutoDuckNumber('AUTODUCK_RESEARCH_CONFLUENCE_MIN') || 2;
    if (q < minQuality) return { pass: false, reason: `research quality ${q} < ${minQuality}` };
    if (conf < minConfluence) return { pass: false, reason: `research confluence ${conf} < ${minConfluence}` };
    if (edge < minEdge) return { pass: false, reason: `research edge ${edge} < ${minEdge}` };
    return { pass: true, reason: 'RESEARCH quant gate OK', minQuality, minEdge, minConfluence };
};
