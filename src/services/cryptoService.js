import axios from 'axios';

// 1. (CACHE)
export const cryptoCache = {
    fearGreed:    { value: 50, label: 'Neutral', updatedAt: 0 },
    dominance:    { btc: 50, eth: 17, updatedAt: 0 },
    globalMarket: { totalMarketCap: 0, volume24h: 0, updatedAt: 0 },
    topMovers:    { gainers: [], losers: [], updatedAt: 0 },
    prices:       {},
};

//2. UTILITY FUNCTION
export const formatLargeNumber = (num) => {
    if (!num || isNaN(num)) return '---';
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9)  return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6)  return `$${(num / 1e6).toFixed(2)}M`;
    return `$${num.toLocaleString()}`;
};

export const translateFearGreed = (label) => {
    const map = {
        'Extreme Fear': 'Cực kỳ sợ hãi', 'Fear': 'Sợ hãi',
        'Neutral': 'Trung lập', 'Greed': 'Tham lam', 'Extreme Greed': 'Tham lam cực độ'
    };
    return map[label] || label;
};

export const calcTechnicals = (candles) => {
    if (!candles || candles.length < 20) return null;
    const closes = candles.map(c => c.close);
    const n = closes.length;

    const ema = (data, period) => {
        const k = 2 / (period + 1);
        let val = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
        for (let i = period; i < data.length; i++) val = data[i] * k + val * (1 - k);
        return parseFloat(val.toFixed(2));
    };

    const rsiPeriod = 14;
    let gains = 0, losses = 0;
    for (let i = n - rsiPeriod; i < n; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff; else losses += Math.abs(diff);
    }
    const avgGain = gains / rsiPeriod;
    const avgLoss = losses / rsiPeriod;
    const rsi = avgLoss === 0 ? 100 : parseFloat((100 - (100 / (1 + avgGain / avgLoss))).toFixed(1));

    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const macdLine = parseFloat((ema12 - ema26).toFixed(2));

    const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const variance = closes.slice(-20).reduce((sum, c) => sum + Math.pow(c - sma20, 2), 0) / 20;
    const stdDev = Math.sqrt(variance);
    const bbUpper = parseFloat((sma20 + 2 * stdDev).toFixed(2));
    const bbLower = parseFloat((sma20 - 2 * stdDev).toFixed(2));
    const bbPercent = parseFloat(((closes[n-1] - bbLower) / (bbUpper - bbLower) * 100).toFixed(1));

    const atr14 = candles.slice(-15).reduce((sum, c, i, arr) => {
        if (i === 0) return sum;
        const tr = Math.max(c.high - c.low, Math.abs(c.high - arr[i-1].close), Math.abs(c.low - arr[i-1].close));
        return sum + tr;
    }, 0) / 14;

    const vwapData = candles.slice(-50).reduce((acc, c) => {
        const tp = (c.high + c.low + c.close) / 3;
        acc.tpv += tp * (c.volume || 1);
        acc.vol += (c.volume || 1);
        return acc;
    }, { tpv: 0, vol: 0 });
    const vwap = parseFloat((vwapData.tpv / vwapData.vol).toFixed(2));

    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);
    const currentPrice = closes[n - 1];

    let score = 50;
    if (rsi > 50 && rsi < 70) score += 15; else if (rsi >= 70) score -= 10; else if (rsi < 30) score -= 15;
    if (macdLine > 0) score += 15;
    if (currentPrice > ema20) score += 10;
    if (ema20 > ema50) score += 10;
    if (bbPercent > 40 && bbPercent < 60) score += 5;
    score = Math.round(Math.min(Math.max(score, 0), 100));

    let trend = 'SIDEWAY', trendColor = 'yellow', action = 'QUAN SÁT';
    if (score >= 68 && ema20 > ema50) { trend = 'BULLISH STRONG'; trendColor = 'green'; action = 'CANH LONG'; }
    else if (score <= 32 && ema20 < ema50) { trend = 'BEARISH STRONG'; trendColor = 'red'; action = 'CANH SHORT'; }
    else if (score >= 58) { trend = 'BULLISH BIAS'; trendColor = 'green'; action = 'QUAN SÁT LONG'; }
    else if (score <= 42) { trend = 'BEARISH BIAS'; trendColor = 'red'; action = 'QUAN SÁT SHORT'; }

    const sl = action.includes('LONG') ? currentPrice - atr14 * 1.5 : currentPrice + atr14 * 1.5;
    const tp1 = action.includes('LONG') ? currentPrice + atr14 * 1.5 : currentPrice - atr14 * 1.5;
    const tp2 = action.includes('LONG') ? currentPrice + atr14 * 2.5 : currentPrice - atr14 * 2.5;
    const rr = parseFloat((Math.abs(tp1 - currentPrice) / Math.abs(sl - currentPrice) || 1).toFixed(2));

    return {
        rsi, macdLine, ema12, ema26, ema20, ema50, bbUpper, bbLower, bbPercent, atr: parseFloat(atr14.toFixed(2)), vwap,
        score, trend, trendColor, action, sl: parseFloat(sl.toFixed(2)), tp1: parseFloat(tp1.toFixed(2)), tp2: parseFloat(tp2.toFixed(2)), rrRatio: rr
    };
};

export const calcVolumeProfile = (candles, bins = 12) => {
    if (!candles || candles.length < 5) return null;
    let minP = Math.min(...candles.map(c => c.low));
    let maxP = Math.max(...candles.map(c => c.high));
    if (maxP === minP) { maxP += 1; minP -= 1; }
    const binSize = (maxP - minP) / bins;
    const buckets = Array.from({ length: bins }, (_, i) => ({ priceCenter: parseFloat((minP + (i + 0.5) * binSize).toFixed(2)), volume: 0 }));
    let maxVol = 0, pocPrice = 0;
    candles.forEach(c => {
        const tp = (c.high + c.low + c.close) / 3;
        const idx = Math.min(Math.floor((tp - minP) / binSize), bins - 1);
        if (idx >= 0) {
            buckets[idx].volume += (c.volume || 0);
            if (buckets[idx].volume > maxVol) { maxVol = buckets[idx].volume; pocPrice = buckets[idx].priceCenter; }
        }
    });
    return { bins: buckets.reverse(), maxVol, pocPrice };
};

// ─────────────────────────────────────────────────────────────
// KLINE / TICKER — NGUỒN DỮ LIỆU ĐA TẦNG (chống geo-block 451/403)
// Nhiều sàn (api.binance.com, api.bybit.com) chặn IP datacenter/cloud
// → thử lần lượt nhiều nguồn cho tới khi có dữ liệu:
//   1. data-api.binance.vision  (mirror công khai của Binance — cùng format, ít bị chặn)
//   2. api.binance.com          (thường hoạt động ở mạng local)
//   3. OKX                      (ít bị chặn ở cloud)
//   4. Bybit                    (dự phòng cuối)
// ─────────────────────────────────────────────────────────────

// Chuẩn hoá mọi kiểu nhập khung thời gian về giá trị API chuẩn.
// Chấp nhận: giá trị API ('1d', '1h', '5m'...), nhãn tiếng Việt của nút chọn
// khung trong CryptoTab VÀ của thanh công cụ biểu đồ ('1 phút', '2 giờ', '1 tháng'...).
const INTERVAL_CANON = {
    '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '2h': '2h', '4h': '4h', '1d': '1d', '1w': '1w', '1M': '1M',
    '1 phút': '1m', '3 phút': '3m', '5 phút': '5m', '15 phút': '15m', '30 phút': '30m',
    '1 giờ': '1h', '2 giờ': '2h', '4 giờ': '4h',
    '1 ngày': '1d', '1 tuần': '1w', '1 tháng': '1M', '1 năm': '1M',
};
export const normalizeInterval = (interval) =>
    INTERVAL_CANON[interval] || INTERVAL_CANON[String(interval || '').trim()] || '1d';

const KLINE_LIMIT = { '1m': 500, '3m': 400, '5m': 400, '15m': 300, '30m': 300, '1h': 300, '2h': 250, '4h': 250, '1d': 365, '1w': 200, '1M': 120 };
const isDailyLike = (iv) => ['1d', '1w', '1M'].includes(iv);
const fmtKlineTime = (ms, iv) => new Date(ms).toISOString().replace('T', ' ').substring(0, isDailyLike(iv) ? 10 : 16);

// Nguồn định dạng Binance (mirror vision + api chính)
const fetchBinanceStyle = async (base, pair, iv, limit) => {
    try {
        const r = await axios.get(`${base}/api/v3/klines?symbol=${pair}&interval=${iv}&limit=${limit}`, { timeout: 8000 });
        if (!Array.isArray(r.data) || r.data.length === 0) return null;
        return r.data.map(k => ({ time: fmtKlineTime(k[0], iv), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
    } catch { return null; }
};

const OKX_BAR = { '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '2h': '2H', '4h': '4H', '1d': '1D', '1w': '1W', '1M': '1M' };
const fetchOkxKlines = async (symbol, iv, limit) => {
    try {
        const r = await axios.get(`https://www.okx.com/api/v5/market/candles?instId=${symbol}-USDT&bar=${OKX_BAR[iv] || '1D'}&limit=${Math.min(limit, 300)}`, { timeout: 8000 });
        const list = r.data?.data;
        if (!Array.isArray(list) || list.length === 0) return null;
        // OKX trả mới→cũ, cần đảo lại
        return list.map(k => ({ time: fmtKlineTime(+k[0], iv), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] })).reverse();
    } catch { return null; }
};

const BYBIT_INT = { '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '2h': '120', '4h': '240', '1d': 'D', '1w': 'W', '1M': 'M' };
const fetchBybitKlines = async (symbol, iv, limit) => {
    try {
        const r = await axios.get(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}USDT&interval=${BYBIT_INT[iv] || 'D'}&limit=${Math.min(limit, 1000)}`, { timeout: 8000 });
        const list = r.data?.result?.list;
        if (!Array.isArray(list) || list.length === 0) return null;
        return list.map(k => ({ time: fmtKlineTime(+k[0], iv), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] })).reverse();
    } catch { return null; }
};

// Lấy nến từ nguồn khả dụng đầu tiên. Trả về [] nếu mọi nguồn đều fail.
export const fetchKlines = async (symbol, interval) => {
    const iv = normalizeInterval(interval);
    const limit = KLINE_LIMIT[iv] || 300;
    const pair = `${symbol}USDT`;
    const sources = [
        () => fetchBinanceStyle('https://data-api.binance.vision', pair, iv, limit),
        () => fetchBinanceStyle('https://api.binance.com', pair, iv, limit),
        () => fetchOkxKlines(symbol, iv, limit),
        () => fetchBybitKlines(symbol, iv, limit),
    ];
    for (const src of sources) {
        const data = await src();
        if (data && data.length) return data;
    }
    return [];
};

// Ticker 24h chuẩn hoá — nhiều nguồn, fallback tính từ nến nếu cần.
export const fetchTicker24h = async (symbol, candles = []) => {
    const pair = `${symbol}USDT`;
    for (const base of ['https://data-api.binance.vision', 'https://api.binance.com']) {
        try {
            const r = await axios.get(`${base}/api/v3/ticker/24hr?symbol=${pair}`, { timeout: 5000 });
            const t = r.data;
            if (t?.lastPrice) return { lastPrice: +t.lastPrice, priceChangePercent: +t.priceChangePercent, quoteVolume: +t.quoteVolume, highPrice: +t.highPrice, lowPrice: +t.lowPrice };
        } catch {}
    }
    try {
        const r = await axios.get(`https://www.okx.com/api/v5/market/ticker?instId=${symbol}-USDT`, { timeout: 5000 });
        const t = r.data?.data?.[0];
        if (t?.last) {
            const last = +t.last, open = +t.open24h || last;
            return { lastPrice: last, priceChangePercent: open ? ((last - open) / open) * 100 : 0, quoteVolume: +t.volCcy24h || 0, highPrice: +t.high24h || last, lowPrice: +t.low24h || last };
        }
    } catch {}
    // Fallback: ước lượng từ nến đã có
    if (candles.length) {
        const last = candles[candles.length - 1];
        const recent = candles.slice(-Math.min(candles.length, 24));
        const first = recent[0];
        return {
            lastPrice: last.close,
            priceChangePercent: first.open ? ((last.close - first.open) / first.open) * 100 : 0,
            quoteVolume: recent.reduce((s, c) => s + c.volume * c.close, 0),
            highPrice: Math.max(...recent.map(c => c.high)),
            lowPrice: Math.min(...recent.map(c => c.low)),
        };
    }
    return null;
};

export const fetchCryptoData = async (symbol, interval) => {
    const data = await fetchKlines(symbol, interval);
    if (!data.length) throw new Error('Không lấy được dữ liệu nến từ mọi nguồn');
    return data;
};