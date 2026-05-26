// 

import axios from 'axios';
import chalk from 'chalk';
import vader from 'vader-sentiment';
import { analyzeCryptoSignalWithGemini } from './aiService.js';
import CryptoCoin from '../../models/CryptoCoin.js';
// ============================================================
// CACHE IN-MEMORY  

// ─── PHẦN 1: CACHE & TTL ───────────────────────────────────────────────────
const TTL_FEAR_GREED    = 15 * 60 * 1000;
const TTL_GLOBAL_MARKET =  5 * 60 * 1000;

let cryptoCache = {
    fearGreed:    { value: 50, label: 'Neutral', updatedAt: 0 },
    dominance:    { btc: 50, eth: 17, updatedAt: 0 },
    globalMarket: { totalMarketCap: 0, volume24h: 0, updatedAt: 0 },
    topMovers:    { gainers: [], losers: [], updatedAt: 0 },
    prices:       {},
};

function isFresh(updatedAt, ttl) {
    return updatedAt > 0 && (Date.now() - updatedAt) < ttl;
}

// ─── PHẦN 2: BACKGROUND FETCH ───────────────────────────────────────────────
async function fetchFearGreed() {
    if (isFresh(cryptoCache.fearGreed.updatedAt, TTL_FEAR_GREED)) return;
    try {
        const res = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 5000 });
        if (res.data?.data?.[0]) {
            const d = res.data.data[0];
            cryptoCache.fearGreed = { value: parseInt(d.value), label: d.value_classification, updatedAt: Date.now() };
            console.log(chalk.cyan(`[CRYPTO] Fear & Greed: ${d.value} (${d.value_classification})`));
        }
    } catch (e) {
        console.log(chalk.yellow(`[CRYPTO] Fear & Greed lỗi: ${e.message}`));
    }
}

async function fetchGlobalMarket() {
    if (isFresh(cryptoCache.globalMarket.updatedAt, TTL_GLOBAL_MARKET)) return;
    try {
        const res = await axios.get('https://api.coingecko.com/api/v3/global', { timeout: 8000 });
        const d = res.data?.data;
        if (d) {
            cryptoCache.dominance = {
                btc: parseFloat(d.market_cap_percentage?.btc || 50).toFixed(1),
                eth: parseFloat(d.market_cap_percentage?.eth || 17).toFixed(1),
                updatedAt: Date.now()
            };
            cryptoCache.globalMarket = {
                totalMarketCap: d.total_market_cap?.usd || 0,
                volume24h: d.total_volume?.usd || 0,
                marketCapChangePercent: parseFloat(d.market_cap_change_percentage_24h_usd || 0).toFixed(2),
                updatedAt: Date.now()
            };
            console.log(chalk.cyan(`[CRYPTO] Global market cập nhật lúc ${new Date().toLocaleTimeString('vi-VN')}`));
        }
    } catch (e) {
        console.log(chalk.yellow(`[CRYPTO] Global market lỗi: ${e.message}`));
    }
}

(async () => { await fetchFearGreed(); await fetchGlobalMarket(); })();
setInterval(fetchFearGreed,    TTL_FEAR_GREED);
setInterval(fetchGlobalMarket, TTL_GLOBAL_MARKET);

// ============================================================
// HELPER: Format số lớn  
// ============================================================
function formatLargeNumber(num) {
    if (!num || isNaN(num)) return '---';
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9)  return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6)  return `$${(num / 1e6).toFixed(2)}M`;
    return `$${num.toLocaleString()}`;
}

// ============================================================
// HELPER: Tính các chỉ báo kỹ thuật từ OHLCV
// ============================================================
function calcTechnicals(candles) {
    if (!candles || candles.length < 20) return null;

    const closes = candles.map(c => c.close);
    const n = closes.length;

    // EMA
    const ema = (data, period) => {
        const k = 2 / (period + 1);
        let val = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
        for (let i = period; i < data.length; i++) val = data[i] * k + val * (1 - k);
        return parseFloat(val.toFixed(2));
    };

    // RSI (14)
    const rsiPeriod = 14;
    let gains = 0, losses = 0;
    for (let i = n - rsiPeriod; i < n; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
    }
    const avgGain = gains / rsiPeriod;
    const avgLoss = losses / rsiPeriod;
    const rsi = avgLoss === 0 ? 100 : parseFloat((100 - (100 / (1 + avgGain / avgLoss))).toFixed(1));

    // MACD (12, 26, 9)
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const macdLine = parseFloat((ema12 - ema26).toFixed(2));

    // Bollinger Bands (20, 2)
    const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const variance = closes.slice(-20).reduce((sum, c) => sum + Math.pow(c - sma20, 2), 0) / 20;
    const stdDev = Math.sqrt(variance);
    const bbUpper = parseFloat((sma20 + 2 * stdDev).toFixed(2));
    const bbLower = parseFloat((sma20 - 2 * stdDev).toFixed(2));
    const bbPercent = parseFloat(((closes[n-1] - bbLower) / (bbUpper - bbLower) * 100).toFixed(1));

    // ATR (14)
    const atr14 = candles.slice(-15).reduce((sum, c, i, arr) => {
        if (i === 0) return sum;
        const tr = Math.max(
            c.high - c.low,
            Math.abs(c.high - arr[i-1].close),
            Math.abs(c.low - arr[i-1].close)
        );
        return sum + tr;
    }, 0) / 14;

    // VWAP
    const vwapData = candles.slice(-50).reduce((acc, c) => {
        const tp = (c.high + c.low + c.close) / 3;
        acc.tpv += tp * (c.volume || 1);
        acc.vol += (c.volume || 1);
        return acc;
    }, { tpv: 0, vol: 0 });
    const vwap = parseFloat((vwapData.tpv / vwapData.vol).toFixed(2));

    // EMA crossover trend
    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);
    const currentPrice = closes[n - 1];

    // Confluence score (0-100)
    let score = 50;
    if (rsi > 50 && rsi < 70) score += 15;   // RSI bullish không overbought
    else if (rsi >= 70) score -= 10;           // Overbought
    else if (rsi < 30) score -= 15;            // Oversold (bearish momentum)
    if (macdLine > 0) score += 15;             // MACD dương
    if (currentPrice > ema20) score += 10;     // Trên EMA20
    if (ema20 > ema50) score += 10;            // EMA20 > EMA50 (uptrend)
    if (bbPercent > 40 && bbPercent < 60) score += 5;  // Giữa BB
    score = Math.round(Math.min(Math.max(score, 0), 100));

    // Trend label
    let trend = 'SIDEWAY';
    let trendColor = 'yellow';
    let action = 'QUAN SÁT';
    if (score >= 68 && ema20 > ema50) { trend = 'BULLISH STRONG'; trendColor = 'green'; action = 'CANH LONG'; }
    else if (score <= 32 && ema20 < ema50) { trend = 'BEARISH STRONG'; trendColor = 'red'; action = 'CANH SHORT'; }
    else if (score >= 58) { trend = 'BULLISH BIAS'; trendColor = 'green'; action = 'QUAN SÁT LONG'; }
    else if (score <= 42) { trend = 'BEARISH BIAS'; trendColor = 'red'; action = 'QUAN SÁT SHORT'; }

    // SL / TP
    const sl = action.includes('LONG') ? currentPrice - atr14 * 1.5 : currentPrice + atr14 * 1.5;
    const tp1 = action.includes('LONG') ? currentPrice + atr14 * 1.5 : currentPrice - atr14 * 1.5;
    const tp2 = action.includes('LONG') ? currentPrice + atr14 * 2.5 : currentPrice - atr14 * 2.5;
    const rr = parseFloat((Math.abs(tp1 - currentPrice) / Math.abs(sl - currentPrice) || 1).toFixed(2));

    return {
        rsi, macdLine, ema12, ema26, ema20, ema50,
        bbUpper, bbLower, bbPercent, atr: parseFloat(atr14.toFixed(2)), vwap,
        score, trend, trendColor, action,
        sl: parseFloat(sl.toFixed(2)),
        tp1: parseFloat(tp1.toFixed(2)),
        tp2: parseFloat(tp2.toFixed(2)),
        rrRatio: rr
    };
}

// ============================================================
// HELPER: Volume Profile từ OHLCV  
// ============================================================
function calcVolumeProfile(candles, bins = 12) {
    if (!candles || candles.length < 5) return null;
    let minP = Math.min(...candles.map(c => c.low));
    let maxP = Math.max(...candles.map(c => c.high));
    if (maxP === minP) { maxP += 1; minP -= 1; }
    const binSize = (maxP - minP) / bins;
    const buckets = Array.from({ length: bins }, (_, i) => ({
        priceCenter: parseFloat((minP + (i + 0.5) * binSize).toFixed(2)),
        volume: 0
    }));
    let maxVol = 0; let pocPrice = 0;
    candles.forEach(c => {
        const tp = (c.high + c.low + c.close) / 3;
        const idx = Math.min(Math.floor((tp - minP) / binSize), bins - 1);
        if (idx >= 0) {
            buckets[idx].volume += (c.volume || 0);
            if (buckets[idx].volume > maxVol) { maxVol = buckets[idx].volume; pocPrice = buckets[idx].priceCenter; }
        }
    });
    return { bins: buckets.reverse(), maxVol, pocPrice };
}

// ============================================================
// EXPORT: Đăng ký tất cả routes vào app Express
// ============================================================
export function registerCryptoRoutes(app) {

    // ----------------------------------------------------------
    // ROUTE 1: /api/crypto/radar
     // ----------------------------------------------------------
    
    // /api/crypto/news/:s Google News, Reddit,..
    app.get('/api/crypto/news/:symbol', async (req, res) => {
        const sym = req.params.symbol.toUpperCase();
        try {
            const getVaderSentiment = (text) => {
                const intensity = vader.SentimentIntensityAnalyzer.polarity_scores(text);
                if (intensity.compound >= 0.05) return 'positive';
                if (intensity.compound <= -0.05) return 'negative';
                return 'neutral';
            };

            // ==================================================
            // 1. NGUỒN TỔNG HỢP ( Open-Source API)
            // Lấy tin từ CoinDesk, The Block, CoinTelegraph...  
            // ==================================================
            let proNews = [];
            try {
                const rssUrl = `https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml`;
                const rssRes = await axios.get(rssUrl, { timeout: 8000 });
                
                const items = rssRes.data.match(/<item>([\s\S]*?)<\/item>/g) || [];
                
                proNews = items.slice(0, 10).map(item => {
                    const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || 'No title';
                    const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '';
                    const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
                    
                    if (title.toLowerCase().includes(sym.toLowerCase()) || sym === 'BTC') {
                        return {
                            title,
                            link,
                            source: 'CoinDesk (RSS)',
                            time: new Date(pubDate).toLocaleString('vi-VN'),
                            sentiment: getVaderSentiment(title)
                        };
                    }
                    return null;
                }).filter(n => n !== null);
            } catch (err) {
                console.log(chalk.red(`❌ [NEWS] Lỗi lấy tin CoinDesk: ${err.message}`));
            }

            // ==================================================
            // 2. NGUỒN REDDIT 
            // ==================================================
            let redditNews = [];
            try {
                 const redditUrl = `https://www.reddit.com/search.json?q=${sym}+crypto&sort=new&limit=100`;
                const redditRes = await axios.get(redditUrl, { timeout: 5000 });
                
                const validPosts = redditRes.data.data.children.filter(post => {
                    const data = post.data;
                     return !data.removed_by_category && !data.is_video && data.score >= 5;
                });

                redditNews = validPosts.slice(0, 15).map(post => {  
                    const data = post.data;
                    return {
                        title: data.title,
                        link: `https://www.reddit.com${data.permalink}`,
                        source: `Reddit (r/${data.subreddit} - ${data.score} Upvotes)`,
                        time: new Date(data.created_utc * 1000).toLocaleString('vi-VN'),
                        sentiment: getVaderSentiment(data.title)
                    };
                });
            } catch (err) {
                console.log(chalk.yellow(`⚠️ [NEWS] Lỗi Reddit API cho ${sym}: ${err.message}`));
            }

            // ==================================================
            // 3. NGUỒN GOOGLE NEWS (RSS)
            // ==================================================
            let googleNews = [];
            try {
                const query = encodeURIComponent(`${sym} crypto`);
                const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
                const rssRes = await axios.get(rssUrl, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                
                googleNews = [...rssRes.data.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 15).map(m => { // Tăng lên 15 bài
                    const block = m[1];
                    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || block.match(/<title>(.*?)<\/title>/)?.[1] || '';
                    const link = block.match(/<link>(.*?)<\/link>/)?.[1] || '';
                    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
                    
                    return { 
                        title, link, 
                        source: block.match(/<source[^>]*>(.*?)<\/source>/)?.[1] || 'Google News', 
                        time: pubDate ? new Date(pubDate).toLocaleString('vi-VN') : '', 
                        sentiment: getVaderSentiment(title) 
                    };
                }).filter(n => n.title);
            } catch (err) {}

            // ==================================================
            // 4. GỘP DỮ LIỆU & CẮT MAX 50 TIN
            // ==================================================
             const combinedNews = [...proNews, ...redditNews, ...googleNews].slice(0, 50);
            return res.json({ success: true, data: combinedNews });

        } catch (e) {
            return res.json({ success: false, data: [], message: e.message });
        }
    });
    app.get('/api/crypto/derivatives/:symbol', async (req, res) => {
            const sym = req.params.symbol.toUpperCase();
            const pair = sym + 'USDT'; 
            
            try {
                // Chạy song song 3 API cùng lúc 
                const [fundingRes, oiRes, lsRes] = await Promise.all([
                    axios.get(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${pair}`, { timeout: 5000 }).catch(() => null),
                    axios.get(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${pair}`, { timeout: 5000 }).catch(() => null),
                    axios.get(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${pair}&period=1d&limit=1`, { timeout: 5000 }).catch(() => null)
                ]);

                const data = {
                    symbol: sym,
                    markPrice: fundingRes?.data ? parseFloat(fundingRes.data.markPrice) : null,
                    fundingRate: fundingRes?.data ? (parseFloat(fundingRes.data.lastFundingRate) * 100).toFixed(4) : 0,  
                    openInterest: oiRes?.data ? parseFloat(oiRes.data.openInterest) : null,
                    longShortRatio: lsRes?.data?.length > 0 ? parseFloat(lsRes.data[0].longShortRatio).toFixed(2) : null,
                    longPercent: lsRes?.data?.length > 0 ? (parseFloat(lsRes.data[0].longAccount) * 100).toFixed(2) : 50,
                    shortPercent: lsRes?.data?.length > 0 ? (parseFloat(lsRes.data[0].shortAccount) * 100).toFixed(2) : 50,
                };

                return res.json({ success: true, data });
            } catch (error) {
                console.log(chalk.red(`⚠️ [DERIVATIVES] Lỗi khi lấy phái sinh ${sym}: ${error.message}`));
                return res.json({ success: false, message: 'Không thể lấy dữ liệu phái sinh' });
            }
        });

    // Greedy and Fear
    app.get('/api/crypto/radar', async (req, res) => {
        try {
            const now = Date.now();

            // Lấy Fear & Greed (dùng cache nếu còn tươi < 15 phút)
            let fearGreed = cryptoCache.fearGreed;
            if (now - fearGreed.updatedAt > 15 * 60 * 1000) {
                try {
                    const fgRes = await axios.get('https://api.alternative.me/fng/?limit=2', { timeout: 5000 });
                    if (fgRes.data?.data?.[0]) {
                        const d = fgRes.data.data[0];
                        fearGreed = { value: parseInt(d.value), label: d.value_classification, updatedAt: now };
                        cryptoCache.fearGreed = fearGreed;
                    }
                } catch (e) { /* dùng cache cũ */ }
            }

            // Lấy Dominance (dùng cache nếu còn tươi < 5 phút)
            let dominance = cryptoCache.dominance;
            let globalMarket = cryptoCache.globalMarket;
            if (now - dominance.updatedAt > 5 * 60 * 1000) {
                try {
                    const gRes = await axios.get('https://api.coingecko.com/api/v3/global', { timeout: 8000 });
                    const d = gRes.data?.data;
                    if (d) {
                        dominance = {
                            btc: parseFloat(d.market_cap_percentage?.btc || 50).toFixed(1),
                            eth: parseFloat(d.market_cap_percentage?.eth || 17).toFixed(1),
                            updatedAt: now
                        };
                        globalMarket = {
                            totalMarketCap: d.total_market_cap?.usd || 0,
                            volume24h: d.total_volume?.usd || 0,
                            marketCapChangePercent: parseFloat(d.market_cap_change_percentage_24h_usd || 0).toFixed(2),
                            updatedAt: now
                        };
                        cryptoCache.dominance = dominance;
                        cryptoCache.globalMarket = globalMarket;
                    }
                } catch (e) {}
            }

            // Altcoin season index: nếu BTC.D < 48%  
            const altSeason = parseFloat(dominance.btc) < 48
                ? 'Altseason đang diễn ra'
                : parseFloat(dominance.btc) > 55
                    ? 'BTC dẫn dắt mạnh'
                    : 'Chưa kích hoạt';

            return res.json({
                success: true,
                data: {
                    fearGreed: {
                        value: fearGreed.value,
                        label: fearGreed.label,
                        labelVi: translateFearGreed(fearGreed.label)
                    },
                    dominance: {
                        btc: dominance.btc,
                        eth: dominance.eth,
                        altSeason,
                        btcDominantSignal: parseFloat(dominance.btc) > 50 ? 'BTC dẫn dắt' : 'Altcoin mùa'
                    },
                    globalMarket: {
                        totalMarketCap: formatLargeNumber(globalMarket.totalMarketCap),
                        volume24h: formatLargeNumber(globalMarket.volume24h),
                        marketCapChangePercent: globalMarket.marketCapChangePercent
                    }
                }
            });
        } catch (error) {
            console.log(chalk.red(`❌ [CRYPTO RADAR] ${error.message}`));
            return res.status(500).json({ success: false, message: error.message });
        }
    });

    // ----------------------------------------------------------
    // ROUTE 2: /api/crypto/price/:symbol
    // Trả về: giá realtime + chỉ báo kỹ thuật + volume profile
     // ----------------------------------------------------------
    app.get('/api/crypto/price/:symbol', async (req, res) => {
        const symbol = req.params.symbol.toUpperCase();
        const interval = req.query.interval || '4h';
        const intervalMap = { 
            '1m': '1m', 
            '5m': '5m', '15m': '15m', 
            '30m': '30m', '1h': '1h', '4h': '4h',
            '1d': '1d', '1w': '1w' };
        let lastSignal = null;

        try {
            const coinRecord = await CryptoCoin.findOne({ symbol });
            if (coinRecord && coinRecord.reports && coinRecord.reports.length > 0) {
                lastSignal = coinRecord.reports[coinRecord.reports.length - 1];
            }
        } catch(e) {}

        try {
            const binanceInterval = intervalMap[interval] || '4h';

             const limitMap = { '1m': 500, '5m': 500, '15m': 300, '30m': 200, '1h': 200, '4h': 200, '1d': 300, '1w': 200 };
            const limit = limitMap[binanceInterval] || 200;

            // Lấy OHLCV từ Binance public API 
            const pair = `${symbol}USDT`;
            const [klineRes, tickerRes] = await Promise.all([
                axios.get(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${binanceInterval}&limit=${limit}`, { timeout: 8000 }),
                axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`, { timeout: 5000 })
            ]);

            // Parse OHLCV
            const candles = klineRes.data.map(k => ({
                time: new Date(k[0]).toISOString().replace('T', ' ').substring(0, 16),
                open: parseFloat(k[1]),
                high: parseFloat(k[2]),
                low: parseFloat(k[3]),
                close: parseFloat(k[4]),
                volume: parseFloat(k[5])
            }));

            // Parse ticker 24h
            const ticker = tickerRes.data;
            const currentPrice = parseFloat(ticker.lastPrice);
            const change24h = parseFloat(ticker.priceChangePercent);
            const volume24h = parseFloat(ticker.quoteVolume); 
            const high24h = parseFloat(ticker.highPrice);
            const low24h = parseFloat(ticker.lowPrice);

            // Tính chỉ báo kỹ thuật
            const technicals = calcTechnicals(candles);

            // Tính Volume Profile
            const volProfile = calcVolumeProfile(candles.slice(-50));

            // CVD (Cumulative Volume Delta)
            const cvd = candles.slice(-20).reduce((sum, c) => {
                return sum + (c.close >= c.open ? c.volume : -c.volume);
            }, 0);

             // Orderbook imbalance (  Binance depth)
            let orderbookImbalance = null;
            try {
                const depthRes = await axios.get(`https://api.binance.com/api/v3/depth?symbol=${pair}&limit=20`, { timeout: 3000 });
                const bids = depthRes.data.bids.reduce((sum, b) => sum + parseFloat(b[1]), 0);
                const asks = depthRes.data.asks.reduce((sum, a) => sum + parseFloat(a[1]), 0);
                const total = bids + asks;
                orderbookImbalance = {
                    bidPct: parseFloat(((bids / total) * 100).toFixed(1)),
                    askPct: parseFloat(((asks / total) * 100).toFixed(1)),
                    ratio: parseFloat((bids / asks).toFixed(2)),
                    spread: parseFloat((parseFloat(depthRes.data.asks[0][0]) - parseFloat(depthRes.data.bids[0][0])).toFixed(2))
                };
            } catch (e) { /*  optional */ }

            // ==================================================
            //ON-CHAIN TỪ COINGECKO
            // ==================================================
            let marketCap = 0, circulatingSupply = 0, maxSupply = 0, ath = 0, athChange = 0;
            try {
                 const cgRes = await axios.get(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&symbols=${symbol.toLowerCase()}`, { timeout: 4000 });
                if (cgRes.data && cgRes.data.length > 0) {
                    const cgData = cgRes.data[0];
                    marketCap = cgData.market_cap;
                    circulatingSupply = cgData.circulating_supply;
                    maxSupply = cgData.max_supply || cgData.total_supply;
                    ath = cgData.ath;
                    athChange = cgData.ath_change_percentage;
                }
            } catch (cgErr) {
                console.log(chalk.yellow(`⚠️ Không lấy được CoinGecko cho ${symbol}`));
            }

            return res.json({
                success: true,
                data: {
                    symbol,
                    pair,
                    currentPrice,
                    change24h,
                    volume24h: formatLargeNumber(volume24h),
                    high24h,
                    low24h,
                    candles,        
                    technicals,     
                    volProfile,     
                    cvd: Math.round(cvd),
                    orderbookImbalance,
                     marketCap,
                    circulatingSupply,
                    maxSupply,
                    ath,
                    athChange
                }
            });
            } catch (error) {
            console.log(chalk.yellow(`⚠️ Binance lỗi (${error.message}), thử Bybit...`));
            const pair = `${symbol}USDT`;
            const intervalMap2 = { '4h': '240', '1h': '60', '1d': 'D', '1w': 'W', '15m': '15', '5m': '5' };
            const bybitInterval = intervalMap2[interval] || '240';

            try {  
                const bybitRes = await axios.get(
                    `https://api.bybit.com/v5/market/kline?category=linear&symbol=${pair}&interval=${bybitInterval}&limit=200`,
                    { timeout: 8000 }
                );

                if (bybitRes.data?.result?.list) {
                    const rawCandles = bybitRes.data.result.list.reverse();
                    const candles = rawCandles.map(k => ({
                        time: new Date(parseInt(k[0])).toISOString().substring(0, 16).replace('T', ' '),
                        open: parseFloat(k[1]), high: parseFloat(k[2]),
                        low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
                    }));

                    const technicals = calcTechnicals(candles);
                    const volProfile = calcVolumeProfile(candles.slice(-50));
                    const currentPrice = candles[candles.length - 1].close;
                    const prevPrice = candles[candles.length - 2]?.close || currentPrice;
                    const change24h = parseFloat(((currentPrice - prevPrice) / prevPrice * 100).toFixed(2));

                    return res.json({
                        success: true, source: 'bybit',
                        data: {
                            symbol, pair, currentPrice, change24h,
                            volume24h: '---', high24h: 0, low24h: 0,
                            candles, technicals, volProfile, cvd: 0, orderbookImbalance: null,
                            marketCap: 0, circulatingSupply: 0, maxSupply: 0, ath: 0, athChange: 0,
                            lastSignal
                        }
                    });
                }
            } catch (bybitErr) {
                return res.status(500).json({ success: false, message: 'Binance & Bybit đều lỗi' });
            }
        }
    });  

    // ----------------------------------------------------------
    // LƯU BÁO CÁO AI MỚI VÀO DATABASE KHI PHÂN TÍCH
    // ----------------------------------------------------------
    app.post('/api/crypto/signal', async (req, res) => {
        try {
            const { symbol, currentPrice, technicalScore, techDetails, derivatives, newsList } = req.body;
            
            const aiDecision = await analyzeCryptoSignalWithGemini(symbol, {
                currentPrice, technicalScore, techDetails, derivatives,
                newsList: (newsList || []).slice(0, 5)
            });

            aiDecision.timestamp = new Date().toISOString();

            try {
                let coinRecord = await CryptoCoin.findOne({ symbol });
                if (!coinRecord) coinRecord = new CryptoCoin({ symbol });
                if (!coinRecord.reports) coinRecord.reports = [];
                
                coinRecord.reports.push(aiDecision);
                if (coinRecord.reports.length > 10) coinRecord.reports.shift(); 
                
                await coinRecord.save();
            } catch (dbErr) {
                console.log(chalk.yellow(`⚠️ Không thể lưu báo cáo AI cho ${symbol}: ${dbErr.message}`));
            }

            return res.json({ success: true, data: aiDecision });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    });
    // ----------------------------------------------------------
    // ROUTE 3: /api/crypto/top-movers
    // Trả về: Top gainers và losers trong 24h
     // ----------------------------------------------------------
    app.get('/api/crypto/top-movers', async (req, res) => {
        const now = Date.now();

        // Dùng cache nếu còn tươi < 2 phút
        if (now - cryptoCache.topMovers.updatedAt < 2 * 60 * 1000 && cryptoCache.topMovers.gainers.length > 0) {
            return res.json({ success: true, data: cryptoCache.topMovers });
        }

        try {
            // Lấy top 50 coin theo market cap, lọc ra movers
            const res = await axios.get(
                'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&price_change_percentage=24h',
                { timeout: 10000 }
            );

            const coins = res.data;
            const sorted = [...coins].sort((a, b) =>
                Math.abs(b.price_change_percentage_24h) - Math.abs(a.price_change_percentage_24h)
            );

            const gainers = sorted
                .filter(c => c.price_change_percentage_24h > 0)
                .slice(0, 5)
                .map(c => ({ symbol: c.symbol.toUpperCase(), change: parseFloat(c.price_change_percentage_24h.toFixed(2)), price: c.current_price }));

            const losers = sorted
                .filter(c => c.price_change_percentage_24h < 0)
                .slice(0, 5)
                .map(c => ({ symbol: c.symbol.toUpperCase(), change: parseFloat(c.price_change_percentage_24h.toFixed(2)), price: c.current_price }));

            cryptoCache.topMovers = { gainers, losers, updatedAt: now };

            return res.json({ success: true, data: { gainers, losers } });
        } catch (error) {
             try {
                const binanceRes = await axios.get('https://api.binance.com/api/v3/ticker/24hr', { timeout: 8000 });
                const usdtPairs = binanceRes.data
                    .filter(t => t.symbol.endsWith('USDT') && !t.symbol.includes('UP') && !t.symbol.includes('DOWN'))
                    .map(t => ({
                        symbol: t.symbol.replace('USDT', ''),
                        change: parseFloat(parseFloat(t.priceChangePercent).toFixed(2)),
                        price: parseFloat(t.lastPrice)
                    }))
                    .filter(t => t.price > 0.01); // lọc trash coins

                const sorted = usdtPairs.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
                const gainers = sorted.filter(c => c.change > 0).slice(0, 5);
                const losers = sorted.filter(c => c.change < 0).slice(0, 5);

                cryptoCache.topMovers = { gainers, losers, updatedAt: now };
                return res.json({ success: true, data: { gainers, losers } });
            } catch (e) {
                return res.status(500).json({ success: false, message: error.message });
            }
        }
    });

    // ----------------------------------------------------------
    // ROUTE 4: /api/crypto/funding
    // Trả về: Funding rate các coin chính trên Binance Futures
    // ----------------------------------------------------------
    app.get('/api/crypto/funding', async (req, res) => {
        try {
            const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

            const results = await Promise.all(symbols.map(async (sym) => {
                try {
                    const r = await axios.get(
                        `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${sym}&limit=1`,
                        { timeout: 4000 }
                    );
                    if (r.data?.[0]) {
                        return {
                            symbol: sym.replace('USDT', ''),
                            fundingRate: parseFloat((parseFloat(r.data[0].fundingRate) * 100).toFixed(4)),
                            nextFundingTime: new Date(r.data[0].fundingTime).toLocaleTimeString('vi-VN')
                        };
                    }
                } catch (e) {}
                return { symbol: sym.replace('USDT', ''), fundingRate: 0, nextFundingTime: '---' };
            }));

             const avgFunding = results.reduce((sum, r) => sum + r.fundingRate, 0) / results.length;
            const marketBias = avgFunding > 0.02 ? 'Longs chiếm ưu thế' : avgFunding < -0.01 ? 'Shorts chiếm ưu thế' : 'Cân bằng';

            return res.json({ success: true, data: { rates: results, avgFunding: parseFloat(avgFunding.toFixed(4)), marketBias } });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    });

    // ----------------------------------------------------------
    // ROUTE 5: /api/crypto/liquidations
    // Trả về: Dữ liệu thanh lý vị thế 24h ( Coinglass)
    // ----------------------------------------------------------
    app.get('/api/crypto/liquidations', async (req, res) => {
        try {
            // CoinGlass API công khai (không cần key)
            const res = await axios.get(
                'https://open-api.coinglass.com/public/v2/liquidation_history?symbol=BTC&time_type=h24',
                {
                    timeout: 6000,
                    headers: {
                        'coinglassSecret': process.env.COINGLASS_API_KEY || '',
                        'Accept': 'application/json'
                    }
                }
            );

            if (res.data?.data) {
                const d = res.data.data;
                return res.json({
                    success: true,
                    data: {
                        longLiqUsd: formatLargeNumber(d.longLiquidationUsd || 0),
                        shortLiqUsd: formatLargeNumber(d.shortLiquidationUsd || 0),
                        totalLiqUsd: formatLargeNumber((d.longLiquidationUsd || 0) + (d.shortLiquidationUsd || 0)),
                        dominantSide: (d.longLiquidationUsd || 0) > (d.shortLiquidationUsd || 0) ? 'Long bị thanh lý nhiều' : 'Short bị thanh lý nhiều'
                    }
                });
            }
            throw new Error('Không có dữ liệu từ CoinGlass');
        } catch (error) {
            // Fallback: trả về dữ liệu mô phỏng nếu API không có key
            console.log(chalk.yellow(`⚠️ [CRYPTO] CoinGlass lỗi: ${error.message}. Cần COINGLASS_API_KEY trong .env`));
            return res.json({
                success: true,
                isEstimated: true,
                data: {
                    longLiqUsd: '---',
                    shortLiqUsd: '---',
                    totalLiqUsd: '---',
                    dominantSide: 'Cần COINGLASS_API_KEY',
                    note: 'Thêm COINGLASS_API_KEY=xxx vào file .env để bật tính năng này'
                }
            });
        }
    });
    console.log(chalk.bgMagenta.black.bold(' ✔ CRYPTO ROUTES ĐÃ ĐĂNG KÝ THÀNH CÔNG '));
}

// ============================================================
// HELPER: Dịch Fear & Greed label sang tiếng Việt
// ============================================================
function translateFearGreed(label) {
    const map = {
        'Extreme Fear': 'Cực kỳ sợ hãi',
        'Fear': 'Sợ hãi',
        'Neutral': 'Trung lập',
        'Greed': 'Tham lam',
        'Extreme Greed': 'Tham lam cực độ'
    };
    return map[label] || label;
}
// ============================================================
//EXPORT: Provide OHLCV data to history.controller.js// ============================================================
export const fetchCryptoData = async (symbol, interval) => {
    const intervalMap = {
        '1 phút': '1m', '5 phút': '5m', '15 phút': '15m',
        '30 phút': '30m', '1 giờ': '1h', '4 giờ': '4h',
        '1 ngày': '1d', '1 tuần': '1w'
    };
    const limitMap = {
        '1m': 500, '5m': 300, '15m': 200, '30m': 200,
        '1h': 200, '4h': 200, '1d': 365, '1w': 200
    };

    const binanceInterval = intervalMap[interval] || '1d';
    const limit = limitMap[binanceInterval] || 200;
    const pair = `${symbol}USDT`;

    try {
//Try getting it from Binance first
        const kRes = await axios.get(
            `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${binanceInterval}&limit=${limit}`,
            { timeout: 8000 }
        );
        return kRes.data.map(k => ({
            time: new Date(k[0]).toISOString().replace('T', ' ').substring(0, ['1d','1w'].includes(binanceInterval) ? 10 : 16),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5])
        }));
    } catch (error) {
//Fallback to Bybit if Binance crashes
         try {
            const bvMap = { '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W' };
            const bybitInt = bvMap[binanceInterval] || 'D';
            const bRes = await axios.get(
                `https://api.bybit.com/v5/market/kline?category=spot&symbol=${pair}&interval=${bybitInt}&limit=${limit}`,
                { timeout: 8000 }
            );
            if (bRes.data?.result?.list) {
                return bRes.data.result.list.reverse().map(k => ({
                    time: new Date(parseInt(k[0])).toISOString().substring(0, 16).replace('T', ' '),
                    open: parseFloat(k[1]), high: parseFloat(k[2]),
                    low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
                }));
            }
        } catch (e) { }
        throw new Error('Lỗi lấy dữ liệu từ cả Binance và Bybit');
    }
};
