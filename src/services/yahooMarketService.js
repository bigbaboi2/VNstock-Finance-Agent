/**
 * International equity quotes / OHLC via Yahoo Finance chart API (v8).
 * yahoo-finance2 is optional — raw HTTP is more reliable (no crumb / fewer 429s).
 */
import axios from 'axios';
import { calcTechnicals, calcVolumeProfile } from './cryptoService.js';

const YAHOO_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'application/json',
};

const INTERVAL_MAP = {
    '5m': { interval: '5m', range: '5d' },
    '15m': { interval: '15m', range: '5d' },
    '1h': { interval: '60m', range: '1mo' },
    '4h': { interval: '60m', range: '3mo' },
    '1d': { interval: '1d', range: '1y' },
    '1w': { interval: '1wk', range: '5y' },
    '5 phút': { interval: '5m', range: '5d' },
    '15 phút': { interval: '15m', range: '5d' },
    '1 giờ': { interval: '60m', range: '1mo' },
    '4 giờ': { interval: '60m', range: '3mo' },
    '1 ngày': { interval: '1d', range: '1y' },
    '1 tuần': { interval: '1wk', range: '5y' },
};

const quoteCache = new Map(); // key -> { at, data }
const chartCache = new Map();
const QUOTE_TTL = 45_000;
const CHART_TTL = 180_000;
const MAX_CANDLES = 300;

const cacheGet = (map, key, ttl) => {
    const hit = map.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > ttl) {
        map.delete(key);
        return null;
    }
    return hit.data;
};

const cacheSet = (map, key, data) => {
    map.set(key, { at: Date.now(), data });
};

const resolveInterval = (raw) => {
    const key = String(raw || '1d').trim();
    return INTERVAL_MAP[key] || INTERVAL_MAP[key.toLowerCase()] || INTERVAL_MAP['1d'];
};

const chartUrl = (symbol, { interval, range }) =>
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;

async function fetchChartRaw(symbol, opts, timeout = 8000) {
    const url = chartUrl(symbol, opts);
    const res = await axios.get(url, { timeout, headers: YAHOO_HEADERS });
    const result = res.data?.chart?.result?.[0];
    if (!result) throw new Error(`Yahoo chart empty for ${symbol}`);
    return result;
}

function metaToQuote(symbol, meta = {}) {
    const price = Number(meta.regularMarketPrice);
    const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
    const change = Number.isFinite(price) && Number.isFinite(prev) ? price - prev : null;
    const changePercent =
        Number.isFinite(change) && Number.isFinite(prev) && prev !== 0
            ? (change / prev) * 100
            : null;

    return {
        symbol,
        yahooSymbol: meta.symbol || symbol,
        name: meta.shortName || meta.longName || symbol,
        currency: meta.currency || null,
        exchange: meta.exchangeName || meta.fullExchangeName || null,
        price: Number.isFinite(price) ? price : null,
        previousClose: Number.isFinite(prev) ? prev : null,
        change: Number.isFinite(change) ? change : null,
        changePercent: Number.isFinite(changePercent) ? changePercent : null,
        open: meta.regularMarketOpen ?? null,
        high: meta.regularMarketDayHigh ?? null,
        low: meta.regularMarketDayLow ?? null,
        volume: meta.regularMarketVolume ?? null,
        marketState: meta.marketState || null,
        timezone: meta.exchangeTimezoneName || meta.timezone || null,
    };
}

function resultToCandles(result) {
    const ts = result?.timestamp || [];
    const q = result?.indicators?.quote?.[0] || {};
    const opens = q.open || [];
    const highs = q.high || [];
    const lows = q.low || [];
    const closes = q.close || [];
    const volumes = q.volume || [];

    const candles = [];
    for (let i = 0; i < ts.length; i++) {
        const open = opens[i];
        const high = highs[i];
        const low = lows[i];
        const close = closes[i];
        if ([open, high, low, close].some((v) => v == null || Number.isNaN(Number(v)))) continue;
        candles.push({
            time: ts[i],
            open: Number(open),
            high: Number(high),
            low: Number(low),
            close: Number(close),
            volume: Number(volumes[i]) || 0,
        });
    }
    return candles.slice(-MAX_CANDLES);
}

/** Downsample 60m bars into ~4h for UI interval "4h". */
function downsampleTo4h(candles) {
    if (!candles.length) return candles;
    const out = [];
    for (let i = 0; i < candles.length; i += 4) {
        const chunk = candles.slice(i, i + 4);
        if (!chunk.length) continue;
        out.push({
            time: chunk[0].time,
            open: chunk[0].open,
            high: Math.max(...chunk.map((c) => c.high)),
            low: Math.min(...chunk.map((c) => c.low)),
            close: chunk[chunk.length - 1].close,
            volume: chunk.reduce((s, c) => s + (c.volume || 0), 0),
        });
    }
    return out.slice(-MAX_CANDLES);
}

export async function fetchQuote(symbol) {
    const sym = String(symbol || '').trim();
    if (!sym) throw new Error('Missing symbol');
    const cached = cacheGet(quoteCache, sym.toUpperCase(), QUOTE_TTL);
    if (cached) return cached;

    const result = await fetchChartRaw(sym, { interval: '1d', range: '5d' }, 7000);
    const quote = metaToQuote(sym, result.meta);
    cacheSet(quoteCache, sym.toUpperCase(), quote);
    return quote;
}

export async function fetchQuotes(symbols = []) {
    const list = [...new Set(symbols.map((s) => String(s).trim()).filter(Boolean))];
    const settled = await Promise.allSettled(list.map((s) => fetchQuote(s)));
    return settled
        .map((r, i) => (r.status === 'fulfilled' ? r.value : { symbol: list[i], error: r.reason?.message || 'fail' }))
        .filter(Boolean);
}

export async function fetchHistory(symbol, intervalLabel = '1d') {
    const sym = String(symbol || '').trim();
    if (!sym) throw new Error('Missing symbol');
    const opts = resolveInterval(intervalLabel);
    const cacheKey = `${sym.toUpperCase()}|${opts.interval}|${opts.range}|${intervalLabel}`;
    const cached = cacheGet(chartCache, cacheKey, CHART_TTL);
    if (cached) return cached;

    const result = await fetchChartRaw(sym, opts, 10000);
    let candles = resultToCandles(result);
    const labelNorm = String(intervalLabel).trim().toLowerCase();
    const is4h = labelNorm === '4h' || labelNorm === '4 giờ' || labelNorm === '4 gio';
    if (is4h) candles = downsampleTo4h(candles);

    const payload = {
        symbol: sym,
        interval: intervalLabel,
        yahooInterval: opts.interval,
        range: opts.range,
        candles,
        quote: metaToQuote(sym, result.meta),
        technicals: calcTechnicals(candles),
        volProfile: calcVolumeProfile(candles.slice(-80)),
    };
    cacheSet(chartCache, cacheKey, payload);
    // also refresh quote cache
    if (payload.quote?.price != null) cacheSet(quoteCache, sym.toUpperCase(), payload.quote);
    return payload;
}

export async function fetchQuoteWithTechnicals(symbol, intervalLabel = '1d') {
    const history = await fetchHistory(symbol, intervalLabel);
    return {
        quote: history.quote,
        technicals: history.technicals,
        volProfile: history.volProfile,
        candleCount: history.candles?.length || 0,
    };
}
