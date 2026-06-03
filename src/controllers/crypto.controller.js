import axios from 'axios';
import chalk from 'chalk';
import vader from 'vader-sentiment';
import CryptoCoin from '../../models/CryptoCoin.js';
import { analyzeCryptoSignalWithGemini } from '../services/aiService.js';
import { buildCryptoSignalMessage, sendTelegramMessage } from '../services/telegramService.js';
import { cryptoCache, formatLargeNumber, calcTechnicals, calcVolumeProfile, translateFearGreed } from '../services/cryptoService.js';

export const getCryptoNews = async (req, res) => {
    const sym = req.params.symbol.toUpperCase();
    try {
        const getVaderSentiment = (text) => {
            const intensity = vader.SentimentIntensityAnalyzer.polarity_scores(text);
            if (intensity.compound >= 0.05) return 'positive';
            if (intensity.compound <= -0.05) return 'negative';
            return 'neutral';
        };

        let proNews = [], redditNews = [], googleNews = [];
        try {
            const rssRes = await axios.get(`https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml`, { timeout: 8000 });
            const items = rssRes.data.match(/<item>([\s\S]*?)<\/item>/g) || [];
            proNews = items.slice(0, 10).map(item => {
                const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || 'No title';
                const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '';
                const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
                if (title.toLowerCase().includes(sym.toLowerCase()) || sym === 'BTC') {
                    return { title, link, source: 'CoinDesk (RSS)', time: new Date(pubDate).toLocaleString('vi-VN'), sentiment: getVaderSentiment(title) };
                }
                return null;
            }).filter(n => n !== null);
        } catch (err) {}

        try {
            const redditRes = await axios.get(`https://www.reddit.com/search.json?q=${sym}+crypto&sort=new&limit=100`, { timeout: 5000 });
            const validPosts = redditRes.data.data.children.filter(post => !post.data.removed_by_category && !post.data.is_video && post.data.score >= 5);
            redditNews = validPosts.slice(0, 15).map(post => ({ title: post.data.title, link: `https://www.reddit.com${post.data.permalink}`, source: `Reddit (r/${post.data.subreddit})`, time: new Date(post.data.created_utc * 1000).toLocaleString('vi-VN'), sentiment: getVaderSentiment(post.data.title) }));
        } catch (err) {}

        try {
            const rssRes = await axios.get(`https://news.google.com/rss/search?q=${encodeURIComponent(`${sym} crypto`)}&hl=en-US&gl=US&ceid=US:en`, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
            googleNews = [...rssRes.data.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 15).map(m => {
                const title = m[1].match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || m[1].match(/<title>(.*?)<\/title>/)?.[1] || '';
                return { title, link: m[1].match(/<link>(.*?)<\/link>/)?.[1] || '', source: m[1].match(/<source[^>]*>(.*?)<\/source>/)?.[1] || 'Google News', time: m[1].match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '', sentiment: getVaderSentiment(title) };
            }).filter(n => n.title);
        } catch (err) {}

        return res.json({ success: true, data: [...proNews, ...redditNews, ...googleNews].slice(0, 50) });
    } catch (e) { return res.json({ success: false, data: [], message: e.message }); }
};

export const getCryptoDerivatives = async (req, res) => {
    const sym = req.params.symbol.toUpperCase();
    const pair = sym + 'USDT';
    try {
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
    } catch (error) { return res.json({ success: false, message: 'Không thể lấy dữ liệu phái sinh' }); }
};

export const getCryptoRadar = async (req, res) => {
    try {
        const { fearGreed, dominance, globalMarket } = cryptoCache;
        const altSeason = parseFloat(dominance.btc) < 48 ? 'Altseason đang diễn ra' : parseFloat(dominance.btc) > 55 ? 'BTC dẫn dắt mạnh' : 'Chưa kích hoạt';
        return res.json({
            success: true,
            data: {
                fearGreed: { value: fearGreed.value, label: fearGreed.label, labelVi: translateFearGreed(fearGreed.label) },
                dominance: { btc: dominance.btc, eth: dominance.eth, altSeason, btcDominantSignal: parseFloat(dominance.btc) > 50 ? 'BTC dẫn dắt' : 'Altcoin mùa' },
                globalMarket: { totalMarketCap: formatLargeNumber(globalMarket.totalMarketCap), volume24h: formatLargeNumber(globalMarket.volume24h), marketCapChangePercent: globalMarket.marketCapChangePercent }
            }
        });
    } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const getCryptoPrice = async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const interval = req.query.interval || '4h';
    const intervalMap = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' };
    let lastSignal = null;
    try { const coinRecord = await CryptoCoin.findOne({ symbol }); if (coinRecord?.reports?.length > 0) lastSignal = coinRecord.reports[coinRecord.reports.length - 1]; } catch(e) {}

    try {
        const binanceInterval = intervalMap[interval] || '4h';
        const limitMap = { '1m': 500, '5m': 500, '15m': 300, '30m': 200, '1h': 200, '4h': 200, '1d': 300, '1w': 200 };
        const limit = limitMap[binanceInterval] || 200;
        const pair = `${symbol}USDT`;

        const [klineRes, tickerRes] = await Promise.all([
            axios.get(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${binanceInterval}&limit=${limit}`, { timeout: 8000 }),
            axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`, { timeout: 5000 })
        ]);

        const candles = klineRes.data.map(k => ({ time: new Date(k[0]).toISOString().replace('T', ' ').substring(0, 16), open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]) }));
        const ticker = tickerRes.data;
        
        let orderbookImbalance = null;
        try {
            const depthRes = await axios.get(`https://api.binance.com/api/v3/depth?symbol=${pair}&limit=20`, { timeout: 3000 });
            const bids = depthRes.data.bids.reduce((sum, b) => sum + parseFloat(b[1]), 0);
            const asks = depthRes.data.asks.reduce((sum, a) => sum + parseFloat(a[1]), 0);
            orderbookImbalance = { bidPct: parseFloat(((bids / (bids+asks)) * 100).toFixed(1)), askPct: parseFloat(((asks / (bids+asks)) * 100).toFixed(1)), ratio: parseFloat((bids / asks).toFixed(2)), spread: parseFloat((parseFloat(depthRes.data.asks[0][0]) - parseFloat(depthRes.data.bids[0][0])).toFixed(2)) };
        } catch (e) {}

        let marketCap = 0, circulatingSupply = 0, maxSupply = 0, ath = 0, athChange = 0;
        try {
            const cgRes = await axios.get(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&symbols=${symbol.toLowerCase()}`, { timeout: 4000 });
            if (cgRes.data?.[0]) { const d = cgRes.data[0]; marketCap = d.market_cap; circulatingSupply = d.circulating_supply; maxSupply = d.max_supply || d.total_supply; ath = d.ath; athChange = d.ath_change_percentage; }
        } catch (cgErr) {}

        return res.json({
            success: true,
            data: {
                symbol, pair, currentPrice: parseFloat(ticker.lastPrice), change24h: parseFloat(ticker.priceChangePercent), volume24h: formatLargeNumber(parseFloat(ticker.quoteVolume)),
                high24h: parseFloat(ticker.highPrice), low24h: parseFloat(ticker.lowPrice), candles, technicals: calcTechnicals(candles), volProfile: calcVolumeProfile(candles.slice(-50)),
                cvd: Math.round(candles.slice(-20).reduce((sum, c) => sum + (c.close >= c.open ? c.volume : -c.volume), 0)), orderbookImbalance, marketCap, circulatingSupply, maxSupply, ath, athChange, lastSignal
            }
        });
    } catch (error) { return res.status(500).json({ success: false, message: 'Binance lỗi: ' + error.message }); }
};

export const saveCryptoSignal = async (req, res) => {
    try {
        const { symbol, currentPrice, technicalScore, techDetails, derivatives, newsList } = req.body;
        const aiDecision = await analyzeCryptoSignalWithGemini(symbol, { currentPrice, technicalScore, techDetails, derivatives, newsList: (newsList || []).slice(0, 5) });
        aiDecision.timestamp = new Date().toISOString();
        try {
            let coinRecord = await CryptoCoin.findOne({ symbol });
            if (!coinRecord) coinRecord = new CryptoCoin({ symbol });
            if (!coinRecord.reports) coinRecord.reports = [];
            coinRecord.reports.push(aiDecision);
            if (coinRecord.reports.length > 10) coinRecord.reports.shift();
            await coinRecord.save();
        } catch (dbErr) {}

        await sendTelegramMessage(buildCryptoSignalMessage(symbol, aiDecision, currentPrice)).catch(() => {});
        return res.json({ success: true, data: aiDecision });
    } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const getTopMovers = async (req, res) => {
    if (Date.now() - cryptoCache.topMovers.updatedAt < 2 * 60 * 1000 && cryptoCache.topMovers.gainers.length > 0) return res.json({ success: true, data: cryptoCache.topMovers });
    try {
        const resData = await axios.get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&price_change_percentage=24h', { timeout: 10000 });
        const sorted = [...resData.data].sort((a, b) => Math.abs(b.price_change_percentage_24h) - Math.abs(a.price_change_percentage_24h));
        const gainers = sorted.filter(c => c.price_change_percentage_24h > 0).slice(0, 5).map(c => ({ symbol: c.symbol.toUpperCase(), change: parseFloat(c.price_change_percentage_24h.toFixed(2)), price: c.current_price }));
        const losers = sorted.filter(c => c.price_change_percentage_24h < 0).slice(0, 5).map(c => ({ symbol: c.symbol.toUpperCase(), change: parseFloat(c.price_change_percentage_24h.toFixed(2)), price: c.current_price }));
        cryptoCache.topMovers = { gainers, losers, updatedAt: Date.now() };
        return res.json({ success: true, data: { gainers, losers } });
    } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const getCryptoFunding = async (req, res) => {
    try {
        const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
        const results = await Promise.all(symbols.map(async (sym) => {
            try {
                const r = await axios.get(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${sym}&limit=1`, { timeout: 4000 });
                if (r.data?.[0]) return { symbol: sym.replace('USDT', ''), fundingRate: parseFloat((parseFloat(r.data[0].fundingRate) * 100).toFixed(4)), nextFundingTime: new Date(r.data[0].fundingTime).toLocaleTimeString('vi-VN') };
            } catch (e) {}
            return { symbol: sym.replace('USDT', ''), fundingRate: 0, nextFundingTime: '---' };
        }));
        const avgFunding = results.reduce((sum, r) => sum + r.fundingRate, 0) / results.length;
        const marketBias = avgFunding > 0.02 ? 'Longs chiếm ưu thế' : avgFunding < -0.01 ? 'Shorts chiếm ưu thế' : 'Cân bằng';
        return res.json({ success: true, data: { rates: results, avgFunding: parseFloat(avgFunding.toFixed(4)), marketBias } });
    } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const getCryptoLiquidations = async (req, res) => {
    try {
        const glassRes = await axios.get('https://open-api.coinglass.com/public/v2/liquidation_history?symbol=BTC&time_type=h24', { timeout: 6000, headers: { 'coinglassSecret': process.env.COINGLASS_API_KEY || '', 'Accept': 'application/json' } });
        const d = glassRes.data?.data;
        if (!d) throw new Error('Không có dữ liệu');
        return res.json({ success: true, data: { longLiqUsd: formatLargeNumber(d.longLiquidationUsd || 0), shortLiqUsd: formatLargeNumber(d.shortLiquidationUsd || 0), totalLiqUsd: formatLargeNumber((d.longLiquidationUsd || 0) + (d.shortLiquidationUsd || 0)), dominantSide: (d.longLiquidationUsd || 0) > (d.shortLiquidationUsd || 0) ? 'Long bị thanh lý nhiều' : 'Short bị thanh lý nhiều' } });
    } catch (error) {
        return res.json({ success: true, isEstimated: true, data: { longLiqUsd: '---', shortLiqUsd: '---', totalLiqUsd: '---', dominantSide: 'Cần COINGLASS_API_KEY', note: 'Thêm COINGLASS_API_KEY=xxx vào .env' } });
    }
};
export const getCryptoSymbols = async (req, res) => {
    try {
        const coins = await CryptoCoin.find({}, { symbol: 1, name: 1, image: 1, _id: 0 }).lean();
        return res.json(coins);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
