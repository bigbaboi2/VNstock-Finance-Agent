import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_FORECAST_CANDLES,
  calculateATR,
  calculateForecast,
  calculateSMA,
  calculateSignalScore,
  calculateSmaStructure,
  toHeikinAshi,
} from '../src/lib/chartForecast.js';

function makeCandles(count, { start = 100, drift = 0.35, flat = false } = {}) {
  const candles = [];
  let previousClose = start;
  for (let index = 0; index < count; index += 1) {
    const wave = flat ? 0 : Math.sin(index / 3) * 0.45;
    const open = previousClose;
    const close = flat ? start : open + drift + wave;
    candles.push({
      timestamp: 1_700_000_000_000 + index * 86_400_000,
      open,
      high: Math.max(open, close) + 0.8 + (index % 3) * 0.1,
      low: Math.min(open, close) - 0.7 - (index % 2) * 0.1,
      close,
      volume: index % 7 === 0 ? 0 : 1_000 + index * 17,
    });
    previousClose = close;
  }
  return candles;
}

test('calculateSMA returns the average for the requested trailing period', () => {
  assert.equal(calculateSMA([1, 2, 3, 4, 5], 3), 4);
  assert.equal(calculateSMA([1, 2], 3), null);
});

test('SMA structure reweights only the tiers with enough data', () => {
  const shortCloses = makeCandles(35).map(candle => candle.close);
  const short = calculateSmaStructure(shortCloses, 2);
  assert.deepEqual(short.availableTiers, ['short']);

  const longCloses = makeCandles(220).map(candle => candle.close);
  const long = calculateSmaStructure(longCloses, 2);
  assert.deepEqual(long.availableTiers, ['short', 'medium', 'long']);
  assert.ok(long.score >= -1 && long.score <= 1);
});

test('Heikin Ashi uses the standard first candle and preserves invariants', () => {
  const input = [
    { timestamp: 1, open: 10, high: 14, low: 8, close: 12, volume: 5 },
    { timestamp: 2, open: 12, high: 16, low: 11, close: 15, volume: 8 },
  ];
  const snapshot = structuredClone(input);
  const output = toHeikinAshi(input);
  assert.equal(output[0].open, 11);
  assert.equal(output[0].close, 11);
  assert.equal(output[1].open, 11);
  assert.equal(output[1].close, 13.5);
  output.forEach(candle => {
    assert.ok(candle.high >= candle.open && candle.high >= candle.close);
    assert.ok(candle.low <= candle.open && candle.low <= candle.close);
  });
  assert.deepEqual(input, snapshot);
});

test('forecast probabilities are bounded, sum to 100 and targets surround anchor', () => {
  const candles = makeCandles(90);
  const forecast = calculateForecast(candles);
  assert.equal(forecast.status, 'ready');
  assert.equal(forecast.upProbability + forecast.downProbability, 100);
  assert.ok(forecast.upProbability >= 5 && forecast.upProbability <= 95);
  assert.ok(forecast.forecastHigh > forecast.anchor);
  assert.ok(forecast.forecastLow < forecast.anchor);
  const atr = calculateATR(candles);
  assert.ok(forecast.forecastHigh - forecast.anchor <= atr * 1.75 + Number.EPSILON);
  assert.ok(forecast.anchor - forecast.forecastLow <= atr * 1.75 + Number.EPSILON);
});

test('forecast reports insufficient data below the minimum', () => {
  const forecast = calculateForecast(makeCandles(MIN_FORECAST_CANDLES - 1));
  assert.deepEqual(forecast, {
    status: 'insufficient_data',
    required: MIN_FORECAST_CANDLES,
    available: MIN_FORECAST_CANDLES - 1,
  });
});

test('flat candles and zero volume remain finite', () => {
  const candles = makeCandles(70, { flat: true }).map(candle => ({
    ...candle,
    high: candle.close,
    low: candle.close,
    volume: 0,
  }));
  const signal = calculateSignalScore(candles);
  const forecast = calculateForecast(candles);
  assert.ok(Number.isFinite(signal.score));
  assert.ok(Number.isFinite(forecast.forecastHigh));
  assert.ok(Number.isFinite(forecast.forecastLow));
});

test('walk-forward accuracy ignores a tied next close', () => {
  const candles = makeCandles(70);
  candles[55] = { ...candles[55], close: candles[54].close };
  const forecast = calculateForecast(candles, { minAccuracySamples: 1 });
  assert.equal(forecast.sampleSize, candles.length - MIN_FORECAST_CANDLES - 2);
  assert.ok(forecast.historicalAccuracy >= 0 && forecast.historicalAccuracy <= 100);
});
