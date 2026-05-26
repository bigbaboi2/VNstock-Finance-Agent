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

export const fetchCryptoData = async (symbol, interval) => {
    const intervalMap = { '1 phút': '1m', '5 phút': '5m', '15 phút': '15m', '30 phút': '30m', '1 giờ': '1h', '4 giờ': '4h', '1 ngày': '1d', '1 tuần': '1w' };
    const limitMap = { '1m': 500, '5m': 300, '15m': 200, '30m': 200, '1h': 200, '4h': 200, '1d': 365, '1w': 200 };
    const binanceInterval = intervalMap[interval] || '1d';
    const limit = limitMap[binanceInterval] || 200;
    const pair = `${symbol}USDT`;

    try {
        const kRes = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${binanceInterval}&limit=${limit}`, { timeout: 8000 });
        return kRes.data.map(k => ({
            time: new Date(k[0]).toISOString().replace('T', ' ').substring(0, ['1d','1w'].includes(binanceInterval) ? 10 : 16),
            open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
        }));
    } catch (error) {
        try {
            const bvMap = { '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W' };
            const bybitInt = bvMap[binanceInterval] || 'D';
            const bRes = await axios.get(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${pair}&interval=${bybitInt}&limit=${limit}`, { timeout: 8000 });
            if (bRes.data?.result?.list) {
                return bRes.data.result.list.reverse().map(k => ({
                    time: new Date(parseInt(k[0])).toISOString().substring(0, 16).replace('T', ' '),
                    open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
                }));
            }
        } catch (e) {}
        throw new Error('Lỗi lấy dữ liệu từ cả Binance và Bybit');
    }
};