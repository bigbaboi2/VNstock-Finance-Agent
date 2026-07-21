/**
 * Setup detection + setup-aware quality scoring for AutoDuck entry funnel.
 */

const LIVE_ALLOW_SHORT_CONTINUATION = process.env.AUTODUCK_LIVE_ALLOW_SHORT_CONTINUATION === 'true';
const LIVE_ALLOW_SHORT_FALLBACK = process.env.AUTODUCK_LIVE_ALLOW_SHORT_FALLBACK === 'true';

export const LIVE_SETUP_WHITELIST = new Set([
    'EMA_PULLBACK',
    'TREND_PULLBACK',
    'VWAP_RECLAIM',
    'BREAKOUT_RETEST',
    ...(LIVE_ALLOW_SHORT_CONTINUATION ? ['SHORT_CONTINUATION'] : []),
    ...(LIVE_ALLOW_SHORT_FALLBACK ? ['SHORT'] : []),
]);

export const IDLE_PROBE_SETUP_WHITELIST = new Set([
    'EMA_PULLBACK',
    'TREND_PULLBACK',
    'MEAN_REVERSION',
    'VWAP_RECLAIM',
]);

export const LIVE_QUALITY_MIN = Number(process.env.AUTODUCK_LIVE_QUALITY_MIN) || 82;
export const SIM_QUALITY_MIN = Number(process.env.AUTODUCK_SIM_QUALITY_MIN) || 72;

const parseEnvQuality = (key, fallback) => {
    const v = Number(process.env[key]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
};

/** Ngưỡng quality LIVE theo setup (override env, mặc định = LIVE_QUALITY_MIN). */
export const getLiveQualityMinForSetup = (setupType) => {
    const map = {
        EMA_PULLBACK: parseEnvQuality('AUTODUCK_LIVE_MIN_QUALITY_EMA_PULLBACK', LIVE_QUALITY_MIN),
        TREND_PULLBACK: parseEnvQuality('AUTODUCK_LIVE_MIN_QUALITY_TREND_PULLBACK', LIVE_QUALITY_MIN),
        VWAP_RECLAIM: parseEnvQuality('AUTODUCK_LIVE_MIN_QUALITY_VWAP_RECLAIM', LIVE_QUALITY_MIN),
        BREAKOUT_RETEST: parseEnvQuality('AUTODUCK_LIVE_MIN_QUALITY_BREAKOUT_RETEST', Math.max(LIVE_QUALITY_MIN, 86)),
        SHORT_CONTINUATION: parseEnvQuality('AUTODUCK_LIVE_MIN_QUALITY_SHORT_CONTINUATION', LIVE_QUALITY_MIN),
        SHORT: parseEnvQuality('AUTODUCK_LIVE_MIN_QUALITY_SHORT', LIVE_QUALITY_MIN + 2),
    };
    return map[setupType] ?? LIVE_QUALITY_MIN;
};
export const LIVE_CONFLUENCE_MIN = Number(process.env.AUTODUCK_LIVE_CONFLUENCE_MIN) || 3;
export const SIM_CONFLUENCE_MIN = Number(process.env.AUTODUCK_SIM_CONFLUENCE_MIN) || 2;
export const LIVE_EDGE_MIN = Number(process.env.AUTODUCK_LIVE_EDGE_MIN) || 28;
export const SIM_EDGE_MIN = Number(process.env.AUTODUCK_SIM_EDGE_MIN) || 22;

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
    let s = 50;
    if (htfTrend === 'UP') s += 15;
    if (vwap && price >= vwap * 0.998 && price <= vwap * 1.015) s += 20;
    if ((signal.volumeSurge || 0) >= 1.4) s += 15;
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
        if (rsi > 72 || k > 88 || extendedAboveVwap) {
            return { valid: false, type: 'BLOCK_EXTENDED', note: `Quá căng (RSI ${rsi}, K ${k})`, setupScore: 0 };
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

        if (htfTrend === 'UP' && vwap && price >= vwap * 0.998 && price <= vwap * 1.02 && (signal.volumeSurge || 0) >= 1.4) {
            return {
                valid: true,
                type: 'VWAP_RECLAIM',
                note: 'Reclaim VWAP với volume xác nhận',
                setupScore: scoreVwapReclaim(signal, htfTrend),
            };
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

export const passesLiveQuantGate = (entrySetup, signal) => {
    const type = entrySetup?.type;
    if (!LIVE_SETUP_WHITELIST.has(type)) return { pass: false, reason: `setup ${type} không trong LIVE whitelist` };
    if (type === 'MEAN_REVERSION' && (signal.breakdown?.qualityScore ?? signal.score) < 85) {
        return { pass: false, reason: 'MEAN_REVERSION cần qualityScore >= 85 cho LIVE' };
    }
    const q = signal.breakdown?.qualityScore ?? signal.score;
    const edge = signal.breakdown?.edge ?? 0;
    const conf = signal.breakdown?.confluenceCount ?? computeConfluenceScore(signal, signal.direction);
    const adx = signal.breakdown?.adx ?? signal.adx?.adx ?? 0;
    if (adx < 18 && edge < 30) return { pass: false, reason: `ADX ${adx} thấp + edge ${edge} yếu` };
    const minQuality = getLiveQualityMinForSetup(type);
    if (q < minQuality) return { pass: false, reason: `qualityScore ${q} < ${minQuality}` };
    if (conf < LIVE_CONFLUENCE_MIN) return { pass: false, reason: `confluence ${conf} < ${LIVE_CONFLUENCE_MIN}` };
    if (edge < LIVE_EDGE_MIN) return { pass: false, reason: `edge ${edge} < ${LIVE_EDGE_MIN}` };
    return { pass: true, reason: 'LIVE quant gate OK' };
};

export const passesSimQuantGate = (entrySetup, signal) => {
    if (!entrySetup?.valid) return { pass: false, reason: 'setup invalid' };
    const q = signal.breakdown?.qualityScore ?? signal.score;
    const edge = signal.breakdown?.edge ?? 0;
    const conf = signal.breakdown?.confluenceCount ?? computeConfluenceScore(signal, signal.direction);
    if (q < SIM_QUALITY_MIN) return { pass: false, reason: `qualityScore ${q} < ${SIM_QUALITY_MIN}` };
    if (conf < SIM_CONFLUENCE_MIN) return { pass: false, reason: `confluence ${conf} < ${SIM_CONFLUENCE_MIN}` };
    if (edge < SIM_EDGE_MIN) return { pass: false, reason: `edge ${edge} < ${SIM_EDGE_MIN}` };
    return { pass: true, reason: 'SIM quant gate OK' };
};
