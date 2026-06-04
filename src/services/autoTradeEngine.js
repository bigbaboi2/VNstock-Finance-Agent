import chalk from 'chalk';
import AutoTrade from '../../models/AutoTrade.js';
import UserOrder from '../../models/UserOrder.js';
import AiBehavior from '../../models/AiBehavior.js';
import Setting from '../../models/Setting.js';
import Stock from '../../models/Stock.js';
import DerivNews from '../../models/DerivNews.js';
import { generateWithRole } from './multiProviderRouter.js';
import {
    buildVnStockScanUniverse,
    buildCryptoScanUniverse,
    getCryptoTradeContext,
    getDerivativesTradeContext,
    getVnMarketContext,
} from './tradeContextService.js';
import {
    buildAutoTradeCloseMessage,
    buildAutoTradeOpenMessage,
    buildMarketRadarMessage,
    buildVolatilityAlertMessage,
    buildDailyPnLReportMessage,
    sendTelegramMessage,
} from './telegramService.js';
import axios from 'axios';

// ============================================================
// CONSTANTS & HELPERS
// ============================================================

const ENTRADE_BASE = 'https://services.entrade.com.vn/chart-api/v2/ohlcs';
const MIN_DIRECTIONAL_EDGE = 20;
const ENTRY_SCORE_THRESHOLD = 70;
const REVERSAL_EXIT_THRESHOLD = 60;
const AI_OVERRIDE_SCORE_THRESHOLD = 82;
let autoTradePipelineRunning = false;
const volatilityAlertCooldown = new Map();

/** 
 * Kiểm tra giờ giao dịch VN (T2-T6, 9:00–14:45)
 * Đảm bảo sử dụng múi giờ Asia/Ho_Chi_Minh
 */
const isVNMarketOpen = () => {
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"}));
    const day = now.getDay();
    if (day === 0 || day === 6) return false;
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= 540 && mins <= 885;
};

/** Kiểm tra trước giờ mở cửa (8:30–8:59) để quét lên lịch lệnh */
const isPreMarket = () => {
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"}));
    const day = now.getDay();
    if (day === 0 || day === 6) return false;
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= 510 && mins < 540;
};

/** Kiểm tra ATO (9:00–9:15) — tránh vào lệnh khi giá chưa ổn định */
const isATOPeriod = () => {
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"}));
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= 540 && mins <= 555;
};

/** Kiểm tra ATC (14:30–14:45) — tránh vào lệnh cuối phiên */
const isATCPeriod = () => {
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"}));
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= 870 && mins <= 885;
};

// --- LẤY TỶ GIÁ USD/VND TỰ ĐỘNG ---
let cachedUsdVndRate = 25400;  
let lastUsdVndFetch = 0;

const getUsdVndRate = async () => {
    const now = Date.now();
    if (now - lastUsdVndFetch < 60 * 60 * 1000) return cachedUsdVndRate;  

    try {
        const vcbRes = await axios.get(
            'https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=10',
            { timeout: 4000, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        const match = vcbRes.data.match(/<Exrate CurrencyCode="USD"[^>]*Transfer="([^"]+)"/);
        if (match && match[1]) {
            const rate = parseFloat(match[1].replace(/,/g, ''));
            if (rate > 20000 && rate < 30000) {
                cachedUsdVndRate = rate;
                lastUsdVndFetch = now;
                console.log(chalk.gray(`[SYSTEM] Đã cập nhật tỷ giá USD/VND Vietcombank: ${rate.toLocaleString('vi-VN')}`));
            }
        }
    } catch (error) {
        console.log(chalk.yellow(`[CẢNH BÁO] Lỗi lấy tỷ giá VCB, dùng giá cũ: ${cachedUsdVndRate}`));
    }
    return cachedUsdVndRate;
};

// ============================================================
// REAL-TIME PRICE FETCHING
// ============================================================
const fetchOHLCV = async (symbol, resolution = '1D', days = 30, assetType = 'VN_STOCK') => {
    const to = Math.floor(Date.now() / 1000);
    const from = to - (days * 24 * 60 * 60);

    let type = 'stock';
    if (assetType === 'DERIVATIVES') {
        type = 'derivative';
    } else if (['VNINDEX', 'VN30', 'HNX'].includes(symbol)) {
        type = 'index';
    }

    const url = `${ENTRADE_BASE}/${type}?from=${from}&to=${to}&symbol=${symbol}&resolution=${resolution}`;

    const res = await axios.get(url, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!res?.data?.t || res.data.t.length < 2) {
        throw new Error(`Không lấy được OHLCV cho ${symbol}`);
    }

    return res.data.t.map((ts, i) => ({
        time:   ts,
        open:   Number(res.data.o[i]),
        high:   Number(res.data.h[i]),
        low:    Number(res.data.l[i]),
        close:  Number(res.data.c[i]),
        volume: Number(res.data.v[i]) || 0,
    }));
};

/**
 * Fetch giá realtime hiện tại (lấy close của nến 1D hoặc 15m gần nhất)
 */
const fetchCurrentPrice = async (symbol, assetType = 'VN_STOCK') => {
    if (assetType === 'CRYPTO') {
        const res = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, {
            timeout: 8000
        });
        return parseFloat(res.data.price);
    }

    const candles = await fetchOHLCV(symbol, '15', 2, assetType);
    return candles[candles.length - 1].close;
};

const fetchCryptoOHLCV = async (symbol, interval = '15m', limit = 120) => {
    const res = await axios.get(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
        { timeout: 10000 }
    );

    return res.data.map(k => ({
        time:   k[0] / 1000,
        open:   parseFloat(k[1]),
        high:   parseFloat(k[2]),
        low:    parseFloat(k[3]),
        close:  parseFloat(k[4]),
        volume: parseFloat(k[5]),
    }));
};

const fetchRealtimeQuote = async (symbol, assetType) => {
    const price = await fetchCurrentPrice(symbol, assetType);
    if (!Number.isFinite(price) || price <= 0) {
        throw new Error(`Gia realtime khong hop le cho ${symbol}`);
    }

    return {
        price,
        source: assetType === 'CRYPTO' ? 'BINANCE_TICKER' : 'ENTRADE_15M_CLOSE',
        fetchedAt: new Date(),
    };
};

const fetchAnalysisCandles = async (symbol, asset) => {
    if (asset === 'CRYPTO') return fetchCryptoOHLCV(symbol, '15m', 160);

    try {
        const days = asset === 'DERIVATIVES' ? 5 : 15;
        const intraday = await fetchOHLCV(symbol, '15', days, asset);
        if (intraday.length >= 60) return intraday;
    } catch (err) {
        console.log(chalk.yellow(`  [DATA] Khong du nen intraday cho ${symbol}, fallback 1D: ${err.message}`));
    }

    const fallbackDays = asset === 'DERIVATIVES' ? 30 : 90;
    return fetchOHLCV(symbol, '1D', fallbackDays, asset);
};

const classifyNewsSentiment = (text = '') => {
    const lower = String(text).toLowerCase();
    const positiveWords = [
        'tăng', 'vượt', 'lãi', 'lợi nhuận', 'kỷ lục', 'bứt phá', 'mua ròng',
        'positive', 'surge', 'rally', 'gain', 'record', 'profit', 'inflow', 'bull',
    ];
    const negativeWords = [
        'giảm', 'lỗ', 'bán tháo', 'bán ròng', 'điều tra', 'nợ xấu', 'rủi ro',
        'negative', 'drop', 'fall', 'selloff', 'lawsuit', 'hack', 'outflow', 'bear',
    ];
    const positive = positiveWords.some(w => lower.includes(w));
    const negative = negativeWords.some(w => lower.includes(w));
    if (positive && !negative) return 'positive';
    if (negative && !positive) return 'negative';
    return 'neutral';
};

const summarizeNewsItems = (items = []) => {
    const cleanItems = items
        .filter(n => n?.title)
        .slice(0, 8)
        .map(n => ({
            title: String(n.title).trim(),
            sentiment: n.sentiment || classifyNewsSentiment(n.title),
            source: n.source || 'N/A',
            publishedAt: n.publishedAt || n.timestamp || n.date || null,
        }));

    const counts = cleanItems.reduce((acc, n) => {
        acc[n.sentiment] = (acc[n.sentiment] || 0) + 1;
        return acc;
    }, { positive: 0, negative: 0, neutral: 0 });
    const sentimentScore = Math.max(-3, Math.min(3, counts.positive - counts.negative));
    const bias = sentimentScore > 0 ? 'positive' : sentimentScore < 0 ? 'negative' : 'neutral';
    const topTitle = cleanItems[0]?.title || '';
    const summary = cleanItems.length
        ? `${bias.toUpperCase()} | +${counts.positive}/-${counts.negative}/=${counts.neutral} | ${topTitle}`
        : 'Không có tin tức mới đủ tin cậy.';

    return {
        items: cleanItems,
        counts,
        sentimentScore,
        bias,
        topTitle,
        summary,
    };
};

const fetchCryptoNewsContext = async (symbol) => {
    const baseSymbol = String(symbol).replace(/USDT$/i, '');
    const items = [];

    try {
        const rssRes = await axios.get(
            `https://news.google.com/rss/search?q=${encodeURIComponent(`${baseSymbol} crypto`)}&hl=en-US&gl=US&ceid=US:en`,
            { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        const matches = [...String(rssRes.data || '').matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8);
        for (const m of matches) {
            const raw = m[1];
            const title = raw.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
                || raw.match(/<title>(.*?)<\/title>/)?.[1]
                || '';
            if (title) items.push({ title, source: 'Google News', sentiment: classifyNewsSentiment(title) });
        }
    } catch (err) {
        console.log(chalk.gray(`[NEWS] Không lấy được crypto news cho ${symbol}: ${err.message}`));
    }

    return summarizeNewsItems(items);
};

const getNewsContextForAsset = async (asset, symbol) => {
    try {
        if (asset === 'VN_STOCK') {
            const stock = await Stock.findOne({ symbol }, { deepNewsData: { $slice: -10 } }).lean();
            return summarizeNewsItems((stock?.deepNewsData || []).slice().reverse());
        }

        if (asset === 'DERIVATIVES') {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const news = await DerivNews.find({ timestamp: { $gte: thirtyDaysAgo } })
                .sort({ timestamp: -1 })
                .limit(10)
                .lean();
            return summarizeNewsItems(news);
        }

        if (asset === 'CRYPTO') return fetchCryptoNewsContext(symbol);
    } catch (err) {
        console.log(chalk.gray(`[NEWS] Không lấy được news context cho ${asset}/${symbol}: ${err.message}`));
    }

    return summarizeNewsItems([]);
};

// ============================================================
// TECHNICAL INDICATORS (tự tính, không phụ thuộc thư viện ngoài)
// ============================================================

/** EMA (Exponential Moving Average) */
const calcEMA = (closes, period) => {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
};

/** ATR (Average True Range) — đo biến động thực để tính SL/TP */
const calcATR = (candles, period = 14) => {
    if (candles.length < period + 1) return null;
    const trs = candles.slice(1).map((c, i) => {
        const prev = candles[i];
        return Math.max(
            c.high - c.low,
            Math.abs(c.high - prev.close),
            Math.abs(c.low  - prev.close)
        );
    });
    const recent = trs.slice(-period);
    return recent.reduce((a, b) => a + b, 0) / period;
};

/** RSI */
const calcRSI = (closes, period = 14) => {
    if (closes.length < period + 1) return 50;
    
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;
        
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
};

/** MACD — tính đúng chuẩn: EMA12 từ SMA(12 nến đầu), EMA26 từ SMA(26 nến đầu) */
const calcMACD = (closes) => {
    if (closes.length < 35) return { macd: null, signal: null, hist: null };

    const k12 = 2 / 13;
    const k26 = 2 / 27;
    const k9  = 2 / 10;

    let ema12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
    for (let i = 12; i < 26; i++) {
        ema12 = closes[i] * k12 + ema12 * (1 - k12);
    }

    let ema26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;

    const macdLine = [];
    for (let i = 26; i < closes.length; i++) {
        ema12 = closes[i] * k12 + ema12 * (1 - k12);
        ema26 = closes[i] * k26 + ema26 * (1 - k26);
        macdLine.push(ema12 - ema26);
    }

    if (macdLine.length < 9) return { macd: null, signal: null, hist: null };

    let signal = macdLine.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
    for (let i = 9; i < macdLine.length; i++) {
        signal = macdLine[i] * k9 + signal * (1 - k9);
    }

    const macd = macdLine[macdLine.length - 1];
    return { macd, signal, hist: macd - signal };
};

const calcVolumeSurge = (volumes) => {
    if (volumes.length < 5) return 1;
    const baseline = volumes.slice(-21, -1);
    const avg = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    if (avg === 0) return 1;
    return volumes[volumes.length - 1] / avg;
};

/** Bollinger Bands — phát hiện breakout */
const calcBollinger = (closes, period = 20, stdMult = 2) => {
    if (closes.length < period) return null;
    const slice = closes.slice(-period);
    const mean  = slice.reduce((a, b) => a + b, 0) / period;
    const std   = Math.sqrt(slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period);
    return {
        upper: mean + stdMult * std,
        mid:   mean,
        lower: mean - stdMult * std,
        bwPct: (std * 2 * stdMult / mean) * 100,
    };
};

// ============================================================
// SIGNAL SCORING ENGINE 
// ============================================================

export const analyzeTechnicalSignal = (candles, breadthRatio = 50, statusType = 'neutral') => {
    if (!candles || candles.length < 26) {
        return { direction: 'NEUTRAL', score: 0, breakdown: {}, atr: null };
    }

    const closes  = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    const currentPrice = closes[closes.length - 1];

    // ── Indicators ──
    const ema9   = calcEMA(closes, 9);
    const ema21  = calcEMA(closes, 21);
    const ema50  = calcEMA(closes, 50);
    const rsi    = calcRSI(closes);
    const atr    = calcATR(candles, 14);
    const boll   = calcBollinger(closes, 20);
    const volSurge = calcVolumeSurge(volumes);
    const { macd, signal: macdSignal, hist } = calcMACD(closes);

    // ── REGIME FILTER: thị trường đang nén/sideways → không vào lệnh ──
    if (boll && boll.bwPct < 2.5) {
        return {
            direction: 'NEUTRAL',
            score: 0,
            breakdown: { regimeFilter: 'SIDEWAYS', bwPct: boll.bwPct },
            atr: atr ? Math.round(atr * 100) / 100 : null,
        };
    }

    const latest = candles[candles.length - 1];
    const candleBias = latest.close > latest.open ? 'LONG' : latest.close < latest.open ? 'SHORT' : 'NEUTRAL';

    let trendLong = 50;
    let trendShort = 50;
    if (ema9 && ema21 && ema50) {
        if (ema9 > ema21 && ema21 > ema50) {
            trendLong = 90;
            trendShort = 15;
        } else if (ema9 < ema21 && ema21 < ema50) {
            trendLong = 15;
            trendShort = 90;
        } else if (ema9 > ema21) {
            trendLong = 65;
            trendShort = 40;
        } else {
            trendLong = 40;
            trendShort = 65;
        }
    }

    let rsiLong = 50;
    let rsiShort = 50;
    if (rsi < 25) {
        rsiLong = 78;
        rsiShort = 25;
    } else if (rsi < 35) {
        rsiLong = 68;
        rsiShort = 35;
    } else if (rsi <= 62) {
        rsiLong = 60;
        rsiShort = 45;
    } else if (rsi <= 72) {
        rsiLong = 45;
        rsiShort = 60;
    } else {
        rsiLong = 25;
        rsiShort = 78;
    }

    let macdLong = 50;
    let macdShort = 50;
    if (hist !== null) {
        if (hist > 0 && macd > macdSignal) {
            macdLong = 80;
            macdShort = 20;
        } else if (hist < 0 && macd < macdSignal) {
            macdLong = 20;
            macdShort = 80;
        }
    }

    let bollLong = 50;
    let bollShort = 50;
    if (boll && boll.upper > boll.lower) {
        const pctB = (currentPrice - boll.lower) / (boll.upper - boll.lower);
        if (currentPrice > boll.upper) {
            bollLong = 72;
            bollShort = 35;
        } else if (currentPrice < boll.lower) {
            bollLong = 35;
            bollShort = 72;
        } else if (pctB > 0.7) {
            bollLong = 62;
            bollShort = 48;
        } else if (pctB < 0.3) {
            bollLong = 48;
            bollShort = 62;
        }
    }

    let volumeConfirm = 35;
    if      (volSurge >= 2.5) volumeConfirm = 90;
    else if (volSurge >= 1.5) volumeConfirm = 72;
    else if (volSurge >= 1.0) volumeConfirm = 55;

    const isAccumulation = candleBias === 'LONG'  && volSurge >= 1.5;
    const isDistribution = candleBias === 'SHORT' && volSurge >= 1.5;

    const volumeLong  = isAccumulation ? volumeConfirm
                      : isDistribution ? Math.max(20, 100 - volumeConfirm)
                      : (candleBias === 'LONG' ? volumeConfirm : Math.max(25, 100 - volumeConfirm));
    const volumeShort = isDistribution ? volumeConfirm
                      : isAccumulation ? Math.max(20, 100 - volumeConfirm)
                      : (candleBias === 'SHORT' ? volumeConfirm : Math.max(25, 100 - volumeConfirm));

    const marketLong = Math.max(0, Math.min(100,
        breadthRatio + (statusType === 'bullish' ? 15 : statusType === 'bearish' ? -20 : statusType === 'warning' ? -10 : 0)
    ));
    const marketShort = Math.max(0, Math.min(100,
        (100 - breadthRatio) + (statusType === 'bearish' ? 15 : statusType === 'bullish' ? -20 : statusType === 'warning' ? 5 : 0)
    ));

    let trendWeight = 0.25;
    let rsiWeight = 0.14;
    let macdWeight = 0.15;
    
    if (statusType === 'bearish') {
        rsiWeight = 0.20;
        trendWeight = 0.20;
    } else if (statusType === 'bullish') {
        trendWeight = 0.30;
        rsiWeight = 0.10;
    }
    const marketWeight = 1 - trendWeight - macdWeight - rsiWeight - 0.14 - 0.15;

    const longScore =
        trendLong    * trendWeight +
        macdLong     * macdWeight +
        rsiLong      * rsiWeight +
        bollLong     * 0.14 +
        volumeLong   * 0.15 +
        marketLong   * marketWeight;

    const shortScore =
        trendShort   * trendWeight +
        macdShort    * macdWeight +
        rsiShort     * rsiWeight +
        bollShort    * 0.14 +
        volumeShort  * 0.15 +
        marketShort  * marketWeight;

    const roundedLong = Math.round(longScore);
    const roundedShort = Math.round(shortScore);
    const edge = Math.abs(roundedLong - roundedShort);

    let direction = 'NEUTRAL';
    let finalScore = Math.max(roundedLong, roundedShort);
    if (finalScore >= ENTRY_SCORE_THRESHOLD && edge >= MIN_DIRECTIONAL_EDGE) {
        direction = roundedLong > roundedShort ? 'LONG' : 'SHORT';
    }

    const breakdown = {
        longScore: roundedLong,
        shortScore: roundedShort,
        edge,
        trendLong: Math.round(trendLong),
        trendShort: Math.round(trendShort),
        rsiLong: Math.round(rsiLong),
        rsiShort: Math.round(rsiShort),
        macdLong: Math.round(macdLong),
        macdShort: Math.round(macdShort),
        bollLong: Math.round(bollLong),
        bollShort: Math.round(bollShort),
        volumeLong: Math.round(volumeLong),
        volumeShort: Math.round(volumeShort),
        marketLong: Math.round(marketLong),
        marketShort: Math.round(marketShort),
        candleBias,
    };

    return {
        direction,
        score: finalScore,
        breakdown,
        atr: atr ? Math.round(atr * 100) / 100 : null,
        entryPrice: currentPrice,
        rsi: Math.round(rsi * 10) / 10,
        ema9, ema21, ema50,
        bollinger: boll,
        volumeSurge: Math.round(volSurge * 100) / 100,
    };
};

// ============================================================
// FEASIBILITY CHECK
// ============================================================

export const verifyOrderFeasibility = (assetType, targetPct) => {
    if ((assetType === 'VN_STOCK' || assetType === 'DERIVATIVES') && targetPct > 30) {
        return {
            feasible: false,
            reason: 'Kỳ vọng vượt biên độ trần sàn của thị trường cơ sở & phái sinh Việt Nam (Tối đa 30% trong ngắn hạn là bất khả thi)!'
        };
    }
    if (assetType === 'CRYPTO' && targetPct > 150) {
        return {
            feasible: false,
            reason: 'Kỳ vọng vượt giới hạn biến động động lượng cực đại 24h của Crypto (Bất khả thi)!'
        };
    }
    return { feasible: true };
};

const getTradeRewardRiskPct = (entryPrice, takeProfitPrice, stopLossPrice, direction) => {
    const isLong = direction === 'LONG' || direction === 'MUA';
    const rewardPct = isLong
        ? ((takeProfitPrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - takeProfitPrice) / entryPrice) * 100;
    const riskPct = isLong
        ? ((entryPrice - stopLossPrice) / entryPrice) * 100
        : ((stopLossPrice - entryPrice) / entryPrice) * 100;

    return {
        rewardPct: Math.round(Math.max(0, rewardPct) * 100) / 100,
        riskPct: Math.round(Math.max(0, riskPct) * 100) / 100,
    };
};

const buildTradePlanFromSignal = (asset, techSignal, quote) => {
    const entryPrice = Math.round(Number(quote.price) * 100) / 100;
    const atr = techSignal.atr || entryPrice * 0.02;
    
    const volPct = (atr / entryPrice) * 100;
    let adaptiveScale = 1.0;
    if (volPct > 5) adaptiveScale = 1.3; 
    else if (volPct < 1.5) adaptiveScale = 0.8; 
    
    let atrMultiplierTP = (asset === 'CRYPTO' ? 4.0 : (asset === 'DERIVATIVES' ? 3.0 : 2.5)) * adaptiveScale;
    let atrMultiplierSL = (asset === 'CRYPTO' ? 2.0 : (asset === 'DERIVATIVES' ? 1.5 : 1.5)) * adaptiveScale;

    // --- GIỚI HẠN RỦI RO TỐI ĐA BẢO VỆ TÀI KHOẢN ---
    const maxRiskPct = asset === 'CRYPTO' ? 0.04 : (asset === 'DERIVATIVES' ? 0.02 : 0.06);
    const riskFromAtr = (atr * atrMultiplierSL) / entryPrice;
    if (riskFromAtr > maxRiskPct) {
        atrMultiplierSL = (entryPrice * maxRiskPct) / atr;
        atrMultiplierTP = Math.max(atrMultiplierTP, atrMultiplierSL * 1.5);
    }

    const finalSlDistancePct = (atr * atrMultiplierSL) / entryPrice;
    if (finalSlDistancePct > maxRiskPct * 1.1) {
        return null;
    }

    const isLong = techSignal.direction === 'LONG' || techSignal.direction === 'MUA';

    const takeProfitPrice = isLong
        ? Math.round((entryPrice + atr * atrMultiplierTP) * 100) / 100
        : Math.round((entryPrice - atr * atrMultiplierTP) * 100) / 100;
    const stopLossPrice = isLong
        ? Math.round((entryPrice - atr * atrMultiplierSL) * 100) / 100
        : Math.round((entryPrice + atr * atrMultiplierSL) * 100) / 100;
    const directionLabel = asset === 'VN_STOCK'
        ? (techSignal.direction === 'LONG' ? 'MUA' : 'BÁN')
        : techSignal.direction;
    const { rewardPct, riskPct } = getTradeRewardRiskPct(
        entryPrice,
        takeProfitPrice,
        stopLossPrice,
        directionLabel
    );

    return {
        directionLabel,
        entryPrice,
        takeProfitPrice,
        stopLossPrice,
        rewardPct,
        riskPct,
        atr,
    };
};

const applyExecutionContextBias = (signal, asset, context = {}) => {
    if (!signal?.breakdown || signal.direction === 'NEUTRAL') return signal;

    let longBias = 0;
    let shortBias = 0;
    const reasons = [];
    const newsScore = Number(context.news?.sentimentScore);

    if (Number.isFinite(newsScore) && newsScore !== 0) {
        if (newsScore > 0) {
            longBias += Math.min(5, newsScore * 2);
            reasons.push('positive_news_flow');
        } else {
            shortBias += Math.min(5, Math.abs(newsScore) * 2);
            reasons.push('negative_news_flow');
        }
    }

    if (asset === 'CRYPTO') {
        const ratio = Number(context.orderbook?.ratio);
        const funding = Number(context.derivatives?.fundingRatePct);
        const longShortRatio = Number(context.derivatives?.longShortRatio);

        if (Number.isFinite(ratio) && ratio > 1.2) {
            longBias += 4;
            reasons.push('orderbook_bid_dominant');
        } else if (Number.isFinite(ratio) && ratio < 0.8) {
            shortBias += 4;
            reasons.push('orderbook_ask_dominant');
        }

        if (Number.isFinite(funding) && funding > 0.05) {
            shortBias += 2;
            reasons.push('positive_funding_crowded_long');
        } else if (Number.isFinite(funding) && funding < -0.03) {
            longBias += 2;
            reasons.push('negative_funding_short_pressure');
        }

        if (Number.isFinite(longShortRatio) && longShortRatio > 1.6) {
            shortBias += 2;
            reasons.push('long_short_ratio_overcrowded');
        } else if (Number.isFinite(longShortRatio) && longShortRatio > 0 && longShortRatio < 0.7) {
            longBias += 2;
            reasons.push('short_side_overcrowded');
        }
    }

    if (asset === 'DERIVATIVES') {
        const basis = Number(context.basis);
        const changePct = Number(context.changePct);
        const foreignNet = Number(context.foreignNet);
        const oiTrend = context.oiTrend;

        if (Number.isFinite(basis) && basis > 1.5) {
            longBias += 2;
            reasons.push('positive_basis');
        } else if (Number.isFinite(basis) && basis < -1.5) {
            shortBias += 2;
            reasons.push('negative_basis');
        }

        if (oiTrend === 'UP' && Number.isFinite(changePct) && changePct > 0) {
            longBias += 3;
            reasons.push('oi_up_price_up');
        } else if (oiTrend === 'UP' && Number.isFinite(changePct) && changePct < 0) {
            shortBias += 3;
            reasons.push('oi_up_price_down');
        }

        if (Number.isFinite(foreignNet) && foreignNet > 0) {
            longBias += 2;
            reasons.push('foreign_net_buy');
        } else if (Number.isFinite(foreignNet) && foreignNet < 0) {
            shortBias += 2;
            reasons.push('foreign_net_sell');
        }
    }

    if (longBias === 0 && shortBias === 0) return signal;

    const longScore = Math.max(0, Math.min(100, (signal.breakdown.longScore || 0) + longBias));
    const shortScore = Math.max(0, Math.min(100, (signal.breakdown.shortScore || 0) + shortBias));
    const edge = Math.abs(longScore - shortScore);
    const score = Math.max(longScore, shortScore);
    const direction = score >= ENTRY_SCORE_THRESHOLD && edge >= MIN_DIRECTIONAL_EDGE
        ? longScore > shortScore ? 'LONG' : 'SHORT'
        : 'NEUTRAL';

    return {
        ...signal,
        direction,
        score,
        breakdown: {
            ...signal.breakdown,
            longScore,
            shortScore,
            edge,
            contextLongBias: longBias,
            contextShortBias: shortBias,
            contextBiasReasons: reasons,
        },
    };
};

const getExecutionContextForAsset = async (asset, symbol) => {
    try {
        if (asset === 'CRYPTO') return await getCryptoTradeContext(symbol);
        if (asset === 'DERIVATIVES') return await getDerivativesTradeContext();
        if (asset === 'VN_STOCK') return { source: 'VN_MARKET_CONTEXT', ...(await getVnMarketContext()) };
    } catch (err) {
        console.log(chalk.gray(`[CONTEXT] Không lấy được context bổ sung cho ${asset}/${symbol}: ${err.message}`));
    }
    return {};
};

const isUserOrderCompatibleWithTrade = (userOrder, tradePlan) => {
    const { rewardPct, riskPct } = getTradeRewardRiskPct(
        tradePlan.entryPrice,
        tradePlan.takeProfitPrice,
        tradePlan.stopLossPrice,
        tradePlan.direction
    );

    if (rewardPct < Number(userOrder.targetPct) * 0.8) {
        return {
            compatible: false,
            reason: `TP thực tế ${rewardPct}% quá thấp so với mục tiêu user ${userOrder.targetPct}%.`,
        };
    }

    if (Number.isFinite(Number(userOrder.stopLossPct)) && riskPct > Number(userOrder.stopLossPct) * 1.5) {
        return {
            compatible: false,
            reason: `Risk thực tế ${riskPct}% vượt quá xa stop loss user ${userOrder.stopLossPct}%.`,
        };
    }

    return { compatible: true, rewardPct, riskPct };
};

// ============================================================
// AI SIGNAL CONFIRMATION (dùng AI để xác nhận tín hiệu kỹ thuật)
// ============================================================

const compactContextForPrompt = (context = {}) => {
    if (!context || Object.keys(context).length === 0) return 'Không có context bổ sung.';
    const newsLine = context.news
        ? `\nNews sentiment: ${context.news.bias || 'neutral'} | score ${context.news.sentimentScore ?? 0} | ${context.news.topTitle || 'Không có headline nổi bật'}`
        : '';

    if (context.orderbook || context.derivatives) {
        return [
            `Nguồn: ${context.source || 'N/A'}`,
            `24h change: ${Number(context.change24h || 0).toFixed(2)}%`,
            `Orderbook bid/ask: ${context.orderbook?.bidPct ?? 'N/A'}%/${context.orderbook?.askPct ?? 'N/A'}% | ratio ${context.orderbook?.ratio ?? 'N/A'} | spread ${context.orderbook?.spread ?? 'N/A'}`,
            `Funding: ${Number(context.derivatives?.fundingRatePct || 0).toFixed(4)}% | OI: ${context.derivatives?.openInterest || 'N/A'} | Long/Short: ${context.derivatives?.longShortRatio || 'N/A'}`,
        ].join('\n') + newsLine;
    }

    if (context.vn30f1m || context.basis !== undefined) {
        return [
            `Nguồn: ${context.source || 'N/A'}`,
            `VN30F1M: ${context.vn30f1m || 'N/A'} | VN30: ${context.vn30 || 'N/A'} | Basis: ${context.basis ?? 'N/A'}`,
            `Change: ${context.changePct ?? 'N/A'}% | Volume: ${context.volume || 'N/A'} | OI: ${context.oi || 'N/A'} (${context.oiTrend || 'N/A'}) | Foreign net: ${context.foreignNet || 'N/A'}`,
        ].join('\n') + newsLine;
    }

    return `Nguồn: ${context.source || 'N/A'} | fetchedAt: ${context.fetchedAt || 'N/A'}${newsLine}`;
};

const getAISignalConfirmation = async (asset, signal, marketStatus, diagnosticDesc, executionContext = {}) => {
    try {
        let lessonContext = 'Không có lịch sử giao dịch trước đó cho mã này.';
        try {
            const recentLessons = await AiBehavior.find({ symbol: signal.symbol, assetType: asset })
                .sort({ createdAt: -1 })
                .limit(3)
                .lean();
            if (recentLessons.length > 0) {
                lessonContext = recentLessons
                    .map((l, i) => `[${i + 1}] PnL: ${l.actualPnl >= 0 ? '+' : ''}${l.actualPnl}% | ${l.lesson}`)
                    .join('\n');
            }
        } catch (_) {}

        const prompt = `Bạn là chuyên gia phân tích kỹ thuật của hệ thống OMNI DUCK.
Dưới đây là kết quả phân tích kỹ thuật định lượng cho lệnh sắp vào:

[THÔNG TIN TÍN HIỆU]
- Phân khúc: ${asset}
- Mã: ${signal.symbol}
- Giá hiện tại: ${signal.entryPrice}
- Hướng đề xuất: ${signal.direction}
- Điểm tổng hợp: ${signal.score}/100
- RSI: ${signal.rsi}
- Volume Surge: ${signal.volumeSurge}x
- EMA9/21/50: ${signal.ema9?.toFixed(2) || 'N/A'} / ${signal.ema21?.toFixed(2) || 'N/A'} / ${signal.ema50?.toFixed(2) || 'N/A'}
- ATR: ${signal.atr}

Hãy đánh giá KHÁCH QUAN. Nếu có rủi ro tiềm ẩn, điểm yếu kỹ thuật, hoặc bối cảnh thị trường bất lợi — hãy BÁC BỎ.
[TRẠNG THÁI VĨ MÔ]
- Tình trạng thị trường: ${marketStatus}
- Chẩn đoán: ${diagnosticDesc}

[CONTEXT BỔ SUNG TỪ TAB/SERVICE LIÊN QUAN]
${compactContextForPrompt(executionContext)}

[CHI TIẾT ĐIỂM]
- Long Score: ${signal.breakdown.longScore}/100
- Short Score: ${signal.breakdown.shortScore}/100
- Directional Edge: ${signal.breakdown.edge}
- Trend Long/Short: ${signal.breakdown.trendLong}/${signal.breakdown.trendShort}
- RSI Long/Short: ${signal.breakdown.rsiLong}/${signal.breakdown.rsiShort}
- Bollinger Long/Short: ${signal.breakdown.bollLong}/${signal.breakdown.bollShort}
- Volume Long/Short: ${signal.breakdown.volumeLong}/${signal.breakdown.volumeShort}
- Market Long/Short: ${signal.breakdown.marketLong}/${signal.breakdown.marketShort}

[LỊCH SỬ GIAO DỊCH GẦN NHẤT (${signal.symbol})]
${lessonContext}

Hãy phân tích xác nhận hoặc bác bỏ tín hiệu này trong 2-3 câu ngắn gọn, rõ ràng bằng tiếng Việt. Kết thúc bằng: "XÁC NHẬN" hoặc "BÁC BỎ".`;

        const response = await generateWithRole('derivatives', prompt, {
            maxTokens: 300,
            temperature: 0.3
        });

        const confirmed = response.toUpperCase().includes('XÁC NHẬN');
        return { confirmed, reason: response.trim() };

    } catch (err) {
        console.log(chalk.yellow(`[AI CONFIRM] Không gọi được AI, fallback theo score kỹ thuật: ${err.message}`));
        return {
            confirmed: signal.score >= 70,
            reason: 'AI không phản hồi — xác nhận tự động theo ngưỡng kỹ thuật.'
        };
    }
};

// ============================================================
// REALTIME EXIT CHECK — kiểm tra SL/TP đã hit chưa
// ============================================================

const checkExitConditions = async (trade, marketContext = {}) => {
    try {
        const currentPrice = await fetchCurrentPrice(trade.symbol, trade.assetType);

        const isLong  = trade.direction === 'LONG' || trade.direction === 'MUA';
        const isShort = trade.direction === 'SHORT' || trade.direction === 'BÁN';

        let shouldClose = false;
        let exitReason  = '';
        let trailingUpdated = false;

        if (isLong) {
            const reward = trade.takeProfitPrice - trade.entryPrice;
            if (reward > 0) {
                const activationPrice = trade.entryPrice + reward * 0.4;
                if (currentPrice >= activationPrice) {
                    let newSL = trade.entryPrice + reward * 0.05; 
                    if (currentPrice >= trade.entryPrice + reward * 0.7) {
                        newSL = trade.entryPrice + reward * 0.4;
                    }
                    if (newSL > trade.stopLossPrice) {
                        trade.stopLossPrice = Math.round(newSL * 100) / 100;
                        trailingUpdated = true;
                    }
                }
            }

            if (currentPrice >= trade.takeProfitPrice) {
                shouldClose = true;
                exitReason  = `TP HIT: Giá ${currentPrice} chạm mục tiêu ${trade.takeProfitPrice}`;
            } else if (currentPrice <= trade.stopLossPrice) {
                shouldClose = true;
                exitReason  = `SL HIT: Giá ${currentPrice} phá đáy cắt lỗ ${trade.stopLossPrice}`;
            }
        } else if (isShort) {
            const reward = trade.entryPrice - trade.takeProfitPrice;
            if (reward > 0) {
                const activationPrice = trade.entryPrice - reward * 0.4; 
                if (currentPrice <= activationPrice) {
                    let newSL = trade.entryPrice - reward * 0.05;
                    if (currentPrice <= trade.entryPrice - reward * 0.7) {
                        newSL = trade.entryPrice - reward * 0.4;
                    }
                    if (newSL < trade.stopLossPrice) {
                        trade.stopLossPrice = Math.round(newSL * 100) / 100;
                        trailingUpdated = true;
                    }
                }
            }

            if (currentPrice <= trade.takeProfitPrice) {
                shouldClose = true;
                exitReason  = `TP HIT (SHORT): Giá ${currentPrice} rơi đến mục tiêu ${trade.takeProfitPrice}`;
            } else if (currentPrice >= trade.stopLossPrice) {
                shouldClose = true;
                exitReason  = `SL HIT (SHORT): Giá ${currentPrice} bật lên phá cắt lỗ ${trade.stopLossPrice}`;
            }
        }

        const maxHoldMs = trade.assetType === 'CRYPTO' ? 8 * 3600_000 : 2 * 24 * 3600_000;
        const holdMs    = Date.now() - new Date(trade.openedAt).getTime();
        if (!shouldClose && holdMs > maxHoldMs) {
            shouldClose = true;
            exitReason  = `Timeout: Lệnh quá thời hạn giữ tối đa (${Math.round(holdMs / 3600000)}h). Đóng để quản lý rủi ro.`;
        }

        const minHoldForSignalExitMs = trade.assetType === 'CRYPTO' ? 30 * 60_000 : 60 * 60_000;
        if (!shouldClose && holdMs > minHoldForSignalExitMs) {
            try {
                const candles = await fetchAnalysisCandles(trade.symbol, trade.assetType);
                const signal = analyzeTechnicalSignal(
                    candles,
                    marketContext.breadthRatio ?? 50,
                    marketContext.statusType ?? 'neutral'
                );
                const reverseDirection = isLong ? 'SHORT' : 'LONG';

                if (signal.direction === reverseDirection && signal.score >= REVERSAL_EXIT_THRESHOLD) {
                    shouldClose = true;
                    exitReason = `Đảo chiều kỹ thuật: ${reverseDirection} score ${signal.score}/100 (edge ${signal.breakdown.edge}).`;
                }
            } catch (signalErr) {
                console.log(chalk.gray(`[EXIT SIGNAL] Không đủ dữ liệu đảo chiều cho ${trade.symbol}: ${signalErr.message}`));
            }
        }

        return { shouldClose, currentPrice, exitReason, trailingUpdated };
    } catch (err) {
        console.log(chalk.yellow(`[EXIT CHECK] Không fetch được giá realtime cho ${trade.symbol}: ${err.message}`));
        return { shouldClose: false, currentPrice: null, exitReason: '', trailingUpdated: false };
    }
};

// ============================================================
// CORE ENGINE LOOP
// ============================================================

const checkVolatilityAndAlert = async (symbol, asset, candles) => {
    if (!candles || candles.length < 5) return;
    const now = Date.now();
    const cooldownKey = `${asset}_${symbol}`;
    
    if (volatilityAlertCooldown.has(cooldownKey) && now < volatilityAlertCooldown.get(cooldownKey)) {
        return; 
    }

    const currentCandle = candles[candles.length - 1];
    const oldCandle = candles[candles.length - 5];
    const priceDiff = currentCandle.close - oldCandle.close;
    const pctDiff = (priceDiff / oldCandle.close) * 100;
    const absPct = Math.abs(pctDiff);

    let isAnomalous = false;
    let note = '';

    if (asset === 'CRYPTO' && absPct >= 2.5) {
        isAnomalous = true; note = `Biến động giật mạnh vượt ngưỡng 2.5% của khung 1H.`;
    } else if (asset === 'DERIVATIVES' && Math.abs(priceDiff) >= 7) {
        isAnomalous = true; note = `Thị trường phái sinh giật mạnh ${Math.abs(priceDiff).toFixed(1)} điểm.`;
    } else if (asset === 'VN_STOCK' && absPct >= 3.5) {
        isAnomalous = true; note = `Cổ phiếu có dấu hiệu kéo/xả bất thường (biến động > 3.5%).`;
    }

    if (isAnomalous) {
        const msg = buildVolatilityAlertMessage(asset, symbol, currentCandle.close, pctDiff, '1 giờ (4 nến 15m)', note);
        await sendTelegramMessage(msg).catch(() => {});
        console.log(chalk.magenta.bold(`[VOLATILITY] Đã cảnh báo Telegram biến động mạnh cho ${symbol} (${pctDiff.toFixed(2)}%)`));
        volatilityAlertCooldown.set(cooldownKey, now + 2 * 60 * 60 * 1000);
    }
};

export const runAutoTradePipeline = async (forcedAssetType = null) => {
    if (forcedAssetType === 'ALL') forcedAssetType = null;
    if (autoTradePipelineRunning) {
        console.log(chalk.gray(`[AUTODUCK] Bỏ qua chu kỳ ${forcedAssetType || 'ALL'}: pipeline trước vẫn đang chạy.`));
        return { skipped: true, reason: 'pipeline_running' };
    }

    autoTradePipelineRunning = true;
    console.log(chalk.bgMagenta.black(`\n[AUTODUCK ENGINE v2] Khởi chạy chu kỳ rà soát thị trường thực tế...`));

    try {
        // ── 1. Thu thập dữ liệu thị trường vĩ mô từ QuantEngine ──
        let breadthRatio   = 50;
        let marketStatus   = 'ĐI NGANG TÍCH LŨY';
        let statusType     = 'neutral';
        let diagnosticDesc = 'Chưa có dữ liệu vĩ mô.';
        let topGainersFromMarket = [];
        let topLosersFromMarket  = [];
        let topVolumeFromMarket  = [];
        let strongSectorsFromMarket = [];
        let vnMarketContext = null;
        const radarCandidates = {
            CRYPTO: [],
            VN_STOCK: [],
            DERIVATIVES: [],
        };

        try {
            vnMarketContext = await getVnMarketContext();
            const intel = vnMarketContext?.intelligence;
            if (intel) {
                breadthRatio            = parseFloat(intel.breadthRatio) || 50;
                marketStatus            = intel.marketStatus;
                statusType              = intel.statusType;
                diagnosticDesc          = intel.diagnosticDesc;
                topGainersFromMarket    = intel.topGainers || [];
                topLosersFromMarket     = intel.topLosers || [];
                topVolumeFromMarket     = intel.topVolume || [];
                strongSectorsFromMarket = intel.strongSectors || [];
            }
        } catch (macroErr) {
            console.log(chalk.yellow(`[AUTODUCK] Lấy dữ liệu vĩ mô lỗi, tiếp tục với breadth mặc định: ${macroErr.message}`));
        }

        console.log(chalk.gray(`[AUTODUCK] Macro: ${marketStatus} | Breadth: ${breadthRatio.toFixed(1)}% | Type: ${statusType}`));

        // ── 2. Xác định phân khúc tài sản cần quét ──
        const targetAssets = [];
        if (forcedAssetType) {
            targetAssets.push(forcedAssetType);
        } else {
            targetAssets.push('CRYPTO'); 
            
            // Quét cả trong phiên, ATO/ATC và Pre-Market. Sẽ cấp cờ PENDING nếu chưa vào phiên chuẩn
            if (isVNMarketOpen() || isPreMarket() || isATOPeriod() || isATCPeriod()) {
                targetAssets.push('VN_STOCK');
                targetAssets.push('DERIVATIVES');
            }
        }

        const isOutOfStandardHours = !isVNMarketOpen() || isATOPeriod() || isATCPeriod();

        // ── Lấy cấu hình vốn để kiểm soát giải ngân ──
        let totalCapitalSetting = await Setting.findOne({ key: 'autoTradeTotalCapital' });
        if (!totalCapitalSetting) {
            totalCapitalSetting = new Setting({ key: 'autoTradeTotalCapital', value: 5_000_000_000 });
            await totalCapitalSetting.save();
        }
        const TOTAL_CAPITAL = Number(totalCapitalSetting.value) || 5_000_000_000;
        
        // ── Đếm lệnh bằng DB query trực tiếp (atomic, tránh race condition) ──
        const MAX_CONCURRENT_TRADES = 5;
        const openTradesList = await AutoTrade.find({ status: { $in: ['OPEN', 'PENDING'] } });
        let currentAllocatedCapital = openTradesList.reduce((sum, t) => sum + (Number(t.investedAmount) || 0), 0);
        let currentOpenCount = openTradesList.length;

        // ── 3. Quét từng phân khúc ──
        for (const asset of targetAssets) {
            console.log(chalk.cyan(`\n[AUTODUCK] ═══ Quét phân khúc: ${asset} ═══`));

            const stats = { scanned: 0, skipScore: 0, skipLimit: 0, skipRisk: 0, aiRejected: 0, matched: 0 };
            let symbolsToScan = [];

            if (asset === 'VN_STOCK') {
                const baseUniverse = await buildVnStockScanUniverse(vnMarketContext, 15);
                const recentStocks = await Stock.find({ 'reports.0': { $exists: true } })
                    .sort({ 'reports.timestamp': -1 })
                    .limit(10).select('symbol').lean();
                const recentSymbols = recentStocks.map(s => s.symbol);
                symbolsToScan = [...new Set([...baseUniverse, ...recentSymbols])];
                console.log(chalk.gray(
                    `[AUTODUCK] VN universe ${symbolsToScan.length} mã | Gainers: ${topGainersFromMarket.slice(0, 5).map(s => s.symbol).join(', ') || 'N/A'} | Volume: ${topVolumeFromMarket.slice(0, 5).map(s => s.symbol).join(', ') || 'N/A'} | Sector: ${strongSectorsFromMarket.map(s => s.name).join(', ') || 'N/A'}`
                ));

            } else if (asset === 'DERIVATIVES') {
                symbolsToScan = ['VN30F1M'];

            } else if (asset === 'CRYPTO') {
                const baseUniverse = await buildCryptoScanUniverse(50);
                symbolsToScan = baseUniverse;
            }

            // ── 4. Phân tích từng symbol ──
            for (const symbol of symbolsToScan) {
                try {
                    stats.scanned++;

                    let candles;
                    try {
                        candles = await fetchAnalysisCandles(symbol, asset);
                    } catch (fetchErr) {
                        continue;
                    }

                    await checkVolatilityAndAlert(symbol, asset, candles);

                    const [baseExecutionContext, newsContext] = await Promise.all([
                        getExecutionContextForAsset(asset, symbol),
                        getNewsContextForAsset(asset, symbol),
                    ]);
                    const executionContext = {
                        ...baseExecutionContext,
                        news: newsContext,
                    };
                    let techSignal = analyzeTechnicalSignal(candles, breadthRatio, statusType);
                    techSignal = applyExecutionContextBias(techSignal, asset, executionContext);
                    techSignal.symbol = symbol;

                    if (techSignal.direction === 'NEUTRAL' || techSignal.score < ENTRY_SCORE_THRESHOLD) {
                        stats.skipScore++;
                        continue;
                    }

                    if (currentOpenCount >= MAX_CONCURRENT_TRADES) {
                        stats.skipLimit++;
                        continue;
                    }

                    if (asset === 'VN_STOCK' && techSignal.direction === 'SHORT') {
                        stats.skipScore++;
                        continue;
                    }

                    const quote = await fetchRealtimeQuote(symbol, asset);
                    const tradePlan = buildTradePlanFromSignal(asset, techSignal, quote);

                    if (!tradePlan) {
                        stats.skipRisk++;
                        continue;
                    }

                    const existingOpen = await AutoTrade.findOne({ 
                        symbol, 
                        assetType: asset, 
                        status: { $in: ['OPEN', 'PENDING'] } 
                    });
                    if (existingOpen) {
                        continue;
                    }

                    if (techSignal.volumeSurge < 1.5) {
                        stats.skipScore++;
                        continue;
                    }

                    // ── 5. AI xác nhận tín hiệu ──
                    const aiConfirm = await getAISignalConfirmation(asset, techSignal, marketStatus, diagnosticDesc, executionContext);
                    console.log(chalk.blue(`  [AI CONFIRM] ${aiConfirm.confirmed ? '✅ XÁC NHẬN' : '❌ BÁC BỎ'} — ${aiConfirm.reason}`));

                    radarCandidates[asset].push({
                        symbol,
                        assetType: asset,
                        direction: tradePlan.directionLabel,
                        score: techSignal.score,
                        entryPrice: tradePlan.entryPrice,
                        takeProfitPrice: tradePlan.takeProfitPrice,
                        stopLossPrice: tradePlan.stopLossPrice,
                        rewardPct: tradePlan.rewardPct,
                        riskPct: tradePlan.riskPct,
                        aiConfirmed: aiConfirm.confirmed,
                        reason: aiConfirm.reason,
                        news: newsContext,
                        breakdown: techSignal.breakdown,
                    });

                    if (!aiConfirm.confirmed && techSignal.score < AI_OVERRIDE_SCORE_THRESHOLD) {
                        stats.aiRejected++;
                        continue;
                    }

                    // ── 6. Tính SL/TP động theo ATR ──
                    const {
                        directionLabel,
                        entryPrice,
                        takeProfitPrice,
                        stopLossPrice,
                    } = tradePlan;

                    // ── AI PHÂN BỔ VỐN THÔNG MINH (Tổng quỹ 5 TỶ VNĐ) ──
                    let availableCapital = TOTAL_CAPITAL - currentAllocatedCapital;
                    if (availableCapital <= 0) {
                        stats.skipLimit++;
                        continue;
                    }

                    let allocationPct = 0.05;
                    if (techSignal.score >= 85) allocationPct = 0.20;
                    else if (techSignal.score >= 78) allocationPct = 0.15;
                    else if (techSignal.score >= 74) allocationPct = 0.10;

                    let idealInvestedAmount = TOTAL_CAPITAL * allocationPct;
                    
                    let maxVolumeByRisk = Infinity;
                    const riskUnit = Math.abs(entryPrice - stopLossPrice);
                    const currentUsdRate = await getUsdVndRate();
                    if (riskUnit > 0) {
                        const riskAmountUSD = asset === 'CRYPTO' ? (TOTAL_CAPITAL * 0.02) / currentUsdRate : 0;
                        const riskAmountVND = TOTAL_CAPITAL * 0.02;
                        maxVolumeByRisk = asset === 'CRYPTO' ? riskAmountUSD / riskUnit : riskAmountVND / riskUnit;
                    }

                    let investedAmount = Math.min(idealInvestedAmount, availableCapital);
                    let volume = 0;

                    if (asset === 'CRYPTO') {
                        const investedUSD = investedAmount / currentUsdRate;
                        volume = Math.min(parseFloat((investedUSD / entryPrice).toFixed(4)), maxVolumeByRisk);
                        if (investedUSD < 10) {
                            stats.skipRisk++;
                            continue;
                        }
                    } else if (asset === 'DERIVATIVES') {
                        volume = Math.max(0, Math.floor(Math.min(investedAmount / 25_000_000, maxVolumeByRisk)));
                        if (volume < 1) {
                            stats.skipRisk++;
                            continue;
                        }
                    } else {
                        volume = Math.floor(Math.min(investedAmount / entryPrice, maxVolumeByRisk));
                        volume = Math.floor(volume / 100) * 100;
                        if (volume < 100) {
                            stats.skipRisk++;
                            continue;
                        }
                    }

                    investedAmount = asset === 'CRYPTO' ? volume * entryPrice * currentUsdRate : volume * entryPrice;
                    
                    currentAllocatedCapital += investedAmount;
                    currentOpenCount++;

                    const tradeStatus = (isOutOfStandardHours && asset !== 'CRYPTO') ? 'PENDING' : 'OPEN';

                    // ── ATOMIC COUNT CHECK: đếm lại từ DB ngay trước khi lưu, tránh race condition ──
                    const liveOpenCount = await AutoTrade.countDocuments({ status: { $in: ['OPEN', 'PENDING'] } });
                    if (liveOpenCount >= MAX_CONCURRENT_TRADES) {
                        stats.skipLimit++;
                        continue;
                    }

                    // ── 7. Lưu lệnh vào DB ──
                    const newTrade = new AutoTrade({
                        symbol,
                        assetType: asset,
                        direction: directionLabel,
                        entryPrice,
                        takeProfitPrice,
                        stopLossPrice,
                        investedAmount,
                        volume,
                        aiScore: techSignal.score,
                        confidence: techSignal.score,
                        reason: aiConfirm.reason,
                        aiReportSnapshot: `priceSource=${quote.source}; contextSource=${executionContext.source || 'N/A'}; fetchedAt=${quote.fetchedAt.toISOString()}; longScore=${techSignal.breakdown.longScore}; shortScore=${techSignal.breakdown.shortScore}; edge=${techSignal.breakdown.edge}; news=${newsContext.summary}`,
                        status: tradeStatus,
                        marketCondition: marketStatus,
                        signalBreakdown: techSignal.breakdown,
                        executionMeta: {
                            priceSource: quote.source,
                            fetchedAt: quote.fetchedAt,
                            contextSource: executionContext.source || null,
                        },
                    });
                    await newTrade.save();

                    const telegramOpenMessage = buildAutoTradeOpenMessage(
                        newTrade,
                        aiConfirm,
                        quote,
                        executionContext,
                        tradePlan
                    );
                    await sendTelegramMessage(telegramOpenMessage).catch(() => {});

                    console.log(chalk.green.bold(
                        `  [LỆNH ${tradeStatus}] ${directionLabel} ${symbol} @ ${entryPrice} | Vốn: ${(investedAmount/1e6).toFixed(1)}Tr | Score: ${techSignal.score}`
                    ));
                    stats.matched++;

                    // ── 8. Khớp user orders đang PENDING ──
                    const pendingUserOrders = await UserOrder.find({
                        status: 'PENDING',
                        $or: [{ assetType: 'ALL' }, { assetType: asset }]
                    });

                    for (const userOrder of pendingUserOrders) {
                        const validation = verifyOrderFeasibility(asset, userOrder.targetPct);
                        if (!validation.feasible) {
                            userOrder.status = 'REJECTED';
                            userOrder.result.message = validation.reason;
                            await userOrder.save();
                            continue;
                        }

                        const compatibility = isUserOrderCompatibleWithTrade(userOrder, {
                            entryPrice,
                            takeProfitPrice,
                            stopLossPrice,
                            direction: directionLabel,
                        });
                        if (!compatibility.compatible) {
                            userOrder.result.message = `Đang chờ lệnh phù hợp hơn: ${compatibility.reason}`;
                            await userOrder.save();
                            continue;
                        }

                        userOrder.assignedTrade = newTrade._id;
                        userOrder.status        = 'MATCHED';
                        userOrder.result.message = `[${directionLabel}] Đã khớp vào ${symbol} @ ${entryPrice}. TP: ${takeProfitPrice} | SL: ${stopLossPrice}. Reward/Risk: +${compatibility.rewardPct}%/-${compatibility.riskPct}%.`;
                        await userOrder.save();
                        console.log(chalk.bgGreen.black(`  [AUTO-MATCH] User ${userOrder.username} → lệnh ${newTrade._id}`));
                    }

                } catch (symbolErr) {
                    console.log(chalk.yellow(`  [ERROR] Lỗi xử lý ${symbol}: ${symbolErr.message}`));
                    continue;
                }
            }
            
            if (stats.scanned > 0) {
                console.log(chalk.gray(`  └─ Tổng kết: Quét ${stats.scanned} mã | Bỏ qua (Điểm yếu: ${stats.skipScore}, Rủi ro/Vốn: ${stats.skipRisk + stats.skipLimit}, AI hủy: ${stats.aiRejected}) | Đã vào: ${stats.matched} lệnh.`));
            }
        }

        for (const asset of Object.keys(radarCandidates)) {
            radarCandidates[asset].sort((a, b) => {
                if (Number(b.aiConfirmed) !== Number(a.aiConfirmed)) {
                    return Number(b.aiConfirmed) - Number(a.aiConfirmed);
                }
                return (b.score || 0) - (a.score || 0);
            });
        }

        const hasRadarCandidates = Object.values(radarCandidates).some(items => items.length > 0);
        const shouldSendEmptyRadar = Boolean(forcedAssetType);
        if (hasRadarCandidates || shouldSendEmptyRadar) {
            await sendTelegramMessage(buildMarketRadarMessage(radarCandidates, {
                generatedAt: new Date(),
                marketStatus,
            })).catch(() => {});
        }

        // ── Kích hoạt Lệnh Chờ khi vào Phiên Chuẩn ──
        if (!isOutOfStandardHours) {
            const pendingTrades = await AutoTrade.find({ status: 'PENDING', assetType: { $ne: 'CRYPTO' } });
            for (const pt of pendingTrades) {
                pt.status = 'OPEN';
                await pt.save();
                console.log(chalk.bgGreen.white(`[AUTODUCK] 🟢 Lệnh chờ ${pt.symbol} đã ACTIVE do thị trường mở cửa.`));
            }
        }

        // ── 9. Vòng đóng lệnh theo SL/TP realtime ──
        await runExitAndLearningPipeline(marketStatus, { breadthRatio, statusType });

    } catch (err) {
        console.error(chalk.red(`[AUTODUCK CRITICAL ERROR] ${err.message}`));
    } finally {
        autoTradePipelineRunning = false;
    }
};

// ============================================================
// EXIT + AI LEARNING PIPELINE
// ============================================================

async function runExitAndLearningPipeline(currentMarketStatus, marketContext = {}) {
    const openTrades = await AutoTrade.find({ status: { $in: ['OPEN', 'PENDING'] } });
    if (openTrades.length === 0) return;

    console.log(chalk.gray(`\n[EXIT PIPELINE] Kiểm tra ${openTrades.length} lệnh đang mở/chờ...`));

    for (const trade of openTrades) {
        try {
            const { shouldClose, currentPrice, exitReason, trailingUpdated } = await checkExitConditions(trade, marketContext);

            if (trailingUpdated && !shouldClose) {
                await trade.save();
                console.log(chalk.cyan(`  [TRAIL] ${trade.symbol} dời SL tự động đến ${trade.stopLossPrice}`));
            }

            if (!shouldClose) {
                continue;
            }

            const isLong = trade.direction === 'LONG' || trade.direction === 'MUA';
            const priceDiff = isLong
                ? (currentPrice - trade.entryPrice)
                : (trade.entryPrice - currentPrice);

            if (!Number.isFinite(currentPrice) || !Number.isFinite(trade.entryPrice) || trade.entryPrice === 0 || !Number.isFinite(trade.volume)) {
                console.log(chalk.red(`  [LỖI PNL] Không thể tính PnL cho ${trade.symbol} (${trade._id}). Giá hiện tại: ${currentPrice}, Giá vào: ${trade.entryPrice}, Khối lượng: ${trade.volume}. Đặt PnL về 0.`));
                trade.exitPrice = currentPrice;
                trade.status = 'CLOSED';
                trade.closedAt = new Date();
                trade.pnlPercent = 0;
                trade.pnl = 0;
                await trade.save();
                continue;
            }

            trade.exitPrice  = currentPrice;
            trade.status     = 'CLOSED';
            trade.closedAt   = new Date();
            trade.pnlPercent = Math.round((priceDiff / trade.entryPrice) * 100 * 100) / 100;
            
            const currentUsdRate = await getUsdVndRate();
            let rawPnlValue = trade.volume * priceDiff;
            if (trade.assetType === 'CRYPTO') rawPnlValue *= currentUsdRate;
            trade.pnl       = Math.round(rawPnlValue);
            
            await trade.save();

            await sendTelegramMessage(buildAutoTradeCloseMessage(trade, exitReason)).catch(() => {});

            const pnlLabel = trade.pnlPercent >= 0 ? chalk.green(`+${trade.pnlPercent}%`) : chalk.red(`${trade.pnlPercent}%`);
            console.log(chalk.bgYellow.black(
                `[ĐÓNG LỆNH] ${trade.symbol} @ ${currentPrice} | PnL: ` + pnlLabel + ` | ${exitReason}`
            ));

            const boundUserOrders = await UserOrder.find({ assignedTrade: trade._id, status: 'MATCHED' });
            for (const uOrder of boundUserOrders) {
                uOrder.status          = 'COMPLETED';
                uOrder.result.finalPnl = Math.round(uOrder.capital * (trade.pnlPercent / 100));
                uOrder.result.message  = `Vị thế đã đóng. PnL thực tế: ${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent}%. Lý do: ${exitReason}`;
                await uOrder.save();
            }

            try {
                const reflectivePrompt = `Bạn là Giám đốc Nghiên cứu AI của hệ thống OMNI DUCK.
Phân tích giao dịch vừa kết thúc và rút ra bài học kinh nghiệm ngắn gọn (tối đa 3 câu).

[DỮ LIỆU GIAO DỊCH]
- Asset: ${trade.assetType} | Mã: ${trade.symbol} | Hướng: ${trade.direction}
- Giá vào: ${trade.entryPrice} → Giá ra: ${trade.exitPrice}
- TP đặt: ${trade.takeProfitPrice} | SL đặt: ${trade.stopLossPrice}
- AI Score: ${trade.aiScore}/100 | PnL thực: ${trade.pnlPercent}%
- Lý do đóng: ${exitReason}
- Trạng thái thị trường: ${currentMarketStatus}
- Breakdown tín hiệu: ${JSON.stringify(trade.signalBreakdown || {})}

Bài học kinh nghiệm (tiếng Việt, 2-3 câu thực chiến):`;

                const lessonText = await generateWithRole('pm', reflectivePrompt, { maxTokens: 500, temperature: 0.4 });

                const behaviorLog = new AiBehavior({
                    symbol:         trade.symbol,
                    assetType:      trade.assetType,
                    action:         trade.direction,
                    predictedScore: trade.aiScore,
                    actualPnl:      trade.pnlPercent,
                    marketCondition: currentMarketStatus,
                    lesson:         lessonText.trim(),
                    tags:           trade.pnlPercent > 0 ? ['WIN_SIGNAL', 'TP_HIT'] : ['LOSS_SIGNAL', 'SL_HIT'],
                });
                await behaviorLog.save();
                console.log(chalk.blueBright(`  [AI LEARN] ${lessonText.trim()}`));

            } catch (aiErr) {
                console.log(chalk.gray(`  [AI LEARN] Không ghi được bài học: ${aiErr.message}`));
            }
        } catch (tradeErr) {
            console.log(chalk.yellow(`[EXIT PIPELINE] Lỗi xử lý lệnh ${trade.symbol}/${trade._id}: ${tradeErr.message}`));
        }
    }
}

// ============================================================
// DAILY PNL REPORT
// ============================================================
export const sendDailyPnLReport = async () => {
    try {
        const nowTs = Date.now();
        const vnDateStr = new Date().toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"});
        const vnDateObj = new Date(vnDateStr);
        
        const msSinceStartOfDayVN = vnDateObj.getHours() * 3600000 + vnDateObj.getMinutes() * 60000 + vnDateObj.getSeconds() * 1000 + vnDateObj.getMilliseconds();
        const startOfDayUTC = new Date(nowTs - msSinceStartOfDayVN);
        const endOfDayUTC = new Date(nowTs - msSinceStartOfDayVN + 86400000 - 1);

        const closedTradesToday = await AutoTrade.find({
            status: 'CLOSED',
            closedAt: { $gte: startOfDayUTC, $lte: endOfDayUTC }
        }).sort({ closedAt: -1 }).lean();

        if (closedTradesToday.length === 0) {
            console.log(chalk.gray(`[AUTODUCK] Không có lệnh đóng trong ngày, bỏ qua báo cáo PnL.`));
            return;
        }

        const message = buildDailyPnLReportMessage(closedTradesToday, vnDateObj);
        await sendTelegramMessage(message).catch(() => {});
        console.log(chalk.green(`[AUTODUCK] Đã gửi báo cáo PnL tổng kết ngày qua Telegram.`));
    } catch (error) {
        console.log(chalk.red(`[AUTODUCK] Lỗi gửi báo cáo PnL cuối ngày: ${error.message}`));
    }
};

// ============================================================
// SCHEDULER
// ============================================================

export const startAutoDuckScheduler = () => {
    console.log(chalk.bold.green('🚀 [AUTODUCK v2 SCHEDULER] Hệ thống tuần hoàn lệnh thực tế đã lên lịch.'));

    const runningPipelines = new Set();
    const runScheduledPipeline = async (label, forcedAssetType = null) => {
        if (runningPipelines.has(label)) {
            console.log(chalk.gray(`[AUTODUCK] Bỏ qua chu kỳ ${label}: pipeline trước vẫn đang chạy.`));
            return;
        }

        runningPipelines.add(label);
        try {
            await runAutoTradePipeline(forcedAssetType);
        } catch (err) {
            console.error(chalk.red(`[SCHEDULER ${label}] ${err.message}`));
        } finally {
            runningPipelines.delete(label);
        }
    };

    runScheduledPipeline('ALL');

    setInterval(async () => {
        await runScheduledPipeline('CRYPTO', 'CRYPTO');
    }, 15 * 60 * 1000);

    setInterval(async () => {
        if (isVNMarketOpen() || isPreMarket() || isATOPeriod() || isATCPeriod()) {
            await runScheduledPipeline('ALL');
        }
    }, 30 * 60 * 1000);

    let dailyReportSentForDay = -1;
    setInterval(async () => {
        const nowInVN = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"}));
        const hours = nowInVN.getHours();
        const minutes = nowInVN.getMinutes();
        const currentDayStr = nowInVN.getDate();

        if (hours === 15 && minutes >= 5 && minutes <= 15) {
            if (dailyReportSentForDay !== currentDayStr) {
                dailyReportSentForDay = currentDayStr;
                await sendDailyPnLReport();
            }
        }
    }, 5 * 60 * 1000);
};
 
export const calculateSignalScore = (aiScore, sentimentType, breadthRatio, isVolumeConfirmed) => {
    let sentimentScore = 50;
    if (sentimentType === 'positive') sentimentScore = 90;
    if (sentimentType === 'negative') sentimentScore = 15;
    const volWeight = isVolumeConfirmed ? 100 : 40;
    return Math.min(100, Math.max(0, Math.round(
        (aiScore * 0.5) + (sentimentScore * 0.2) + (breadthRatio * 0.15) + (volWeight * 0.15)
    )));
};