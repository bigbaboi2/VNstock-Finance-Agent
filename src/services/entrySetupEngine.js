/**
 * Setup detection + setup-aware quality scoring for AutoDuck entry funnel.
 */
import {
    getAutoDuckBoolean,
    getAutoDuckNumber,
    getAutoDuckString,
} from './autoDuckConfigService.js';
import { DEFAULT_LONG_CORE_SYMBOLS } from './autoTradeStrategyConstants.js';

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
export const VWAP_RECLAIM_LIVE_QUALITY_DEFAULT = 82;
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
        EMA_PULLBACK: setupOverrideOr('AUTODUCK_LIVE_MIN_QUALITY_EMA_PULLBACK', 82),
        // VWAP reclaim still needs a higher bar than generic setups (near-VWAP
        // + volume is common), but 90 starved LIVE fills. Default 84 balances
        // sample size (~5/day target) vs quality; Setting/env can override.
        VWAP_RECLAIM: setupOverrideOr(
            'AUTODUCK_LIVE_MIN_QUALITY_VWAP_RECLAIM',
            VWAP_RECLAIM_LIVE_QUALITY_DEFAULT
        ),
        // BREAKOUT_RETEST: WR=60% (7-day data) → lower bar from 86→82 to increase throughput.
        BREAKOUT_RETEST: setupOverrideOr('AUTODUCK_LIVE_MIN_QUALITY_BREAKOUT_RETEST', 80),
        // TREND_PULLBACK: lower bar to 80 to generate more samples (was equal to globalMin=82).
        TREND_PULLBACK: setupOverrideOr('AUTODUCK_LIVE_MIN_QUALITY_TREND_PULLBACK', 84),
        SHORT_CONTINUATION: setupOverrideOr('AUTODUCK_LIVE_MIN_QUALITY_SHORT_CONTINUATION', 82),
        SHORT: setupOverrideOr('AUTODUCK_LIVE_MIN_QUALITY_SHORT', 86),
    };
    return map[setupType] ?? globalMin;
};

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

const finite = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

export const getLiveEdgeMinForSetup = (setupType) => {
    const globalMin = getLiveEdgeMin();
    const map = {
        BREAKOUT_RETEST: setupOverrideOr('AUTODUCK_LIVE_MIN_EDGE_BREAKOUT_RETEST', 26),
        VWAP_RECLAIM: setupOverrideOr('AUTODUCK_LIVE_MIN_EDGE_VWAP_RECLAIM', 24),
        EMA_PULLBACK: setupOverrideOr('AUTODUCK_LIVE_MIN_EDGE_EMA_PULLBACK', 25),
        TREND_PULLBACK: setupOverrideOr('AUTODUCK_LIVE_MIN_EDGE_TREND_PULLBACK', 28),
        SHORT_CONTINUATION: setupOverrideOr('AUTODUCK_LIVE_MIN_EDGE_SHORT_CONTINUATION', 26),
        SHORT: setupOverrideOr('AUTODUCK_LIVE_MIN_EDGE_SHORT', 30),
    };
    return map[setupType] ?? globalMin;
};

const parseSymbolList = (raw) => String(raw || '')
    .split(/[\s,;]+/)
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

export const getLongCoreSymbols = () => {
    const configured = parseSymbolList(getAutoDuckString('AUTODUCK_LONG_CORE_SYMBOLS'));
    return new Set(configured.length ? configured : DEFAULT_LONG_CORE_SYMBOLS);
};

export const getCryptoMinAtrPct = (symbol) => getLongCoreSymbols().has(String(symbol || '').toUpperCase())
    ? configNumberOr('AUTODUCK_MIN_ATR_PCT_CORE', 0.25)
    : configNumberOr('AUTODUCK_MIN_ATR_PCT_ALT', 0.40);

export const normalizeMarketRegime = (marketCondition) => {
    const raw = String(marketCondition || 'NEUTRAL').toUpperCase();
    if (raw.includes('RISK_OFF') || raw.includes('RISK-OFF') || raw.includes('BEAR')) return 'RISK_OFF';
    if (raw.includes('RISK_ON') || raw.includes('RISK-ON') || raw.includes('BULL')) return 'RISK_ON';
    return 'NEUTRAL';
};

const configNumberOr = (key, fallback) => {
    const value = getAutoDuckNumber(key);
    return Number.isFinite(value) ? value : fallback;
};

export const resolveRegimeAdjustments = ({ marketCondition, direction = 'LONG' } = {}) => {
    const regime = normalizeMarketRegime(marketCondition);
    const isShort = String(direction).toUpperCase() === 'SHORT';
    let qualityAdj = 0;
    let edgeAdj = 0;
    let volumeAdj = 0;
    if (isShort && regime === 'NEUTRAL') {
        qualityAdj = configNumberOr('AUTODUCK_REGIME_NEUTRAL_SHORT_QUALITY_ADJ', 1);
        edgeAdj = configNumberOr('AUTODUCK_REGIME_NEUTRAL_SHORT_EDGE_ADJ', 1);
        volumeAdj = configNumberOr('AUTODUCK_REGIME_NEUTRAL_SHORT_VOLUME_ADJ', 0.1);
    } else if (isShort && regime === 'RISK_ON') {
        qualityAdj = configNumberOr('AUTODUCK_REGIME_RISK_ON_SHORT_QUALITY_ADJ', 3);
        edgeAdj = configNumberOr('AUTODUCK_REGIME_RISK_ON_SHORT_EDGE_ADJ', 3);
        volumeAdj = configNumberOr('AUTODUCK_REGIME_RISK_ON_SHORT_VOLUME_ADJ', 0.2);
    } else if (!isShort && regime === 'NEUTRAL') {
        qualityAdj = configNumberOr('AUTODUCK_REGIME_NEUTRAL_LONG_QUALITY_ADJ', 2);
        edgeAdj = configNumberOr('AUTODUCK_REGIME_NEUTRAL_LONG_EDGE_ADJ', 2);
        volumeAdj = configNumberOr('AUTODUCK_REGIME_NEUTRAL_LONG_VOLUME_ADJ', 0.1);
    } else if (!isShort && regime === 'RISK_OFF') {
        qualityAdj = configNumberOr('AUTODUCK_REGIME_RISK_OFF_LONG_QUALITY_ADJ', 4);
        edgeAdj = configNumberOr('AUTODUCK_REGIME_RISK_OFF_LONG_EDGE_ADJ', 4);
        volumeAdj = configNumberOr('AUTODUCK_REGIME_RISK_OFF_LONG_VOLUME_ADJ', 0.2);
    }
    return { regime, qualityAdj, edgeAdj, volumeAdj };
};

export const resolveCryptoVolumeProfile = ({ symbol, direction = 'LONG', marketCondition } = {}) => {
    const tier = getLongCoreSymbols().has(String(symbol || '').toUpperCase()) ? 'CORE' : 'ALT';
    const baseFloor = tier === 'CORE'
        ? configNumberOr('AUTODUCK_VOLUME_FLOOR_CORE', 1.0)
        : configNumberOr('AUTODUCK_VOLUME_FLOOR_ALT', 1.2);
    const adjustments = resolveRegimeAdjustments({ marketCondition, direction });
    return {
        tier,
        baseFloor,
        volumeFloor: baseFloor + adjustments.volumeAdj,
        maxVolume: configNumberOr('AUTODUCK_VOLUME_CLIMAX_MAX', 4.0),
        regime: adjustments.regime,
        adjustments,
    };
};

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

const computeConfluenceStrength = (signal, direction) => {
    const b = signal?.breakdown || {};
    const isLong = direction === 'LONG' || direction === 'MUA';
    const trend = finite(isLong ? b.trendLong : b.trendShort, 50);
    const macd = finite(isLong ? b.macdLong : b.macdShort, 50);
    const obv = finite(isLong ? b.obvLong : b.obvShort, 50);
    const volumeSurge = finite(signal?.volumeSurge, 0);
    const volumeStrength = volumeSurge <= 0
        ? 0
        : clamp(100 - Math.abs(volumeSurge - 2.2) * 34);

    return Math.round(clamp(
        trend * 0.30 + macd * 0.30 + obv * 0.20 + volumeStrength * 0.20
    ));
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

const evaluateBreakoutRetestLegacy = (signal, candles = []) => {
    if (!candles || candles.length < 25) {
        return { valid: false, score: 0, reason: 'Thiếu candle xác nhận breakout/retest' };
    }

    const history = candles.slice(-24, -2);
    const breakout = candles.at(-2);
    const retest = candles.at(-1);
    const resistance = Math.max(...history.map((c) => finite(c.high, finite(c.close))));
    const atr = finite(signal?.atr, finite(retest?.close) * 0.01);
    const breakoutOpen = finite(breakout?.open);
    const breakoutClose = finite(breakout?.close);
    const breakoutHigh = finite(breakout?.high, breakoutClose);
    const breakoutLow = finite(breakout?.low, breakoutOpen);
    const retestOpen = finite(retest?.open);
    const retestClose = finite(retest?.close);
    const retestLow = finite(retest?.low, retestClose);
    const breakoutRange = Math.max(breakoutHigh - breakoutLow, Number.EPSILON);
    const bodyRatio = Math.abs(breakoutClose - breakoutOpen) / breakoutRange;
    const displacementAtr = atr > 0 ? (breakoutClose - resistance) / atr : 0;
    const entryDistanceAtr = atr > 0 ? (retestClose - resistance) / atr : Infinity;
    const volumeSurge = finite(signal?.volumeSurge);

    const breakoutConfirmed = breakoutClose > breakoutOpen
        && displacementAtr >= 0.15
        && bodyRatio >= 0.50;
    const retestTouched = atr > 0
        && retestLow <= resistance + atr * 0.25
        && retestLow >= resistance - atr * 0.40;
    const retestHeld = retestClose >= resistance + atr * 0.03
        && retestClose >= retestOpen;
    const entryNotChased = entryDistanceAtr >= 0.03 && entryDistanceAtr <= 0.50;
    const volumeHealthy = volumeSurge >= 1.2 && volumeSurge <= 4.0;

    if (!breakoutConfirmed || !retestTouched || !retestHeld || !entryNotChased || !volumeHealthy) {
        return {
            valid: false,
            score: 0,
            reason: !breakoutConfirmed ? 'Breakout chưa đủ displacement/body'
                : !retestTouched ? 'Không retest vùng breakout'
                : !retestHeld ? 'Retest chưa đóng giữ trên kháng cự'
                : !entryNotChased ? 'Entry đã cách vùng breakout quá xa'
                : 'Volume breakout bất thường hoặc không đủ',
            resistance,
            entryDistanceAtr,
            displacementAtr,
        };
    }

    const displacementScore = clamp(55 + displacementAtr * 45, 55, 95);
    const retestScore = clamp(100 - Math.abs(entryDistanceAtr - 0.18) * 120, 55, 100);
    const bodyScore = clamp(bodyRatio * 100, 50, 100);
    const volumeScore = clamp(100 - Math.abs(volumeSurge - 2.2) * 30, 50, 100);
    const score = Math.round(
        displacementScore * 0.30 + retestScore * 0.30 + bodyScore * 0.20 + volumeScore * 0.20
    );

    return {
        valid: score >= 78,
        score,
        reason: score >= 78 ? 'Breakout và retest hai nến đã xác nhận' : 'Chất lượng retest thấp',
        resistance,
        maxEntryPrice: resistance + atr * 0.50,
        minEntryPrice: resistance + atr * 0.03,
        entryDistanceAtr,
        displacementAtr,
    };
};
// Kept temporarily for replay comparisons between the strict detector and V3.
export const evaluateBreakoutRetestStrictBaseline = evaluateBreakoutRetestLegacy;

export const evaluateBreakoutRetest = (signal, candles = []) => {
    if (!candles || candles.length < 25) {
        return { valid: false, score: 0, reason: 'BREAKOUT_INSUFFICIENT_CANDLES' };
    }
    const volumeSurge = finite(signal?.volumeSurge);
    if (volumeSurge < 1.2 || volumeSurge > 4.0) {
        return { valid: false, score: 0, reason: volumeSurge > 4 ? 'BREAKOUT_VOLUME_CLIMAX' : 'BREAKOUT_VOLUME_LOW' };
    }

    const lastIndex = candles.length - 1;
    const diagnostics = [];
    for (let breakoutIndex = Math.max(20, lastIndex - 3); breakoutIndex <= lastIndex - 1; breakoutIndex += 1) {
        const breakout = candles[breakoutIndex];
        const prior = candles.slice(Math.max(0, breakoutIndex - 24), breakoutIndex);
        const resistance = Math.max(...prior.map((c) => finite(c.high, finite(c.close))));
        const atr = finite(signal?.atr, finite(candles[lastIndex]?.close) * 0.01);
        const open = finite(breakout?.open);
        const close = finite(breakout?.close);
        const high = finite(breakout?.high, close);
        const low = finite(breakout?.low, open);
        const bodyRatio = Math.abs(close - open) / Math.max(high - low, Number.EPSILON);
        const displacementAtr = atr > 0 ? (close - resistance) / atr : 0;
        if (!(close > open && displacementAtr >= 0.15 && bodyRatio >= 0.50)) {
            diagnostics.push('BREAKOUT_DISPLACEMENT_OR_BODY');
            continue;
        }
        const postBreakout = candles.slice(breakoutIndex + 1, Math.min(lastIndex + 1, breakoutIndex + 4));
        const retest = postBreakout.find((c) => {
            const candleLow = finite(c?.low, finite(c?.close));
            return candleLow >= resistance - atr * 0.40
                && candleLow <= resistance + atr * 0.40
                && finite(c?.close) >= resistance;
        });
        if (!retest) {
            diagnostics.push('BREAKOUT_RETEST_NOT_TOUCHED_1_3');
            continue;
        }
        const current = candles[lastIndex];
        const currentClose = finite(current?.close);
        const entryDistanceAtr = atr > 0 ? (currentClose - resistance) / atr : Infinity;
        if (currentClose < resistance) {
            diagnostics.push('BREAKOUT_RETEST_NOT_HELD');
            continue;
        }
        if (entryDistanceAtr < 0 || entryDistanceAtr > 0.60) {
            diagnostics.push('BREAKOUT_ENTRY_OUTSIDE_0_6_ATR');
            continue;
        }
        const score = Math.round(
            clamp(55 + displacementAtr * 45, 55, 95) * 0.30
            + clamp(100 - Math.abs(entryDistanceAtr - 0.18) * 100, 55, 100) * 0.30
            + clamp(bodyRatio * 100, 50, 100) * 0.20
            + clamp(100 - Math.abs(volumeSurge - 2.2) * 30, 50, 100) * 0.20
        );
        return {
            valid: score >= 78,
            score,
            reason: score >= 78 ? 'BREAKOUT_RETEST_CONFIRMED' : 'BREAKOUT_RETEST_SCORE_LOW',
            setupPattern: 'BREAKOUT_RETEST_1_3',
            resistance,
            referencePrice: resistance,
            maxEntryPrice: resistance + atr * 0.60,
            minEntryPrice: resistance,
            entryDistanceAtr,
            displacementAtr,
            triggerCandleTime: current?.time ?? current?.timestamp ?? current?.openTime,
        };
    }
    return { valid: false, score: 0, reason: diagnostics.at(-1) || 'BREAKOUT_NOT_FOUND', diagnostics };
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
        const nearEma21 = ema21 && Math.abs(price - ema21) <= atr;
        const macdBull = (signal.breakdown?.macdLong ?? 50) >= 65;
        const lastCandle = candles.at(-1);
        const previousCandle = candles.at(-2);
        const beforePreviousCandle = candles.at(-3);
        const emaPullbackTouched = ema21 && Number(previousCandle?.low) <= ema21 + atr * 0.25;
        const emaHigherLow = Number(lastCandle?.low) > Number(previousCandle?.low);
        const emaTrigger = Number(lastCandle?.close) > Number(previousCandle?.high)
            || (Number(lastCandle?.close) > Number(previousCandle?.close)
                && Number(previousCandle?.close) > Number(beforePreviousCandle?.close));

        if (htfTrend === 'UP' && nearEma21 && Math.abs(price - ema21) <= atr * 0.75
            && rsi >= 42 && rsi <= 55 && macdBull && emaPullbackTouched && emaHigherLow && emaTrigger) {
            return {
                valid: true,
                type: 'EMA_PULLBACK',
                note: 'HTF UP + pullback EMA21 + RSI vùng vàng',
                setupScore: scoreEmaPullback(signal, htfTrend),
                referencePrice: ema21,
                minEntryPrice: ema21 - atr * 0.75,
                maxEntryPrice: ema21 + atr * 0.75,
                entryDistanceAtr: Math.abs(price - ema21) / atr,
                setupPattern: Number(lastCandle?.close) > Number(previousCandle?.high) ? 'BREAK_PREVIOUS_HIGH' : 'TWO_RISING_CLOSES',
                triggerCandleTime: lastCandle?.time ?? lastCandle?.timestamp ?? lastCandle?.openTime,
            };
        }

        // Near-VWAP is a *candidate* only. Confirmed reclaim → VWAP_RECLAIM;
        // unconfirmed → fall through to BREAKOUT / TREND_PULLBACK / EMA-class
        // detectors. Hard BLOCK_VWAP_UNCONFIRMED starved LIVE fills (0–1/day).
        const maxVwapEntry = vwap ? vwap + atr * 0.35 : null;
        const vwapEvaluation = evaluateVwapReclaim(signal, candles);
        if (htfTrend === 'UP' && vwapEvaluation.valid) {
            return {
                valid: true,
                type: 'VWAP_RECLAIM',
                note: vwapEvaluation.reason,
                setupScore: scoreVwapReclaim(signal, htfTrend),
                ...vwapEvaluation,
            };
        }
        const vwapCandidate = false;
        if (vwapCandidate) {
            const recent = (candles || []).slice(-5);
            const last = recent.at(-1);
            const prev = recent.at(-2);
            const lastClose = Number(last?.close);
            const lastOpen = Number(last?.open);
            const prevClose = Number(prev?.close);
            const reclaimedFromBelow = recent.slice(0, -2).some((c) => Number(c?.close) <= vwap);
            const closedAboveVwap = Number.isFinite(lastClose) && lastClose >= vwap * VWAP_CLOSE_CONFIRM_MULT;
            const heldAboveVwap = Number.isFinite(prevClose) && prevClose >= vwap;
            const bullishClose = !Number.isFinite(lastOpen) || lastClose >= lastOpen;
            const strongVolume = (signal.volumeSurge || 0) >= VWAP_VOL_CONFIRM;

            if (reclaimedFromBelow && heldAboveVwap && closedAboveVwap && bullishClose && strongVolume) {
                return {
                    valid: true,
                    type: 'VWAP_RECLAIM',
                    note: 'Reclaim VWAP với volume xác nhận',
                    setupScore: scoreVwapReclaim(signal, htfTrend),
                    referencePrice: vwap,
                    minEntryPrice: vwap,
                    maxEntryPrice: maxVwapEntry,
                };
            }
            // Unconfirmed near-VWAP: skip VWAP label, continue other detectors.
        }

        const breakoutRetest = evaluateBreakoutRetest(signal, candles);
        if (breakoutRetest.valid) {
            return {
                valid: true,
                type: 'BREAKOUT_RETEST',
                note: breakoutRetest.reason,
                setupScore: breakoutRetest.score,
                referencePrice: breakoutRetest.resistance,
                minEntryPrice: breakoutRetest.minEntryPrice,
                maxEntryPrice: breakoutRetest.maxEntryPrice,
                triggerCandleTime: breakoutRetest.triggerCandleTime,
                entryDistanceAtr: breakoutRetest.entryDistanceAtr,
                setupPattern: breakoutRetest.setupPattern,
            };
        }

        const last = candles.at(-1);
        const prev = candles.at(-2);
        const before = candles.at(-3);
        const bullishTrigger = Number(last?.close) > Number(prev?.high);
        const improvingMomentumTrigger = Number(last?.close) > Number(prev?.close)
            && Number(prev?.close) > Number(before?.close)
            && macdBull;
        const higherLow = Number(last?.low) > Number(prev?.low);
        const strictPullback = htfTrend === 'UP'
            && nearEma21
            && Math.abs(price - ema21) <= atr
            && rsi >= 42 && rsi <= 60
            && macdBull
            && (bullishTrigger || improvingMomentumTrigger)
            && (bullishTrigger || Math.abs(price - ema21) <= atr * 0.60)
            && higherLow;
        if (strictPullback) {
            return {
                valid: true,
                type: 'TREND_PULLBACK',
                note: bullishTrigger ? 'TREND_BREAK_PREVIOUS_HIGH' : 'TREND_TWO_RISING_CLOSES',
                setupScore: scoreEmaPullback(signal, htfTrend),
                referencePrice: ema21,
                minEntryPrice: ema21 - atr,
                maxEntryPrice: ema21 + atr,
                entryDistanceAtr: Math.abs(price - ema21) / atr,
                setupPattern: bullishTrigger ? 'BREAK_PREVIOUS_HIGH' : 'TWO_RISING_CLOSES',
                triggerCandleTime: last?.time ?? last?.timestamp ?? last?.openTime,
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

        return {
            valid: false,
            type: 'NO_CLEAR_SETUP',
            note: [vwapEvaluation.reason, breakoutRetest.reason, 'TREND_TRIGGER_OR_HIGHER_LOW_MISSING'].filter(Boolean).join('|'),
            diagnostics: { vwap: vwapEvaluation.reason, breakout: breakoutRetest.reason, trend: 'TREND_TRIGGER_OR_HIGHER_LOW_MISSING' },
            setupScore: 0,
        };
    }

    if (direction === 'SHORT') {
        const shortEvaluation = evaluateShortContinuation(signal, htfTrend, candles, executionContext);
        const sc = shortEvaluation.setupScore;
        if (shortEvaluation.valid) {
            return {
                valid: true,
                type: 'SHORT_CONTINUATION',
                note: 'HTF DOWN + pullback EMA21 + lower-high + bearish trigger',
                setupScore: shortEvaluation.setupScore,
                referencePrice: shortEvaluation.referencePrice,
                minEntryPrice: shortEvaluation.minEntryPrice,
                maxEntryPrice: shortEvaluation.maxEntryPrice,
                entryDistanceAtr: shortEvaluation.entryDistanceAtr,
                setupPattern: shortEvaluation.setupPattern,
                triggerCandleTime: shortEvaluation.triggerCandleTime,
            };
        }
        return { valid: true, type: 'SHORT', note: shortEvaluation.reason, setupScore: sc };
    }

    return { valid: true, type: direction || 'DEFAULT', note: '', setupScore: 50 };
};

export const computeQualityScore = (entrySetup, signal, executionContext = {}) => {
    const setupScore = entrySetup.setupScore ?? 50;
    const confluence = computeConfluenceScore(signal, signal.direction);
    const confluenceScore = computeConfluenceStrength(signal, signal.direction);
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
    const isLong = signal.direction === 'LONG' || signal.direction === 'MUA';
    const htfTrend = String(signal.breakdown?.htfTrend || 'NEUTRAL').toUpperCase();
    const momentum = Number(isLong ? signal.breakdown?.macdLong : signal.breakdown?.macdShort) || 0;
    const volumeSurge = Number(signal.volumeSurge) || 0;
    if (signal.assetType === 'CRYPTO' || signal.breakdown?.htfTrend) {
        if (isLong && htfTrend !== 'UP') return { pass: false, reason: `HTF ${htfTrend} không đồng thuận LONG` };
        if (!isLong && htfTrend !== 'DOWN') return { pass: false, reason: `HTF ${htfTrend} không đồng thuận SHORT` };
        if (momentum < 60) return { pass: false, reason: `momentum ${momentum} < 60` };
        const minVolume = Number.isFinite(opts.minVolume) ? opts.minVolume : 1.2;
        const maxVolume = Number.isFinite(opts.maxVolume) ? opts.maxVolume : 4.0;
        if (volumeSurge < minVolume) return { pass: false, reason: `volumeSurge ${volumeSurge} < ${minVolume}` };
        if (volumeSurge > maxVolume) return { pass: false, reason: `volumeSurge ${volumeSurge} > ${maxVolume} (climax)` };
    }
    const adx = signal.breakdown?.adx ?? signal.adx?.adx ?? 0;
    if (adx < 18 && edge < 30) return { pass: false, reason: `ADX ${adx} thấp + edge ${edge} yếu` };
    const staticMin = getLiveQualityMinForSetup(type);
    const minQuality = Number.isFinite(opts.effectiveQualityFloor) && opts.effectiveQualityFloor > 0
        ? opts.effectiveQualityFloor
        : staticMin;
    const liveConfMin = getLiveConfluenceMin();
    const liveEdgeMin = Number.isFinite(opts.effectiveEdgeFloor) && opts.effectiveEdgeFloor > 0
        ? opts.effectiveEdgeFloor
        : getLiveEdgeMinForSetup(type);
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

export const evaluateVwapReclaim = (signal, candles = []) => {
    const vwap = finite(signal?.vwap);
    const price = finite(signal?.entryPrice);
    const atr = finite(signal?.atr, price * 0.02);
    const volumeSurge = finite(signal?.volumeSurge);
    if (!(vwap > 0 && atr > 0)) return { valid: false, reason: 'VWAP_OR_ATR_MISSING' };
    if (volumeSurge > 4) return { valid: false, reason: 'VWAP_VOLUME_CLIMAX' };
    if (finite(signal?.rsi, 50) > 64) return { valid: false, reason: 'VWAP_MOMENTUM_OVEREXTENDED' };
    const entryDistanceAtr = (price - vwap) / atr;
    if (entryDistanceAtr < 0 || entryDistanceAtr > 0.35) {
        return { valid: false, reason: 'VWAP_ENTRY_OUTSIDE_0_35_ATR', entryDistanceAtr };
    }
    const last = candles.at(-1);
    const prev = candles.at(-2);
    const before = candles.at(-3);
    const bullishCandle = finite(last?.close) >= finite(last?.open, finite(last?.close));
    const twoCloses = finite(prev?.close) > vwap && finite(last?.close) > vwap
        && bullishCandle;
    const crossRetest = finite(prev?.close) > vwap
        && finite(before?.close) <= vwap
        && finite(last?.low, finite(last?.close)) <= vwap + atr * 0.10
        && finite(last?.close) > vwap
        && finite(last?.close) >= finite(prev?.close)
        && finite(last?.close) > finite(prev?.high, finite(prev?.close))
        && bullishCandle;
    if (!twoCloses && !crossRetest) return { valid: false, reason: 'VWAP_CONFIRMATION_MISSING' };
    return {
        valid: true,
        reason: crossRetest ? 'VWAP_CROSS_RETEST_HELD' : 'VWAP_TWO_CLOSES_ABOVE',
        setupPattern: crossRetest ? 'CROSS_RETEST' : 'TWO_CLOSES',
        referencePrice: vwap,
        minEntryPrice: vwap,
        maxEntryPrice: vwap + atr * 0.35,
        entryDistanceAtr,
        triggerCandleTime: last?.time ?? last?.timestamp ?? last?.openTime,
    };
};

export const evaluateShortContinuation = (signal, htfTrend, candles = [], executionContext = {}) => {
    const price = finite(signal?.entryPrice);
    const atr = finite(signal?.atr, price * 0.02);
    const ema21 = finite(signal?.ema21);
    const volumeSurge = finite(signal?.volumeSurge);
    const last = candles.at(-1);
    const prev = candles.at(-2);
    const sc = scoreShortContinuation(signal, htfTrend, executionContext);
    if (htfTrend !== 'DOWN') return { valid: false, reason: 'SHORT_HTF_NOT_DOWN', setupScore: sc };
    if (volumeSurge < 1.2 || volumeSurge > 4) {
        return { valid: false, reason: volumeSurge > 4 ? 'SHORT_VOLUME_CLIMAX' : 'SHORT_VOLUME_LOW', setupScore: sc };
    }
    const nearEma = ema21 > 0 && Math.abs(price - ema21) <= atr;
    const emaTouched = finite(last?.high) >= ema21 - atr * 0.25;
    const bearishRejection = finite(last?.close) < finite(last?.open)
        && finite(last?.close) < ema21
        && finite(last?.close) < finite(prev?.low);
    if (sc >= 60 && nearEma && emaTouched && bearishRejection) {
        return {
            valid: true, setupScore: sc, reason: 'SHORT_EMA21_BEARISH_REJECTION', setupPattern: 'EMA21_REJECTION',
            referencePrice: ema21, minEntryPrice: ema21 - atr, maxEntryPrice: ema21 + atr,
            entryDistanceAtr: (price - ema21) / atr,
            triggerCandleTime: last?.time ?? last?.timestamp ?? last?.openTime,
        };
    }

    const lastIndex = candles.length - 1;
    for (let breakdownIndex = Math.max(20, lastIndex - 3); breakdownIndex <= lastIndex - 1; breakdownIndex += 1) {
        const prior = candles.slice(Math.max(0, breakdownIndex - 24), breakdownIndex);
        const support = Math.min(...prior.map((c) => finite(c.low, finite(c.close))));
        const breakdown = candles[breakdownIndex];
        if (finite(breakdown?.close) > support - atr * 0.15) continue;
        const retest = candles.slice(breakdownIndex + 1, Math.min(lastIndex + 1, breakdownIndex + 4))
            .find((c) => finite(c?.high) >= support - atr * 0.40 && finite(c?.high) <= support + atr * 0.40);
        if (!retest || finite(retest?.close) >= support || finite(last?.close) >= support) continue;
        const entryDistanceAtr = (support - price) / atr;
        if (entryDistanceAtr < 0 || entryDistanceAtr > 0.60) continue;
        return {
            valid: true, setupScore: sc, reason: 'SHORT_BREAKDOWN_RETEST_FAILED', setupPattern: 'BREAKDOWN_RETEST',
            referencePrice: support, minEntryPrice: support - atr * 0.60, maxEntryPrice: support,
            entryDistanceAtr,
            triggerCandleTime: last?.time ?? last?.timestamp ?? last?.openTime,
        };
    }
    return { valid: false, reason: 'SHORT_NO_EMA_REJECTION_OR_BREAKDOWN_RETEST', setupScore: sc };
};

export const validateEntryQuote = (entrySetup, signal, quote, { maxAgeMs = 60_000 } = {}) => {
    const price = finite(quote?.price);
    const fetchedAt = quote?.fetchedAt ? new Date(quote.fetchedAt).getTime() : NaN;
    if (!(price > 0)) return { valid: false, reason: 'Realtime quote không hợp lệ' };
    if (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt > maxAgeMs) {
        return { valid: false, reason: 'Realtime quote đã stale' };
    }

    const minEntry = finite(entrySetup?.minEntryPrice, -Infinity);
    const maxEntry = finite(entrySetup?.maxEntryPrice, Infinity);
    if (price < minEntry || price > maxEntry) {
        return {
            valid: false,
            reason: `Giá realtime ${price} đã rời vùng entry [${minEntry}, ${maxEntry}]`,
        };
    }

    return { valid: true, reason: 'Realtime quote còn trong vùng setup' };
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
