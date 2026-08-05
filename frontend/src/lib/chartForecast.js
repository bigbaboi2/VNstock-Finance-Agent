export const MIN_FORECAST_CANDLES = 35;
const SIGNAL_LOOKBACK_CANDLES = 260;

const SCORE_WEIGHTS = Object.freeze({
  ema: 0.15,
  sma: 0.20,
  macd: 0.15,
  rsi: 0.15,
  bollinger: 0.15,
  momentum: 0.10,
  volumeCandle: 0.10,
});

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function calculateSMA(values, period) {
  if (!Array.isArray(values) || values.length < period || period <= 0) return null;
  return average(values.slice(-period));
}

function calculateEMA(values, period) {
  if (!Array.isArray(values) || values.length < period || period <= 0) return null;
  const multiplier = 2 / (period + 1);
  let ema = average(values.slice(0, period));
  for (let index = period; index < values.length; index += 1) {
    ema = values[index] * multiplier + ema * (1 - multiplier);
  }
  return ema;
}

function calculateEMASeries(values, period) {
  if (!Array.isArray(values) || values.length < period || period <= 0) return [];
  const multiplier = 2 / (period + 1);
  let ema = average(values.slice(0, period));
  const result = new Array(period - 1).fill(null);
  result.push(ema);
  for (let index = period; index < values.length; index += 1) {
    ema = values[index] * multiplier + ema * (1 - multiplier);
    result.push(ema);
  }
  return result;
}

export function calculateATR(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period + 1) return null;
  const trueRanges = [];
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];
    trueRanges.push(Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    ));
  }
  return average(trueRanges.slice(-period));
}

function calculateRSI(values, period = 14) {
  if (!Array.isArray(values) || values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;
  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain = ((averageGain * (period - 1)) + Math.max(change, 0)) / period;
    averageLoss = ((averageLoss * (period - 1)) + Math.max(-change, 0)) / period;
  }
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  const relativeStrength = averageGain / averageLoss;
  return 100 - (100 / (1 + relativeStrength));
}

function calculateMACDHistogram(values) {
  if (!Array.isArray(values) || values.length < MIN_FORECAST_CANDLES) return null;
  const ema12 = calculateEMASeries(values, 12);
  const ema26 = calculateEMASeries(values, 26);
  const macdValues = [];
  for (let index = 25; index < values.length; index += 1) {
    if (ema12[index] != null && ema26[index] != null) {
      macdValues.push(ema12[index] - ema26[index]);
    }
  }
  if (macdValues.length < 9) return null;
  const signal = calculateEMA(macdValues, 9);
  return macdValues[macdValues.length - 1] - signal;
}

function calculateBollinger(values, period = 20, multiplier = 2) {
  if (!Array.isArray(values) || values.length < period) return null;
  const slice = values.slice(-period);
  const middle = average(slice);
  const variance = average(slice.map(value => (value - middle) ** 2));
  const deviation = Math.sqrt(variance);
  return {
    middle,
    upper: middle + multiplier * deviation,
    lower: middle - multiplier * deviation,
  };
}

function normalizedGap(fast, slow, atr) {
  if (fast == null || slow == null || !Number.isFinite(atr) || atr <= 0) return null;
  return clamp((fast - slow) / (atr * 1.2), -1, 1);
}

export function calculateSmaStructure(closes, atr) {
  const sma = {};
  [5, 10, 20, 50, 100, 200].forEach(period => {
    sma[period] = calculateSMA(closes, period);
  });

  const tiers = [
    {
      key: 'short',
      weight: 0.40,
      values: [normalizedGap(sma[5], sma[10], atr), normalizedGap(sma[10], sma[20], atr)],
    },
    {
      key: 'medium',
      weight: 0.35,
      values: [normalizedGap(sma[20], sma[50], atr)],
    },
    {
      key: 'long',
      weight: 0.25,
      values: [normalizedGap(sma[50], sma[100], atr), normalizedGap(sma[100], sma[200], atr)],
    },
  ].map(tier => {
    const available = tier.values.filter(value => value != null);
    return available.length ? { ...tier, score: average(available) } : null;
  }).filter(Boolean);

  const availableWeight = tiers.reduce((sum, tier) => sum + tier.weight, 0);
  const score = availableWeight > 0
    ? tiers.reduce((sum, tier) => sum + tier.score * (tier.weight / availableWeight), 0)
    : 0;

  return {
    score: clamp(score, -1, 1),
    sma,
    availableTiers: tiers.map(tier => tier.key),
  };
}

export function calculateSignalScore(candles) {
  if (!Array.isArray(candles) || candles.length < MIN_FORECAST_CANDLES) return null;
  const closes = candles.map(candle => Number(candle.close));
  const latest = candles[candles.length - 1];
  const rawAtr = calculateATR(candles, 14);
  const priceFallback = Math.max(Math.abs(latest.close) * 0.001, Number.EPSILON);
  const atr = Number.isFinite(rawAtr) && rawAtr > 0 ? rawAtr : priceFallback;

  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const emaScore = clamp((ema9 - ema21) / (atr * 0.8), -1, 1);

  const smaStructure = calculateSmaStructure(closes, atr);
  const macdHistogram = calculateMACDHistogram(closes) ?? 0;
  const macdScore = clamp(macdHistogram / (atr * 0.35), -1, 1);

  const rsi = calculateRSI(closes, 14) ?? 50;
  const rsiScore = clamp((rsi - 50) / 25, -1, 1);

  const bollinger = calculateBollinger(closes, 20);
  const halfBand = bollinger ? (bollinger.upper - bollinger.lower) / 2 : 0;
  const bollingerScore = halfBand > 0
    ? clamp((latest.close - bollinger.middle) / halfBand, -1, 1)
    : 0;

  const momentumBase = closes[closes.length - 6];
  const momentumScore = momentumBase != null
    ? clamp((latest.close - momentumBase) / (atr * 2.5), -1, 1)
    : 0;

  const previousVolumes = candles.slice(-21, -1).map(candle => Number(candle.volume) || 0);
  const averageVolume = average(previousVolumes) || 0;
  const volumeRatio = averageVolume > 0 ? (Number(latest.volume) || 0) / averageVolume : 1;
  const body = latest.close - latest.open;
  const bodyDirection = body === 0 ? 0 : Math.sign(body);
  const bodyStrength = clamp(Math.abs(body) / atr, 0, 1);
  const volumeConfirmation = clamp(volumeRatio / 1.5, 0.25, 1);
  const volumeCandleScore = bodyDirection * bodyStrength * volumeConfirmation;

  const components = {
    ema: emaScore,
    sma: smaStructure.score,
    macd: macdScore,
    rsi: rsiScore,
    bollinger: bollingerScore,
    momentum: momentumScore,
    volumeCandle: volumeCandleScore,
  };
  const score = Object.entries(SCORE_WEIGHTS).reduce(
    (sum, [key, weight]) => sum + components[key] * weight,
    0,
  );

  return {
    score: clamp(score, -1, 1),
    atr,
    rawAtr,
    components,
    indicators: {
      ema9,
      ema21,
      rsi,
      macdHistogram,
      bollinger,
      sma: smaStructure.sma,
      availableSmaTiers: smaStructure.availableTiers,
    },
  };
}

function calculateHistoricalAccuracy(candles, maxSamples = 15) {
  const sampleCap = Math.min(maxSamples || 15, 15);
  const firstEvaluationIndex = Math.max(
    MIN_FORECAST_CANDLES - 1,
    candles.length - 1 - sampleCap,
  );
  let correct = 0;
  let sampleSize = 0;
  // The newest bar may still be forming, so it is never treated as a completed outcome.
  for (let index = firstEvaluationIndex; index < candles.length - 2; index += 1) {
    const actualMove = candles[index + 1].close - candles[index].close;
    if (actualMove === 0) continue;
    const windowStart = Math.max(0, index + 1 - SIGNAL_LOOKBACK_CANDLES);
    const historicalSignal = calculateSignalScore(candles.slice(windowStart, index + 1));
    if (!historicalSignal) continue;
    const predictedDirection = historicalSignal.score >= 0 ? 1 : -1;
    if (predictedDirection === Math.sign(actualMove)) correct += 1;
    sampleSize += 1;
  }
  return {
    sampleSize,
    accuracy: sampleSize > 0 ? (correct / sampleSize) * 100 : null,
  };
}

function calculateExcursions(candles, lookback = 20) {
  const upward = [];
  const downward = [];
  const start = Math.max(0, candles.length - 2 - lookback);
  for (let index = start; index < candles.length - 2; index += 1) {
    const current = candles[index];
    const next = candles[index + 1];
    upward.push(Math.max(0, next.high - current.close));
    downward.push(Math.max(0, current.close - next.low));
  }
  return { upward: average(upward), downward: average(downward) };
}

export function getNextTradingTimestamp(lastTimestamp, interval = '1D', stepOffset = 1) {
  let currentMs = Number(lastTimestamp) || Date.now();
  let step = 0;
  const isDaily = !interval || interval === '1D' || interval === 'D' || interval === '1W' || interval === '1M';
  const dayMs = 24 * 60 * 60 * 1000;

  while (step < stepOffset) {
    if (isDaily) {
      currentMs += dayMs;
      const dayOfWeek = new Date(currentMs).getDay(); // 0 = Sun, 6 = Sat
      if (dayOfWeek === 6) {
        currentMs += 2 * dayMs; // skip to Monday
      } else if (dayOfWeek === 0) {
        currentMs += dayMs; // skip to Monday
      }
    } else {
      const minutes = parseInt(interval, 10) || 60;
      currentMs += minutes * 60 * 1000;
      const d = new Date(currentMs);
      const dayOfWeek = d.getDay();
      if (dayOfWeek === 6) {
        currentMs += 2 * dayMs; // skip Sat & Sun
      } else if (dayOfWeek === 0) {
        currentMs += dayMs; // skip Sun
      }
    }
    step += 1;
  }
  return currentMs;
}

// --- Per-instance cache -----------------------------------------------
// IMPORTANT: this used to be a single pair of module-level variables shared
// by every caller. When more than one chart (e.g. mini watchlist charts +
// the main chart) called calculateForecast concurrently, each call clobbered
// the others' cache, forcing a full, synchronous recompute (including the
// expensive historical backtest below) on nearly every render/tick across
// ALL chart instances. That's a primary cause of page-wide jank.
//
// Fix: keep a small Map of caches keyed by an explicit `options.cacheKey`
// (e.g. a per-component id, or `${symbol}_${interval}`) so instances never
// step on each other. Callers that don't pass a cacheKey fall back to a
// shared bucket (previous behaviour), so this is backward compatible.
const forecastCacheStore = new Map();

function getForecastCacheBucket(cacheKey) {
  const key = cacheKey || '__default__';
  let bucket = forecastCacheStore.get(key);
  if (!bucket) {
    bucket = {
      forecastMemoKey: '',
      forecastMemoResult: null,
      // Separate, coarser-grained cache for the historical backtest, see
      // note above calculateForecast() for why this is split out.
      accuracyMemoKey: '',
      accuracyMemoResult: null,
    };
    forecastCacheStore.set(key, bucket);
  }
  return bucket;
}

// Call when a chart instance unmounts, or when switching symbols, to avoid
// unbounded growth of forecastCacheStore over a long session.
export function clearForecastCache(cacheKey) {
  if (cacheKey) forecastCacheStore.delete(cacheKey);
  else forecastCacheStore.clear();
}

export function calculateForecast(candles, options = {}) {
  const maxBacktestSamples = options.maxBacktestSamples ?? 15;
  const minAccuracySamples = options.minAccuracySamples ?? 10;
  const horizonCount = clamp(options.horizonCount || 1, 1, 5);
  const interval = options.interval || '1D';
  const cache = getForecastCacheBucket(options.cacheKey);

  if (!Array.isArray(candles) || candles.length < MIN_FORECAST_CANDLES) {
    return {
      status: 'insufficient_data',
      required: MIN_FORECAST_CANDLES,
      available: Array.isArray(candles) ? candles.length : 0,
    };
  }

  const latest = candles[candles.length - 1];
  // Includes latest.close so an intrabar price tick still refreshes the
  // score/probabilities (cheap: one calculateSignalScore call).
  const memoKey = `${candles.length}|${latest?.timestamp}|${latest?.close}|${horizonCount}|${interval}|${maxBacktestSamples}|${minAccuracySamples}`;

  if (cache.forecastMemoResult && cache.forecastMemoKey === memoKey) {
    return cache.forecastMemoResult;
  }

  const signal = calculateSignalScore(candles.slice(-SIGNAL_LOOKBACK_CANDLES));
  const upProbability = round(clamp(50 + signal.score * 45, 5, 95), 1);
  const downProbability = round(100 - upProbability, 1);
  const confidence = Math.max(upProbability, downProbability);

  // The backtest (calculateHistoricalAccuracy) re-runs calculateSignalScore
  // up to `maxBacktestSamples` times over ~260-candle windows each — far
  // more expensive than the single call above. Its result only actually
  // changes when a *new candle closes* (i.e. candles.length or the last
  // closed candle changes), not on every intrabar price tick. So it gets
  // its own, coarser cache key without `latest.close` in it.
  const previousClosed = candles[candles.length - 2];
  const accuracyKey = `${candles.length}|${previousClosed?.timestamp}|${maxBacktestSamples}|${minAccuracySamples}`;
  let historical;
  if (cache.accuracyMemoResult && cache.accuracyMemoKey === accuracyKey) {
    historical = cache.accuracyMemoResult;
  } else {
    historical = calculateHistoricalAccuracy(candles, maxBacktestSamples);
    cache.accuracyMemoKey = accuracyKey;
    cache.accuracyMemoResult = historical;
  }
  const historicalAccuracy = historical.sampleSize >= minAccuracySamples
    ? round(historical.accuracy, 1)
    : null;

  const excursions = calculateExcursions(candles, 20);
  const fallbackRange = signal.atr * 0.8;
  const upwardBase = excursions.upward > 0 ? excursions.upward : fallbackRange;
  const downwardBase = excursions.downward > 0 ? excursions.downward : fallbackRange;
  const upwardScale = 0.35 + 1.3 * (upProbability / 100);
  const downwardScale = 0.35 + 1.3 * (downProbability / 100);
  const upwardRange = clamp(upwardBase * upwardScale, signal.atr * 0.25, signal.atr * 1.75);
  const downwardRange = clamp(downwardBase * downwardScale, signal.atr * 0.25, signal.atr * 1.75);

  const steps = [];
  let prevClose = latest.close;
  let prevUpClose = latest.close;
  let prevDownClose = latest.close;

  let prevUpHigh = latest.close;
  let prevUpLow = latest.close;
  let prevDownHigh = latest.close;
  let prevDownLow = latest.close;

  const trendline = [{ step: 0, timestamp: latest.timestamp, price: latest.close }];

  // Signal bias: asymmetric expansion for bullish vs bearish momentum
  const upBias = signal.score >= 0 ? 1 + signal.score * 0.45 : Math.max(0.4, 1 + signal.score * 0.35);
  const downBias = signal.score <= 0 ? 1 + Math.abs(signal.score) * 0.45 : Math.max(0.4, 1 - signal.score * 0.35);
  const anchorCandleRange = Math.max(Math.abs(latest.high - latest.low), signal.atr * 0.6);

  for (let i = 1; i <= horizonCount; i += 1) {
    const stepUpProb = round(clamp(50 + signal.score * 45 * (0.92 ** (i - 1)), 10, 90), 1);
    const stepDownProb = round(100 - stepUpProb, 1);

    let upRange, downRange;
    if (i === 1) {
      upRange = clamp(anchorCandleRange * 0.70 + upwardRange * upBias * 0.40, signal.atr * 0.4, signal.atr * 2.2);
      downRange = clamp(anchorCandleRange * 0.70 + downwardRange * downBias * 0.40, signal.atr * 0.4, signal.atr * 2.2);
    } else {
      // Step i candle length derived directly from step i-1 candle length & range
      const lastUpRange = Math.max(prevUpHigh - prevUpLow, signal.atr * 0.4);
      const lastDownRange = Math.max(prevDownHigh - prevDownLow, signal.atr * 0.4);
      upRange = clamp(lastUpRange * (0.90 + 0.14 * upBias), signal.atr * 0.4, signal.atr * 2.2);
      downRange = clamp(lastDownRange * (0.90 + 0.14 * downBias), signal.atr * 0.4, signal.atr * 2.2);
    }

    // Blend candle open prices toward the probability-weighted trendline
    // to prevent exponential divergence of Up/Down branches.
    // Step 1 opens at anchor close; step 2+ blends 35% toward the weighted expected price.
    const weightedExpected = prevUpClose * (stepUpProb / 100) + prevDownClose * (stepDownProb / 100);
    const trendBlend = i === 1 ? 0 : 0.35;

    const upOpen = prevUpClose * (1 - trendBlend) + weightedExpected * trendBlend;
    const upMove = upRange * 0.55;
    const upClose = upOpen + upMove;
    const upHigh = upClose + upRange * 0.22;
    const upLow = upOpen - upRange * 0.08;

    const downOpen = prevDownClose * (1 - trendBlend) + weightedExpected * trendBlend;
    const downMove = downRange * 0.55;
    const downClose = downOpen - downMove;
    const downLow = downClose - downRange * 0.22;
    const downHigh = downOpen + downRange * 0.08;

    const stepOpen = prevClose;
    const expectedMove = (upMove - downMove) * 0.35;
    const stepClose = prevClose + expectedMove;
    const stepHigh = Math.max(upHigh, stepOpen);
    const stepLow = Math.min(downLow, stepOpen);
    const timestamp = getNextTradingTimestamp(latest.timestamp, interval, i);

    steps.push({
      step: i,
      timestamp,
      open: round(stepOpen, 2),
      high: round(stepHigh, 2),
      low: round(stepLow, 2),
      close: round(stepClose, 2),
      upCandle: {
        open: round(upOpen, 2),
        high: round(upHigh, 2),
        low: round(upLow, 2),
        close: round(upClose, 2),
      },
      downCandle: {
        open: round(downOpen, 2),
        high: round(downHigh, 2),
        low: round(downLow, 2),
        close: round(downClose, 2),
      },
      forecastHigh: round(upHigh, 2),
      forecastLow: round(downLow, 2),
      upProbability: stepUpProb,
      downProbability: stepDownProb,
    });

    trendline.push({
      step: i,
      timestamp,
      price: round(stepClose, 2),
    });

    prevClose = stepClose;
    prevUpClose = upClose;
    prevDownClose = downClose;

    prevUpHigh = upHigh;
    prevUpLow = upLow;
    prevDownHigh = downHigh;
    prevDownLow = downLow;
  }

  const result = {
    status: 'ready',
    score: round(signal.score, 6),
    upProbability,
    downProbability,
    confidence,
    historicalAccuracy,
    sampleSize: historical.sampleSize,
    anchor: latest.close,
    forecastHigh: latest.close + upwardRange,
    forecastLow: latest.close - downwardRange,
    steps,
    trendline,
    horizonCount,
    atr: signal.atr,
    components: signal.components,
    indicators: signal.indicators,
  };

  cache.forecastMemoKey = memoKey;
  cache.forecastMemoResult = result;
  return result;
}

export function toHeikinAshi(candles) {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const result = [];
  candles.forEach((candle, index) => {
    const close = (candle.open + candle.high + candle.low + candle.close) / 4;
    const open = index === 0
      ? (candle.open + candle.close) / 2
      : (result[index - 1].open + result[index - 1].close) / 2;
    result.push({
      ...candle,
      open,
      high: Math.max(candle.high, open, close),
      low: Math.min(candle.low, open, close),
      close,
    });
  });
  return result;
}
