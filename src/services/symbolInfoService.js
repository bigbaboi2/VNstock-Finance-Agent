/**
 * Telegram /info — quote + technicals + news/sentiment + deterministic view.
 * Does NOT call any LLM. Cached AI reports are read from DB only.
 */
import axios from 'axios';
import chalk from 'chalk';
import vader from 'vader-sentiment';
import Stock from '../../models/Stock.js';
import CryptoCoin from '../../models/CryptoCoin.js';
import { fetchCafefData } from '../fetchers/cafefService.js';
import {
    fetchKlines,
    fetchTicker24h,
    calcTechnicals,
} from './cryptoService.js';
// autoTradeEngine is imported dynamically inside getVnSymbolInfo to avoid circular deps
import {
    filterValidNews,
    isPrefetchNewsFresh,
    prefetchVnStockNews,
} from './vnStockNewsService.js';
import {
    getVnMarketContext,
    buildVnMacroSnapshot,
    getCryptoMacroContext,
} from './tradeContextService.js';
import { getCachedMarketInsight } from './marketInsightService.js';

const POSITIVE_WORDS = [
    'tăng', 'vượt', 'lãi', 'lợi nhuận', 'kỷ lục', 'bứt phá', 'mua ròng',
    'positive', 'surge', 'rally', 'gain', 'record', 'profit', 'inflow', 'bull',
];
const NEGATIVE_WORDS = [
    'giảm', 'lỗ', 'bán tháo', 'bán ròng', 'điều tra', 'nợ xấu', 'rủi ro',
    'negative', 'drop', 'fall', 'selloff', 'lawsuit', 'hack', 'outflow', 'bear',
];

const normalizeSymbol = (raw = '') =>
    String(raw).trim().toUpperCase().replace(/USDT$/i, '');

const classifyNewsSentiment = (text = '') => {
    const lower = String(text).toLowerCase();
    const positive = POSITIVE_WORDS.some((w) => lower.includes(w));
    const negative = NEGATIVE_WORDS.some((w) => lower.includes(w));
    if (positive && !negative) return 'positive';
    if (negative && !positive) return 'negative';
    return 'neutral';
};

const classifyWithVader = (text = '') => {
    try {
        const intensity = vader.SentimentIntensityAnalyzer.polarity_scores(String(text));
        if (intensity.compound >= 0.05) return 'positive';
        if (intensity.compound <= -0.05) return 'negative';
    } catch (_) {}
    return classifyNewsSentiment(text);
};

const summarizeNewsItems = (items = []) => {
    const seen = new Set();
    const cleanItems = items
        .filter((n) => n?.title)
        .filter((n) => {
            const key = String(n.title).trim().toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, 8)
        .map((n) => ({
            title: String(n.title).trim(),
            sentiment: n.sentiment || classifyNewsSentiment(n.title),
            source: n.source || 'N/A',
            date: n.date || n.publishedAt || null,
        }));

    const counts = cleanItems.reduce(
        (acc, n) => {
            acc[n.sentiment] = (acc[n.sentiment] || 0) + 1;
            return acc;
        },
        { positive: 0, negative: 0, neutral: 0 }
    );
    const score = Math.max(-3, Math.min(3, counts.positive - counts.negative));
    const bias = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
    return { items: cleanItems, counts, score, bias };
};

const roundPrice = (price, asset) => {
    const n = Number(price);
    if (!Number.isFinite(n)) return null;
    if (asset === 'VN_STOCK') return Math.round(n * 20) / 20;
    if (n >= 1000) return Math.round(n * 100) / 100;
    if (n >= 1) return Math.round(n * 1000) / 1000;
    return Math.round(n * 1e6) / 1e6;
};

const stripHtml = (s = '') =>
    String(s)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const extractRssItems = (xml = '', limit = 8) => {
    const matches = [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit);
    return matches.map((m) => {
        const raw = m[1];
        const title = stripHtml(
            raw.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
            || raw.match(/<title>(.*?)<\/title>/)?.[1]
            || ''
        );
        const link = raw.match(/<link>(.*?)<\/link>/)?.[1] || '';
        const pubDate = raw.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
        return { title, link, pubDate };
    }).filter((n) => n.title);
};

/** Resolve VN_STOCK vs CRYPTO without LLM. */
export const resolveAssetType = async (symbol) => {
    const sym = normalizeSymbol(symbol);
    if (!sym) throw new Error('Thiếu mã');

    const [cryptoDoc, stockDoc] = await Promise.all([
        CryptoCoin.findOne({ symbol: sym }).lean().catch(() => null),
        Stock.findOne({ symbol: sym }).lean().catch(() => null),
    ]);

    if (cryptoDoc && !stockDoc) return { symbol: sym, asset: 'CRYPTO' };
    if (stockDoc && !cryptoDoc) return { symbol: sym, asset: 'VN_STOCK' };
    if (cryptoDoc && stockDoc) {
        // Prefer crypto for well-known short tickers that exist in both (rare)
        if (['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA'].includes(sym)) {
            return { symbol: sym, asset: 'CRYPTO' };
        }
        return { symbol: sym, asset: 'VN_STOCK' };
    }

    // Fallback probes
    try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - 7 * 24 * 60 * 60;
        const dnse = await axios.get(
            `https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${from}&to=${to}&symbol=${sym}&resolution=1D`,
            { timeout: 6000 }
        );
        if (dnse.data?.c?.length > 0) return { symbol: sym, asset: 'VN_STOCK' };
    } catch (_) {}

    try {
        const candles = await fetchKlines(sym, '4h');
        if (candles?.length) return { symbol: sym, asset: 'CRYPTO' };
    } catch (_) {}

    throw new Error(`Không tìm thấy mã ${sym} (cổ phiếu VN hoặc crypto)`);
};

const ENTRADE_STOCK = 'https://services.entrade.com.vn/chart-api/v2/ohlcs/stock';

/** Parse Entrade OHLCV → candles in VND (×1000). */
const parseEntradeCandles = (data) => {
    if (!data?.t?.length) return [];
    return data.t.map((ts, i) => ({
        time: ts,
        open: Number(data.o[i]) * 1000,
        high: Number(data.h[i]) * 1000,
        low: Number(data.l[i]) * 1000,
        close: Number(data.c[i]) * 1000,
        volume: Number(data.v[i]) || 0,
    }));
};

const fetchEntradeOhlcv = async (symbol, resolution, days) => {
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 24 * 60 * 60;
    const res = await axios.get(
        `${ENTRADE_STOCK}?from=${from}&to=${to}&symbol=${symbol}&resolution=${resolution}`,
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    return parseEntradeCandles(res.data);
};

/**
 * Live quote: 15m last close (realtime trong phiên) + % so với close phiên trước (1D).
 * Volume: max(nến ngày, tổng volume 15m trong ngày) — daily Entrade đôi khi chậm hơn UI.
 */
const fetchVnQuote = async (symbol) => {
    const [daily, intra] = await Promise.all([
        fetchEntradeOhlcv(symbol, '1D', 10).catch(() => []),
        fetchEntradeOhlcv(symbol, '15', 3).catch(() => []),
    ]);

    if (!daily.length && !intra.length) {
        throw new Error(`Không lấy được giá Entrade cho ${symbol}`);
    }

    const prevClose = daily.length >= 2
        ? daily[daily.length - 2].close
        : daily[0]?.close;
    const todayBar = daily[daily.length - 1];

    // Ưu tiên 15m (live); fallback close ngày
    const liveClose = intra.length
        ? intra[intra.length - 1].close
        : todayBar?.close;

    if (!liveClose) throw new Error(`Không lấy được giá Entrade cho ${symbol}`);

    const ref = prevClose || todayBar?.open || liveClose;
    const change = liveClose - ref;
    const changePercent = ref ? (change / ref) * 100 : 0;

    // Volume trong phiên: cộng nến 15m từ 0h VN (UTC+7) hôm nay
    let intraVol = 0;
    if (intra.length) {
        const now = new Date();
        const vnOffsetMs = 7 * 60 * 60 * 1000;
        const vnNow = new Date(now.getTime() + vnOffsetMs);
        const startVn = Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate()) - vnOffsetMs;
        const startSec = Math.floor(startVn / 1000);
        intraVol = intra
            .filter((c) => c.time >= startSec)
            .reduce((s, c) => s + (c.volume || 0), 0);
    }
    const volume = Math.max(todayBar?.volume || 0, intraVol);

    return {
        price: liveClose,
        change,
        changePercent,
        volume,
        prevClose: ref,
        source: intra.length ? 'ENTRADE_15M' : 'ENTRADE_1D',
        fetchedAt: new Date(),
        priceAt: intra.length
            ? new Date(intra[intra.length - 1].time * 1000)
            : (todayBar?.time ? new Date(todayBar.time * 1000) : new Date()),
    };
};

/** Đủ nến cho analyzeTechnicalSignal (≥ 52+26). */
const fetchVnAnalysisCandles = async (symbol) => {
    // ~180 ngày lịch ≈ 120+ phiên — vượt ngưỡng 78 nến
    const candles = await fetchEntradeOhlcv(symbol, '1D', 180);
    if (candles.length < 30) {
        throw new Error(`Không đủ nến phân tích cho ${symbol} (${candles.length})`);
    }
    return candles;
};

/** MACD line đơn giản để hiển thị (EMA12 − EMA26). */
const calcMacdLine = (closes = []) => {
    if (closes.length < 26) return null;
    const ema = (data, period) => {
        const k = 2 / (period + 1);
        let val = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
        for (let i = period; i < data.length; i++) val = data[i] * k + val * (1 - k);
        return val;
    };
    return Math.round((ema(closes, 12) - ema(closes, 26)) * 100) / 100;
};

/** RSI fallback nếu analyzeTechnicalSignal early-return. */
const calcRsiSimple = (closes = [], period = 14) => {
    if (closes.length < period + 1) return null;
    let gains = 0;
    let losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    return Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 10) / 10;
};

const calcRiskMetrics = (closes = []) => {
    if (closes.length < 2) return { maxDrawdown: 0, volatility: 0 };
    
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * 100;
    
    const period = Math.min(60, closes.length);
    const recentCloses = closes.slice(-period);
    let maxDrawdown = 0;
    let peak = recentCloses[0];
    
    for (let i = 1; i < recentCloses.length; i++) {
        if (recentCloses[i] > peak) {
            peak = recentCloses[i];
        }
        const drawdown = (peak - recentCloses[i]) / peak * 100;
        if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
        }
    }
    
    return {
        maxDrawdown: Math.round(maxDrawdown * 100) / 100,
        volatility: Math.round(volatility * 100) / 100
    };
};

const buildVnLevels = (price, atr, direction) => {
    const entry = roundPrice(price, 'VN_STOCK');
    const a = atr && atr > 0 ? atr : price * 0.02;
    if (direction === 'SHORT') {
        // VN stocks: no short plan — treat as observe levels around price
        return {
            entry,
            sl: roundPrice(entry + a * 1.5, 'VN_STOCK'),
            tp1: roundPrice(entry - a * 1.2, 'VN_STOCK'),
            tp2: roundPrice(entry - a * 2.5, 'VN_STOCK'),
        };
    }
    if (direction === 'LONG') {
        return {
            entry,
            sl: roundPrice(entry - a * 1.5, 'VN_STOCK'),
            tp1: roundPrice(entry + a * 1.2, 'VN_STOCK'),
            tp2: roundPrice(entry + a * 2.5, 'VN_STOCK'),
        };
    }
    return {
        entry,
        sl: roundPrice(entry - a * 1.5, 'VN_STOCK'),
        tp1: roundPrice(entry + a * 1.2, 'VN_STOCK'),
        tp2: roundPrice(entry + a * 2.5, 'VN_STOCK'),
    };
};

const fetchVnMicroNews = async (symbol) => {
    let stock = await Stock.findOne(
        { symbol },
        { deepNewsData: 1, deepNewsPrefetchedAt: 1, deepNewsFetchedAt: 1 }
    ).lean();

    if (!isPrefetchNewsFresh(stock || {})) {
        console.log(chalk.cyan(`[INFO] Prefetch tin VN cho ${symbol}...`));
        await prefetchVnStockNews(symbol, { mode: 'balanced', newsMode: 'fast', limit: 12 }).catch((err) => {
            console.log(chalk.yellow(`[INFO] Prefetch tin ${symbol} lỗi: ${err.message}`));
        });
        stock = await Stock.findOne(
            { symbol },
            { deepNewsData: 1, deepNewsPrefetchedAt: 1, deepNewsFetchedAt: 1 }
        ).lean();
    }

    const valid = filterValidNews(stock?.deepNewsData || [])
        .slice()
        .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
        .slice(0, 8)
        .map((n) => ({
            title: n.title,
            source: n.source || 'VN',
            sentiment: n.sentiment || classifyNewsSentiment(n.title),
            date: n.date || n.publishedAt || null,
        }));

    return summarizeNewsItems(valid);
};

const fetchCryptoMicroNews = async (symbol) => {
    const items = [];
    const base = normalizeSymbol(symbol);

    try {
        const rssRes = await axios.get(
            `https://news.google.com/rss/search?q=${encodeURIComponent(`${base} crypto`)}&hl=en-US&gl=US&ceid=US:en`,
            { timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        for (const n of extractRssItems(rssRes.data, 8)) {
            items.push({
                title: n.title,
                source: 'Google News',
                sentiment: classifyWithVader(n.title),
                date: n.pubDate || null,
            });
        }
    } catch (err) {
        console.log(chalk.gray(`[INFO] Crypto Google news ${base}: ${err.message}`));
    }

    try {
        const rssRes = await axios.get(
            'https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml',
            { timeout: 6000 }
        );
        for (const n of extractRssItems(rssRes.data, 12)) {
            if (
                n.title.toLowerCase().includes(base.toLowerCase())
                || base === 'BTC'
            ) {
                items.push({
                    title: n.title,
                    source: 'CoinDesk',
                    sentiment: classifyWithVader(n.title),
                    date: n.pubDate || null,
                });
            }
        }
    } catch (err) {
        console.log(chalk.gray(`[INFO] CoinDesk news ${base}: ${err.message}`));
    }

    // Dedupe by title
    const seen = new Set();
    const unique = items.filter((n) => {
        const key = n.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return summarizeNewsItems(unique.slice(0, 8));
};

const fetchCryptoDerivatives = async (symbol) => {
    const pair = `${normalizeSymbol(symbol)}USDT`;
    try {
        const [fundingRes, lsRes] = await Promise.all([
            axios.get(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${pair}`, { timeout: 5000 }).catch(() => null),
            axios.get(
                `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${pair}&period=1d&limit=1`,
                { timeout: 5000 }
            ).catch(() => null),
        ]);
        return {
            fundingRate: fundingRes?.data
                ? (parseFloat(fundingRes.data.lastFundingRate) * 100).toFixed(4)
                : null,
            longPercent: lsRes?.data?.[0]
                ? (parseFloat(lsRes.data[0].longAccount) * 100).toFixed(1)
                : null,
            shortPercent: lsRes?.data?.[0]
                ? (parseFloat(lsRes.data[0].shortAccount) * 100).toFixed(1)
                : null,
        };
    } catch (_) {
        return null;
    }
};

const readCachedAiVn = (stockDoc) => {
    const reports = stockDoc?.reports;
    if (!Array.isArray(reports) || reports.length === 0) return null;
    const latest = reports[reports.length - 1];
    if (!latest) return null;
    const content = String(latest.content || '');
    const excerpt = content
        .replace(/[#*_`>]/g, '')
        .replace(/\n+/g, ' ')
        .trim()
        .slice(0, 220);
    return {
        action: latest.action || latest.actionData?.action || 'QUAN SÁT',
        actionData: latest.actionData || null,
        timestamp: latest.timestamp || null,
        excerpt: excerpt || null,
        price: latest.price || null,
        changePercent: latest.changePercent ?? null,
    };
};

const readCachedAiCrypto = (coinDoc) => {
    const reports = coinDoc?.reports;
    if (!Array.isArray(reports) || reports.length === 0) return null;
    const latest = reports[reports.length - 1];
    if (!latest) return null;
    return {
        action: latest.signal || latest.action || 'WAIT',
        actionData: {
            entry: latest.entry,
            sl: latest.sl,
            tp: latest.tp,
            confidence: latest.confidence,
            horizon: latest.horizon,
        },
        timestamp: latest.timestamp || null,
        excerpt: String(latest.advice || latest.tech_analysis || '').slice(0, 220) || null,
    };
};

export const findIndustryPeers = async (currentSymbol, currentIndustry, currentCapStr) => {
    if (!currentIndustry) return null;
    try {
        const Stock = (await import('../../models/Stock.js')).default;
        const peers = await Stock.find({ 'cafeF.profile.Data.Nganh': currentIndustry }, { symbol: 1, companyName: 1, 'cafeF.finance': 1 }).lean();
        
        if (!peers || peers.length < 2) return null;
        
        const parseCap = (financeArray) => {
            if (!Array.isArray(financeArray)) return 0;
            const capItem = financeArray.find(item => item.Code === 'VonHoaThiTruong');
            if (!capItem?.Value) return 0;
            return parseFloat(capItem.Value.replace(/,/g, '')) || 0;
        };
        
        const currentCap = parseFloat(currentCapStr?.replace(/,/g, '')) || 0;
        
        const parsedPeers = peers.map(p => ({
            symbol: p.symbol,
            name: p.companyName || p.symbol,
            cap: parseCap(p.cafeF?.finance)
        })).filter(p => p.cap > 0 && p.symbol !== currentSymbol);
        
        if (parsedPeers.length === 0) return null;
        
        parsedPeers.sort((a, b) => b.cap - a.cap);
        const top3 = parsedPeers.slice(0, 3);
        
        const similarPeers = [...parsedPeers]
            .filter(p => !top3.some(t => t.symbol === p.symbol))
            .sort((a, b) => Math.abs(a.cap - currentCap) - Math.abs(b.cap - currentCap))
            .slice(0, 3);
            
        let peerContext = `Doanh nghiệp cùng ngành (${currentIndustry}):\n`;
        if (top3.length > 0) {
            peerContext += `- Top vốn hóa: ${top3.map(p => `${p.symbol} (${Math.round(p.cap)} Tỷ)`).join(', ')}\n`;
        }
        if (similarPeers.length > 0) {
            peerContext += `- Cùng quy mô: ${similarPeers.map(p => `${p.symbol} (${Math.round(p.cap)} Tỷ)`).join(', ')}\n`;
        }
        return peerContext.trim();
    } catch (error) {
        console.error(`[findIndustryPeers] Lỗi:`, error.message);
        return null;
    }
};

/**
 * Deterministic action from technicals + news + macro + insight Home + AI cache DB.
 * Trọng số: tech 40% · tin 20% · vĩ mô 10% · insight Home 20% · AI đã lưu 10%.
 */
export const buildDeterministicView = ({
    asset,
    techDirection,
    techScore,
    adx,
    newsSentiment,
    macroBias = 'neutral',
    levels,
    insightPick = null,
    cachedAi = null,
}) => {
    const score = Number(techScore) || 0;
    const newsBias = newsSentiment?.bias || 'neutral';
    const newsScore = Number(newsSentiment?.score) || 0;
    const dir = String(techDirection || 'NEUTRAL').toUpperCase();
    const sideways = Number(adx) > 0 && Number(adx) < 18;
    const reasons = [];
    const weights = [];

    // Tech component −1..+1
    let techW = 0;
    const techBull = dir === 'LONG' || dir.includes('LONG') || dir === 'MUA';
    const techBear = dir === 'SHORT' || dir.includes('SHORT') || dir === 'BÁN';
    if (sideways) {
        techW = 0;
        reasons.push(`ADX ${Number(adx).toFixed(0)} — sideway`);
    } else if (techBull) {
        techW = score >= 70 ? 1 : score >= 55 ? 0.6 : 0.25;
        reasons.push(`Tech ${dir} score ${score}`);
    } else if (techBear) {
        techW = score >= 70 ? -1 : score >= 55 ? -0.6 : -0.25;
        reasons.push(`Tech ${dir} score ${score}`);
    } else {
        reasons.push(score < 55 ? `Score thấp (${score})` : 'Tech trung lập');
    }
    weights.push(`Tech ${(techW * 40).toFixed(0)}`);

    // News −1..+1
    let newsW = 0;
    if (newsBias === 'positive') newsW = Math.min(1, 0.35 + Math.abs(newsScore) * 0.2);
    else if (newsBias === 'negative') newsW = -Math.min(1, 0.35 + Math.abs(newsScore) * 0.2);
    if (newsW !== 0) reasons.push(`Tin ${newsBias} (${newsScore >= 0 ? '+' : ''}${newsScore})`);
    weights.push(`Tin ${(newsW * 20).toFixed(0)}`);

    // Macro −1..+1
    let macroW = 0;
    if (macroBias === 'bullish') macroW = 0.6;
    else if (macroBias === 'bearish') macroW = -0.6;
    if (macroW !== 0) reasons.push(`Vĩ mô ${macroBias}`);
    weights.push(`Macro ${(macroW * 10).toFixed(0)}`);

    // Insight Home (topPicks) −1..+1 — trọng số cao vì không có AI live
    let insightW = 0;
    if (insightPick?.action) {
        const ia = String(insightPick.action).toUpperCase();
        const iscore = Number(insightPick.score);
        const boost = Number.isFinite(iscore) ? Math.min(1, Math.max(0.4, iscore / 100)) : 0.7;
        if (ia.includes('MUA')) {
            insightW = boost;
            reasons.push(`Insight Home: MUA${Number.isFinite(iscore) ? ` (${iscore})` : ''}`);
        } else if (ia.includes('TRÁNH')) {
            insightW = -boost;
            reasons.push(`Insight Home: TRÁNH${Number.isFinite(iscore) ? ` (${iscore})` : ''}`);
        } else if (ia.includes('THEO')) {
            insightW = 0.15;
            reasons.push('Insight Home: THEO DÕI');
        }
        if (insightPick.horizon) reasons.push(`Horizon insight: ${insightPick.horizon}`);
    } else {
        reasons.push('Insight Home: không có mã này');
    }
    weights.push(`Insight ${(insightW * 20).toFixed(0)}`);

    // Cached AI report DB −1..+1
    let aiW = 0;
    if (cachedAi?.action) {
        const aa = String(cachedAi.action).toUpperCase();
        if (aa.includes('MUA') || aa.includes('LONG') || aa.includes('BUY')) {
            aiW = 0.8;
            reasons.push(`AI DB: ${cachedAi.action}`);
        } else if (aa.includes('BÁN') || aa.includes('SHORT') || aa.includes('SELL') || aa.includes('TRÁNH')) {
            aiW = -0.8;
            reasons.push(`AI DB: ${cachedAi.action}`);
        } else if (aa.includes('ĐỨNG') || aa.includes('WAIT') || aa.includes('QUAN')) {
            aiW = 0;
            reasons.push(`AI DB: ${cachedAi.action}`);
        }
    }
    weights.push(`AI-DB ${(aiW * 10).toFixed(0)}`);

    // Composite −1..+1
    const composite =
        techW * 0.40
        + newsW * 0.20
        + macroW * 0.10
        + insightW * 0.20
        + aiW * 0.10;

    let action = asset === 'CRYPTO' ? 'WAIT' : 'ĐỨNG NGOÀI';
    if (composite >= 0.35) {
        action = asset === 'CRYPTO' ? 'CANH LONG' : 'MUA';
    } else if (composite <= -0.35) {
        action = asset === 'CRYPTO' ? 'CANH SHORT' : 'BÁN / GIẢM TỶ TRỌNG';
    } else if (composite >= 0.15) {
        action = asset === 'CRYPTO' ? 'QUAN SÁT LONG' : 'THEO DÕI (thiên mua)';
    } else if (composite <= -0.15) {
        action = asset === 'CRYPTO' ? 'QUAN SÁT SHORT' : 'THEO DÕI (thiên bán)';
    }

    // Conflict guard: insight TRÁNH mạnh + tech mua yếu → đứng ngoài
    if (insightW <= -0.6 && techW > 0 && techW < 0.8 && composite < 0.45) {
        action = asset === 'CRYPTO' ? 'WAIT' : 'ĐỨNG NGOÀI';
        reasons.push('Insight TRÁNH ưu tiên — hạ khuyến nghị');
    }
    // Insight MUA mạnh có thể kéo nhẹ lên theo dõi nếu đang đứng ngoài
    if (insightW >= 0.6 && composite > -0.1 && composite < 0.35 && action.includes('ĐỨNG')) {
        action = 'THEO DÕI (thiên mua)';
        reasons.push('Insight MUA — nâng lên theo dõi');
    }

    let shortHorizon = '1–5 phiên / vài ngày';
    let longHorizon = 'Quan sát 4–12 tuần';
    if (Math.abs(composite) < 0.15 || sideways) {
        shortHorizon = 'Chờ xác nhận thêm (không ưu tiên vào lệnh)';
        longHorizon = 'Theo dõi tích lũy / phân hóa';
    } else if (Math.abs(composite) >= 0.5) {
        shortHorizon = insightPick?.horizon === 'DÀI HẠN'
            ? 'Ưu tiên khung trung–dài (theo insight)'
            : 'Ngắn hạn: 2–7 ngày (ATR/TP1)';
        longHorizon = insightPick?.horizon === 'NGẮN HẠN'
            ? 'Không giữ dài nếu thesis ngắn hạn'
            : '1–3 tháng nếu xu hướng/insight giữ';
    }

    return {
        action,
        shortHorizon,
        longHorizon,
        reason: reasons.join('; '),
        weightSummary: `Trọng số ≈ ${weights.join(' · ')} → tổng ${(composite * 100).toFixed(0)}`,
        composite: Math.round(composite * 100) / 100,
        entry: levels?.entry ?? null,
        sl: levels?.sl ?? null,
        tp1: levels?.tp1 ?? null,
        tp2: levels?.tp2 ?? null,
    };
};

const isUsefulDisplayName = (name, symbol) => {
    const s = String(name || '').trim();
    if (!s) return false;
    if (s.toUpperCase() === String(symbol || '').toUpperCase()) return false;
    if (s === 'N/A' || s === 'n/a' || s === '---') return false;
    return true;
};

/** Cache map symbol → company title từ CafeF company.json (TTL 6h). */
let _cafefCompanyMap = null;
let _cafefCompanyMapAt = 0;
const CAFEF_COMPANY_TTL_MS = 6 * 60 * 60 * 1000;

const loadCafefCompanyMap = async () => {
    if (_cafefCompanyMap && Date.now() - _cafefCompanyMapAt < CAFEF_COMPANY_TTL_MS) {
        return _cafefCompanyMap;
    }
    try {
        const res = await axios.get('https://cafefnew.mediacdn.vn/Search/company.json', { timeout: 10000 });
        const map = new Map();
        if (Array.isArray(res.data)) {
            for (const item of res.data) {
                const sym = String(item.Symbol || item.a || '').toUpperCase();
                const title = String(item.Title || item.Description || item.b || '').trim();
                if (sym && title) map.set(sym, title);
            }
        }
        _cafefCompanyMap = map;
        _cafefCompanyMapAt = Date.now();
        return map;
    } catch (err) {
        console.log(chalk.gray(`[INFO] CafeF company.json: ${err.message}`));
        return _cafefCompanyMap || new Map();
    }
};

const resolveVnCompanyName = async (symbol, stockDoc, cafef) => {
    const candidates = [
        stockDoc?.companyName,
        stockDoc?.name,
        cafef?.companyName,
    ];
    for (const c of candidates) {
        if (isUsefulDisplayName(c, symbol)) return String(c).trim();
    }
    const map = await loadCafefCompanyMap();
    const fromJson = map.get(String(symbol).toUpperCase());
    if (isUsefulDisplayName(fromJson, symbol)) {
        // Persist nhẹ để lần sau đọc DB
        Stock.updateOne(
            { symbol },
            { $set: { companyName: fromJson, lastUpdated: new Date() } },
            { upsert: true }
        ).catch(() => {});
        return fromJson;
    }
    return null;
};

const findInsightPick = (symbol, insight) => {
    const picks = Array.isArray(insight?.topPicks) ? insight.topPicks : [];
    const sym = String(symbol || '').toUpperCase();
    return picks.find((p) => String(p.symbol || '').toUpperCase() === sym) || null;
};

const macroBiasFromVn = (snapshot) => {
    const status = String(snapshot?.statusType || snapshot?.marketStatus || '').toLowerCase();
    const breadth = Number(snapshot?.breadthRatio);
    if (status.includes('bear') || status.includes('giảm') || status.includes('suy')) return 'bearish';
    if (status.includes('bull') || status.includes('tăng') || status.includes('hưng')) return 'bullish';
    if (Number.isFinite(breadth)) {
        if (breadth >= 60) return 'bullish';
        if (breadth <= 40) return 'bearish';
    }
    return 'neutral';
};

const getVnSymbolInfo = async (symbol) => {
    // Dynamic import avoids circular dependency with autoTradeEngine → symbolInfoService
    const { analyzeTechnicalSignal } = await import('./autoTradeEngine.js');

    const [quote, cafef, candles, newsSummary, vnCtx, stockDoc, insight] = await Promise.all([
        fetchVnQuote(symbol),
        fetchCafefData(symbol).catch(() => null),
        fetchVnAnalysisCandles(symbol).catch((err) => {
            console.log(chalk.yellow(`[INFO] Nến VN ${symbol}: ${err.message}`));
            return [];
        }),
        fetchVnMicroNews(symbol),
        getVnMarketContext().catch(() => null),
        Stock.findOne(
            { symbol },
            { companyName: 1, name: 1, reports: { $slice: -1 }, cafeF: 1 }
        ).lean().catch(() => null),
        getCachedMarketInsight().catch(() => null),
    ]);

    const cachedAi = readCachedAiVn(stockDoc);
    const insightPick = findInsightPick(symbol, insight);

    const closes = candles.map((c) => c.close);
    let techSignal = { direction: 'NEUTRAL', score: 0, atr: null, rsi: null, breakdown: {} };
    if (candles.length >= 78) {
        techSignal = analyzeTechnicalSignal(candles);
    } else if (candles.length >= 26) {
        // Không đủ cho full engine — vẫn tính RSI/MACD/ATR đơn giản để /info không trống
        const rsi = calcRsiSimple(closes);
        const macdLine = calcMacdLine(closes);
        const atrRough = candles.length >= 15
            ? candles.slice(-15).reduce((sum, c, i, arr) => {
                if (i === 0) return sum;
                const tr = Math.max(
                    c.high - c.low,
                    Math.abs(c.high - arr[i - 1].close),
                    Math.abs(c.low - arr[i - 1].close)
                );
                return sum + tr;
            }, 0) / 14
            : quote.price * 0.02;
        const emaBias = closes.length >= 50
            ? (closes[closes.length - 1] > closes.slice(-50).reduce((a, b) => a + b, 0) / 50 ? 'LONG' : 'SHORT')
            : 'NEUTRAL';
        let score = 50;
        if (rsi != null) {
            if (rsi > 50 && rsi < 70) score += 15;
            else if (rsi >= 70) score -= 10;
            else if (rsi < 30) score += 10;
        }
        if (macdLine != null && macdLine > 0) score += 15;
        if (emaBias === 'LONG') score += 10;
        else if (emaBias === 'SHORT') score -= 10;
        score = Math.min(100, Math.max(0, score));
        const direction = score >= 62 ? 'LONG' : score <= 38 ? 'SHORT' : 'NEUTRAL';
        techSignal = {
            direction,
            score,
            atr: atrRough,
            rsi,
            breakdown: { macdLine, fallback: true },
        };
    }

    const macdDisplay = techSignal.breakdown?.macdLine
        ?? calcMacdLine(closes)
        ?? (techSignal.breakdown?.macdLong != null
            ? (techSignal.breakdown.macdLong >= techSignal.breakdown.macdShort ? 'bullish' : 'bearish')
            : null);
    const rsiDisplay = techSignal.rsi ?? calcRsiSimple(closes);

    // VN: never emit SHORT levels as trade plan
    const planDirection = techSignal.direction === 'SHORT' ? 'NEUTRAL' : techSignal.direction;
    // ATR đã theo VND (nến ×1000); nếu null → 2% giá live
    const atrVnd = techSignal.atr && techSignal.atr > 0 ? techSignal.atr : quote.price * 0.02;
    const levels = buildVnLevels(quote.price, atrVnd, planDirection);

    const macro = buildVnMacroSnapshot(vnCtx || {});
    const macroBias = macroBiasFromVn(macro);
    const macroHint = [
        macro.marketStatus ? `TT: ${macro.marketStatus}` : null,
        Number.isFinite(Number(macro.breadthRatio)) ? `Breadth ${macro.breadthRatio}` : null,
        macro.diagnosticDesc ? String(macro.diagnosticDesc).slice(0, 120) : null,
    ].filter(Boolean).join(' | ') || null;

    const view = buildDeterministicView({
        asset: 'VN_STOCK',
        techDirection: techSignal.direction,
        techScore: techSignal.score,
        adx: techSignal.breakdown?.adx ?? techSignal.adx?.adx,
        newsSentiment: newsSummary,
        macroBias,
        levels,
        insightPick,
        cachedAi,
    });

    const overviewArr = cafef?.overview;
    const overview = Array.isArray(overviewArr)
        ? overviewArr.filter(Boolean).slice(0, 3).join(' · ')
        : (cafef?.overview || null);

    const companyName = await resolveVnCompanyName(symbol, stockDoc, cafef);
    const industry = cafef?.profileData?.industry || null;
    const peersContext = await findIndustryPeers(symbol, industry, cafef?.mktCap);

    return {
        asset: 'VN_STOCK',
        symbol,
        name: companyName || symbol,
        industry,
        fundamentals: {
            pe: cafef?.pe || '---',
            mktCap: cafef?.mktCap || '---',
            exchange: cafef?.exchange || 'VNX',
            overview: overview ? String(overview).slice(0, 500) : null,
            shareholders: cafef?.shareholdersContext || null,
            peers: peersContext,
        },
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        volume: quote.volume,
        priceAt: quote.priceAt || quote.fetchedAt,
        fetchedAt: quote.fetchedAt,
        priceSource: quote.source,
        technicals: {
            rsi: rsiDisplay,
            macd: macdDisplay,
            trend: techSignal.direction,
            score: techSignal.score,
            direction: techSignal.direction,
            adx: techSignal.breakdown?.adx ?? techSignal.adx?.adx ?? null,
            riskMetrics: calcRiskMetrics(closes),
            atr: atrVnd,
        },
        levels,
        news: {
            micro: newsSummary.items.slice(0, 5),
            macroHint,
            sentiment: {
                score: newsSummary.score,
                bias: newsSummary.bias,
                counts: newsSummary.counts,
            },
        },
        insightPick,
        insightDate: insight?.date || null,
        view,
        cachedAi,
    };
};

const getCryptoSymbolInfo = async (symbol) => {
    const [candles, newsSummary, derivatives, cryptoMacro, coinDoc] = await Promise.all([
        fetchKlines(symbol, '4h'),
        fetchCryptoMicroNews(symbol),
        fetchCryptoDerivatives(symbol),
        getCryptoMacroContext().catch(() => null),
        CryptoCoin.findOne({ symbol }).lean().catch(() => null),
    ]);

    if (!candles?.length) throw new Error(`Không lấy được dữ liệu giá crypto cho ${symbol}`);

    const ticker = await fetchTicker24h(symbol, candles);
    const tech = calcTechnicals(candles);
    const price = ticker?.lastPrice ?? candles[candles.length - 1].close;
    const changePercent = Number(ticker?.priceChangePercent) || 0;

    const levels = tech
        ? {
            entry: roundPrice(price, 'CRYPTO'),
            sl: tech.sl,
            tp1: tech.tp1,
            tp2: tech.tp2,
        }
        : { entry: roundPrice(price, 'CRYPTO'), sl: null, tp1: null, tp2: null };

    let macroBias = 'neutral';
    const fg = Number(cryptoMacro?.fearGreed);
    if (Number.isFinite(fg)) {
        if (fg <= 35) macroBias = 'bearish';
        else if (fg >= 65) macroBias = 'bullish';
    }
    const funding = derivatives?.fundingRate != null ? Number(derivatives.fundingRate) : null;
    if (funding != null) {
        if (funding > 0.05) macroBias = macroBias === 'bullish' ? 'bullish' : 'neutral';
        if (funding < -0.02) macroBias = 'bearish';
    }

    const macroHint = [
        cryptoMacro?.fearGreedLabel || cryptoMacro?.fearGreed != null
            ? `F&G: ${cryptoMacro.fearGreed ?? ''} ${cryptoMacro.fearGreedLabel || ''}`.trim()
            : null,
        derivatives?.fundingRate != null ? `Funding ${derivatives.fundingRate}%` : null,
        derivatives?.longPercent != null
            ? `L/S ${derivatives.longPercent}/${derivatives.shortPercent}`
            : null,
    ].filter(Boolean).join(' | ') || null;

    const techDirection = tech?.action?.includes('LONG')
        ? 'LONG'
        : tech?.action?.includes('SHORT')
            ? 'SHORT'
            : 'NEUTRAL';

    const cachedAi = readCachedAiCrypto(coinDoc);
    const now = new Date();
    const cryptoName = isUsefulDisplayName(coinDoc?.name, symbol)
        ? String(coinDoc.name).trim()
        : null;

    const view = buildDeterministicView({
        asset: 'CRYPTO',
        techDirection,
        techScore: tech?.score ?? 0,
        adx: null,
        newsSentiment: newsSummary,
        macroBias,
        levels,
        insightPick: null,
        cachedAi,
    });

    return {
        asset: 'CRYPTO',
        symbol,
        name: cryptoName || symbol,
        industry: 'Crypto',
        fundamentals: {
            pe: '---',
            mktCap: coinDoc?.marketCap ? String(coinDoc.marketCap) : '---',
            exchange: 'CRYPTO',
            overview: null,
        },
        price,
        change: null,
        changePercent,
        volume: ticker?.quoteVolume ?? null,
        priceAt: now,
        fetchedAt: now,
        priceSource: 'EXCHANGE_TICKER',
        technicals: {
            rsi: tech?.rsi ?? null,
            macd: tech?.macdLine ?? null,
            trend: tech?.trend ?? null,
            score: tech?.score ?? 0,
            direction: techDirection,
            adx: null,
            atr: tech?.atr ?? null,
            action: tech?.action ?? null,
        },
        levels,
        news: {
            micro: newsSummary.items.slice(0, 5),
            macroHint,
            sentiment: {
                score: newsSummary.score,
                bias: newsSummary.bias,
                counts: newsSummary.counts,
            },
        },
        insightPick: null,
        insightDate: null,
        view,
        cachedAi,
    };
};

/**
 * Main entry for Telegram /info
 */
export const getSymbolInfo = async (rawSymbol) => {
    const { symbol, asset } = await resolveAssetType(rawSymbol);
    console.log(chalk.cyan(`[INFO] /info ${symbol} → ${asset}`));
    if (asset === 'CRYPTO') return getCryptoSymbolInfo(symbol);
    return getVnSymbolInfo(symbol);
};
