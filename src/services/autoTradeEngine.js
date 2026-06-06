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

// ── CONSTANTS & HELPERS

const ENTRADE_BASE = 'https://services.entrade.com.vn/chart-api/v2/ohlcs';
const REVERSAL_EXIT_THRESHOLD = 55;
const AI_OVERRIDE_SCORE_THRESHOLD = 85;
let autoTradePipelineRunning = false;
let exitPipelineRunning = false;
const volatilityAlertCooldown = new Map();

export const isVNMarketOpen = () => {
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"}));
    const day = now.getDay();
    if (day === 0 || day === 6) return false;
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= 540 && mins <= 885;
};

export const isPreMarket = () => {
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"}));
    const day = now.getDay();
    if (day === 0 || day === 6) return false;
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= 510 && mins < 540;
};

export const isATOPeriod = () => {
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"}));
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= 540 && mins <= 555;
};

export const isATCPeriod = () => {
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"}));
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= 870 && mins <= 885;
};

// --- LẤY TỶ GIÁ USD/VND TỰ ĐỘNG ---
let cachedUsdVndRate = 25400;  
let lastUsdVndFetch = 0;

export const getUsdVndRate = async () => {
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

export const getRiskConfig = (level) => {
    switch (Number(level)) {
        case 1: return {
            level: 1, name: 'THẬN TRỌNG (CAUTIOUS)',
            scoreThreshold: 72, edge: 25,
            volSurge: { VN_STOCK: 1.6, CRYPTO: 1.5, DERIVATIVES: 1.3 },
            maxRisk: { VN_STOCK: 0.04, CRYPTO: 0.03, DERIVATIVES: 0.015 },
            allocationMultiplier: 0.6, trailingActivation: 0.15,
            prompt: `CHIẾN LƯỢC (THẬN TRỌNG – LEVEL 1):
Mục tiêu ưu tiên là bảo toàn vốn. Yêu cầu ít nhất 3 trong 4 điều kiện đồng thuận: xu hướng EMA rõ, MACD dương, volume surge xác nhận, không có phân phối đỉnh rõ ràng.
Nếu score kỹ thuật >= 72 VÀ edge >= 25 VÀ không có tín hiệu phân phối rõ → XÁC NHẬN.
Nếu score >= 72 nhưng có 1 điểm yếu nhỏ về technical → vẫn có thể XÁC NHẬN nếu news/context hỗ trợ.
Chỉ BÁC BỎ khi: (1) score < 72, hoặc (2) có tín hiệu phân phối/đảo chiều rõ ràng trên nhiều chỉ báo, hoặc (3) vĩ mô bearish mạnh kết hợp volume bán ròng.`
        };
        case 2: return {
            level: 2, name: 'CÂN BẰNG (BALANCED)',
            scoreThreshold: 68, edge: 20,
            volSurge: { VN_STOCK: 1.4, CRYPTO: 1.5, DERIVATIVES: 1.1 },
            maxRisk: { VN_STOCK: 0.055, CRYPTO: 0.04, DERIVATIVES: 0.025 },
            allocationMultiplier: 1.0, trailingActivation: 0.25,
            prompt: `CHIẾN LƯỢC (CÂN BẰNG – LEVEL 2):
Mục tiêu tối ưu Risk/Reward. Đánh giá khách quan kết hợp kỹ thuật, dòng tiền và vĩ mô.
Nếu score >= 68 VÀ edge >= 20 → XÁC NHẬN, trừ khi có mâu thuẫn tín hiệu rõ ràng (ví dụ: trend tăng nhưng OBV giảm mạnh + news rất tiêu cực).
Một hoặc hai điểm yếu nhỏ về indicator phụ (ví dụ VWAP dưới nhẹ, StochRSI chưa lý tưởng) không phải lý do BÁC BỎ nếu tín hiệu chính (EMA, MACD, volume) đang ủng hộ.
BÁC BỎ khi: tín hiệu kỹ thuật chính mâu thuẫn nhau, hoặc context thị trường bearish rõ rệt.`
        };
        case 3: return {
            level: 3, name: 'CHUYÊN GIA (EXPERT)',
            scoreThreshold: 64, edge: 15,
            volSurge: { VN_STOCK: 1.1, CRYPTO: 1.3, DERIVATIVES: 0.9 },
            maxRisk: { VN_STOCK: 0.07, CRYPTO: 0.05, DERIVATIVES: 0.035 },
            allocationMultiplier: 1.3, trailingActivation: 0.35,
            prompt: `CHIẾN LƯỢC (CHUYÊN GIA – LEVEL 3):
Ưu tiên nắm bắt cơ hội, chấp nhận rủi ro có tính toán. Phân tích tập trung vào dòng tiền thông minh và momentum ngắn hạn.
Nếu score >= 64 VÀ edge >= 15 → THIÊN VỀ XÁC NHẬN. Các điểm yếu kỹ thuật phụ (VWAP, StochRSI chưa cực đoan, ADX trung bình) KHÔNG đủ để BÁC BỎ.
Có thể BỎ QUA nhược điểm kỹ thuật nhỏ nếu: dòng tiền vào rõ (OBV tăng, volume surge xác nhận) HOẶC news/macro hỗ trợ mạnh.
Chỉ BÁC BỎ khi: (1) tín hiệu đảo chiều rất rõ (engulfing ngược chiều + volume mạnh), hoặc (2) cả 3 chỉ báo chính (EMA, MACD, Ichimoku) đều chống lại hướng lệnh.`
        };
        case 4: return {
            level: 4, name: 'LIỀU LĨNH (DEGEN)',
            scoreThreshold: 60, edge: 10,
            volSurge: { VN_STOCK: 0.9, CRYPTO: 1.0, DERIVATIVES: 0.8 },
            maxRisk: { VN_STOCK: 0.10, CRYPTO: 0.08, DERIVATIVES: 0.05 },
            allocationMultiplier: 1.6, trailingActivation: 0.45,
            prompt: `CHIẾN LƯỢC (DEGEN – LEVEL 4 – HIGH RISK):
Mục tiêu tối đa hóa lợi nhuận. Score >= 60 với edge >= 10 là đủ điều kiện kỹ thuật — MẶC ĐỊNH XÁC NHẬN nếu không có lý do BÁC BỎ rõ ràng.
Rủi ro là chi phí của cơ hội. Chấp nhận: volume surge thấp, trend chưa hoàn toàn rõ, một vài chỉ báo phụ chưa lý tưởng.
Không BÁC BỎ vì: ADX thấp, VWAP chưa đẹp, StochRSI chưa oversold/overbought lý tưởng, news trung tính.
Chỉ BÁC BỎ khi CÓ ÍT NHẤT 2 TRONG 3: (1) Phân phối đỉnh rõ trong dài hạn (nhiều nến đỏ volume lớn tại vùng kháng cự), (2) Toàn bộ EMA+MACD+Ichimoku đều ngược chiều lệnh, (3) News cực kỳ tiêu cực có xác nhận từ nhiều nguồn.`
        };
        default: return {
            level: 2, name: 'CÂN BẰNG (BALANCED)',
            scoreThreshold: 68, edge: 20,
            volSurge: { VN_STOCK: 1.4, CRYPTO: 1.5, DERIVATIVES: 1.1 },
            maxRisk: { VN_STOCK: 0.055, CRYPTO: 0.04, DERIVATIVES: 0.025 },
            allocationMultiplier: 1.0, trailingActivation: 0.25,
            prompt: `CHIẾN LƯỢC (CÂN BẰNG – LEVEL 2):
Mục tiêu tối ưu Risk/Reward. Đánh giá khách quan kết hợp kỹ thuật, dòng tiền và vĩ mô.
Nếu score >= 68 VÀ edge >= 20 → XÁC NHẬN, trừ khi có mâu thuẫn tín hiệu rõ ràng.
Một hoặc hai điểm yếu nhỏ về indicator phụ không phải lý do BÁC BỎ nếu tín hiệu chính đang ủng hộ.
BÁC BỎ khi: tín hiệu kỹ thuật chính mâu thuẫn nhau, hoặc context thị trường bearish rõ rệt.`
        };
    }
};

// ── REAL-TIME PRICE FETCHING
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

export const fetchAnalysisCandles = async (symbol, asset, timeframe = 'daily') => {
    if (asset === 'VN_STOCK') {
        const daily = await fetchOHLCV(symbol, '1D', 60, asset);
        if (timeframe === 'intraday') {
            try {
                const intra = await fetchOHLCV(symbol, '15', 5, asset);
                if (intra.length >= 20) {
                    daily._intraday15m = intra;
                }
            } catch (_) {}
        }
        return daily;
    }

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

// ── TECHNICAL INDICATORS

const calcEMA = (closes, period) => {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
};

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

const calcOBV = (candles) => {
    if (candles.length < 3) return { obv: 0, obvTrend: 'neutral' };
    let obv = 0;
    const obvArr = [0];
    for (let i = 1; i < candles.length; i++) {
        if (candles[i].close > candles[i - 1].close) obv += candles[i].volume;
        else if (candles[i].close < candles[i - 1].close) obv -= candles[i].volume;
        obvArr.push(obv);
    }
    const recent = obvArr.slice(-5);
    const trend = recent[recent.length - 1] > recent[0] ? 'up' : recent[recent.length - 1] < recent[0] ? 'down' : 'neutral';
    return { obv, obvTrend: trend };
};

const calcVWAP = (candles, period = 20) => {
    const slice = candles.slice(-period);
    let totalVol = 0, totalTypical = 0;
    for (const c of slice) {
        const typical = (c.high + c.low + c.close) / 3;
        totalTypical += typical * c.volume;
        totalVol += c.volume;
    }
    return totalVol > 0 ? totalTypical / totalVol : null;
};

const calcVWAPIntraday = (candles, tzMode = 'UTC') => {
    if (!candles || candles.length < 2) return null;

    const offsetSec = tzMode === 'VN' ? 7 * 3600 : 0;
    const lastTime = candles[candles.length - 1].time; // unix giây
    const dayStartSec = Math.floor((lastTime + offsetSec) / 86400) * 86400 - offsetSec;

    let sessionStart = 0;
    for (let i = candles.length - 1; i >= 0; i--) {
        if (candles[i].time < dayStartSec) {
            sessionStart = i + 1;
            break;
        }
    }

    const slice = candles.slice(sessionStart);
    if (slice.length < 2) {
        // Fallback: rolling 20-candle VWAP
        return calcVWAP(candles, 20);
    }

    let totalVol = 0, totalTypical = 0;
    for (const c of slice) {
        const typical = (c.high + c.low + c.close) / 3;
        totalTypical += typical * c.volume;
        totalVol += c.volume;
    }
    return totalVol > 0 ? totalTypical / totalVol : null;
};

const calcStochasticRSI = (closes, rsiPeriod = 14, stochPeriod = 14) => {
    if (closes.length < rsiPeriod + stochPeriod + 1) return { k: 50, d: 50 };
    // Build RSI array
    const rsiArr = [];
    let gains = 0, losses = 0;
    for (let i = 1; i <= rsiPeriod; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / rsiPeriod, avgLoss = losses / rsiPeriod;
    if (avgLoss === 0) rsiArr.push(100);
    else rsiArr.push(100 - (100 / (1 + avgGain / avgLoss)));
    for (let i = rsiPeriod + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        avgGain = (avgGain * (rsiPeriod - 1) + Math.max(diff, 0)) / rsiPeriod;
        avgLoss = (avgLoss * (rsiPeriod - 1) + Math.max(-diff, 0)) / rsiPeriod;
        rsiArr.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
    }
    const rsiSlice = rsiArr.slice(-stochPeriod);
    const rsiMin = Math.min(...rsiSlice), rsiMax = Math.max(...rsiSlice);
    const k = rsiMax === rsiMin ? 50 : ((rsiArr[rsiArr.length - 1] - rsiMin) / (rsiMax - rsiMin)) * 100;
    const d = rsiArr.length >= stochPeriod + 2
        ? (rsiArr.slice(-(stochPeriod + 2), -stochPeriod).reduce((a, b) => a + b, 0) / 2 + k) / 2
        : k;
    return { k: Math.round(k * 10) / 10, d: Math.round(d * 10) / 10 };
};

const calcADX = (candles, period = 14) => {
    if (candles.length < period * 2 + 1) return { adx: 20, pdi: 25, mdi: 25 };
    const trs = [], pms = [], mms = [];
    for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high, l = candles[i].low;
        const ph = candles[i - 1].high, pl = candles[i - 1].low, pc = candles[i - 1].close;
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
        pms.push(h - ph > pl - l && h - ph > 0 ? h - ph : 0);
        mms.push(pl - l > h - ph && pl - l > 0 ? pl - l : 0);
    }

    let runTR = trs.slice(0, period).reduce((a, b) => a + b, 0);
    let runPM = pms.slice(0, period).reduce((a, b) => a + b, 0);
    let runMM = mms.slice(0, period).reduce((a, b) => a + b, 0);

    const dxArr = [];
    for (let i = period; i < trs.length; i++) {
        runTR = runTR - runTR / period + trs[i];
        runPM = runPM - runPM / period + pms[i];
        runMM = runMM - runMM / period + mms[i];
        const p = runTR > 0 ? (runPM / runTR) * 100 : 0;
        const m = runTR > 0 ? (runMM / runTR) * 100 : 0;
        dxArr.push(p + m > 0 ? (Math.abs(p - m) / (p + m)) * 100 : 0);
    }

    // Final PDI/MDI từ vòng cuối
    const pdi14 = runTR > 0 ? (runPM / runTR) * 100 : 25;
    const mdi14 = runTR > 0 ? (runMM / runTR) * 100 : 25;

    // ADX = Wilder smooth của dxArr
    let adx = 20;
    if (dxArr.length >= period) {
        adx = dxArr.slice(0, period).reduce((a, b) => a + b, 0) / period;
        for (let i = period; i < dxArr.length; i++) {
            adx = (adx * (period - 1) + dxArr[i]) / period;
        }
    } else if (dxArr.length > 0) {
        adx = dxArr.reduce((a, b) => a + b, 0) / dxArr.length;
    }

    return {
        adx: Math.round(adx * 10) / 10,
        pdi: Math.round(pdi14 * 10) / 10,
        mdi: Math.round(mdi14 * 10) / 10,
    };
};

const detectCandlePattern = (candles) => {
    if (candles.length < 3) return { pattern: 'none', direction: 'neutral', strength: 0 };
    const c = candles[candles.length - 1];
    const p = candles[candles.length - 2];
    const pp = candles[candles.length - 3];

    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const bodyRatio = range > 0 ? body / range : 0;

    if (p.close < p.open && c.close > c.open && c.open < p.close && c.close > p.open) {
        return { pattern: 'bullish_engulfing', direction: 'LONG', strength: 3 };
    }

    if (p.close > p.open && c.close < c.open && c.open > p.close && c.close < p.open) {
        return { pattern: 'bearish_engulfing', direction: 'SHORT', strength: 3 };
    }

    const lowerWick = Math.min(c.open, c.close) - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    if (lowerWick > 2 * body && upperWick < body * 0.5 && range > 0) {
        return { pattern: 'hammer', direction: 'LONG', strength: 2 };
    }

    if (upperWick > 2 * body && lowerWick < body * 0.5 && range > 0) {
        return { pattern: 'shooting_star', direction: 'SHORT', strength: 2 };
    }

    if (pp.close > pp.open && p.close > p.open && c.close > c.open &&
        p.close > pp.close && c.close > p.close &&
        p.open > pp.open && c.open > p.open) {
        return { pattern: 'three_white_soldiers', direction: 'LONG', strength: 3 };
    }

    if (bodyRatio < 0.1 && range > 0) {
        return { pattern: 'doji', direction: 'neutral', strength: 1 };
    }

    if (c.close > c.open && bodyRatio > 0.7) {
        return { pattern: 'strong_bull_candle', direction: 'LONG', strength: 2 };
    }

    return { pattern: 'none', direction: 'neutral', strength: 0 };
};

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

const calcIchimoku = (candles, periods = { tenkan: 9, kijun: 26, senkouB: 52, chikou: 26 }) => {
    if (candles.length < periods.senkouB + periods.kijun) {
        return { tenkan: null, kijun: null, senkouA: null, senkouB: null, chikou: null, futureKumo: 'NEUTRAL' };
    }

    const getHigh = (arr) => Math.max(...arr.map(c => c.high));
    const getLow = (arr) => Math.min(...arr.map(c => c.low));

    const tenkanSlice = candles.slice(-periods.tenkan);
    const tenkan = (getHigh(tenkanSlice) + getLow(tenkanSlice)) / 2;

    const kijunSlice = candles.slice(-periods.kijun);
    const kijun = (getHigh(kijunSlice) + getLow(kijunSlice)) / 2;

    const chikou = candles[candles.length - 1].close;
    const chikouComparePrice = candles[candles.length - 1 - periods.kijun]?.close || null;

    const candlesForCurrentKumo = candles.slice(0, -periods.kijun);

    // Tenkan-sen của 26 nến trước
    const pastTenkanSlice = candlesForCurrentKumo.slice(-periods.tenkan);
    const pastTenkan = (getHigh(pastTenkanSlice) + getLow(pastTenkanSlice)) / 2;

    // Kijun-sen của 26 nến trước
    const pastKijunSlice = candlesForCurrentKumo.slice(-periods.kijun);
    const pastKijun = (getHigh(pastKijunSlice) + getLow(pastKijunSlice)) / 2;

    const senkouA = (pastTenkan + pastKijun) / 2;

    const pastSenkouBSlice = candlesForCurrentKumo.slice(-periods.senkouB);
    const senkouB = (getHigh(pastSenkouBSlice) + getLow(pastSenkouBSlice)) / 2;

    const futureKumo = ((tenkan + kijun) / 2) > ((getHigh(candles.slice(-periods.senkouB)) + getLow(candles.slice(-periods.senkouB))) / 2) ? 'BULLISH' : 'BEARISH';

    return { tenkan, kijun, senkouA, senkouB, chikou, chikouComparePrice, futureKumo };
};

// ── SIGNAL SCORING ENGINE

export const analyzeTechnicalSignal = (candles, breadthRatio = 50, statusType = 'neutral', customScoreThreshold = null, config = getRiskConfig(2)) => {
    if (!candles || candles.length < 52 + 26) {
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
    const ichimoku = calcIchimoku(candles);

    // ── Chỉ báo bổ sung nâng cao ──
    const obv = calcOBV(candles);
    // rolling window cho 1D candles (VN_STOCK).
    const candleIntervalSec = candles.length >= 2 ? (candles[1].time - candles[0].time) : 86400;
    const isIntradayCandles = candleIntervalSec < 3600; // 15m = 900s
    const vwap = isIntradayCandles
        ? calcVWAPIntraday(candles, 'UTC')
        : calcVWAP(candles, 20);
    const stochRSI = calcStochasticRSI(closes);
    const adx = calcADX(candles, 14);
    const candlePattern = detectCandlePattern(candles);

    const isSidewaysBB = boll && boll.bwPct < 1.8;
    const isSidewaysADX = adx.adx < 15;
    if (isSidewaysBB && isSidewaysADX) {
        if (candlePattern.strength < 2) {
            return {
                direction: 'NEUTRAL',
                score: 0,
                breakdown: { regimeFilter: 'SIDEWAYS', bwPct: boll?.bwPct, adx: adx.adx },
                atr: atr ? Math.round(atr * 100) / 100 : null,
            };
        }
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

    // --- Chấm điểm cho Mây Ichimoku ---
    let ichimokuLong = 50;
    let ichimokuShort = 50;

    if (ichimoku.tenkan !== null) {
        const kumoTop = Math.max(ichimoku.senkouA, ichimoku.senkouB);
        const kumoBottom = Math.min(ichimoku.senkouA, ichimoku.senkouB);

        if (currentPrice > kumoTop) {
            ichimokuLong += 20; ichimokuShort -= 15;
        } else if (currentPrice < kumoBottom) {
            ichimokuLong -= 15; ichimokuShort += 20;
        } else {
            ichimokuLong -= 5; ichimokuShort -= 5;
        }

        if (ichimoku.tenkan > ichimoku.kijun) {
            ichimokuLong += 15; ichimokuShort -= 10;
        } else {
            ichimokuLong -= 10; ichimokuShort += 15;
        }

        if (ichimoku.chikou > ichimoku.chikouComparePrice) {
            ichimokuLong += 10; ichimokuShort -= 5;
        } else {
            ichimokuLong -= 5; ichimokuShort += 10;
        }

        if (ichimoku.futureKumo === 'BULLISH') ichimokuLong += 5;
        else if (ichimoku.futureKumo === 'BEARISH') ichimokuShort += 5;

        ichimokuLong = Math.max(0, Math.min(100, ichimokuLong));
        ichimokuShort = Math.max(0, Math.min(100, ichimokuShort));
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

    let obvLong = 50, obvShort = 50;
    if (obv.obvTrend === 'up') { obvLong = 70; obvShort = 35; }
    else if (obv.obvTrend === 'down') { obvLong = 30; obvShort = 70; }

    let vwapLong = 50, vwapShort = 50;
    if (vwap !== null) {
        if (currentPrice > vwap * 1.005) { vwapLong = 68; vwapShort = 38; }
        else if (currentPrice < vwap * 0.995) { vwapLong = 38; vwapShort = 68; }
    }

    let stochLong = 50, stochShort = 50;
    if (stochRSI.k < 15) { stochLong = 80; stochShort = 20; }
    else if (stochRSI.k < 30) { stochLong = 68; stochShort = 35; }
    else if (stochRSI.k > 85) { stochLong = 20; stochShort = 80; }
    else if (stochRSI.k > 70) { stochLong = 35; stochShort = 68; }

    const trendStrengthMultiplier = adx.adx > 30 ? 1.25 : adx.adx > 20 ? 1.1 : 1.0;

    let patternBonusLong = 0, patternBonusShort = 0;
    if (candlePattern.direction === 'LONG') {
        patternBonusLong = candlePattern.strength * 4; // Tối đa +12 điểm
    } else if (candlePattern.direction === 'SHORT') {
        patternBonusShort = candlePattern.strength * 4;
    }

    let trendWeight   = 0.17;
    let rsiWeight     = 0.08;
    let macdWeight    = 0.12;
    let bollWeight    = 0.08;
    let volumeWeight  = 0.09;
    let ichimokuWeight = 0.17;
    let marketWeight  = 0.11;
    let obvWeight     = 0.07;
    let vwapWeight    = 0.06;
    let stochWeight   = 0.05;
    // tổng = 1.0 ✓

    if (statusType === 'bearish') {
        stochWeight   = 0.08;
        rsiWeight     = 0.11;
        macdWeight    = 0.14;
        trendWeight   = 0.13;
        ichimokuWeight = 0.14;
        obvWeight     = 0.08;
        vwapWeight    = 0.06;
        marketWeight  = 1 - trendWeight - rsiWeight - macdWeight - bollWeight - volumeWeight - ichimokuWeight - obvWeight - vwapWeight - stochWeight;
    } else if (statusType === 'bullish') {
        trendWeight   = 0.22;
        ichimokuWeight = 0.20;
        obvWeight     = 0.08;
        rsiWeight     = 0.07;
        marketWeight  = 1 - trendWeight - rsiWeight - macdWeight - bollWeight - volumeWeight - ichimokuWeight - obvWeight - vwapWeight - stochWeight;
    }

    const effectiveTrendLong  = Math.min(100, trendLong  * trendStrengthMultiplier);
    const effectiveTrendShort = Math.min(100, trendShort * trendStrengthMultiplier);

    const longScore =
        effectiveTrendLong  * trendWeight +
        macdLong            * macdWeight +
        rsiLong             * rsiWeight +
        bollLong            * bollWeight +
        volumeLong          * volumeWeight +
        ichimokuLong        * ichimokuWeight +
        marketLong          * marketWeight +
        obvLong             * obvWeight +
        vwapLong            * vwapWeight +
        stochLong           * stochWeight;

    const shortScore =
        effectiveTrendShort * trendWeight +
        macdShort           * macdWeight +
        rsiShort            * rsiWeight +
        bollShort           * bollWeight +
        volumeShort         * volumeWeight +
        ichimokuShort       * ichimokuWeight +
        marketShort         * marketWeight +
        obvShort            * obvWeight +
        vwapShort           * vwapWeight +
        stochShort          * stochWeight;

    let roundedLong  = Math.round(longScore)  + patternBonusLong;
    let roundedShort = Math.round(shortScore) + patternBonusShort;
    roundedLong  = Math.min(100, Math.max(0, roundedLong));
    roundedShort = Math.min(100, Math.max(0, roundedShort));
    const edge = Math.abs(roundedLong - roundedShort);

    let direction = 'NEUTRAL';
    let finalScore = Math.max(roundedLong, roundedShort);
    const scoreThr = customScoreThreshold !== null ? customScoreThreshold : config.scoreThreshold;
    if (finalScore >= scoreThr && edge >= config.edge) {
        direction = roundedLong > roundedShort ? 'LONG' : 'SHORT';
    }

    const breakdown = {
        longScore: roundedLong,
        shortScore: roundedShort,
        edge,
        trendLong: Math.round(effectiveTrendLong),
        trendShort: Math.round(effectiveTrendShort),
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
        ichimokuLong: Math.round(ichimokuLong),
        ichimokuShort: Math.round(ichimokuShort),
        obvLong: Math.round(obvLong),
        obvShort: Math.round(obvShort),
        vwapLong: Math.round(vwapLong),
        vwapShort: Math.round(vwapShort),
        stochLong: Math.round(stochLong),
        stochShort: Math.round(stochShort),
        adx: adx.adx,
        candlePattern: candlePattern.pattern,
        patternBonus: patternBonusLong || patternBonusShort,
        candleBias,
    };

    return {
        direction,
        score: finalScore,
        breakdown,
        atr: atr || null,
        entryPrice: currentPrice,
        rsi: Math.round(rsi * 10) / 10,
        stochRSI,
        adx,
        ema9, ema21, ema50,
        vwap: vwap || null,
        ichimoku,
        bollinger: boll,
        volumeSurge: Math.round(volSurge * 100) / 100,
        candlePattern,
    };
};

// ── FEASIBILITY CHECK

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

const buildTradePlanFromSignal = (asset, techSignal, quote, config = getRiskConfig(2)) => {
    if (asset === 'VN_STOCK' && techSignal.direction === 'SHORT') {
        return null;
    }

    const roundPrice = (price) => {
        if (asset === 'VN_STOCK') return Math.round(price * 20) / 20;   // bước 0.05
        if (asset === 'DERIVATIVES') return Math.round(price * 10) / 10; // bước 0.1
        return price;
    };

    const entryPrice = roundPrice(Number(quote.price));
    const atr = techSignal.atr || entryPrice * 0.02;
    
    const volPct = (atr / entryPrice) * 100;
    let adaptiveScale = 1.0;
    if (volPct > 5) adaptiveScale = 1.3; 
    else if (volPct < 1.5) adaptiveScale = 0.8; 

    let atrMultiplierTP, atrMultiplierSL;
    if (asset === 'VN_STOCK') {
        // Thắt chặt risk và cân bằng R/R
        atrMultiplierTP = 2.5 * adaptiveScale;
        atrMultiplierSL = 1.5 * adaptiveScale;
    } else {
        atrMultiplierTP = (asset === 'CRYPTO' ? 4.0 : (asset === 'DERIVATIVES' ? 3.0 : 3.5)) * adaptiveScale;
        atrMultiplierSL = (asset === 'CRYPTO' ? 2.0 : (asset === 'DERIVATIVES' ? 1.5 : 2.0)) * adaptiveScale;
    }

    const maxRiskPct = config.maxRisk[asset] || 0.025;
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

    const takeProfitPrice = roundPrice(isLong
        ? entryPrice + atr * atrMultiplierTP
        : entryPrice - atr * atrMultiplierTP);
    const stopLossPrice = roundPrice(isLong
        ? entryPrice - atr * atrMultiplierSL
        : entryPrice + atr * atrMultiplierSL);

    const directionLabel = (asset === 'VN_STOCK' && isLong) ? 'MUA' : techSignal.direction;
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

const applyExecutionContextBias = (signal, asset, context = {}, customScoreThreshold = null, config = getRiskConfig(2)) => {
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

    if (asset === 'VN_STOCK' && context.intelligence) {
        const intel = context.intelligence;

        const strongTickers = new Set((intel.strongSectors || []).flatMap(s => s.tickers || []));
        if (strongTickers.has(signal.symbol)) {
            longBias += 5;
            reasons.push('strong_sector_momentum');
        }

        const topGainers = new Set((intel.topGainers || []).map(s => s.symbol));
        if (topGainers.has(signal.symbol)) {
            longBias += 3;
            reasons.push('top_gainer_momentum');
        }
    }

    if (longBias === 0 && shortBias === 0) return signal;

    const longScore = Math.max(0, Math.min(100, (signal.breakdown.longScore || 0) + longBias));
    const shortScore = Math.max(0, Math.min(100, (signal.breakdown.shortScore || 0) + shortBias));
    const edge = Math.abs(longScore - shortScore);
    const score = Math.max(longScore, shortScore);
    const scoreThr = customScoreThreshold !== null ? customScoreThreshold : config.scoreThreshold;
    const direction = score >= scoreThr && edge >= config.edge
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

// ── AI SIGNAL CONFIRMATION

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

const getAISignalConfirmation = async (asset, signal, marketStatus, diagnosticDesc, executionContext = {}, config = getRiskConfig(2)) => {
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

                const crossAssetLessons = await AiBehavior.find({
                assetType: asset,
                tags: { $in: ['LOSS_SIGNAL', 'SL_HIT'] }, 
            })
            .sort({ createdAt: -1 })
            .limit(2)
            .lean();
            if (crossAssetLessons.length > 0) {
                lessonContext += '\n\nPattern chung cần tránh (từ các lệnh thua cùng phân khúc):\n' + 
                    crossAssetLessons.map(l => `- Cẩn trọng: ${l.lesson}`).join('\n');
            }
        } catch (_) {}

        const strategyContext = asset === 'VN_STOCK'
            ? `CHIẾN LƯỢC: Đây là lệnh NGẮN HẠN cho VN_STOCK, thời gian nắm giữ TỐI ĐA 5 NGÀY.\n${config.prompt}`
            : `CHIẾN LƯỢC: Đây là lệnh GIAO DỊCH NGẮN HẠN (${asset}).\n${config.prompt}`;

        const scoreForBias = signal.score || 0;
        const scoreBiasInstruction = scoreForBias >= 80
            ? `\nLƯU Ý QUAN TRỌNG: Score kỹ thuật ${scoreForBias}/100 rất cao. Mặc định THIÊN VỀ XÁC NHẬN — chỉ BÁC BỎ nếu có lý do kỹ thuật cực kỳ rõ ràng (tín hiệu đảo chiều mạnh hoặc context thị trường quá tiêu cực).`
            : scoreForBias >= 70
            ? `\nLƯU Ý: Score kỹ thuật ${scoreForBias}/100 tốt. Chỉ BÁC BỎ nếu có mâu thuẫn rõ ràng giữa các tín hiệu chính hoặc context thị trường bất lợi đáng kể.`
            : `\nLƯU Ý: Score kỹ thuật ${scoreForBias}/100. Đánh giá khách quan, cân nhắc cả điểm mạnh và điểm yếu.`;

        const prompt = `Bạn là chuyên gia phân tích kỹ thuật của hệ thống OMNI DUCK.
Dưới đây là kết quả phân tích kỹ thuật định lượng cho lệnh sắp vào:

[THÔNG TIN TÍN HIỆU]
- Phân khúc: ${asset}
- Mã: ${signal.symbol}
- Giá hiện tại: ${signal.entryPrice}
- VWAP: ${signal.vwap ?? 'N/A'} | Giá ${signal.entryPrice > (signal.vwap ?? 0) ? 'trên' : 'dưới'} VWAP
- Hướng đề xuất: ${signal.direction}
- Điểm tổng hợp: ${signal.score}/100
- RSI: ${signal.rsi} | StochRSI K: ${signal.stochRSI?.k ?? 'N/A'}
- ADX: ${signal.adx?.adx ?? 'N/A'} (+DI: ${signal.adx?.pdi ?? 'N/A'} / -DI: ${signal.adx?.mdi ?? 'N/A'})
- Volume Surge: ${signal.volumeSurge}x
- Candle Pattern: ${signal.candlePattern?.pattern ?? 'none'} (strength: ${signal.candlePattern?.strength ?? 0})
- EMA9/21/50: ${signal.ema9?.toFixed(2) || 'N/A'} / ${signal.ema21?.toFixed(2) || 'N/A'} / ${signal.ema50?.toFixed(2) || 'N/A'}
- ATR: ${signal.atr}

${strategyContext}
${scoreBiasInstruction}

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
- OBV Long/Short: ${signal.breakdown.obvLong ?? 'N/A'}/${signal.breakdown.obvShort ?? 'N/A'}
- VWAP Long/Short: ${signal.breakdown.vwapLong ?? 'N/A'}/${signal.breakdown.vwapShort ?? 'N/A'}
- Market Long/Short: ${signal.breakdown.marketLong}/${signal.breakdown.marketShort}
- Pattern bonus: +${signal.breakdown.patternBonus ?? 0}

[LỊCH SỬ GIAO DỊCH GẦN NHẤT (${signal.symbol})]
${lessonContext}

Phân tích xác nhận hoặc bác bỏ tín hiệu trong 2-3 câu ngắn gọn bằng tiếng Việt. Kết thúc bằng: "XÁC NHẬN" hoặc "BÁC BỎ".`;

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

// ── REALTIME EXIT CHECK

const checkExitConditions = async (trade, marketContext = {}, isFastCheck = false) => {
    try {
        const currentPrice = await fetchCurrentPrice(trade.symbol, trade.assetType);

        const isLong  = trade.direction === 'LONG' || trade.direction === 'MUA';
        const isShort = trade.direction === 'SHORT' || trade.direction === 'BÁN';

        const config = getRiskConfig(trade.riskLevel || 2);

        const roundPrice = (price) => {
            if (trade.assetType === 'VN_STOCK') return Math.round(price * 20) / 20;
            if (trade.assetType === 'DERIVATIVES') return Math.round(price * 10) / 10;
            return price;
        };

        let shouldClose = false;
        let exitReason  = '';
        let trailingUpdated = false;

        if (trade.assetType === 'VN_STOCK' && isShort) {
            console.log(chalk.red.bold(`[DATA INTEGRITY ERROR] Found an open 'BÁN' (short) trade for VN_STOCK: ${trade.symbol} (${trade._id}). This is invalid. Forcing close.`));
            return { shouldClose: true, currentPrice: trade.entryPrice, exitReason: 'Lỗi dữ liệu: Đóng lệnh BÁN không hợp lệ cho VN_STOCK.', trailingUpdated: false };
        }

        if (isLong) {
            const reward = trade.takeProfitPrice - trade.entryPrice;
            if (reward > 0) {
                // Trailing kích hoạt sớm hơn
                const activationPrice = trade.entryPrice + reward * config.trailingActivation;
                if (currentPrice >= activationPrice) {
                    let newSL = trade.entryPrice + reward * 0.05; // breakeven sớm
                    if (currentPrice >= trade.entryPrice + reward * 0.60) {
                        newSL = trade.entryPrice + reward * 0.35;
                    }
                    if (newSL > trade.stopLossPrice) {
                        trade.stopLossPrice = roundPrice(newSL);
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
                const activationPrice = trade.entryPrice - reward * config.trailingActivation; 
                if (currentPrice <= activationPrice) {
                    let newSL = trade.entryPrice - reward * 0.05;
                    if (currentPrice <= trade.entryPrice - reward * 0.60) {
                        newSL = trade.entryPrice - reward * 0.35;
                    }
                    if (newSL < trade.stopLossPrice) {
                        trade.stopLossPrice = roundPrice(newSL);
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

        let maxHoldMs;
        const SHORT_TERM_CUTOFF_MS = new Date('2025-06-05T00:00:00+07:00').getTime();
        const tradeCreatedAt = new Date(trade.openedAt || trade.createdAt || Date.now()).getTime();
        switch (trade.assetType) {
            case 'VN_STOCK':
                maxHoldMs = tradeCreatedAt >= SHORT_TERM_CUTOFF_MS
                    ? 7 * 24 * 3600_000   // Rút ngắn maxhold còn 7 ngày
                    : 30 * 24 * 3600_000; // Lệnh cũ: giữ nguyên 30 ngày
                break;
            case 'CRYPTO':
                maxHoldMs = 6 * 3600_000;
                break;
            default: // DERIVATIVES
                maxHoldMs = 2 * 24 * 3600_000;
        }

        const holdMs    = Date.now() - new Date(trade.openedAt).getTime();
        if (!shouldClose && holdMs > maxHoldMs) {
            shouldClose = true;
            exitReason  = `Timeout: Lệnh quá thời hạn giữ tối đa (${Math.round(holdMs / 3600000)}h). Đóng để quản lý rủi ro.`;
        }

        const minHoldForSignalExitMs = trade.assetType === 'CRYPTO' ? 30 * 60_000 : 60 * 60_000;
        if (!shouldClose && !isFastCheck && holdMs > minHoldForSignalExitMs) {
            try {
                const candles = await fetchAnalysisCandles(trade.symbol, trade.assetType);
                const signal = analyzeTechnicalSignal(
                    candles,
                    marketContext.breadthRatio ?? 50,
                    marketContext.statusType ?? 'neutral',
                    REVERSAL_EXIT_THRESHOLD,
                    config
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

// ── CORE ENGINE LOOP

const checkVolatilityAndAlert = async (symbol, asset, candles) => {
    if (!candles || candles.length < 5) return;
    const now = Date.now();
    const cooldownKey = `${asset}_${symbol}`;
    
    if (volatilityAlertCooldown.has(cooldownKey) && now < volatilityAlertCooldown.get(cooldownKey)) {
        return; 
    }

    if (asset === 'CRYPTO') {
        const isHolding = await AutoTrade.findOne({ symbol, assetType: 'CRYPTO', status: { $in: ['OPEN', 'PENDING'] } });
        if (!isHolding) return;
    }

    const currentCandle = candles[candles.length - 1];
    const oldCandle = candles[candles.length - 5];
    const priceDiff = currentCandle.close - oldCandle.close;
    const pctDiff = (priceDiff / oldCandle.close) * 100;
    const absPct = Math.abs(pctDiff);

    let isAnomalous = false;
    let note = '';

    if (asset === 'CRYPTO' && absPct >= 5.5) {
        isAnomalous = true; note = `Biến động giật mạnh vượt ngưỡng 5.5% của khung 1H.`;
    } else if (asset === 'DERIVATIVES' && Math.abs(priceDiff) >= 7) {
        isAnomalous = true; note = `Thị trường phái sinh giật mạnh ${Math.abs(priceDiff).toFixed(1)} điểm.`;
    } else if (asset === 'VN_STOCK' && absPct >= 4.5) {
        isAnomalous = true; note = `Cổ phiếu có dấu hiệu kéo/xả bất thường (biến động > 4.5%).`;
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
        // 1. Macro data
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

        // 2. Target assets
        const targetAssets = [];
        if (forcedAssetType) {
            targetAssets.push(forcedAssetType);
        } else {
            targetAssets.push('CRYPTO'); 
            
            if (isVNMarketOpen() || isPreMarket() || isATOPeriod() || isATCPeriod()) {
                targetAssets.push('VN_STOCK');
                targetAssets.push('DERIVATIVES');
            }
        }

        const isOutOfStandardHours = !isVNMarketOpen() || isATOPeriod() || isATCPeriod();

        const settingsRaw = await Setting.find({ key: { $in: ['autoTradeTotalCapital', 'autoTradeMaxConcurrent', 'autoTradeRiskLevel'] } });
        const settingsMap = settingsRaw.reduce((acc, s) => { acc[s.key] = s.value; return acc; }, {});
        
        const TOTAL_CAPITAL = Number(settingsMap.autoTradeTotalCapital) || 5_000_000_000;
        const MAX_CONCURRENT_TRADES = Number(settingsMap.autoTradeMaxConcurrent) || 10;
        const currentRiskLevel = Number(settingsMap.autoTradeRiskLevel) || 2;
        const currentRiskConfig = getRiskConfig(currentRiskLevel);

        const openTradesList = await AutoTrade.find({ status: { $in: ['OPEN', 'PENDING'] } });
        let currentAllocatedCapital = openTradesList.reduce((sum, t) => sum + (Number(t.investedAmount) || 0), 0);
        let currentOpenCount = openTradesList.length;

        const utilizationRate = currentAllocatedCapital / TOTAL_CAPITAL;
        const dynamicScoreThreshold = utilizationRate < 0.40 
            ? currentRiskConfig.scoreThreshold - 3 
            : currentRiskConfig.scoreThreshold;

        // 3. Scan loop
        for (const asset of targetAssets) {
            console.log(chalk.cyan(`\n[AUTODUCK] ═══ Quét phân khúc: ${asset} ═══`));

            const stats = { scanned: 0, skipScore: 0, skipLimit: 0, skipRisk: 0, aiRejected: 0, matched: 0 };
            let symbolsToScan = [];

            if (asset === 'VN_STOCK') {
                const baseUniverse = await buildVnStockScanUniverse(vnMarketContext, 60);
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

            // 4. Analyze symbol
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
                    let techSignal = analyzeTechnicalSignal(candles, breadthRatio, statusType, dynamicScoreThreshold, currentRiskConfig);
                    techSignal = applyExecutionContextBias(techSignal, asset, executionContext, dynamicScoreThreshold, currentRiskConfig);
                    techSignal.symbol = symbol;

                    if (techSignal.direction === 'NEUTRAL' || techSignal.score < dynamicScoreThreshold) {
                        stats.skipScore++;
                        continue;
                    }

                    if (asset === 'VN_STOCK' && techSignal.direction === 'SHORT') {
                        stats.skipScore++;
                        continue;
                    }

                    const minVolSurge = currentRiskConfig.volSurge[asset] || 1.2;
                    if (techSignal.volumeSurge < minVolSurge) {
                        stats.skipVolume = (stats.skipVolume || 0) + 1;
                        console.log(chalk.gray(`  [VOL FILTER] ${symbol}: volSurge=${techSignal.volumeSurge}x < min=${minVolSurge}x (score=${techSignal.score})`));
                        continue;
                    }

                    if (currentOpenCount >= MAX_CONCURRENT_TRADES) {
                        stats.skipLimit++;
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

                    const quote = await fetchRealtimeQuote(symbol, asset);
                    const tradePlan = buildTradePlanFromSignal(asset, techSignal, quote, currentRiskConfig);

                    if (!tradePlan) {
                        stats.skipRisk++;
                        continue;
                    }

                    // 5. AI confirm
                    const aiConfirm = await getAISignalConfirmation(asset, techSignal, marketStatus, diagnosticDesc, executionContext, currentRiskConfig);
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

                    if (!aiConfirm.confirmed) {
                        stats.aiRejected++;
                        continue;
                    }

                    // 6. Trade plan
                    const {
                        directionLabel,
                        entryPrice,
                        takeProfitPrice,
                        stopLossPrice,
                    } = tradePlan;

                    // 7. Allocation
                    let availableCapital = TOTAL_CAPITAL - currentAllocatedCapital;
                    if (availableCapital <= 0) {
                        stats.skipLimit++;
                        continue;
                    }

                    let allocationPct;
                    if (asset === 'VN_STOCK') {
                        const utilizationBonus = utilizationRate < 0.30 ? 0.05 : 0;
                        let baseAlloc = 0.10;
                        if (techSignal.score >= 80) baseAlloc = 0.20;
                        else if (techSignal.score >= 75) baseAlloc = 0.15;
                        else if (techSignal.score >= 68) baseAlloc = 0.12;
                        else baseAlloc = 0.08;
                        allocationPct = Math.min(0.40, (baseAlloc * currentRiskConfig.allocationMultiplier) + utilizationBonus);
                    } else { // CRYPTO, DERIVATIVES
                        const utilizationBonus = utilizationRate < 0.30 ? 0.05 : 0;
                        let baseAlloc = 0.10;
                        if (techSignal.score >= 80) baseAlloc = 0.20;
                        else if (techSignal.score >= 75) baseAlloc = 0.15;
                        else baseAlloc = 0.10;
                        allocationPct = Math.min(0.40, (baseAlloc * currentRiskConfig.allocationMultiplier) + utilizationBonus);
                    }
                    let idealInvestedAmount = TOTAL_CAPITAL * allocationPct;
                    
                    let maxVolumeByRisk = Infinity;
                    const riskUnit = Math.abs(entryPrice - stopLossPrice);
                    const currentUsdRate = await getUsdVndRate();
                    if (riskUnit > 0) {
                        const riskAmountUSD = asset === 'CRYPTO' ? (TOTAL_CAPITAL * currentRiskConfig.maxRisk.CRYPTO) / currentUsdRate : 0;
                        const riskAmountVND = TOTAL_CAPITAL * currentRiskConfig.maxRisk[asset];
                        
                        if (asset === 'VN_STOCK') {
                            maxVolumeByRisk = riskAmountVND / (riskUnit * 1000);
                        } else if (asset === 'DERIVATIVES') {
                            maxVolumeByRisk = riskAmountVND / (riskUnit * 100000);
                        } else {
                            maxVolumeByRisk = riskAmountUSD / riskUnit;
                        }
                    }

                    let investedAmount = Math.min(idealInvestedAmount, availableCapital);
                    let volume = 0;

                    if (asset === 'CRYPTO') {
                        const investedUSD = investedAmount / currentUsdRate;
                        if (investedUSD < 10) {
                            stats.skipRisk++;
                            continue;
                        }
                        const rawVolume = investedUSD / entryPrice;
                        volume = Math.min(parseFloat(rawVolume.toFixed(6)), maxVolumeByRisk);
                        if (volume <= 0) {
                            stats.skipRisk++;
                            continue;
                        }
                        investedAmount = Math.round(volume * entryPrice * currentUsdRate);
                    } else if (asset === 'DERIVATIVES') {
                        volume = Math.max(0, Math.floor(Math.min(investedAmount / 25_000_000, maxVolumeByRisk)));
                        if (volume < 1) {
                            stats.skipRisk++;
                            continue;
                        }
                        investedAmount = volume * 25_000_000;
                    } else {
                        const priceVND = entryPrice * 1000;
                        volume = Math.floor(Math.min(investedAmount / priceVND, maxVolumeByRisk));
                        volume = Math.floor(volume / 100) * 100;
                        if (volume < 100) {
                            stats.skipRisk++;
                            continue;
                        }
                        const notionalVND = volume * priceVND;
                        if (notionalVND < 5_000_000) {
                            stats.skipRisk++;
                            continue;
                        }
                        investedAmount = Math.round(notionalVND);
                    }
                    
                    currentAllocatedCapital += investedAmount;
                    currentOpenCount++;

                    const tradeStatus = (isOutOfStandardHours && asset !== 'CRYPTO') ? 'PENDING' : 'OPEN';

                    const liveOpenCount = await AutoTrade.countDocuments({ status: { $in: ['OPEN', 'PENDING'] } });
                    if (liveOpenCount >= MAX_CONCURRENT_TRADES) {
                        stats.skipLimit++;
                        currentOpenCount = liveOpenCount; // sync lại local counter
                        continue;
                    }
                    const raceGuardCheck = await AutoTrade.findOne({
                        symbol,
                        assetType: asset,
                        status: { $in: ['OPEN', 'PENDING'] },
                    });
                    if (raceGuardCheck) {
                        currentOpenCount = Math.max(currentOpenCount - 1, 0);
                        currentAllocatedCapital -= investedAmount;
                        continue;
                    }

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
                        riskLevel: currentRiskLevel,
                        signalBreakdown: {
                            ...techSignal.breakdown,
                            originalSL: stopLossPrice
                        },
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
                        `  [LỆNH ${tradeStatus}] ${directionLabel} ${symbol} @ ${entryPrice} | Vốn: ${(investedAmount/1e6).toFixed(2)}Tr VNĐ | Volume: ${volume} | Score: ${techSignal.score}`
                    ));
                    stats.matched++;

                    // 8. Match user orders
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
                const volSkip = stats.skipVolume || 0;
                console.log(chalk.gray(`  └─ Tổng kết: Quét ${stats.scanned} mã | Bỏ qua [Điểm yếu: ${stats.skipScore} | Volume surge: ${volSkip} | Rủi ro/Vốn: ${stats.skipRisk + stats.skipLimit} | AI hủy: ${stats.aiRejected}] | Đã vào: ${stats.matched} lệnh.`));
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

        if (!isOutOfStandardHours) {
            const pendingTrades = await AutoTrade.find({ status: 'PENDING', assetType: { $ne: 'CRYPTO' } });
            for (const pt of pendingTrades) {
                pt.status = 'OPEN';
                await pt.save();
                console.log(chalk.bgGreen.white(`[AUTODUCK] 🟢 Lệnh chờ ${pt.symbol} đã ACTIVE do thị trường mở cửa.`));
            }
        }

        // 9. Exit pipeline
        await runExitAndLearningPipeline(marketStatus, { breadthRatio, statusType });

    } catch (err) {
        console.error(chalk.red(`[AUTODUCK CRITICAL ERROR] ${err.message}`));
    } finally {
        autoTradePipelineRunning = false;
    }
};

// ── EXIT & AI LEARNING PIPELINE

async function runExitAndLearningPipeline(currentMarketStatus, marketContext = {}, isFastCheck = false) {
    if (exitPipelineRunning) return;
    exitPipelineRunning = true;

    try {
        const openTrades = await AutoTrade.find({ status: { $in: ['OPEN', 'PENDING'] } });
        if (openTrades.length === 0) return;

        if (!isFastCheck) {
            console.log(chalk.gray(`\n[EXIT PIPELINE] Kiểm tra ${openTrades.length} lệnh đang mở/chờ...`));
        }

        for (const trade of openTrades) {
            try {
                const { shouldClose, currentPrice, exitReason, trailingUpdated } = await checkExitConditions(trade, marketContext, isFastCheck);

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
                
                const isWin = trade.pnlPercent > 0;
                const exitTag = exitReason.includes('TP HIT') ? 'TP_HIT'
                    : exitReason.includes('SL HIT') ? 'SL_HIT'
                    : exitReason.includes('Timeout') ? 'TIMEOUT_EXIT'
                    : exitReason.includes('Đảo chiều') ? 'REVERSAL_EXIT'
                    : 'MANUAL_EXIT';
                
                const investedVND = Number(trade.investedAmount) || 0;
                trade.pnl = investedVND > 0
                    ? Math.round(investedVND * (trade.pnlPercent / 100))
                    : (() => {
                        const currentUsdRateFallback = cachedUsdVndRate;
                        let rawPnl = trade.volume * priceDiff;
                        if (trade.assetType === 'CRYPTO') rawPnl *= currentUsdRateFallback;
                        return Math.round(rawPnl);
                    })();
                
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
- Kiểu đóng lệnh: ${exitTag}
- Mức độ rủi ro hệ thống lúc mở lệnh (Risk Level): ${trade.riskLevel || 2}/4
- Thời gian nắm giữ: ${Math.round((Date.now() - new Date(trade.openedAt).getTime()) / 3600000)}h
- Volume surge lúc vào: ${trade.signalBreakdown?.volumeSurge ?? 'N/A'}x
- Trailing SL có được kích hoạt không: ${trade.stopLossPrice !== trade.signalBreakdown?.originalSL && trade.signalBreakdown?.originalSL ? 'Có' : 'Không'}
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
                        tags:           [isWin ? 'WIN_SIGNAL' : 'LOSS_SIGNAL', exitTag],
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
    } finally {
        exitPipelineRunning = false;
    }
}

// ── DAILY PNL REPORT
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

// ── SCHEDULER

// ── WIN/LOSS ANALYTICS

export const getTradeAnalytics = async ({ days = 30, assetType = null } = {}) => {
    const since = new Date(Date.now() - days * 24 * 3600_000);
    const query = { closedAt: { $gte: since }, status: 'CLOSED' };
    if (assetType) query.assetType = assetType;

    const trades = await AutoTrade.find(query).lean();
    if (trades.length === 0) return { error: 'Không có lệnh đóng trong khoảng thời gian này.' };

    const wins = trades.filter(t => t.pnlPercent > 0);
    const losses = trades.filter(t => t.pnlPercent <= 0);
    const winRate = Math.round((wins.length / trades.length) * 1000) / 10;

    // Phân tích PnL theo exit tag
    const byExitTag = trades.reduce((acc, t) => {
        const tag = t.aiReportSnapshot?.match(/exitTag=([A-Z_]+)/)?.[1]
            || (t.pnlPercent > 0 ? 'TP_HIT' : 'SL_HIT');
        if (!acc[tag]) acc[tag] = { count: 0, wins: 0, totalPnl: 0 };
        acc[tag].count++;
        if (t.pnlPercent > 0) acc[tag].wins++;
        acc[tag].totalPnl += t.pnlPercent;
        return acc;
    }, {});

    // Phân tích theo score bucket
    const byScore = { lt65: { count: 0, wins: 0 }, s65_72: { count: 0, wins: 0 }, s72_80: { count: 0, wins: 0 }, gt80: { count: 0, wins: 0 } };
    for (const t of trades) {
        const s = t.aiScore || 0;
        const bucket = s < 65 ? 'lt65' : s < 72 ? 's65_72' : s < 80 ? 's72_80' : 'gt80';
        byScore[bucket].count++;
        if (t.pnlPercent > 0) byScore[bucket].wins++;
    }

    // Phân tích AI reject rate (từ AiBehavior logs)
    const aiLogs = await AiBehavior.find({ createdAt: { $gte: since } }).lean();
    const aiWins = aiLogs.filter(l => l.tags?.includes('WIN_SIGNAL'));
    const aiLosses = aiLogs.filter(l => l.tags?.includes('LOSS_SIGNAL'));

    // Avg PnL theo hold time bucket
    const byHoldTime = trades.reduce((acc, t) => {
        const holdH = t.openedAt && t.closedAt
            ? (new Date(t.closedAt) - new Date(t.openedAt)) / 3600_000
            : 0;
        const bucket = holdH < 1 ? 'lt1h' : holdH < 6 ? '1h_6h' : holdH < 24 ? '6h_24h' : 'gt24h';
        if (!acc[bucket]) acc[bucket] = { count: 0, totalPnl: 0 };
        acc[bucket].count++;
        acc[bucket].totalPnl += t.pnlPercent;
        return acc;
    }, {});

    return {
        period: `${days} ngày gần nhất`,
        assetType: assetType || 'ALL',
        totalTrades: trades.length,
        wins: wins.length,
        losses: losses.length,
        winRate: `${winRate}%`,
        avgWinPnl: wins.length ? Math.round(wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length * 100) / 100 : 0,
        avgLossPnl: losses.length ? Math.round(losses.reduce((s, t) => s + t.pnlPercent, 0) / losses.length * 100) / 100 : 0,
        totalPnlPct: Math.round(trades.reduce((s, t) => s + t.pnlPercent, 0) * 100) / 100,
        byExitTag: Object.entries(byExitTag).map(([tag, d]) => ({
            tag,
            count: d.count,
            winRate: `${Math.round((d.wins / d.count) * 1000) / 10}%`,
            avgPnl: Math.round(d.totalPnl / d.count * 100) / 100,
        })),
        byScoreBucket: Object.entries(byScore).map(([bucket, d]) => ({
            bucket,
            count: d.count,
            winRate: d.count > 0 ? `${Math.round((d.wins / d.count) * 1000) / 10}%` : 'N/A',
        })),
        byHoldTime: Object.entries(byHoldTime).map(([bucket, d]) => ({
            bucket,
            count: d.count,
            avgPnl: Math.round(d.totalPnl / d.count * 100) / 100,
        })),
        aiLearning: {
            totalLogs: aiLogs.length,
            wins: aiWins.length,
            losses: aiLosses.length,
        },
        generatedAt: new Date().toISOString(),
    };
};

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
    }, 15 * 60 * 1000);

    setInterval(async () => {
        if (!exitPipelineRunning) {
            await runExitAndLearningPipeline('REALTIME_FAST_MONITOR', {}, true);
        }
    }, 30 * 1000);

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