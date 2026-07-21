import chalk from 'chalk';
import AutoTrade from '../../models/AutoTrade.js';
import UserOrder from '../../models/UserOrder.js';
import AiBehavior from '../../models/AiBehavior.js';
import Setting from '../../models/Setting.js';
import ExchangeOrder from '../../models/ExchangeOrder.js';
import ExchangeConnection from '../../models/ExchangeConnection.js';
import Stock from '../../models/Stock.js';
import DerivNews from '../../models/DerivNews.js';
import { generateWithRole } from './multiProviderRouter.js';
import { parseLlmJson } from '../utils/parseLlmJson.js';
import {
    buildVnStockScanUniverse,
    buildCryptoScanUniverse,
    getCryptoTradeContext,
    getDerivativesTradeContext,
    getVnMarketContext,
    buildVnMacroSnapshot,
    getCryptoMacroContext,
    resolveAssetMacro,
    getMacroContextForTrade,
    CRYPTO_VN_CROSS_BIAS,
    CONTEXT_BIAS_MAX,
} from './tradeContextService.js';
import {
    buildAutoTradeCloseMessage,
    buildAutoTradeOpenMessage,
    buildMarketRadarMessage,
    buildVolatilityAlertMessage,
    buildVolatilityDigestMessage,
    buildDailyPnLReportMessage,
    buildCheckDashboardMessage,
    buildLiveDetailMessage,
    buildSimDetailMessage,
    buildMarketOverviewMessage,
    buildStatsMessage,
    buildFunnelMessage,
    buildInsightMessage,
    buildHealthMessage,
    buildSettingsMessage,
    buildAiLessonsMessage,
    buildBrokerStatusMessage,
    buildTodayPnLMessage,
    buildPortfolioMessage,
    buildSymbolInfoMessage,
    buildHelpMessage,
    sendTelegramMessage,
    escapeHtml,
} from './telegramService.js';
import { getSymbolInfo } from './symbolInfoService.js';
import axios from 'axios';
import { executeLiveEntry, executeLiveExit, executeLivePartialExit, computeLivePnlFromExchangeOrders } from './exchangeBrokerService.js';
import { createManualTrade, closeManualTrade, listOpenManualTrades, monitorManualTrades } from './manualTradeService.js';
import {
    getTradeAnalytics,
    computeExpectancyStats,
    getUnifiedTradeAnalytics,
    getTodayClosedTradesSummary,
    summarizeAnalytics,
} from './tradeAnalyticsService.js';
import {
    calculatePositionSize,
    canAcceptNewTrade,
    getEffectivePortfolioCapital,
    getMatchedAllocations,
    getMatchedRealizedPnl,
    recordAllocation,
    recordUnmatchedAllocation,
    releaseAllocation,
} from './portfolioManager.js';
import {
    detectEntrySetup,
    applyQualityToSignal,
    passesLiveQuantGate,
    passesSimQuantGate,
    IDLE_PROBE_SETUP_WHITELIST,
} from './entrySetupEngine.js';
import {
    buildTestnetGateContext,
    checkTestnetSymbolForPipeline,
    filterSymbolsForTestnetUniverse,
    isSymbolTradableOnConnection,
} from './testnetSymbolGate.js';
import {
    createFunnelTracker,
    pushFunnelSummary,
    getLatestFunnel,
} from './tradeFunnelService.js';
import { appendAuditEvent, getAuditStatus } from './auditLogService.js';
import { getPipelineLogs } from './pipelineLogService.js';
import { getRateLimitStatus } from './multiProviderRouter.js';
import { getTodayInsight, getCachedMarketInsight } from './marketInsightService.js';

// ── CONSTANTS & HELPERS

const ENTRADE_BASE = 'https://services.entrade.com.vn/chart-api/v2/ohlcs';
const REVERSAL_EXIT_THRESHOLD = 70;
const AI_OVERRIDE_SCORE_THRESHOLD = 85;

// ── EXIT POLICY E (partial scale-out) — tham số rút ra từ backtest klines giá thật ──
// SIM: giữ cấu hình backtest. LIVE: R:R thực tế cao hơn (ít partial sớm, TP1 xa hơn, trail chặt hơn).
const EXIT_POLICY_SIM = {
    CRYPTO:      { tp1Fraction: 0.6, tp1AtrMult: 1.5, chandelierMult: 3.0, breakevenFeePct: 0 },
    VN_STOCK:    { tp1Fraction: 0.5, tp1AtrMult: 1.2, chandelierMult: 3.0, breakevenFeePct: 0 },
    DERIVATIVES: { tp1Fraction: 0.5, tp1AtrMult: 1.2, chandelierMult: 3.0, breakevenFeePct: 0 },
};
const EXIT_POLICY_LIVE = {
    CRYPTO:      { tp1Fraction: 0.45, tp1AtrMult: 1.7, chandelierMult: 2.25, breakevenFeePct: 0.002 },
    VN_STOCK:    { tp1Fraction: 0.5, tp1AtrMult: 1.2, chandelierMult: 3.0, breakevenFeePct: 0.004 },
    DERIVATIVES: { tp1Fraction: 0.5, tp1AtrMult: 1.2, chandelierMult: 3.0, breakevenFeePct: 0.001 },
};

/** @returns {{ tp1Fraction, tp1AtrMult, chandelierMult, breakevenFeePct }} */
export const getExitPolicyParams = (executionMode = 'SIMULATED', assetType = 'CRYPTO') => {
    const table = executionMode === 'LIVE' ? EXIT_POLICY_LIVE : EXIT_POLICY_SIM;
    return table[assetType] || table.CRYPTO;
};

// Legacy aliases (tests / exports)
const EXIT_TP1_FRACTION = Object.fromEntries(
    Object.entries(EXIT_POLICY_SIM).map(([k, v]) => [k, v.tp1Fraction])
);
const EXIT_TP1_ATR_MULT = Object.fromEntries(
    Object.entries(EXIT_POLICY_SIM).map(([k, v]) => [k, v.tp1AtrMult])
);
const CHANDELIER_ATR_MULT = Object.fromEntries(
    Object.entries(EXIT_POLICY_SIM).map(([k, v]) => [k, v.chandelierMult])
);

/** Cập nhật TP1 theo policy SIM/LIVE sau khi rebase entry từ fill sàn. */
export const applyExitPolicyToTrade = (trade, executionMode = 'SIMULATED') => {
    const policy = getExitPolicyParams(executionMode, trade.assetType);
    const isLong = trade.direction === 'LONG' || trade.direction === 'MUA';
    const atr = Number(trade.entryAtr) > 0
        ? Number(trade.entryAtr)
        : (Math.abs(trade.takeProfitPrice - trade.entryPrice) / 3) || (trade.entryPrice * 0.02);
    trade.tp1Fraction = policy.tp1Fraction;
    trade.takeProfit1Price = roundAssetPrice(isLong
        ? trade.entryPrice + atr * policy.tp1AtrMult
        : trade.entryPrice - atr * policy.tp1AtrMult, trade.assetType);
};

/** Làm tròn giá crypto theo bậc giá (tránh 0.29669999999999996 trong log/DB). */
export const roundCryptoPrice = (price) => {
    const n = Number(price);
    if (!Number.isFinite(n)) return price;
    if (n >= 1000) return Math.round(n * 100) / 100;
    if (n >= 1) return Math.round(n * 10_000) / 10_000;
    return Math.round(n * 1_000_000) / 1_000_000;
};

const roundAssetPrice = (price, assetType) => {
    if (assetType === 'VN_STOCK') return Math.round(price * 20) / 20;
    if (assetType === 'DERIVATIVES') return Math.round(price * 10) / 10;
    if (assetType === 'CRYPTO') return roundCryptoPrice(price);
    return price;
};

let autoTradePipelineRunning = false;
let autoTradeManuallyStopped = false;
let exitPipelineRunning = false;
const volatilityAlertCooldown = new Map();
/** Buffer cảnh báo trong 1 chu kỳ pipeline → gửi 1 tin digest, tránh spam. */
const volatilityAlertBuffer = [];
const VOL_ALERT_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3h / mã
const VOL_DIGEST_MAX_ITEMS = 12;

const IDLE_FAST_SCAN_INTERVAL_MS = Number(process.env.AUTODUCK_IDLE_FAST_SCAN_MS) || 3 * 60 * 1000;
const IDLE_RELAX_TARGETS = (process.env.AUTODUCK_IDLE_RELAX_TARGETS || '1,3,5')
    .split(',')
    .map(v => Number(v.trim()))
    .filter(v => Number.isFinite(v) && v > 0);
const IDLE_RELAX_STEP_SCORE = Number(process.env.AUTODUCK_IDLE_RELAX_STEP_SCORE) || 3;
const IDLE_RELAX_MAX_SCORE = Number(process.env.AUTODUCK_IDLE_RELAX_MAX_SCORE) || 6;
const IDLE_RELAX_MAX_ATTEMPTS = Number(process.env.AUTODUCK_IDLE_RELAX_MAX_ATTEMPTS) || 4;
const IDLE_MIN_SIM_SCORE = Number(process.env.AUTODUCK_IDLE_MIN_SIM_SCORE) || 68;
const IDLE_MIN_LIVE_SCORE = Number(process.env.AUTODUCK_IDLE_MIN_LIVE_SCORE) || 80;
const IDLE_AI_PROBE_ENABLED = process.env.AUTODUCK_IDLE_AI_PROBE_ENABLED !== 'false';
const IDLE_AI_PROBE_LIVE = process.env.AUTODUCK_IDLE_AI_PROBE_LIVE === 'true';
const IDLE_AI_PROBE_MIN_SCORE = Number(process.env.AUTODUCK_IDLE_AI_PROBE_MIN_SCORE) || 78;
const IDLE_AI_PROBE_SIZE_MULT = Number(process.env.AUTODUCK_IDLE_AI_PROBE_SIZE_MULT) || 0.45;

const idleScanState = {
    attempts: 0,
    lastOpenCount: 0,
};

const resetIdleScanState = (reason = '') => {
    if (idleScanState.attempts > 0) {
        console.log(chalk.gray(`[AUTODUCK IDLE] Reset idle scan${reason ? `: ${reason}` : ''}.`));
    }
    idleScanState.attempts = 0;
};

const pickIdleTarget = (maxConcurrentTrades = 10) => {
    const cap = Number(maxConcurrentTrades) || 10;
    const eligible = IDLE_RELAX_TARGETS.filter(t => t <= cap);
    return eligible.length ? Math.max(...eligible) : 1;
};

const countLiveOrdersWaiting = (asset) => UserOrder.countDocuments({
    status: { $in: ['PENDING', 'ACTIVE'] },
    executionMode: 'LIVE',
    $or: [{ assetType: 'ALL' }, { assetType: asset }],
});

const isAutoFuturesShortEnabled = async () => {
    const flag = await Setting.findOne({ key: 'autoFuturesShortEnabled' });
    const dbEnabled = Boolean(flag && (flag.value === true || flag.value === 'true' || flag.value === 1));
    const envEnabled = process.env.AUTODUCK_AUTO_FUTURES_SHORT_ENABLED === 'true';
    return dbEnabled || envEnabled;
};

export const rebaseTradeLevelsFromFill = (trade, filledPrice) => {
    const fill = Number(filledPrice);
    const oldEntry = Number(trade.entryPrice);
    if (!Number.isFinite(fill) || !Number.isFinite(oldEntry) || oldEntry <= 0) return;
    const isLong = trade.direction === 'LONG' || trade.direction === 'MUA';
    const roundPrice = (p) => roundAssetPrice(p, trade.assetType);
    const tp1D = Math.abs(Number(trade.takeProfit1Price) - oldEntry);
    const tpD = Math.abs(Number(trade.takeProfitPrice) - oldEntry);
    const slD = Math.abs(Number(trade.stopLossPrice) - oldEntry);
    trade.entryPrice = fill;
    if (tp1D > 0) {
        trade.takeProfit1Price = roundPrice(isLong ? fill + tp1D : fill - tp1D);
    }
    if (tpD > 0) {
        trade.takeProfitPrice = roundPrice(isLong ? fill + tpD : fill - tpD);
    }
    if (slD > 0) {
        trade.stopLossPrice = roundPrice(isLong ? fill - slD : fill + slD);
    }
    trade.peakPrice = fill;
};

// ── NEWS CACHE
// Crypto news được fetch từ Google News RSS mỗi lần scan → nếu universe có 50 coin
// và pipeline chạy mỗi 15 phút thì sẽ có ~200 request/giờ ra Google News, dễ bị rate-limit.
// Cache 30 phút per symbol để tái sử dụng kết quả giữa các chu kỳ scan.
const cryptoNewsCacheMap = new Map(); // symbol → { data: NewsContext, fetchedAt: number }
const CRYPTO_NEWS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 phút

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
            allocationMultiplier: 0.6, trailingActivation: 0.30,
            prompt: `CHIẾN LƯỢC (THẬN TRỌNG – LEVEL 1):
Mục tiêu ưu tiên là bảo toàn vốn. Yêu cầu ít nhất 3 trong 4 điều kiện đồng thuận: xu hướng EMA rõ, MACD dương, volume surge xác nhận, không có phân phối đỉnh rõ ràng.
Nếu score kỹ thuật >= 72 VÀ edge >= 25 VÀ không có tín hiệu phân phối rõ → XÁC NHẬN.
Nếu score >= 72 nhưng có 1 điểm yếu nhỏ về technical → vẫn có thể XÁC NHẬN nếu news/context hỗ trợ.
Chỉ BÁC BỎ khi: (1) score < 72, hoặc (2) có tín hiệu phân phối/đảo chiều rõ ràng trên nhiều chỉ báo, hoặc (3) vĩ mô bearish mạnh kết hợp volume bán ròng.`
        };
        case 2: return {
            level: 2, name: 'CÂN BẰNG (BALANCED)',
            scoreThreshold: 80, edge: 25,
            volSurge: { VN_STOCK: 1.4, CRYPTO: 1.5, DERIVATIVES: 1.1 },
            maxRisk: { VN_STOCK: 0.055, CRYPTO: 0.04, DERIVATIVES: 0.025 },
            allocationMultiplier: 1.0, trailingActivation: 0.40,
            prompt: `CHIẾN LƯỢC (CÂN BẰNG – LEVEL 2):
Mục tiêu tối ưu Risk/Reward. Đánh giá khách quan kết hợp kỹ thuật, dòng tiền và vĩ mô.
Nếu score >= 80 VÀ edge >= 25 → XÁC NHẬN, trừ khi có mâu thuẫn tín hiệu rõ ràng (ví dụ: trend tăng nhưng OBV giảm mạnh + news rất tiêu cực).
Một hoặc hai điểm yếu nhỏ về indicator phụ (ví dụ VWAP dưới nhẹ, StochRSI chưa lý tưởng) không phải lý do BÁC BỎ nếu tín hiệu chính (EMA, MACD, volume) đang ủng hộ.
BÁC BỎ khi: tín hiệu kỹ thuật chính mâu thuẫn nhau, hoặc context thị trường bearish rõ rệt.`
        };
        case 3: return {
            level: 3, name: 'CHUYÊN GIA (EXPERT)',
            scoreThreshold: 64, edge: 15,
            volSurge: { VN_STOCK: 1.1, CRYPTO: 1.3, DERIVATIVES: 0.9 },
            maxRisk: { VN_STOCK: 0.07, CRYPTO: 0.05, DERIVATIVES: 0.035 },
            allocationMultiplier: 1.3, trailingActivation: 0.50,
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
            allocationMultiplier: 1.6, trailingActivation: 0.55,
            prompt: `CHIẾN LƯỢC (DEGEN – LEVEL 4 – HIGH RISK):
Mục tiêu tối đa hóa lợi nhuận. Score >= 60 với edge >= 10 là đủ điều kiện kỹ thuật — MẶC ĐỊNH XÁC NHẬN nếu không có lý do BÁC BỎ rõ ràng.
Rủi ro là chi phí của cơ hội. Chấp nhận: volume surge thấp, trend chưa hoàn toàn rõ, một vài chỉ báo phụ chưa lý tưởng.
Không BÁC BỎ vì: ADX thấp, VWAP chưa đẹp, StochRSI chưa oversold/overbought lý tưởng, news trung tính.
Chỉ BÁC BỎ khi CÓ ÍT NHẤT 2 TRONG 3: (1) Phân phối đỉnh rõ trong dài hạn (nhiều nến đỏ volume lớn tại vùng kháng cự), (2) Toàn bộ EMA+MACD+Ichimoku đều ngược chiều lệnh, (3) News cực kỳ tiêu cực có xác nhận từ nhiều nguồn.`
        };
        default: return {
            level: 2, name: 'CÂN BẰNG (BALANCED)',
            scoreThreshold: 80, edge: 25,
            volSurge: { VN_STOCK: 1.4, CRYPTO: 1.5, DERIVATIVES: 1.1 },
            maxRisk: { VN_STOCK: 0.055, CRYPTO: 0.04, DERIVATIVES: 0.025 },
            allocationMultiplier: 1.0, trailingActivation: 0.40,
            prompt: `CHIẾN LƯỢC (CÂN BẰNG – LEVEL 2):
Mục tiêu tối ưu Risk/Reward. Đánh giá khách quan kết hợp kỹ thuật, dòng tiền và vĩ mô.
Nếu score >= 80 VÀ edge >= 25 → XÁC NHẬN, trừ khi có mâu thuẫn tín hiệu rõ ràng.
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

export const fetchRealtimeQuote = async (symbol, assetType) => {
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

const summarizeNewsItems = async (items = []) => {
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
    // ── FIX: Cache 30 phút per symbol — tránh gọi Google News RSS lặp lại
    // mỗi chu kỳ scan với 50 coin (~200 req/giờ trước đây)
    const cached = cryptoNewsCacheMap.get(symbol);
    if (cached && Date.now() - cached.fetchedAt < CRYPTO_NEWS_CACHE_TTL_MS) {
        console.log(chalk.gray(`[NEWS] Cache hit crypto news: ${symbol} (còn ${Math.round((CRYPTO_NEWS_CACHE_TTL_MS - (Date.now() - cached.fetchedAt)) / 60000)}p)`));
        return cached.data;
    }

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
        // Nếu fetch lỗi nhưng có cache cũ (dù hết hạn) → vẫn dùng cache cũ thay vì trả về rỗng
        if (cached) {
            console.log(chalk.yellow(`[NEWS] Dùng lại crypto news cache cũ cho ${symbol} do lỗi fetch`));
            return cached.data;
        }
    }

    const result = await summarizeNewsItems(items);
    // Chỉ lưu cache khi fetch thành công (có items)
    if (items.length > 0) {
        cryptoNewsCacheMap.set(symbol, { data: result, fetchedAt: Date.now() });
    }
    return result;
};

const getNewsContextForAsset = async (asset, symbol) => {
    try {
        if (asset === 'VN_STOCK') {
            const stock = await Stock.findOne(
                { symbol },
                { deepNewsData: { $slice: -10 }, deepNewsFetchedAt: 1, deepNewsPrefetchedAt: 1 }
            ).lean();
            const newsItems = (stock?.deepNewsData || []).slice().reverse();

            if (newsItems.length === 0) {
                console.log(chalk.gray(`[NEWS] ${symbol}: không có deepNewsData trong DB`));
            } else if (!stock?.deepNewsFetchedAt) {
                const prefetchNote = stock?.deepNewsPrefetchedAt ? ' — chỉ prefetch headline, chưa cào body' : '';
                console.log(chalk.yellow(`[NEWS] ⚠️ ${symbol}: có ${newsItems.length} tin nhưng chưa có deepNewsFetchedAt${prefetchNote}`));
            } else {
                const fetchAgeHours = (Date.now() - new Date(stock.deepNewsFetchedAt).getTime()) / 3_600_000;
                const inSession = isPreMarket() || isVNMarketOpen() || isATOPeriod() || isATCPeriod();
                const ttlHours = inSession ? 1 : 6;
                if (fetchAgeHours > ttlHours) {
                    console.log(chalk.yellow(
                        `[NEWS] ⚠️ ${symbol}: cache tin ${fetchAgeHours.toFixed(1)}h > TTL ${ttlHours}h — prefetch có thể chậm`
                    ));
                }
            }

            return await summarizeNewsItems(newsItems);
        }

        if (asset === 'DERIVATIVES') {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const news = await DerivNews.find({ timestamp: { $gte: thirtyDaysAgo } })
                .sort({ timestamp: -1 })
                .limit(10)
                .lean();
            return await summarizeNewsItems(news);
        }

        if (asset === 'CRYPTO') return fetchCryptoNewsContext(symbol);
    } catch (err) {
        console.log(chalk.gray(`[NEWS] Không lấy được news context cho ${asset}/${symbol}: ${err.message}`));
    }

    return await summarizeNewsItems([]);
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
    // Dùng nến vừa ĐÓNG (volumes[-2]), KHÔNG dùng nến hiện tại đang hình thành (volumes[-1]):
    // nến live mới tích một phần volume → surge bị tính thấp giả tạo, lọc oan setup volume cao.
    if (volumes.length < 3) return 1;
    const last = volumes[volumes.length - 2];
    const baseline = volumes.slice(-22, -2);
    if (!baseline.length) return 1;
    const avg = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    if (avg === 0) return 1;
    return last / avg;
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

const calcVIDYA = (closes, period = 9) => {
    if (closes.length < period + 1) return null;
    const alpha = 2 / (period + 1);
    let startIndex = Math.max(1, closes.length - period * 4);
    let vidya = closes[startIndex - 1];
    
    for (let i = startIndex; i < closes.length; i++) {
        let stepUp = 0;
        let stepDown = 0;
        const cmoStart = Math.max(1, i - period + 1);
        for (let j = cmoStart; j <= i; j++) {
            const diff = closes[j] - closes[j - 1];
            if (diff > 0) stepUp += diff;
            else stepDown -= diff;
        }
        const stepCmo = (stepUp + stepDown) === 0 ? 0 : Math.abs((stepUp - stepDown) / (stepUp + stepDown));
        const stepWeight = alpha * stepCmo;
        vidya = stepWeight * closes[i] + (1 - stepWeight) * vidya;
    }
    return vidya;
};

const calcTwoPoleSuperSmoother = (closes, period = 15) => {
    if (closes.length < 3) return null;
    const a1 = Math.exp(-Math.SQRT2 * Math.PI / period);
    const b1 = 2 * a1 * Math.cos(Math.SQRT2 * Math.PI / period);
    const c2 = b1;
    const c3 = -a1 * a1;
    const c1 = 1 - c2 - c3;
    
    const ss = [closes[0], closes[1]];
    for (let i = 2; i < closes.length; i++) {
        ss[i] = c1 * (closes[i] + closes[i-1]) / 2 + c2 * ss[i-1] + c3 * ss[i-2];
    }
    return ss[ss.length - 1];
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

    let volumeDeltaPct = 0;
    if (candles.length > 2 && candles[candles.length - 2].takerBuyVolume !== undefined) {
        const lastTakerBuy = candles[candles.length - 2].takerBuyVolume || 0;
        const lastVol = volumes[volumes.length - 2] || 1;
        const takerSell = lastVol - lastTakerBuy;
        volumeDeltaPct = ((lastTakerBuy - takerSell) / lastVol) * 100;
    }

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
    const vidya  = calcVIDYA(closes, 9);
    const twoPole = calcTwoPoleSuperSmoother(closes, 15);

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

    let volumeLong  = isAccumulation ? volumeConfirm
                      : isDistribution ? Math.max(20, 100 - volumeConfirm)
                      : (candleBias === 'LONG' ? volumeConfirm : Math.max(25, 100 - volumeConfirm));
    let volumeShort = isDistribution ? volumeConfirm
                      : isAccumulation ? Math.max(20, 100 - volumeConfirm)
                      : (candleBias === 'SHORT' ? volumeConfirm : Math.max(25, 100 - volumeConfirm));

    if (volumeDeltaPct > 20) { volumeLong += 15; volumeShort -= 15; }
    else if (volumeDeltaPct < -20) { volumeShort += 15; volumeLong -= 15; }
    volumeLong = Math.max(0, Math.min(100, volumeLong));
    volumeShort = Math.max(0, Math.min(100, volumeShort));

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
        obvTrend: obv.obvTrend,
        vwap: vwap,
        bollinger: boll,
        vidya: vidya,
        twoPole: twoPole,
        volumeSurge: Math.round(volSurge * 100) / 100,
        volumeDeltaPct: Math.round(volumeDeltaPct * 100) / 100,
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

    const roundPrice = (price) => roundAssetPrice(price, asset);

    const entryPrice = roundPrice(Number(quote.price));
    const atr = techSignal.atr || entryPrice * 0.02;
    
    const volPct = (atr / entryPrice) * 100;

    // Chặn tài sản gần như không biến động (stablecoin USDE/FRAX/TUSD..., coin chết):
    // ATR/giá quá thấp → TP/SL nằm trong vùng nhiễu, ăn không đủ bù phí 0.2% → chỉ churn lỗ.
    if (asset === 'CRYPTO' && volPct < 0.6) {
        return null;
    }

    let adaptiveScale = 1.0;
    if (volPct > 5) adaptiveScale = 1.3;
    else if (volPct < 1.5) adaptiveScale = 0.8;

    // ── TP2 (runner) / SL theo Policy E ──
    // Crypto: TP2 4.0→3.0 (gần hơn, dễ đạt), SL giữ 2.0. Phần lời chính đến từ TP1 + để runner chạy.
    let atrMultiplierTP, atrMultiplierSL;
    if (asset === 'VN_STOCK') {
        atrMultiplierTP = 2.5 * adaptiveScale;
        atrMultiplierSL = 1.5 * adaptiveScale;
    } else {
        atrMultiplierTP = (asset === 'CRYPTO' ? 3.0 : (asset === 'DERIVATIVES' ? 2.5 : 2.5)) * adaptiveScale;
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

    // ── TP1 (chốt lời từng phần) — SIM dùng mốc gần; LIVE override qua applyExitPolicyToTrade ──
    const simPolicy = getExitPolicyParams('SIMULATED', asset);
    const tp1AtrMult = simPolicy.tp1AtrMult * adaptiveScale;
    const takeProfit1Price = roundPrice(isLong
        ? entryPrice + atr * tp1AtrMult
        : entryPrice - atr * tp1AtrMult);
    const tp1Fraction = simPolicy.tp1Fraction;

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
        takeProfit1Price,
        tp1Fraction,
        rewardPct,
        riskPct,
        atr,
    };
};

const applyExecutionContextBias = (signal, asset, context = {}, customScoreThreshold = null, config = getRiskConfig(2), vnMacroCross = null) => {
    if (!signal?.breakdown || signal.direction === 'NEUTRAL') return signal;

    let longBias = 0;
    let shortBias = 0;
    let vnCrossLong = 0;
    let vnCrossShort = 0;
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
        const btcTrend = Number(context.btcTrend);
        if (Number.isFinite(btcTrend)) {
            if (btcTrend > 3) { longBias += 3; reasons.push("btc_bull_trend"); }
            else if (btcTrend < -3) { shortBias += 3; reasons.push("btc_bear_trend"); }
        }

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

        // VN macro: ảnh hưởng nhẹ (~±2 điểm bias), không thay thế macro crypto.
        if (CRYPTO_VN_CROSS_BIAS && vnMacroCross?.statusType === 'bearish') {
            vnCrossShort += 2;
            reasons.push('vn_macro_cross_risk_off');
        } else if (CRYPTO_VN_CROSS_BIAS && vnMacroCross?.statusType === 'bullish') {
            vnCrossLong += 1;
            reasons.push('vn_macro_cross_risk_on');
        } else if (CRYPTO_VN_CROSS_BIAS && vnMacroCross?.statusType === 'warning') {
            vnCrossShort += 1;
            reasons.push('vn_macro_cross_caution');
        }
        longBias += vnCrossLong;
        shortBias += vnCrossShort;
    }

    if (asset === 'DERIVATIVES') {
        const basis = Number(context.basis);
        const changePct = Number(context.changePct);
        const topMovers = context.topMovers || {};
        if (topMovers.VIC > 2 || topMovers.FPT > 2 || topMovers.VCB > 2 || topMovers.HPG > 2) { longBias += 3; reasons.push("bluechip_pulling_up"); }
        else if (topMovers.VIC < -2 || topMovers.FPT < -2 || topMovers.VCB < -2 || topMovers.HPG < -2) { shortBias += 3; reasons.push("bluechip_dragging_down"); }
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

        if (context.stockData && context.stockData.tcbs && context.stockData.tcbs.foreignBuy) {
            const foreignNet = context.stockData.tcbs.foreignBuy - (context.stockData.tcbs.foreignSell || 0);
            if (foreignNet > 10000000000) { longBias += 4; reasons.push("foreign_net_buy_strong"); }
        }
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

    const capBias = (n) => Math.min(CONTEXT_BIAS_MAX, Math.max(0, n));
    const cappedLong = capBias(longBias);
    const cappedShort = capBias(shortBias);

    const longScore = Math.max(0, Math.min(100, (signal.breakdown.longScore || 0) + cappedLong));
    const shortScore = Math.max(0, Math.min(100, (signal.breakdown.shortScore || 0) + cappedShort));
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
            contextLongBias: cappedLong,
            contextShortBias: cappedShort,
            contextBiasReasons: reasons,
            vnCrossLongBias: vnCrossLong,
            vnCrossShortBias: vnCrossShort,
        },
    };
};

const buildBiasLedger = (signal, assetMacro, vnMacroCross = null) => {
    const b = signal?.breakdown || {};
    const contextLong = Number(b.contextLongBias) || 0;
    const contextShort = Number(b.contextShortBias) || 0;
    const vnLong = Number(b.vnCrossLongBias) || 0;
    const vnShort = Number(b.vnCrossShortBias) || 0;
    return {
        macro: {
            breadth: assetMacro?.breadthRatio ?? 50,
            statusType: assetMacro?.statusType ?? 'neutral',
            deltaLong: 0,
            deltaShort: 0,
            embeddedInTechnical: true,
        },
        context: {
            reasons: b.contextBiasReasons || [],
            deltaLong: contextLong,
            deltaShort: contextShort,
        },
        vnCross: {
            enabled: CRYPTO_VN_CROSS_BIAS,
            statusType: vnMacroCross?.statusType ?? null,
            deltaLong: vnLong,
            deltaShort: vnShort,
        },
        totalDeltaLong: contextLong,
        totalDeltaShort: contextShort,
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

// ── HYBRID ENTRY FILTER (đa khung + anti-chase + trend/mean-reversion) ──
// Bằng chứng thực tế: crypto long-only thua 29% WR vì (a) long ngược xu hướng khung lớn,
// (b) mua đỉnh nhịp pump. Bộ lọc này chặn 2 lỗi đó và chỉ cho vào khi có setup rõ.

/** Xu hướng khung 1h cho crypto: UP / DOWN / NEUTRAL (EMA20 vs EMA50 + vị trí giá). */
const getCryptoHtfTrend = async (symbol) => {
    try {
        const c = await fetchCryptoOHLCV(symbol, '1h', 120);
        const closes = c.map(x => x.close);
        const ema20 = calcEMA(closes, 20);
        const ema50 = calcEMA(closes, 50);
        if (!ema20 || !ema50) return 'NEUTRAL';
        const price = closes[closes.length - 1];
        if (ema20 > ema50 && price > ema50) return 'UP';
        if (ema20 < ema50 && price < ema50) return 'DOWN';
        return 'NEUTRAL';
    } catch (_) {
        return 'NEUTRAL';
    }
};

// ── AI SIGNAL CONFIRMATION

const compactContextForPrompt = (context = {}) => {
    if (!context || Object.keys(context).length === 0) return 'Không có context bổ sung.';

    // ── FIX: Truyền đủ top-3 headlines thay vì chỉ topTitle một dòng
    // Trước đây AI chỉ thấy: "News sentiment: positive | score 2 | [topTitle]"
    // Nếu topTitle là tin cũ/ít liên quan, AI mất toàn bộ thông tin tin tức còn lại
    const buildNewsBlock = (news) => {
        if (!news) return '';
        const headlineLines = (news.items || [])
            .slice(0, 3)
            .map((n, i) => `  ${i + 1}. [${n.sentiment}] ${n.title}`)
            .join('\n');
        const base = `\nNews: ${news.bias || 'neutral'} | score ${news.sentimentScore ?? 0} | +${news.counts?.positive ?? 0}/-${news.counts?.negative ?? 0}/=${news.counts?.neutral ?? 0}`;
        return headlineLines ? `${base}\n${headlineLines}` : base;
    };

    const newsBlock = buildNewsBlock(context.news);

    if (context.orderbook || context.derivatives) {
        return [
            `Nguồn: ${context.source || 'N/A'}`,
            `24h change: ${Number(context.change24h || 0).toFixed(2)}%`,
            `Orderbook bid/ask: ${context.orderbook?.bidPct ?? 'N/A'}%/${context.orderbook?.askPct ?? 'N/A'}% | ratio ${context.orderbook?.ratio ?? 'N/A'} | spread ${context.orderbook?.spread ?? 'N/A'}`,
            `Funding: ${Number(context.derivatives?.fundingRatePct || 0).toFixed(4)}% | OI: ${context.derivatives?.openInterest || 'N/A'} | Long/Short: ${context.derivatives?.longShortRatio || 'N/A'}`,
        ].join('\n') + newsBlock;
    }

    if (context.vn30f1m || context.basis !== undefined) {
        return [
            `Nguồn: ${context.source || 'N/A'}`,
            `VN30F1M: ${context.vn30f1m || 'N/A'} | VN30: ${context.vn30 || 'N/A'} | Basis: ${context.basis ?? 'N/A'}`,
            `Change: ${context.changePct ?? 'N/A'}% | Volume: ${context.volume || 'N/A'} | OI: ${context.oi || 'N/A'} (${context.oiTrend || 'N/A'}) | Foreign net: ${context.foreignNet || 'N/A'}`,
        ].join('\n') + newsBlock;
    }

    return `Nguồn: ${context.source || 'N/A'} | fetchedAt: ${context.fetchedAt || 'N/A'}${newsBlock}`;
};

export const parseAIVerdictJson = (response = '') => {
    try {
        const parsed = parseLlmJson(response);
        if (!parsed) return null;
        const verdict = String(parsed.verdict || '').toUpperCase();
        return {
            confirmed: verdict === 'CONFIRM',
            vetoed: verdict === 'VETO',
            hardVeto: parsed.hardVeto === true,
            confidence: Number(parsed.confidence) || 0,
            reason: String(parsed.reason || response).trim(),
        };
    } catch {
        return null;
    }
};

const aiRoleForAsset = (asset) => {
    if (asset === 'CRYPTO') return 'crypto';
    if (asset === 'DERIVATIVES') return 'derivatives';
    return 'main';
};

export const parseAISignalVerdict = (response = '') => {
    const text = String(response || '').trim().normalize('NFC');
    if (!text) return false;

    const verdictPattern = /(?:^|[\s*_`"'“”.,:;!?()[\]{}-])(XÁC\s+NHẬN|BÁC\s+BỎ)(?=$|[\s*_`"'“”.,:;!?()[\]{}-])/giu;
    const verdicts = [...text.matchAll(verdictPattern)].map(match => match[1].toUpperCase().replace(/\s+/g, ' '));
    if (verdicts.length > 0) {
        return verdicts[verdicts.length - 1] === 'XÁC NHẬN';
    }

    return false;
};

export const isHardAIRejection = (response = '') => {
    const text = String(response || '').toLowerCase().normalize('NFC');
    const hardPatterns = [
        /mâu thuẫn nghiêm trọng/,
        /ngược xu hướng/,
        /đảo chiều (mạnh|rõ|rõ ràng)/,
        /fake breakout/,
        /short squeeze/,
        /phân phối/,
        /tin tức.*(tiêu cực|bất lợi)/,
        /orderbook.*(nghiêng hẳn|áp đảo).*(bán|ngược)/,
        /funding.*(quá cao|bất lợi|crowded)/,
        /rủi ro (đảo chiều|ngược xu hướng|squeeze)/,
    ];
    return hardPatterns.some(pattern => pattern.test(text));
};

const buildIdleProbeInstruction = (options = {}) => {
    if (options.schedulerMode !== 'IDLE_FAST') return '';
    const threshold = Number(options.effectiveThreshold) || IDLE_AI_PROBE_MIN_SCORE;
    return `\n[CHẾ ĐỘ IDLE PROBE]\nHệ thống đang không có đủ lệnh mở nên đang quét nhanh với ngưỡng kỹ thuật đã nới về ${threshold}. Đây KHÔNG phải lệnh all-in; nếu được duyệt, engine sẽ giảm size và vẫn giữ SL/TP theo ATR. Với tín hiệu đã qua lọc volume, setup đa khung và risk filter, hãy XÁC NHẬN nếu rủi ro chỉ là \"thị trường đi ngang\", \"thiếu xác nhận phụ\", hoặc \"score chưa tới 80\". Chỉ BÁC BỎ khi có veto cứng: ngược xu hướng khung lớn, fake breakout rõ, short squeeze/crowded positioning, phân phối/đảo chiều mạnh, tin tức tiêu cực mạnh, hoặc orderbook/funding chống lại hướng lệnh.`;
};

const shouldIdleProbeOverrideAI = ({ asset, signal, aiConfirm, schedulerMode, liveOnlyMode, hasLiveUserOrderWaiting, entrySetup }) => {
    if (!IDLE_AI_PROBE_ENABLED || IDLE_AI_PROBE_LIVE || schedulerMode !== 'IDLE_FAST' || liveOnlyMode || asset !== 'CRYPTO') return false;
    if (hasLiveUserOrderWaiting) return false;
    if (aiConfirm?.confirmed || aiConfirm?.hardVeto || isHardAIRejection(aiConfirm?.reason)) return false;
    if (!IDLE_PROBE_SETUP_WHITELIST.has(entrySetup?.type)) return false;
    if ((signal?.breakdown?.qualityScore ?? signal?.score ?? 0) < IDLE_AI_PROBE_MIN_SCORE) return false;
    if ((signal?.breakdown?.edge || 0) < 25) return false;
    return true;
};

const getAISignalConfirmation = async (asset, signal, marketStatus, diagnosticDesc, executionContext = {}, config = getRiskConfig(2), options = {}) => {
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
        const entrySetupType = options.entrySetup?.type || signal.breakdown?.entrySetup || 'N/A';
        const qualityScore = signal.breakdown?.qualityScore ?? signal.score;
        const confluenceScore = signal.breakdown?.confluenceScore ?? 'N/A';
        const contextReasons = (signal.breakdown?.contextBiasReasons || []).slice(0, 3).join(', ') || 'none';
        const liveVetoMode = options.liveVetoMode === true;

        const scoreBiasInstruction = liveVetoMode
            ? `\nCHẾ ĐỘ LIVE VETO: Tín hiệu đã PASS cổng định lượng (setup=${entrySetupType}, quality=${qualityScore}, confluence=${confluenceScore}). Mặc định CONFIRM. Chỉ trả VETO khi có rủi ro CỨNG: HTF ngược, fake breakout, funding cực đoan, tin cực tiêu cực, orderbook chống hướng lệnh. KHÔNG veto vì thiếu 1-2 chỉ báo phụ.`
            : scoreForBias >= 80
            ? `\nLƯU Ý: qualityScore ${qualityScore}/100 cao. Đánh giá khách quan — chỉ VETO khi mâu thuẫn rõ.`
            : `\nLƯU Ý: qualityScore ${qualityScore}/100. Đánh giá cân bằng điểm mạnh/yếu.`;

        const prompt = `Bạn là chuyên gia phân tích kỹ thuật của hệ thống OMNI DUCK.
Dưới đây là kết quả phân tích kỹ thuật định lượng cho lệnh sắp vào:

[THÔNG TIN TÍN HIỆU]
- Phân khúc: ${asset}
- Mã: ${signal.symbol}
- Entry setup: ${entrySetupType}
- Quality score: ${qualityScore}/100 | Confluence: ${confluenceScore} | Legacy: ${signal.breakdown?.legacyScore ?? signal.score}
- Context bias: ${contextReasons}
- Giá hiện tại: ${signal.entryPrice}
- VWAP: ${signal.vwap ?? 'N/A'}
- Hướng đề xuất: ${signal.direction}
- RSI: ${signal.rsi} | StochRSI K: ${signal.stochRSI?.k ?? 'N/A'}
- ADX: ${signal.adx?.adx ?? 'N/A'} (+DI: ${signal.adx?.pdi ?? 'N/A'} / -DI: ${signal.adx?.mdi ?? 'N/A'})
- Volume Surge: ${signal.volumeSurge}x
- Candle Pattern: ${signal.candlePattern?.pattern ?? 'none'} (strength: ${signal.candlePattern?.strength ?? 0})
- EMA9/21/50: ${signal.ema9?.toFixed(2) || 'N/A'} / ${signal.ema21?.toFixed(2) || 'N/A'} / ${signal.ema50?.toFixed(2) || 'N/A'}
- ATR: ${signal.atr}

${strategyContext}
${scoreBiasInstruction}
${buildIdleProbeInstruction(options)}

[TRẠNG THÁI VĨ MÔ]
- Tình trạng thị trường: ${marketStatus}
- Chẩn đoán: ${diagnosticDesc}

[CONTEXT BỔ SUNG]
${compactContextForPrompt(executionContext)}

[CHI TIẾT ĐIỂM]
- Long/Short: ${signal.breakdown.longScore}/${signal.breakdown.shortScore} | Edge: ${signal.breakdown.edge}
- Setup score: ${signal.breakdown.setupScore ?? 'N/A'}

[LỊCH SỬ GIAO DỊCH GẦN NHẤT (${signal.symbol})]
${lessonContext}

Trả lời JSON duy nhất (không markdown):
{"verdict":"CONFIRM"|"VETO","confidence":0-100,"hardVeto":true|false,"reason":"2-3 câu tiếng Việt"}`;

        const response = await generateWithRole(aiRoleForAsset(asset), prompt, {
            maxTokens: 300,
            temperature: 0.2,
            responseFormat: 'json_object',
        });

        const parsed = parseAIVerdictJson(response);
        let confirmed;
        let hardVeto = false;
        if (parsed) {
            hardVeto = parsed.hardVeto || parsed.vetoed;
            confirmed = liveVetoMode
                ? !parsed.vetoed && !parsed.hardVeto
                : parsed.confirmed;
        } else {
            const legacy = parseAISignalVerdict(response);
            confirmed = liveVetoMode ? legacy !== false : legacy;
            hardVeto = isHardAIRejection(response);
            if (hardVeto) confirmed = false;
        }

        return {
            confirmed,
            hardVeto,
            reason: parsed?.reason || response.trim(),
        };

    } catch (err) {
        console.log(chalk.yellow(`[AI CONFIRM] Không gọi được AI: ${err.message}`));
        if (options.liveVetoMode) {
            return { confirmed: false, hardVeto: false, reason: 'AI không phản hồi — LIVE skip (không auto-confirm).' };
        }
        return {
            confirmed: (signal.breakdown?.qualityScore ?? signal.score) >= 75,
            hardVeto: false,
            reason: 'AI không phản hồi — SIM fallback qualityScore >= 75.',
        };
    }
};

// ── EXIT DECISION (thuần, test được) ──
// Policy E: cập nhật đỉnh (favorable excursion) → chandelier SL (đỉnh − k×ATR) + sàn breakeven
// sau TP1 → quyết định TP2 (đóng hẳn) / SL-trail (đóng hẳn) / TP1 (chốt một phần).
// MUTATES: trade.peakPrice & trade.stopLossPrice. Trả về quyết định cho 1 mức giá hiện tại.
export const evaluateExitDecision = (trade, currentPrice) => {
    const isLong  = trade.direction === 'LONG' || trade.direction === 'MUA';
    const isShort = trade.direction === 'SHORT' || trade.direction === 'BÁN';
    const dir = isLong ? 1 : -1;
    const roundPrice = (p) => roundAssetPrice(p, trade.assetType);
    let trailingUpdated = false;
    let slMoved = false;
    let shouldClose = false;
    let partialFill = false;
    let partialPrice = null;
    let exitReason = '';

    const atrAtEntry = Number(trade.entryAtr) > 0
        ? Number(trade.entryAtr)
        : (Math.abs(trade.takeProfitPrice - trade.entryPrice) / 3) || (trade.entryPrice * 0.01);
    const policy = getExitPolicyParams(trade.executionMode || 'SIMULATED', trade.assetType);
    const chandK = policy.chandelierMult;

    // 1) Đỉnh tiến độ
    const prevPeak = Number.isFinite(trade.peakPrice) ? trade.peakPrice : trade.entryPrice;
    const newPeak = isLong ? Math.max(prevPeak, currentPrice) : Math.min(prevPeak, currentPrice);
    const roundedPeak = roundPrice(newPeak);
    if (roundedPeak !== roundPrice(prevPeak)) {
        trade.peakPrice = roundedPeak;
        trailingUpdated = true;
    }

    // 2) Chandelier + sàn breakeven (sau TP1; LIVE: breakeven + phí)
    // So sánh sau round — tránh spam [TRAIL] khi candSL thô > prevSL nhưng round ra cùng giá.
    const prevSL = roundPrice(Number(trade.stopLossPrice));
    let candSL = trade.peakPrice - dir * chandK * atrAtEntry;
    if (trade.tp1Filled) {
        const feePct = policy.breakevenFeePct || 0;
        const beFloor = isLong
            ? trade.entryPrice * (1 + feePct)
            : trade.entryPrice * (1 - feePct);
        candSL = isLong ? Math.max(candSL, beFloor) : Math.min(candSL, beFloor);
    }
    const roundedCandSL = roundPrice(candSL);
    if (isLong ? roundedCandSL > prevSL : roundedCandSL < prevSL) {
        trade.stopLossPrice = roundedCandSL;
        slMoved = true;
        trailingUpdated = true;
    }

    // 3) Quyết định thoát: TP2 → SL/trail → TP1 (partial)
    const hitTP2 = isLong ? currentPrice >= trade.takeProfitPrice : currentPrice <= trade.takeProfitPrice;
    const hitSL  = isLong ? currentPrice <= trade.stopLossPrice  : currentPrice >= trade.stopLossPrice;
    if (hitTP2) {
        shouldClose = true;
        exitReason  = `TP HIT${isShort ? ' (SHORT)' : ''}: Giá ${currentPrice} chạm mục tiêu ${trade.takeProfitPrice}`;
    } else if (hitSL) {
        shouldClose = true;
        exitReason  = trade.tp1Filled
            ? `TRAIL/BE HIT (bảo vệ lãi sau TP1)${isShort ? ' (SHORT)' : ''}: Giá ${currentPrice} chạm SL BE ${trade.stopLossPrice}`
            : `SL HIT${isShort ? ' (SHORT)' : ''}: Giá ${currentPrice} chạm cắt lỗ ${trade.stopLossPrice}`;
    } else if (!trade.tp1Filled && Number(trade.tp1Fraction) > 0 && Number(trade.takeProfit1Price) > 0) {
        const hitTP1 = isLong ? currentPrice >= trade.takeProfit1Price : currentPrice <= trade.takeProfit1Price;
        if (hitTP1) {
            partialFill  = true;
            partialPrice = currentPrice;
            exitReason   = `TP1 PARTIAL${isShort ? ' (SHORT)' : ''}: Giá ${currentPrice} chạm mốc chốt một phần ${trade.takeProfit1Price}`;
        }
    }
    return { shouldClose, exitReason, trailingUpdated, slMoved, partialFill, partialPrice };
};

// ── REALTIME EXIT CHECK

const resolveExitMacroContext = (trade, marketContext = {}) => {
    if (marketContext.vnMacro) {
        return getMacroContextForTrade(trade.assetType, marketContext.vnMacro, marketContext.cryptoMacro);
    }
    return {
        breadthRatio: marketContext.breadthRatio ?? 50,
        statusType: marketContext.statusType ?? 'neutral',
        marketStatus: marketContext.marketStatus ?? '',
    };
};

const checkExitConditions = async (trade, marketContext = {}, isFastCheck = false) => {
    try {
        if (trade.executionMeta?.emergencyClosePending) {
            const currentPrice = await fetchCurrentPrice(trade.symbol, trade.assetType);
            return {
                shouldClose: true,
                currentPrice,
                exitReason: `TP1 partial failed — emergency close: ${trade.executionMeta.emergencyCloseReason || 'partial exit failed'}`,
                trailingUpdated: false,
                slMoved: false,
                partialFill: false,
                partialPrice: null,
            };
        }

        const currentPrice = await fetchCurrentPrice(trade.symbol, trade.assetType);

        const isLong  = trade.direction === 'LONG' || trade.direction === 'MUA';
        const isShort = trade.direction === 'SHORT' || trade.direction === 'BÁN';

        const config = getRiskConfig(trade.riskLevel || 2);

        const roundPrice = (price) => roundAssetPrice(price, trade.assetType);

        let shouldClose = false;
        let exitReason  = '';
        let trailingUpdated = false;
        let slMoved = false;
        let partialFill = false;
        let partialPrice = null;

        if (trade.assetType === 'VN_STOCK' && isShort) {
            console.log(chalk.red.bold(`[DATA INTEGRITY ERROR] Found an open 'BÁN' (short) trade for VN_STOCK: ${trade.symbol} (${trade._id}). This is invalid. Forcing close.`));
            return { shouldClose: true, currentPrice: trade.entryPrice, exitReason: 'Lỗi dữ liệu: Đóng lệnh BÁN không hợp lệ cho VN_STOCK.', trailingUpdated: false, slMoved: false };
        }

        // ── EXIT POLICY E: chandelier trailing + chốt lời từng phần (TP1) ──
        // Logic thuần đã tách sang evaluateExitDecision() để test độc lập (một nguồn sự thật).
        const decision = evaluateExitDecision(trade, currentPrice);
        shouldClose  = decision.shouldClose;
        exitReason   = decision.exitReason;
        partialFill  = decision.partialFill;
        partialPrice = decision.partialPrice;
        if (decision.trailingUpdated) trailingUpdated = true;
        if (decision.slMoved) slMoved = true;

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
                maxHoldMs = 24 * 3600_000;   // Policy E: nới 18→24h để runner đủ thời gian chạy tới TP2
                break;
            default: // DERIVATIVES
                maxHoldMs = 2 * 24 * 3600_000;
        }

        const holdMs    = Date.now() - new Date(trade.openedAt).getTime();
        if (!shouldClose && holdMs > maxHoldMs) {
            // Timeout THÔNG MINH: nếu lệnh đang lãi đáng kể (>0.5%), KHÔNG cắt cụt — để trailing/TP
            // xử lý (winner cần thời gian chạy). Chỉ ép đóng khi đang lỗ/đi ngang, hoặc đã vượt hard-cap 2x.
            const profitPct = isLong
                ? (currentPrice - trade.entryPrice) / trade.entryPrice
                : (trade.entryPrice - currentPrice) / trade.entryPrice;
            if (profitPct < 0.005 || holdMs > maxHoldMs * 2) {
                shouldClose = true;
                exitReason  = `Timeout: Lệnh quá thời hạn giữ tối đa (${Math.round(holdMs / 3600000)}h). Đóng để quản lý rủi ro.`;
            }
        }

        // ── Reversal exit AN TOÀN: chỉ cắt khi vị thế ĐANG LỖ & chưa chốt TP1.
        // "Để winner chạy": lệnh đang lời được bảo vệ bằng chandelier/breakeven, KHÔNG để
        // tín hiệu đảo chiều cắt cụt (đây là một nguồn cắt cụt winner trước đây).
        const curProfitPct = isLong
            ? (currentPrice - trade.entryPrice) / trade.entryPrice
            : (trade.entryPrice - currentPrice) / trade.entryPrice;
        const minHoldForSignalExitMs = trade.assetType === 'CRYPTO' ? 30 * 60_000 : 60 * 60_000;
        if (!shouldClose && !partialFill && !trade.tp1Filled && curProfitPct < 0.003
            && !isFastCheck && holdMs > minHoldForSignalExitMs) {
            try {
                const candles = await fetchAnalysisCandles(trade.symbol, trade.assetType);
                const tradeMacro = resolveExitMacroContext(trade, marketContext);
                const signal = analyzeTechnicalSignal(
                    candles,
                    tradeMacro.breadthRatio ?? 50,
                    tradeMacro.statusType ?? 'neutral',
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

        return { shouldClose, currentPrice, exitReason, trailingUpdated, slMoved, partialFill, partialPrice };
    } catch (err) {
        console.log(chalk.yellow(`[EXIT CHECK] Không fetch được giá realtime cho ${trade.symbol}: ${err.message}`));
        return { shouldClose: false, currentPrice: null, exitReason: '', trailingUpdated: false, slMoved: false, partialFill: false, partialPrice: null };
    }
};

// ── ADAPTIVE LEARNING LOOP ──────────────────────────────────────────
// "Học thật": dùng KẾT QUẢ THỰC TẾ (AutoTrade đã đóng, PnL ròng) để tự điều chỉnh
// ngưỡng điểm vào lệnh + size theo từng phân khúc. Đây là vòng phản hồi định lượng
// thay cho việc chỉ lưu bài học dạng text (AiBehavior) vốn KHÔNG phản hồi vào logic.
const adaptiveGuardsSim = {
    CRYPTO:      { scoreFloor: 0, sizeMult: 1.0, sample: 0 },
    VN_STOCK:    { scoreFloor: 0, sizeMult: 1.0, sample: 0 },
    DERIVATIVES: { scoreFloor: 0, sizeMult: 1.0, sample: 0 },
};

const adaptiveGuardsLive = {
    CRYPTO:      { scoreFloor: 0, sizeMult: 1.0, sample: 0 },
    VN_STOCK:    { scoreFloor: 0, sizeMult: 1.0, sample: 0 },
    DERIVATIVES: { scoreFloor: 0, sizeMult: 1.0, sample: 0 },
};

export const computeAdaptiveGuardFromTrades = (list) => {
    let scoreFloor = 0;
    let sizeMult = 1.0;

    if (list.length >= 12) {
        const winRate = list.filter(t => t.pnlPercent > 0).length / list.length;
        const totalPnl = list.reduce((s, t) => s + (t.pnlPercent || 0), 0);

        if (winRate < 0.5 || totalPnl < 0) {
            for (const cut of [72, 74, 76, 78, 80]) {
                const above = list.filter(t => (t.aiScore || 0) >= cut);
                if (above.length >= 6) {
                    const wAbove = above.filter(t => t.pnlPercent > 0).length / above.length;
                    if (wAbove >= 0.55) { scoreFloor = cut; break; }
                }
            }
            if (scoreFloor === 0) scoreFloor = 76;
            sizeMult = 0.7;
        }
    }
    return { scoreFloor, sizeMult, sample: list.length };
};

const recomputeAdaptiveGuards = async () => {
    try {
        const since = new Date(Date.now() - 30 * 24 * 3600_000);
        const trades = await AutoTrade.find({ status: 'CLOSED', closedAt: { $gte: since } })
            .select('assetType aiScore pnlPercent executionMode').lean();

        for (const asset of Object.keys(adaptiveGuardsSim)) {
            const allAsset = trades.filter(t => t.assetType === asset);
            const simList = allAsset.filter(t => t.executionMode !== 'LIVE');
            const liveList = allAsset.filter(t => t.executionMode === 'LIVE');
            adaptiveGuardsSim[asset] = computeAdaptiveGuardFromTrades(simList);
            adaptiveGuardsLive[asset] = computeAdaptiveGuardFromTrades(liveList);
        }
        const fmt = (label, guards) => Object.entries(guards)
            .map(([a, g]) => `${a}:${label}floor${g.scoreFloor}/×${g.sizeMult}(n=${g.sample})`)
            .join(' | ');
        console.log(chalk.magenta(`[ADAPTIVE] ${fmt('SIM', adaptiveGuardsSim)}`));
        console.log(chalk.magenta(`[ADAPTIVE] ${fmt('LIVE', adaptiveGuardsLive)}`));
    } catch (err) {
        console.log(chalk.yellow(`[ADAPTIVE] Lỗi tính guard học máy: ${err.message}`));
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
        isAnomalous = true; note = `Giật mạnh >5.5%/1H`;
    } else if (asset === 'DERIVATIVES' && Math.abs(priceDiff) >= 7) {
        isAnomalous = true; note = `Phái sinh giật ${Math.abs(priceDiff).toFixed(1)} điểm`;
    } else if (asset === 'VN_STOCK' && absPct >= 4.5) {
        isAnomalous = true; note = `Kéo/xả bất thường >4.5%`;
    }

    if (!isAnomalous) return;

    // Gom vào buffer — không gửi Telegram ngay
    volatilityAlertBuffer.push({
        asset,
        symbol,
        price: currentCandle.close,
        changePct: pctDiff,
        note,
        timeFrame: '1 giờ (4 nến 15m)',
    });
    volatilityAlertCooldown.set(cooldownKey, now + VOL_ALERT_COOLDOWN_MS);
    console.log(chalk.magenta(`[VOLATILITY] Queue ${symbol} (${pctDiff.toFixed(2)}%) — sẽ gộp digest cuối chu kỳ`));
};

/** Gửi 1 tin tổng hợp các mã biến động mạnh trong chu kỳ quét. */
const flushVolatilityAlerts = async () => {
    if (!volatilityAlertBuffer.length) return;

    const batch = volatilityAlertBuffer.splice(0, volatilityAlertBuffer.length);
    const byKey = new Map();
    for (const a of batch) {
        const k = `${a.asset}_${a.symbol}`;
        const prev = byKey.get(k);
        if (!prev || Math.abs(a.changePct) > Math.abs(prev.changePct)) byKey.set(k, a);
    }
    const items = [...byKey.values()]
        .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
        .slice(0, VOL_DIGEST_MAX_ITEMS);

    if (!items.length) return;

    const msg = buildVolatilityDigestMessage(items);
    if (!msg) return;
    await sendTelegramMessage(msg, { parseMode: 'HTML' }).catch(() => {});
    console.log(chalk.magenta.bold(
        `[VOLATILITY] Đã gửi digest ${items.length}/${batch.length} mã (gộp 1 tin, tránh spam)`
    ));
};

export const runAutoTradePipeline = async (forcedAssetType = null, options = {}) => {
    const thresholdRelax = Math.max(0, Number(options.thresholdRelax) || 0);
    const minOpenTarget = Math.max(0, Number(options.minOpenTarget) || 0);
    const schedulerMode = options.schedulerMode || 'STANDARD';
    const dryRun = options.dryRun === true;
    // ── CHẾ ĐỘ HOẠT ĐỘNG ──
    // Engine BẬT  → quét full: mô phỏng (training AI nền) + live
    // Engine TẮT  → LIVE-ONLY: dừng triển khai mô phỏng, chỉ quét để phục vụ
    //               các gói lệnh LIVE đang chờ (lệnh live vẫn tính toán bình thường)
    let liveOnlyMode = false;
    try {
        const enabledSetting = await Setting.findOne({ key: 'autoTradeEnabled' });
        // Dùng loose check: bắt cả boolean false, string "false", number 0
        const isDisabled = enabledSetting && (
            enabledSetting.value === false ||
            enabledSetting.value === 'false' ||
            enabledSetting.value === 0
        );
        if (isDisabled) {
            const liveOrdersWaiting = await UserOrder.countDocuments({
                status: { $in: ['PENDING', 'ACTIVE'] },
                executionMode: 'LIVE',
            });
            if (liveOrdersWaiting === 0) {
                console.log(chalk.gray(`[AUTODUCK] Engine TẮT + không có gói LIVE chờ → bỏ qua chu kỳ.`));
                return { skipped: true, reason: 'disabled_by_user' };
            }
            liveOnlyMode = true;
            console.log(chalk.yellow(`[AUTODUCK] Engine TẮT → chạy chế độ LIVE-ONLY (${liveOrdersWaiting} gói LIVE đang chờ, mô phỏng tạm dừng).`));
        }
    } catch (err) {
        console.log(chalk.yellow(`[AUTODUCK] Lỗi check autoTradeEnabled: ${err.message}`));
    }

    if (forcedAssetType === 'ALL') forcedAssetType = null;
    if (autoTradeManuallyStopped) {
        console.log(chalk.gray(`[AUTODUCK] Bỏ qua chu kỳ ${forcedAssetType || 'ALL'}: pipeline bị tắt thủ công (/stop).`));
        return { skipped: true, reason: 'manually_stopped' };
    }
    if (autoTradePipelineRunning) {
        console.log(chalk.gray(`[AUTODUCK] Bỏ qua chu kỳ ${forcedAssetType || 'ALL'}: pipeline trước vẫn đang chạy.`));
        return { skipped: true, reason: 'pipeline_running' };
    }

    autoTradePipelineRunning = true;
    if (liveOnlyMode) {
        console.log(chalk.gray(`[AUTODUCK LIVE-ONLY] Quét thị trường phục vụ gói lệnh LIVE...`));
    } else {
        console.log(chalk.bgMagenta.black(`\n[AUTODUCK ENGINE v2] Khởi chạy chu kỳ rà soát thị trường thực tế...`));
    }
    appendAuditEvent('pipeline', {
        forcedAssetType: forcedAssetType || 'ALL',
        schedulerMode,
        thresholdRelax,
        minOpenTarget,
        liveOnlyMode,
        dryRun,
    }, {
        event: 'pipeline_cycle_start',
        source: 'autoTradeEngine',
    }).catch(() => {});

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
        let vnMacro = buildVnMacroSnapshot();
        let cryptoMacro = null;
        const radarCandidates = {
            CRYPTO: [],
            VN_STOCK: [],
            DERIVATIVES: [],
        };

        try {
            vnMarketContext = await getVnMarketContext();
            vnMacro = buildVnMacroSnapshot(vnMarketContext);
            const intel = vnMarketContext?.intelligence;
            if (intel) {
                breadthRatio            = vnMacro.breadthRatio;
                marketStatus            = vnMacro.marketStatus;
                statusType              = vnMacro.statusType;
                diagnosticDesc          = vnMacro.diagnosticDesc;
                topGainersFromMarket    = intel.topGainers || [];
                topLosersFromMarket     = intel.topLosers || [];
                topVolumeFromMarket     = intel.topVolume || [];
                strongSectorsFromMarket = intel.strongSectors || [];
            }
        } catch (macroErr) {
            console.log(chalk.yellow(`[AUTODUCK] Lấy VN macro lỗi, tiếp tục mặc định: ${macroErr.message}`));
        }

        console.log(chalk.gray(
            `[AUTODUCK] VN Macro: ${vnMacro.marketStatus} | Breadth: ${vnMacro.breadthRatio.toFixed(1)}% | Type: ${vnMacro.statusType}`
        ));

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

        if (targetAssets.includes('CRYPTO')) {
            try {
                cryptoMacro = await getCryptoMacroContext();
                console.log(chalk.gray(
                    `[AUTODUCK] Crypto Macro: ${cryptoMacro.marketStatus} | Breadth: ${cryptoMacro.breadthRatio.toFixed(1)}% | F&G ${cryptoMacro.fearGreed} | BTC ${cryptoMacro.btcChangePct >= 0 ? '+' : ''}${cryptoMacro.btcChangePct.toFixed(2)}%`
                ));
            } catch (cryptoMacroErr) {
                console.log(chalk.yellow(`[AUTODUCK] Lấy Crypto macro lỗi: ${cryptoMacroErr.message}`));
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
        // KHÔNG hạ ngưỡng khi thừa vốn nữa: bằng chứng thực tế cho thấy bucket điểm thấp
        // (<80) thua nặng → "vào thêm cho đủ vốn" chỉ làm tăng lỗ. Giữ ngưỡng cố định.
        const dynamicScoreThreshold = currentRiskConfig.scoreThreshold;

        // Cập nhật guard học máy từ kết quả thực tế trước khi quét (vòng phản hồi định lượng).
        await recomputeAdaptiveGuards();

        // 3. Scan loop
        for (const asset of targetAssets) {
            const assetMacro = resolveAssetMacro(asset, vnMacro, cryptoMacro);
            const macroLogSuffix = asset === 'CRYPTO' && assetMacro.vnReference
                ? ` | VN cross ${(assetMacro.vnCrossBlend * 100).toFixed(0)}% (${assetMacro.vnReference.marketStatus})`
                : '';
            console.log(chalk.cyan(
                `\n[AUTODUCK] ═══ Quét phân khúc: ${asset} ═══`
            ));
            console.log(chalk.gray(
                `  [MACRO ${asset}] ${assetMacro.marketStatus} | Breadth ${assetMacro.breadthRatio.toFixed(1)}% | ${assetMacro.statusType}${macroLogSuffix}`
            ));

            // Guard học máy: SIM và LIVE tách riêng — LIVE không bị siết bởi lịch sử SIM.
            const guardSim = adaptiveGuardsSim[asset] || {};
            const guardLive = adaptiveGuardsLive[asset] || {};
            const liveOrdersWaiting = await countLiveOrdersWaiting(asset);
            const requiresLiveQuality = liveOnlyMode || liveOrdersWaiting > 0;

            const baseLiveThreshold = Math.max(dynamicScoreThreshold, guardLive.scoreFloor || 0, IDLE_MIN_LIVE_SCORE);
            const liveScoreThreshold = baseLiveThreshold;

            const baseSimThreshold = Math.max(65, dynamicScoreThreshold - 5);
            const simScoreThreshold = thresholdRelax > 0
                ? Math.max(IDLE_MIN_SIM_SCORE, baseSimThreshold - thresholdRelax)
                : baseSimThreshold;
            const effectiveThreshold = simScoreThreshold;
            const riskOffSizeMult = (asset === 'CRYPTO' && assetMacro.marketStatus === 'CRYPTO RISK-OFF')
                ? (Number(process.env.AUTODUCK_LIVE_RISK_OFF_SIZE_MULT) || 0.5)
                : 1.0;
            const adaptiveSizeMult = requiresLiveQuality
                ? (guardLive.sizeMult || 1.0) * riskOffSizeMult
                : (guardSim.sizeMult || 1.0);
            console.log(chalk.magenta(
                `  [NGƯỠNG] ${asset}: SIM≥${simScoreThreshold} · LIVE≥${liveScoreThreshold} (guard LIVE floor=${guardLive.scoreFloor || 0}/×${guardLive.sizeMult || 1} n=${guardLive.sample}) · LIVE chờ=${liveOrdersWaiting}${riskOffSizeMult < 1 ? ` · RISK-OFF size×${riskOffSizeMult}` : ''}${thresholdRelax > 0 ? ` · idle SIM -${thresholdRelax}` : ''}.`
            ));

            const funnel = createFunnelTracker(asset);
            const stats = { scanned: 0, skipScore: 0, skipLimit: 0, skipRisk: 0, skipLiveGate: 0, skipSimGate: 0, skipTestnetSymbol: 0, aiRejected: 0, aiSoftOverride: 0, matched: 0 };
            let symbolsToScan = [];
            let testnetGateContext = null;

            if (asset === 'CRYPTO' && requiresLiveQuality) {
                testnetGateContext = await buildTestnetGateContext(asset);
                if (testnetGateContext.hasTestnetOrders && testnetGateContext.tradableUnion.size > 0) {
                    console.log(chalk.cyan(
                        `  [TESTNET GATE] ${testnetGateContext.testnetConnections.length} kết nối TESTNET · ${testnetGateContext.tradableUnion.size} cặp USDT khả dụng (union SPOT+FUTURES)`
                    ));
                }
            }

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
                symbolsToScan = testnetGateContext?.hasTestnetOrders
                    ? filterSymbolsForTestnetUniverse(baseUniverse, testnetGateContext.tradableUnion)
                    : baseUniverse;
                if (testnetGateContext?.hasTestnetOrders && symbolsToScan.length < baseUniverse.length) {
                    console.log(chalk.gray(
                        `  [TESTNET GATE] Universe ${baseUniverse.length} → ${symbolsToScan.length} mã (lọc theo testnet)`
                    ));
                }
            }

            // 4. Analyze symbol
            for (const symbol of symbolsToScan) {
                try {
                    stats.scanned++;
                    funnel.record('scanned');

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
                    let techSignal = analyzeTechnicalSignal(
                        candles,
                        assetMacro.breadthRatio,
                        assetMacro.statusType,
                        Math.max(60, effectiveThreshold - 12),
                        currentRiskConfig
                    );
                    techSignal = applyExecutionContextBias(
                        techSignal,
                        asset,
                        executionContext,
                        effectiveThreshold,
                        currentRiskConfig,
                        asset === 'CRYPTO' ? vnMacro : null
                    );
                    const biasLedger = buildBiasLedger(techSignal, assetMacro, asset === 'CRYPTO' ? vnMacro : null);
                    techSignal.symbol = symbol;
                    techSignal.breakdown = { ...techSignal.breakdown, biasLedger };

                    if (techSignal.direction === 'NEUTRAL') {
                        stats.skipScore++;
                        funnel.record('weak');
                        continue;
                    }

                    if (asset === 'VN_STOCK' && techSignal.direction === 'SHORT') {
                        stats.skipScore++;
                        funnel.record('weak');
                        continue;
                    }

                    const minVolSurge = currentRiskConfig.volSurge[asset] || 1.2;
                    if (techSignal.volumeSurge < minVolSurge) {
                        stats.skipVolume = (stats.skipVolume || 0) + 1;
                        funnel.record('vol');
                        console.log(chalk.gray(`  [VOL FILTER] ${symbol}: volSurge=${techSignal.volumeSurge}x < min=${minVolSurge}x (score=${techSignal.score})`));
                        continue;
                    }

                    // ── SETUP + QUALITY SCORE (setup-aware funnel) ──
                    let entrySetup = { valid: true, type: techSignal.direction, note: '', setupScore: 70 };
                    let htfTrend = 'NEUTRAL';
                    if (asset === 'CRYPTO') {
                        htfTrend = await getCryptoHtfTrend(symbol);
                        entrySetup = detectEntrySetup(asset, techSignal, htfTrend, candles, executionContext);
                        if (!entrySetup.valid) {
                            stats.skipSetup = (stats.skipSetup || 0) + 1;
                            funnel.record('setup', { type: entrySetup.type, reason: entrySetup.type });
                            console.log(chalk.gray(`  [SETUP FILTER] ${symbol}: ${entrySetup.type} — ${entrySetup.note}`));
                            continue;
                        }
                        techSignal = applyQualityToSignal(techSignal, entrySetup, executionContext);
                        console.log(chalk.cyan(`  [SETUP ✓] ${symbol}: ${entrySetup.type} Q=${techSignal.score} (HTF ${htfTrend}) — ${entrySetup.note}`));
                    } else {
                        techSignal = applyQualityToSignal(techSignal, entrySetup, executionContext);
                    }

                    const liveGate = passesLiveQuantGate(entrySetup, techSignal);
                    const simGate = passesSimQuantGate(entrySetup, techSignal);

                    if (requiresLiveQuality) {
                        if (!liveGate.pass || techSignal.score < liveScoreThreshold) {
                            stats.skipLiveGate++;
                            const gateReason = liveGate.reason || `score ${techSignal.score} < ${liveScoreThreshold}`;
                            funnel.record('live_gate', {
                                symbol,
                                score: techSignal.score,
                                setup: entrySetup.type,
                                reason: gateReason,
                            });
                            appendAuditEvent('candidate', {
                                asset,
                                symbol,
                                score: techSignal.score,
                                setup: entrySetup.type,
                                stage: 'live_gate',
                                reason: gateReason,
                                liveScoreThreshold,
                                requiresLiveQuality,
                                biasLedger: techSignal.breakdown?.biasLedger || null,
                            }, {
                                event: 'candidate_rejected',
                                source: 'autoTradeEngine',
                            }).catch(() => {});
                            console.log(chalk.gray(`  [LIVE GATE] ${symbol}: ${gateReason}`));
                            continue;
                        }
                        funnel.record('sim_ok');
                    } else if (!liveOnlyMode) {
                        if (!simGate.pass || techSignal.score < effectiveThreshold) {
                            stats.skipSimGate++;
                            continue;
                        }
                        funnel.record('sim_ok');
                    }

                    if (techSignal.score >= liveScoreThreshold - 4) {
                        console.log(chalk.gray(
                            `  [BIAS] ${symbol}: macro=${assetMacro.statusType} breadth=${assetMacro.breadthRatio.toFixed(1)} | ctx +${biasLedger.totalDeltaLong}/+${biasLedger.totalDeltaShort} [${(biasLedger.context.reasons || []).slice(0, 3).join(',')}]`
                        ));
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

                    const testnetPipeline = await checkTestnetSymbolForPipeline({
                        gateContext: testnetGateContext,
                        symbol,
                        direction: tradePlan.directionLabel,
                        requiresLiveQuality,
                        liveOnlyMode,
                    });
                    if (!testnetPipeline.allow) {
                        stats.skipTestnetSymbol++;
                        funnel.record('testnet');
                        console.log(chalk.gray(`  [TESTNET GATE] ${symbol}: ${testnetPipeline.reason}`));
                        continue;
                    }

                    // 5. AI confirm
                    let aiConfirm = await getAISignalConfirmation(asset, techSignal, assetMacro.marketStatus, assetMacro.diagnosticDesc || diagnosticDesc, executionContext, currentRiskConfig, {
                        schedulerMode,
                        thresholdRelax,
                        effectiveThreshold,
                        liveOnlyMode,
                        liveVetoMode: requiresLiveQuality,
                        entrySetup,
                    });
                    const idleProbeOverride = shouldIdleProbeOverrideAI({
                        asset,
                        signal: techSignal,
                        aiConfirm,
                        schedulerMode,
                        liveOnlyMode,
                        hasLiveUserOrderWaiting: liveOrdersWaiting > 0,
                        entrySetup,
                    });
                    if (idleProbeOverride) {
                        stats.aiSoftOverride++;
                        aiConfirm = {
                            ...aiConfirm,
                            confirmed: true,
                            reason: `[IDLE PROBE OVERRIDE · size x${IDLE_AI_PROBE_SIZE_MULT}] AI bác bỏ mềm, nhưng tín hiệu đã qua filter định lượng và score ${techSignal.score} >= ${IDLE_AI_PROBE_MIN_SCORE}. Lý do AI gốc: ${aiConfirm.reason}`,
                        };
                    }
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
                        funnel.record('ai_veto', {
                            symbol,
                            score: techSignal.score,
                            setup: entrySetup.type,
                            reason: aiConfirm.reason,
                        });
                        appendAuditEvent('candidate', {
                            asset,
                            symbol,
                            score: techSignal.score,
                            setup: entrySetup.type,
                            stage: 'ai_veto',
                            reason: aiConfirm.reason,
                            biasLedger: techSignal.breakdown?.biasLedger || null,
                        }, {
                            event: 'candidate_rejected',
                            source: 'autoTradeEngine',
                        }).catch(() => {});
                        continue;
                    }

                    if (dryRun) {
                        funnel.record('near_live', {
                            symbol,
                            score: techSignal.score,
                            setup: entrySetup.type,
                            fail: 'dry_run_pass',
                        });
                        continue;
                    }

                    const deferTradePersist = liveOnlyMode;
                    const {
                        directionLabel,
                        entryPrice,
                        takeProfitPrice,
                        stopLossPrice,
                        takeProfit1Price,
                        tp1Fraction,
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
                    // ── CONVICTION SIZING (quyết đoán hơn) ──
                    // Setup VÀNG = TREND_PULLBACK + score≥80 (vùng WR cao nhất theo data thật) → tăng size.
                    // Score≥80 nói chung → tăng nhẹ. Cap tổng vẫn ≤ 40% vốn.
                    const goldenSetup = entrySetup.type === 'TREND_PULLBACK' && techSignal.score >= 80;
                    const convictionMult = goldenSetup ? 1.25 : (techSignal.score >= 80 ? 1.1 : 1.0);
                    allocationPct = Math.min(0.40, allocationPct * convictionMult);
                    if (idleProbeOverride) {
                        allocationPct = Math.max(0.02, allocationPct * IDLE_AI_PROBE_SIZE_MULT);
                    }

                    let idealInvestedAmount = TOTAL_CAPITAL * allocationPct * adaptiveSizeMult;
                    
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
                    
                    // ── LIVE-ONLY MODE: engine tắt → chỉ mở lệnh nếu có gói LIVE chờ khớp asset này ──
                    if (liveOnlyMode) {
                        const liveCandidates = await UserOrder.countDocuments({
                            status: { $in: ['PENDING', 'ACTIVE'] },
                            executionMode: 'LIVE',
                            $or: [{ assetType: 'ALL' }, { assetType: asset }],
                        });
                        if (liveCandidates === 0) {
                            stats.skipRisk++;
                            continue;
                        }
                    }

                    if (!deferTradePersist) {
                        currentAllocatedCapital += investedAmount;
                        currentOpenCount++;
                    }

                    const tradeStatus = (isOutOfStandardHours && asset !== 'CRYPTO') ? 'PENDING' : 'OPEN';

                    if (!deferTradePersist) {
                        const liveOpenCount = await AutoTrade.countDocuments({ status: { $in: ['OPEN', 'PENDING'] } });
                        if (liveOpenCount >= MAX_CONCURRENT_TRADES) {
                            stats.skipLimit++;
                            funnel.record('limit');
                            currentOpenCount = liveOpenCount;
                            if (!deferTradePersist) {
                                currentAllocatedCapital -= investedAmount;
                                currentOpenCount = Math.max(currentOpenCount - 1, 0);
                            }
                            continue;
                        }
                    }
                    const raceGuardCheck = await AutoTrade.findOne({
                        symbol,
                        assetType: asset,
                        status: { $in: ['OPEN', 'PENDING'] },
                    });
                    if (raceGuardCheck) {
                        if (!deferTradePersist) {
                            currentOpenCount = Math.max(currentOpenCount - 1, 0);
                            currentAllocatedCapital -= investedAmount;
                        }
                        continue;
                    }

                    const newTrade = new AutoTrade({
                        symbol,
                        assetType: asset,
                        direction: directionLabel,
                        entryPrice,
                        takeProfitPrice,
                        stopLossPrice,
                        takeProfit1Price,
                        tp1Fraction,
                        entryAtr: tradePlan.atr,
                        peakPrice: entryPrice,
                        investedAmount,
                        volume,
                        aiScore: techSignal.score,
                        confidence: techSignal.breakdown?.qualityScore ?? techSignal.score,
                        reason: aiConfirm.reason,
                        exitReason: null,
                        exitTag: null,
                        aiReportSnapshot: `priceSource=${quote.source}; contextSource=${executionContext.source || 'N/A'}; fetchedAt=${quote.fetchedAt.toISOString()}; setup=${entrySetup.type}; qualityScore=${techSignal.breakdown?.qualityScore}; confluence=${techSignal.breakdown?.confluenceCount}; legacyScore=${techSignal.breakdown?.legacyScore}; edge=${techSignal.breakdown?.edge}; news=${newsContext.summary}`,
                        status: tradeStatus,
                        marketCondition: assetMacro.marketStatus,
                        riskLevel: currentRiskLevel,
                        signalBreakdown: {
                            ...techSignal.breakdown,
                            originalSL: stopLossPrice,
                            entrySetup: entrySetup.type,
                            rsi: techSignal.rsi ?? null,
                            volumeSurge: techSignal.volumeSurge ?? null,
                            fearGreed: assetMacro.fearGreed ?? null,
                            fearGreedLabel: assetMacro.fearGreedLabel ?? null,
                            btcChangePct: assetMacro.btcChangePct ?? null,
                            plannedRR: (() => {
                                const risk = Math.abs(entryPrice - stopLossPrice);
                                const reward = Math.abs(takeProfitPrice - entryPrice);
                                return risk > 0 ? Math.round((reward / risk) * 100) / 100 : null;
                            })(),
                            plannedRR_tp1: (() => {
                                const risk = Math.abs(entryPrice - stopLossPrice);
                                const reward = Math.abs((takeProfit1Price || takeProfitPrice) - entryPrice);
                                return risk > 0 ? Math.round((reward / risk) * 100) / 100 : null;
                            })(),
                        },
                        executionMeta: {
                            priceSource: quote.source,
                            fetchedAt: quote.fetchedAt,
                            contextSource: executionContext.source || null,
                        },
                    });

                    const persistTradeRecord = async () => {
                        if (newTrade._id) return;
                        await newTrade.save();
                        if (!deferTradePersist) return;
                        currentAllocatedCapital += investedAmount;
                        currentOpenCount++;
                    };

                    if (!deferTradePersist) {
                        await persistTradeRecord();
                        console.log(chalk.gray(
                            `  [SIM ${tradeStatus}] ${directionLabel} ${symbol} @ ${entryPrice} | ${(investedAmount/1e6).toFixed(2)}Tr | Score: ${techSignal.score}`
                        ));
                        stats.matched++;
                        funnel.record('matched_sim');
                    }

                    // 8. Match user orders (FIXED 'PENDING' + PORTFOLIO 'ACTIVE'/'PENDING')
                    //    LIVE-ONLY mode (engine tắt) → chỉ xét các gói LIVE
                    const userOrderQuery = {
                        status: { $in: ['PENDING', 'ACTIVE'] },
                        $or: [{ assetType: 'ALL' }, { assetType: asset }],
                    };
                    if (liveOnlyMode) userOrderQuery.executionMode = 'LIVE';
                    const pendingUserOrders = await UserOrder.find(userOrderQuery);

                    let liveMatched = false;
                    let liveMeta = null;

                    for (const userOrder of pendingUserOrders) {
                        const isPortfolio = userOrder.allocationMode === 'PORTFOLIO';

                        // FIXED đã MATCHED rồi thì không xét lại; PORTFOLIO ACTIVE vẫn nhận thêm lệnh
                        if (!isPortfolio && userOrder.status !== 'PENDING') continue;

                        // LIVE: quant gate + quality score (không nới ngưỡng idle).
                        if (userOrder.executionMode === 'LIVE') {
                            if (!liveGate.pass || techSignal.score < liveScoreThreshold) continue;

                            // Soft-block symbol (comma list), default empty — set via env after Late analysis
                            const softBlock = String(process.env.AUTODUCK_LIVE_SYMBOL_SOFT_BLOCK || '')
                                .split(',')
                                .map((s) => s.trim().toUpperCase())
                                .filter(Boolean);
                            if (softBlock.includes(String(symbol).toUpperCase())) {
                                userOrder.result.message = `[SOFT BLOCK] ${symbol} đang trong AUTODUCK_LIVE_SYMBOL_SOFT_BLOCK — bỏ qua LIVE.`;
                                await userOrder.save();
                                continue;
                            }

                            // RISK-OFF: mặc định giảm size; veto nếu AUTODUCK_LIVE_RISK_OFF_VETO=true
                            if (asset === 'CRYPTO' && assetMacro.marketStatus === 'CRYPTO RISK-OFF'
                                && process.env.AUTODUCK_LIVE_RISK_OFF_VETO === 'true'
                                && (directionLabel === 'LONG' || directionLabel === 'MUA')) {
                                userOrder.result.message = `[RISK-OFF VETO] Bỏ qua LONG ${symbol} khi CRYPTO RISK-OFF.`;
                                await userOrder.save();
                                continue;
                            }
                        }

                        const validation = verifyOrderFeasibility(asset, userOrder.targetPct);
                        if (!validation.feasible) {
                            userOrder.status = 'REJECTED';
                            userOrder.result.message = validation.reason;
                            await userOrder.save();
                            continue;
                        }

                        // PORTFOLIO: bot tự quyết — bỏ qua compatibility chặt theo target user,
                        // chỉ check slot + tính position size. FIXED: giữ check cũ.
                        let allocatedCapital = Number(userOrder.capital) || 0;
                        let matchNote = '';

                        if (isPortfolio) {
                            const hasSlot = await canAcceptNewTrade(userOrder);
                            if (!hasSlot) continue; // đầy slot → đợi lệnh hiện tại đóng

                            const sizing = calculatePositionSize(userOrder, {
                                entryPrice, stopLossPrice, direction: directionLabel,
                            }, techSignal.score);
                            if (sizing.size <= 0) {
                                userOrder.result.message = `[PORTFOLIO] Bỏ qua ${symbol}: ${sizing.reason}`;
                                await userOrder.save();
                                continue;
                            }
                            allocatedCapital = sizing.size;
                            matchNote = ` | Sizing: ${sizing.reason}`;
                            if (userOrder.executionMode === 'LIVE' && riskOffSizeMult < 1
                                && (directionLabel === 'LONG' || directionLabel === 'MUA')) {
                                allocatedCapital = Math.round(allocatedCapital * riskOffSizeMult);
                                matchNote += ` | RISK-OFF size×${riskOffSizeMult}`;
                            }
                        } else {
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
                            matchNote = ` Reward/Risk: +${compatibility.rewardPct}%/-${compatibility.riskPct}%.`;
                            if (userOrder.executionMode === 'LIVE' && riskOffSizeMult < 1
                                && (directionLabel === 'LONG' || directionLabel === 'MUA')) {
                                allocatedCapital = Math.round(allocatedCapital * riskOffSizeMult);
                                matchNote += ` | RISK-OFF size×${riskOffSizeMult}`;
                            }
                        }

                        // ── TESTNET symbol gate (trước broker — tránh UNMATCHED) ──
                        if (userOrder.executionMode === 'LIVE' && userOrder.exchangeConnectionId && asset === 'CRYPTO') {
                            const conn = testnetGateContext?.connectionsById?.[String(userOrder.exchangeConnectionId)]
                                || await ExchangeConnection.findById(userOrder.exchangeConnectionId);
                            if (conn?.environment === 'TESTNET') {
                                const symbolCheck = await isSymbolTradableOnConnection(conn, symbol, directionLabel);
                                if (!symbolCheck.supported) {
                                    userOrder.result.message = `[TESTNET SKIP] ${symbol}: ${symbolCheck.reason}. Gói tiếp tục chờ mã khác (không tính UNMATCHED).`;
                                    await userOrder.save();
                                    continue;
                                }
                            }
                        }

                        // ── SHORT LIVE gate: chỉ cho Binance Futures + cờ short bật ──
                        if (userOrder.executionMode === 'LIVE' && asset === 'CRYPTO' && directionLabel === 'SHORT') {
                            const conn = testnetGateContext?.connectionsById?.[String(userOrder.exchangeConnectionId)]
                                || await ExchangeConnection.findById(userOrder.exchangeConnectionId);
                            const shortEnabled = await isAutoFuturesShortEnabled();
                            if (!shortEnabled) {
                                userOrder.result.message = `[SHORT GATE] SHORT auto đang TẮT (autoFuturesShortEnabled=false). Gói tiếp tục chờ tín hiệu LONG hoặc khi bật SHORT.`;
                                await userOrder.save();
                                appendAuditEvent('security', {
                                    userOrderId: String(userOrder._id),
                                    username: userOrder.username,
                                    symbol,
                                    setup: entrySetup.type,
                                    reason: 'short_auto_disabled',
                                }, {
                                    event: 'live_short_blocked',
                                    level: 'warn',
                                    source: 'autoTradeEngine',
                                }).catch(() => {});
                                continue;
                            }
                            if (!conn || String(conn.exchangeName).toUpperCase() !== 'BINANCE') {
                                userOrder.result.message = `[SHORT GATE] SHORT LIVE chỉ hỗ trợ Binance Futures. Gói tiếp tục chờ mã khác/kết nối phù hợp.`;
                                await userOrder.save();
                                appendAuditEvent('security', {
                                    userOrderId: String(userOrder._id),
                                    username: userOrder.username,
                                    symbol,
                                    setup: entrySetup.type,
                                    exchange: conn?.exchangeName || 'unknown',
                                    reason: 'short_requires_binance_futures',
                                }, {
                                    event: 'live_short_blocked',
                                    level: 'warn',
                                    source: 'autoTradeEngine',
                                }).catch(() => {});
                                continue;
                            }
                        }

                        // ── NHÁNH LIVE EXECUTION trước (để biết executionMode chính xác) ──
                        let liveMsg = '';
                        let liveEntryFailed = false;
                        if (userOrder.executionMode === 'LIVE' && userOrder.exchangeConnectionId && asset === 'CRYPTO') {
                            await persistTradeRecord();
                            const liveResult = await executeLiveEntry({
                                userOrder,
                                trade: newTrade,
                                usdVndRate: currentUsdRate,
                                capitalVnd: allocatedCapital,
                            });
                            if (liveResult.success && liveResult.fillConfirmed !== false) {
                                liveMatched = true;
                                liveMeta = {
                                    environment: liveResult.environment,
                                    exchangeName: liveResult.exchangeName,
                                    marketType: liveResult.marketType || 'SPOT',
                                    leverage: liveResult.leverage || 1,
                                    externalOrderId: liveResult.externalOrderId,
                                    filledPrice: liveResult.filledPrice,
                                    filledQuantity: liveResult.filledQuantity || liveResult.finalQty,
                                    orderSide: liveResult.orderSide,
                                    username: liveResult.username || userOrder.username,
                                };
                                funnel.record('matched_live');
                                if (liveResult.filledPrice) {
                                    rebaseTradeLevelsFromFill(newTrade, liveResult.filledPrice);
                                    applyExitPolicyToTrade(newTrade, 'LIVE');
                                }
                                if (liveResult.filledQuantity > 0) {
                                    newTrade.volume = liveResult.filledQuantity;
                                    const filledUsd = liveResult.filledQuantity * (liveResult.filledPrice || entryPrice);
                                    allocatedCapital = Math.round(filledUsd * currentUsdRate);
                                    newTrade.investedAmount = allocatedCapital;
                                }
                                newTrade.executionMode = 'LIVE';
                                newTrade.marketType = liveResult.marketType || 'SPOT';
                                newTrade.leverage = liveResult.leverage || 1;
                                newTrade.exchangeConnectionId = liveResult.exchangeConnectionId;
                                newTrade.externalOrderId = liveResult.externalOrderId;
                                await newTrade.save();
                                const fillQty = liveResult.filledQuantity || newTrade.volume;
                                liveMsg = ` 🔴 LIVE: ${liveResult.message} | fill qty=${fillQty}`;
                                console.log(chalk.bgMagenta.white(
                                    `  [LIVE MATCH] package=${userOrder._id} ${symbol} fill=OK qty=${fillQty} testnet=${liveResult.environment || 'n/a'} | ${(allocatedCapital/1e6).toFixed(2)}Tr`
                                ));
                                appendAuditEvent('live_execution', {
                                    userOrderId: String(userOrder._id),
                                    username: userOrder.username,
                                    tradeId: String(newTrade._id),
                                    symbol,
                                    direction: directionLabel,
                                    setup: entrySetup.type,
                                    score: techSignal.score,
                                    exchangeConnectionId: String(liveResult.exchangeConnectionId || userOrder.exchangeConnectionId || ''),
                                    externalOrderId: liveResult.externalOrderId || null,
                                    fillQty,
                                    fillPrice: liveResult.filledPrice || null,
                                }, {
                                    event: 'live_match_ok',
                                    source: 'autoTradeEngine',
                                }).catch(() => {});
                            } else {
                                liveEntryFailed = true;
                                if (deferTradePersist && newTrade._id) {
                                    await AutoTrade.deleteOne({ _id: newTrade._id });
                                }
                                liveMsg = ` ⚠️ Live order KHÔNG gửi được: ${liveResult.message}`;
                                console.log(chalk.yellow(`  [LIVE ENTRY FAIL] ${userOrder.username}: ${liveResult.message}`));
                                appendAuditEvent('live_execution', {
                                    userOrderId: String(userOrder._id),
                                    username: userOrder.username,
                                    tradeId: String(newTrade._id),
                                    symbol,
                                    direction: directionLabel,
                                    setup: entrySetup.type,
                                    score: techSignal.score,
                                    reason: liveResult.message,
                                }, {
                                    event: 'live_match_failed',
                                    level: 'warn',
                                    source: 'autoTradeEngine',
                                }).catch(() => {});
                            }
                        }

                        if (liveEntryFailed) {
                            const reason = liveMsg.replace(/^ ⚠️\s*/, '');
                            if (isPortfolio) {
                                recordUnmatchedAllocation(userOrder, newTrade, allocatedCapital, reason);
                                userOrder.result.message = `[PORTFOLIO ${directionLabel} · UNMATCHED] ${symbol} không khớp broker, không chiếm vốn và không tính PnL gói. ${reason}${matchNote}`;
                            } else {
                                userOrder.result.message = `[UNMATCHED] ${symbol} không khớp broker, gói tiếp tục chờ tín hiệu khác. ${reason}`;
                            }
                            await userOrder.save();
                            continue;
                        }

                        // ── Ghi nhận khớp (sau live → executionMode đã đúng) ──
                        const modeTag = newTrade.executionMode === 'LIVE' ? '🔴 LIVE' : 'SIM';
                        if (isPortfolio) {
                            recordAllocation(userOrder, newTrade, allocatedCapital, {
                                matchStatus: 'MATCHED',
                                matchMessage: liveMsg.trim(),
                            });
                            userOrder.result.message = `[PORTFOLIO ${directionLabel} · ${modeTag}] Bot phân bổ ${(allocatedCapital/1e6).toFixed(2)}Tr vào ${symbol} @ ${entryPrice}. Quỹ đang dùng: ${(userOrder.usedCapital/1e6).toFixed(1)}/${(userOrder.totalCapital/1e6).toFixed(1)}Tr.${matchNote}${liveMsg}`;
                        } else {
                            userOrder.assignedTrade = newTrade._id;
                            userOrder.status        = 'MATCHED';
                            userOrder.result.message = `[${directionLabel} · ${modeTag}] Đã khớp vào ${symbol} @ ${entryPrice}. TP: ${takeProfitPrice} | SL: ${stopLossPrice}.${matchNote}${liveMsg}`;
                        }

                        await userOrder.save();
                    }

                    if (deferTradePersist && !liveMatched) {
                        console.log(chalk.gray(`  [LIVE-ONLY] ${symbol}: không khớp LIVE — bỏ qua (không tạo SIM).`));
                        continue;
                    }

                    if (deferTradePersist && liveMatched) {
                        stats.matched++;
                    }

                    // 9. Telegram MỞ LỆNH: chỉ thông báo khi là lệnh LIVE.
                    //    Mô phỏng chạy nền training AI → im lặng, xem qua /sim.
                    if (liveMatched) {
                        const telegramOpenMessage = buildAutoTradeOpenMessage(
                            newTrade,
                            aiConfirm,
                            quote,
                            executionContext,
                            tradePlan,
                            liveMeta
                        );
                        await sendTelegramMessage(telegramOpenMessage).catch(() => {});
                        console.log(chalk.green.bold(
                            `  [LỆNH LIVE ${tradeStatus}] ${directionLabel} ${symbol} @ ${entryPrice} | Score: ${techSignal.score}`
                        ));
                    }

                } catch (symbolErr) {
                    console.log(chalk.yellow(`  [ERROR] Lỗi xử lý ${symbol}: ${symbolErr.message}`));
                    continue;
                }
            }
            
            if (stats.scanned > 0) {
                const volSkip = stats.skipVolume || 0;
                const setupSkip = stats.skipSetup || 0;
                console.log(chalk.gray(`  └─ Tổng kết: Quét ${stats.scanned} mã | Bỏ qua [Điểm yếu: ${stats.skipScore} | LIVE gate: ${stats.skipLiveGate || 0} | SIM gate: ${stats.skipSimGate || 0} | Testnet: ${stats.skipTestnetSymbol || 0} | Volume: ${volSkip} | Setup: ${setupSkip} | Rủi ro/Vốn: ${stats.skipRisk + stats.skipLimit} | AI hủy: ${stats.aiRejected} | Idle override: ${stats.aiSoftOverride}] | Vào: ${stats.matched} lệnh.`));
                pushFunnelSummary(funnel.finalize({
                    liveOrdersWaiting,
                    liveScoreThreshold,
                    simScoreThreshold,
                    dryRun,
                }));
            }
            if (minOpenTarget > 0 && currentOpenCount >= minOpenTarget) {
                console.log(chalk.green(`[AUTODUCK IDLE] Đã đạt mục tiêu ${minOpenTarget} lệnh mở, dừng lượt quét nới ngưỡng.`));
                break;
            }
        }

        // Gửi 1 tin biến động gộp sau khi quét xong mọi asset (tránh spam từng mã)
        await flushVolatilityAlerts();

        for (const asset of Object.keys(radarCandidates)) {
            radarCandidates[asset].sort((a, b) => {
                if (Number(b.aiConfirmed) !== Number(a.aiConfirmed)) {
                    return Number(b.aiConfirmed) - Number(a.aiConfirmed);
                }
                return (b.score || 0) - (a.score || 0);
            });
        }

        // ── RADAR THROTTLE: chỉ gửi khi có tín hiệu MẠNH (AI duyệt + score >= 80) ──
        // Trước đây gửi gần như mỗi chu kỳ → spam. Giờ chỉ báo cơ hội đáng giá.
        const RADAR_MIN_SCORE = 80;
        const isStrong = (c) => c.aiConfirmed === true && (c.score || 0) >= RADAR_MIN_SCORE;
        const strongRadar = {};
        let hasStrongSignal = false;
        for (const [asset, items] of Object.entries(radarCandidates)) {
            const strong = (items || []).filter(isStrong);
            strongRadar[asset] = strong;
            if (strong.length) hasStrongSignal = true;
        }
        if (!liveOnlyMode && hasStrongSignal) {
            await sendTelegramMessage(buildMarketRadarMessage(strongRadar, {
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
        await runExitAndLearningPipeline({ vnMacro, cryptoMacro });

    } catch (err) {
        console.error(chalk.red(`[AUTODUCK CRITICAL ERROR] ${err.message}`));
        appendAuditEvent('pipeline', {
            forcedAssetType: forcedAssetType || 'ALL',
            reason: err.message,
        }, {
            event: 'pipeline_cycle_error',
            level: 'warn',
            source: 'autoTradeEngine',
        }).catch(() => {});
    } finally {
        // Nếu lỗi giữa chu kỳ vẫn cố gửi digest đã gom được
        await flushVolatilityAlerts().catch(() => {});
        autoTradePipelineRunning = false;
        appendAuditEvent('pipeline', {
            forcedAssetType: forcedAssetType || 'ALL',
        }, {
            event: 'pipeline_cycle_end',
            source: 'autoTradeEngine',
        }).catch(() => {});
        Setting.findOneAndUpdate(
            { key: 'lastAutoTradePipelineRun' },
            { value: Date.now() },
            { upsert: true }
        ).catch(() => {});
    }
};

// ── PARTIAL TP1 HANDLER (Policy E) ──
// Chốt `tp1Fraction` vị thế tại TP1, hiện thực hoá PnL phần đó, dời SL phần còn lại về
// breakeven và GIỮ lệnh mở (runner) để chạy tiếp theo chandelier. LIVE: bán phần đó trên sàn.
const applySimulatedClosedPnl = (trade, currentPrice) => {
    const isLong = trade.direction === 'LONG' || trade.direction === 'MUA';
    const priceDiff = isLong
        ? (currentPrice - trade.entryPrice)
        : (trade.entryPrice - currentPrice);
    const ROUND_TRIP_FEE_PCT = trade.assetType === 'CRYPTO' ? 0.2
        : trade.assetType === 'VN_STOCK' ? 0.4
        : 0.1;
    const EXIT_ONLY_FEE_PCT = trade.assetType === 'CRYPTO' ? 0.1
        : trade.assetType === 'VN_STOCK' ? 0.2
        : 0.05;
    const grossPnlPercent = (priceDiff / trade.entryPrice) * 100;
    const investedVND = Number(trade.investedAmount) || 0;

    if (trade.tp1Filled && Number(trade.tp1Fraction) > 0) {
        const remFrac = 1 - Number(trade.tp1Fraction);
        const leg2PnlPct = grossPnlPercent - EXIT_ONLY_FEE_PCT;
        const tp1PnlPct = ((isLong ? (Number(trade.tp1FillPrice) - trade.entryPrice) : (trade.entryPrice - Number(trade.tp1FillPrice))) / trade.entryPrice) * 100 - ROUND_TRIP_FEE_PCT;
        trade.pnlPercent = Math.round((Number(trade.tp1Fraction) * tp1PnlPct + remFrac * leg2PnlPct) * 100) / 100;
        const leg2Vnd = investedVND > 0
            ? investedVND * remFrac * (leg2PnlPct / 100)
            : (() => {
                let raw = trade.volume * remFrac * priceDiff;
                if (trade.assetType === 'CRYPTO') raw *= cachedUsdVndRate;
                return raw;
            })();
        trade.pnl = Math.round(Number(trade.realizedPartialPnl || 0) + leg2Vnd);
    } else {
        trade.pnlPercent = Math.round((grossPnlPercent - ROUND_TRIP_FEE_PCT) * 100) / 100;
        trade.pnl = investedVND > 0
            ? Math.round(investedVND * (trade.pnlPercent / 100))
            : (() => {
                let rawPnl = trade.volume * priceDiff;
                if (trade.assetType === 'CRYPTO') rawPnl *= cachedUsdVndRate;
                return Math.round(rawPnl);
            })();
    }
};

const handlePartialFill = async (trade, partialPrice) => {
    try {
        const isLong = trade.direction === 'LONG' || trade.direction === 'MUA';
        const fraction = Number(trade.tp1Fraction) || 0;
        if (fraction <= 0 || trade.tp1Filled) return;

        if (trade.executionMode === 'LIVE') {
            const runPartial = () => executeLivePartialExit({ trade, fraction, exitReason: `TP1 partial @ ${partialPrice}` })
                .catch(err => ({ success: false, message: err.message }));
            let r = await runPartial();
            if (!r.success) {
                await new Promise((res) => setTimeout(res, 1500));
                r = await runPartial();
            }
            if (!r.success) {
                console.log(chalk.bgRed.white(`  [LIVE PARTIAL FAIL] ${trade.symbol}: ${r.message} — đánh dấu emergency close.`));
                trade.executionMeta = {
                    ...(trade.executionMeta || {}),
                    emergencyClosePending: true,
                    emergencyCloseReason: r.message,
                };
                await trade.save();
                await sendTelegramMessage(
                    `🚨 <b>[LIVE PARTIAL FAIL]</b> ${escapeHtml(trade.symbol)}: ${escapeHtml(r.message)}\n⚠️ Sẽ đóng toàn bộ vị thế ở vòng pipeline kế.`,
                    { parseMode: 'HTML' }
                ).catch(() => {});
                return;
            }
            if (r.filledPrice) partialPrice = r.filledPrice;
        }

        const fee = trade.assetType === 'CRYPTO' ? 0.2 : trade.assetType === 'VN_STOCK' ? 0.4 : 0.1;
        const tp1PnlPct = ((isLong ? (partialPrice - trade.entryPrice) : (trade.entryPrice - partialPrice)) / trade.entryPrice) * 100 - fee;
        const investedVND = Number(trade.investedAmount) || 0;
        const realizedVnd = investedVND > 0
            ? investedVND * fraction * (tp1PnlPct / 100)
            : (() => {
                let raw = trade.volume * fraction * (isLong ? (partialPrice - trade.entryPrice) : (trade.entryPrice - partialPrice));
                if (trade.assetType === 'CRYPTO') raw *= cachedUsdVndRate;
                return raw;
            })();

        if (trade.executionMode === 'LIVE') {
            await sendTelegramMessage(
                `🎯 <b>[LIVE TP1]</b> ${escapeHtml(trade.symbol)}: chốt ${Math.round(fraction * 100)}% @ ${partialPrice} (+${tp1PnlPct.toFixed(2)}%).`,
                { parseMode: 'HTML' }
            ).catch(() => {});
        }

        trade.realizedPartialPnl = Math.round((Number(trade.realizedPartialPnl) || 0) + realizedVnd);
        trade.tp1Filled = true;
        trade.tp1FillPrice = partialPrice;
        const policy = getExitPolicyParams(trade.executionMode || 'SIMULATED', trade.assetType);
        const feePct = policy.breakevenFeePct || 0;
        const beSl = isLong
            ? Math.max(trade.stopLossPrice, trade.entryPrice * (1 + feePct))
            : Math.min(trade.stopLossPrice, trade.entryPrice * (1 - feePct));
        trade.stopLossPrice = beSl;

        await trade.save();
        console.log(chalk.green(
            `  [TP1 PARTIAL ${trade.executionMode === 'LIVE' ? '🔴 LIVE' : 'SIM'}] ${trade.symbol}: chốt ${Math.round(fraction * 100)}% @ ${partialPrice} (+${tp1PnlPct.toFixed(2)}%) | SL→BE ${trade.entryPrice} | runner ${Math.round((1 - fraction) * 100)}% chạy tiếp`
        ));
    } catch (err) {
        console.log(chalk.yellow(`  [TP1 PARTIAL] Lỗi xử lý ${trade.symbol}: ${err.message}`));
    }
};

// ── EXIT & AI LEARNING PIPELINE

async function runExitAndLearningPipeline(macroBundles = {}, isFastCheck = false) {
    // Engine TẮT → vẫn chạy nhưng CHỈ giám sát lệnh LIVE (lệnh thực trên sàn
    // không bao giờ bị bỏ rơi). Lệnh mô phỏng tạm đóng băng đến khi bật lại.
    let monitorLiveOnly = false;
    try {
        const enabledSetting = await Setting.findOne({ key: 'autoTradeEnabled' });
        const isDisabled = enabledSetting && (
            enabledSetting.value === false ||
            enabledSetting.value === 'false' ||
            enabledSetting.value === 0
        );
        if (isDisabled) {
            monitorLiveOnly = true;
        }
    } catch (err) {
        console.log(chalk.yellow(`[EXIT PIPELINE] Lỗi check autoTradeEnabled: ${err.message}`));
    }

    if (exitPipelineRunning) return;
    exitPipelineRunning = true;

    let vnMacro = macroBundles.vnMacro;
    let cryptoMacro = macroBundles.cryptoMacro;
    if (!vnMacro) {
        try {
            vnMacro = buildVnMacroSnapshot(await getVnMarketContext());
        } catch {
            vnMacro = buildVnMacroSnapshot();
        }
    }
    if (!cryptoMacro) {
        try {
            cryptoMacro = await getCryptoMacroContext();
        } catch {
            cryptoMacro = null;
        }
    }
    const exitMarketContext = { vnMacro, cryptoMacro };

    try {
        const tradeQuery = { status: { $in: ['OPEN', 'PENDING'] } };
        if (monitorLiveOnly) tradeQuery.executionMode = 'LIVE';
        const openTrades = await AutoTrade.find(tradeQuery);
        if (openTrades.length === 0) return;

        if (!isFastCheck) {
            console.log(chalk.gray(`\n[EXIT PIPELINE${monitorLiveOnly ? ' · LIVE-ONLY' : ''}] Kiểm tra ${openTrades.length} lệnh đang mở/chờ...`));
        }

        for (const trade of openTrades) {
            try {
                const tradeMacro = resolveExitMacroContext(trade, exitMarketContext);
                const { shouldClose, currentPrice, exitReason, trailingUpdated, slMoved, partialFill, partialPrice } = await checkExitConditions(trade, exitMarketContext, isFastCheck);

                // ── PARTIAL TP1: chốt một phần, dời SL phần còn lại về breakeven, GIỮ lệnh mở ──
                if (partialFill && !shouldClose) {
                    await handlePartialFill(trade, partialPrice);
                    continue;
                }

                if (trailingUpdated && !shouldClose) {
                    await trade.save();
                    if (slMoved) {
                        console.log(chalk.cyan(
                            `  [TRAIL] ${trade.symbol} dời SL → ${roundAssetPrice(trade.stopLossPrice, trade.assetType)}`
                        ));
                    }
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

                let liveExitMeta = null;
                if (trade.executionMode === 'LIVE') {
                    const liveExitResult = await executeLiveExit({ trade, exitReason }).catch(err => ({ success: false, message: err.message }));
                    if (!liveExitResult.success) {
                        console.log(chalk.bgRed.white(`  [LIVE EXIT FAIL] ${trade.symbol}: ${liveExitResult.message} — CẦN KIỂM TRA THỦ CÔNG TRÊN SÀN!`));
                        await sendTelegramMessage(
                            `🚨 <b>[LIVE EXIT FAIL]</b> Không đóng được vị thế thực ${escapeHtml(trade.symbol)}.\nLý do: ${escapeHtml(liveExitResult.message)}\n⚠️ Vui lòng kiểm tra và đóng thủ công trên sàn!`,
                            { parseMode: 'HTML' }
                        ).catch(() => {});
                    } else {
                        liveExitMeta = {
                            environment: liveExitResult.environment,
                            exchangeName: liveExitResult.exchangeName,
                            username: liveExitResult.username,
                            exitSide: liveExitResult.exitSide,
                            filledQuantity: liveExitResult.filledQuantity,
                            filledPrice: liveExitResult.filledPrice || liveExitResult.avgExitPrice,
                            marketType: liveExitResult.marketType || trade.marketType,
                            leverage: liveExitResult.leverage || trade.leverage || 1,
                        };
                    }
                    const fillPnl = await computeLivePnlFromExchangeOrders(trade, cachedUsdVndRate);
                    if (fillPnl) {
                        trade.pnlPercent = fillPnl.pnlPercent;
                        trade.pnl = fillPnl.pnl;
                        trade.exitPrice = fillPnl.exitPrice || trade.exitPrice;
                        if (fillPnl.entryPrice) trade.entryPrice = fillPnl.entryPrice;
                        if (liveExitMeta && fillPnl.exitPrice) liveExitMeta.filledPrice = fillPnl.exitPrice;
                    } else {
                        applySimulatedClosedPnl(trade, currentPrice);
                    }
                } else {
                    applySimulatedClosedPnl(trade, currentPrice);
                }

                const isWin = trade.pnlPercent > 0;
                const exitTag = exitReason.includes('TP HIT') ? 'TP_HIT'
                    : exitReason.includes('TRAIL/BE') ? 'TRAIL_EXIT'
                    : exitReason.includes('SL HIT') ? 'SL_HIT'
                    : exitReason.includes('emergency close') ? 'EMERGENCY_EXIT'
                    : exitReason.includes('Timeout') ? 'TIMEOUT_EXIT'
                    : exitReason.includes('Đảo chiều') ? 'REVERSAL_EXIT'
                    : 'MANUAL_EXIT';

                trade.exitReason = exitReason;
                trade.exitTag = exitTag;

                await trade.save();

                // ── Hoàn tất gói FIXED đã match ──
                const boundUserOrders = await UserOrder.find({ assignedTrade: trade._id, status: 'MATCHED' });
                for (const uOrder of boundUserOrders) {
                    uOrder.status          = 'COMPLETED';
                    uOrder.result.finalPnl = Math.round(uOrder.capital * (trade.pnlPercent / 100));
                    uOrder.result.message  = `Vị thế đã đóng. PnL thực tế: ${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent}%. Lý do: ${exitReason}`;
                    await uOrder.save();
                }

                // ── Giải phóng vốn gói PORTFOLIO (trước Telegram để gộp 1 tin) ──
                const portfolioMeta = [];
                const portfolioOrders = await UserOrder.find({
                    allocationMode: 'PORTFOLIO',
                    'tradeAllocations.trade': trade._id,
                    status: { $in: ['ACTIVE', 'STOPPED'] },
                });
                for (const pOrder of portfolioOrders) {
                    const released = releaseAllocation(pOrder, trade._id, trade.pnlPercent);
                    if (released) {
                        if (released.counted === false) {
                            pOrder.result.message = `[PORTFOLIO] ${trade.symbol} UNMATCHED đóng mô phỏng: ${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent}%. Không cộng vào PnL/quỹ LIVE.`;
                            await pOrder.save();
                            continue;
                        }
                        const effectiveCapital = getEffectivePortfolioCapital(pOrder);
                        const matchedRealizedPnl = getMatchedRealizedPnl(pOrder);
                        const matchedUsedCapital = getMatchedAllocations(pOrder)
                            .filter(a => !a.closedAt)
                            .reduce((s, a) => s + (Number(a.amount) || 0), 0);
                        pOrder.result.finalPnl = matchedRealizedPnl;
                        pOrder.result.message = `[PORTFOLIO] ${trade.symbol} đóng: ${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent}% (${released.pnl >= 0 ? '+' : ''}${Math.round(released.pnl / 1000)}k). Quỹ: ${(effectiveCapital / 1e6).toFixed(2)}Tr | PnL tích lũy: ${matchedRealizedPnl >= 0 ? '+' : ''}${Math.round(matchedRealizedPnl / 1000)}k.`;
                        await pOrder.save();
                        if (trade.executionMode === 'LIVE') {
                            portfolioMeta.push({
                                username: pOrder.username,
                                effectiveCapital,
                                matchedRealizedPnl,
                                matchedUsedCapital,
                            });
                        }
                    }
                }

                // ── THÔNG BÁO ĐÓNG LỆNH (1 tin LIVE: fill + PnL + portfolio) ──
                if (trade.executionMode === 'LIVE') {
                    const closeMeta = {
                        ...(liveExitMeta || {}),
                        portfolio: portfolioMeta,
                    };
                    await sendTelegramMessage(buildAutoTradeCloseMessage(trade, exitReason, closeMeta)).catch(() => {});
                    const pnlLabel = trade.pnlPercent >= 0 ? chalk.green(`+${trade.pnlPercent}%`) : chalk.red(`${trade.pnlPercent}%`);
                    console.log(chalk.bgYellow.black(
                        `[ĐÓNG LỆNH LIVE] ${trade.symbol} @ ${currentPrice} | PnL: ` + pnlLabel + ` | ${exitReason}`
                    ));
                } else {
                    console.log(chalk.gray(
                        `  [SIM CLOSE] ${trade.symbol} @ ${currentPrice} | PnL: ${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent}% | ${exitReason}`
                    ));
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
- Trạng thái thị trường: ${tradeMacro.marketStatus}
- Breakdown tín hiệu: ${JSON.stringify(trade.signalBreakdown || {})}

Bài học kinh nghiệm (tiếng Việt, 2-3 câu thực chiến):`;

                    const lessonText = await generateWithRole('pm', reflectivePrompt, { maxTokens: 500, temperature: 0.4 });

                    const behaviorLog = new AiBehavior({
                        symbol:         trade.symbol,
                        assetType:      trade.assetType,
                        action:         trade.direction,
                        predictedScore: trade.aiScore,
                        actualPnl:      trade.pnlPercent,
                        marketCondition: tradeMacro.marketStatus,
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

// ── WIN/LOSS ANALYTICS — see tradeAnalyticsService.js
export { getTradeAnalytics, getUnifiedTradeAnalytics, summarizeAnalytics, computeExpectancyStats } from './tradeAnalyticsService.js';

export const startAutoDuckScheduler = () => {
    console.log(chalk.bold.green('🚀 [AUTODUCK v2 SCHEDULER] Hệ thống tuần hoàn lệnh thực tế đã lên lịch.'));

    const runningPipelines = new Set();
    const runIntervalTask = async (label, task) => {
        try {
            await task();
        } catch (err) {
            console.error(chalk.red(`[AUTODUCK INTERVAL ${label}] ${err?.stack || err?.message || err}`));
        }
    };

    const runScheduledPipeline = async (label, forcedAssetType = null, options = {}) => {
        if (runningPipelines.has(label)) {
            console.log(chalk.gray(`[AUTODUCK] Bỏ qua chu kỳ ${label}: pipeline trước vẫn đang chạy.`));
            return;
        }

        runningPipelines.add(label);
        try {
            await runAutoTradePipeline(forcedAssetType, options);
        } catch (err) {
            console.error(chalk.red(`[SCHEDULER ${label}] ${err.message}`));
        } finally {
            runningPipelines.delete(label);
        }
    };

    Setting.findOne({ key: 'lastAutoTradePipelineRun' }).then(setting => {
        const lastRun = setting ? Number(setting.value) : 0;
        const now = Date.now();
        if (now - lastRun > 10 * 60 * 1000) {
            runScheduledPipeline('ALL');
        } else {
            console.log(chalk.yellow(`[AUTODUCK] Bỏ qua lần chạy khởi động do mới quét cách đây ${Math.round((now - lastRun) / 60000)} phút.`));
        }
    }).catch(err => {
        console.log(chalk.yellow(`[AUTODUCK] Lỗi check lastAutoTradePipelineRun, vẫn chạy mặc định: ${err.message}`));
        runScheduledPipeline('ALL');
    });

    setInterval(() => runIntervalTask('CRYPTO', async () => {
        await runScheduledPipeline('CRYPTO', 'CRYPTO');
    }), 15 * 60 * 1000);

    setInterval(() => runIntervalTask('IDLE_FAST', async () => {
        try {
            const liveWaiting = await UserOrder.countDocuments({
                status: { $in: ['PENDING', 'ACTIVE'] },
                executionMode: 'LIVE',
            });
            if (liveWaiting > 0) {
                resetIdleScanState(`${liveWaiting} gói LIVE đang chờ — tạm dừng idle SIM relax`);
                return;
            }

            const [openCount, maxConcurrentSetting] = await Promise.all([
                AutoTrade.countDocuments({ status: { $in: ['OPEN', 'PENDING'] } }),
                Setting.findOne({ key: 'autoTradeMaxConcurrent' }).lean(),
            ]);
            const target = pickIdleTarget(maxConcurrentSetting?.value);
            idleScanState.lastOpenCount = openCount;
            if (openCount >= target) {
                resetIdleScanState(`đã có ${openCount}/${target} lệnh mở`);
                return;
            }
            if (openCount > 0 && idleScanState.attempts === 0) {
                return;
            }

            if (idleScanState.attempts >= IDLE_RELAX_MAX_ATTEMPTS) {
                resetIdleScanState(`quá ${IDLE_RELAX_MAX_ATTEMPTS} lượt không tìm được mã đạt chuẩn`);
                return;
            }

            const relax = Math.min(IDLE_RELAX_MAX_SCORE, (idleScanState.attempts + 1) * IDLE_RELAX_STEP_SCORE);
            idleScanState.attempts++;
            console.log(chalk.yellow(`[AUTODUCK IDLE] Lệnh mở ${openCount}/${target} → quét nhanh CRYPTO, nới ngưỡng -${relax} (lượt ${idleScanState.attempts}/${IDLE_RELAX_MAX_ATTEMPTS}).`));

            await runScheduledPipeline('IDLE_FAST', 'CRYPTO', {
                schedulerMode: 'IDLE_FAST',
                thresholdRelax: relax,
                minOpenTarget: target,
            });

            const afterOpenCount = await AutoTrade.countDocuments({ status: { $in: ['OPEN', 'PENDING'] } });
            idleScanState.lastOpenCount = afterOpenCount;
            if (afterOpenCount >= target) {
                resetIdleScanState(`đã đạt ${afterOpenCount}/${target} lệnh`);
            }
        } catch (err) {
            console.log(chalk.yellow(`[AUTODUCK IDLE] Lỗi idle fast scan: ${err.message}`));
        }
    }), IDLE_FAST_SCAN_INTERVAL_MS);

    setInterval(() => runIntervalTask('ALL', async () => {
        if (isVNMarketOpen() || isPreMarket() || isATOPeriod() || isATCPeriod()) {
            await runScheduledPipeline('ALL');
        }
    }), 15 * 60 * 1000);

    setInterval(() => runIntervalTask('EXIT_FAST_MONITOR', async () => {
        if (!exitPipelineRunning) {
            await runExitAndLearningPipeline({}, true);
        }
    }), 30 * 1000);

    // Giám sát lệnh MANUAL (/trade): fill entry, scale-out TP, SL, dời breakeven.
    setInterval(() => runIntervalTask('MANUAL_MONITOR', async () => {
        await monitorManualTrades().catch(err => console.log(chalk.yellow(`[MANUAL MONITOR] ${err.message}`)));
    }), 20 * 1000);

    let dailyReportSentForDay = -1;
    setInterval(() => runIntervalTask('DAILY_PNL', async () => {
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
    }), 5 * 60 * 1000);
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

// ── TELEGRAM COMMAND HANDLER ─────────────────────────────────────────────────

/**
 * getSystemStatus()
 * Thu thập toàn bộ dữ liệu cần thiết cho dashboard /check:
 *   - Vốn tổng / đang dùng / còn lại
 *   - Danh sách lệnh đang OPEN/PENDING (kèm giá thực tế hiện tại nếu lấy được)
 *   - Thống kê 30 ngày (winRate, avgPnl, totalPnl, ...)
 *
 * Hàm này được tách riêng để dễ tái sử dụng từ REST API hoặc lên lịch định kỳ.
 */
export const getAdaptiveGuards = () => ({
    sim: { ...adaptiveGuardsSim },
    live: { ...adaptiveGuardsLive },
});

export const getTelegramSystemHealth = async () => {
    const settingsRaw = await Setting.find({
        key: { $in: ['autoTradeTotalCapital', 'autoTradeMaxConcurrent', 'autoTradeRiskLevel', 'autoTradeEnabled'] },
    }).lean();
    const settingsMap = settingsRaw.reduce((acc, s) => { acc[s.key] = s.value; return acc; }, {});
    const currentRiskLevel = Number(settingsMap.autoTradeRiskLevel) || 2;
    const riskConfig = getRiskConfig(currentRiskLevel);
    const enabledSetting = settingsMap.autoTradeEnabled;
    const autoTradeEnabled = !(enabledSetting === false || enabledSetting === 'false' || enabledSetting === 0);

    return {
        pipelineState: {
            manuallyStopped: autoTradeManuallyStopped,
            pipelineRunning: autoTradePipelineRunning,
            autoTradeEnabled,
        },
        riskLevel: currentRiskLevel,
        riskName: riskConfig.name,
        maxConcurrent: Number(settingsMap.autoTradeMaxConcurrent) || 10,
        adaptiveSim: getAdaptiveGuards().sim,
        adaptiveLive: getAdaptiveGuards().live,
        providers: getRateLimitStatus(),
        audit: getAuditStatus(),
        recentPipelineLogs: (getPipelineLogs().logs || []).slice(-3),
    };
};

const resolveFunnelAsset = (arg = '') => {
    const a = String(arg || 'crypto').toLowerCase();
    if (['vn', 'stock', 'vnstock', 'vn_stock'].includes(a)) return { key: 'VN_STOCK', label: 'VN_STOCK' };
    if (['deriv', 'derivatives', 'vn30', 'phaisinh'].includes(a)) return { key: 'DERIVATIVES', label: 'DERIVATIVES' };
    return { key: 'CRYPTO', label: 'CRYPTO' };
};

export const getSystemStatus = async () => {
    // 1. Cài đặt vốn
    const settingsRaw = await Setting.find({
        key: { $in: ['autoTradeTotalCapital', 'autoTradeMaxConcurrent', 'autoTradeRiskLevel', 'autoTradeEnabled'] },
    }).lean();
    const settingsMap = settingsRaw.reduce((acc, s) => { acc[s.key] = s.value; return acc; }, {});
    const totalCapital       = Number(settingsMap.autoTradeTotalCapital)  || 5_000_000_000;
    const maxConcurrent      = Number(settingsMap.autoTradeMaxConcurrent) || 10;
    const currentRiskLevel   = Number(settingsMap.autoTradeRiskLevel)     || 2;
    const riskConfig         = getRiskConfig(currentRiskLevel);
    const autoTradeEnabled   = !(settingsMap.autoTradeEnabled === false || settingsMap.autoTradeEnabled === 'false' || settingsMap.autoTradeEnabled === 0);

    // 2. Lệnh đang mở
    const rawOpenTrades = await AutoTrade.find({ status: { $in: ['OPEN', 'PENDING'] } }).lean();
    const allocatedCapital = rawOpenTrades.reduce((sum, t) => sum + (Number(t.investedAmount) || 0), 0);

    // 3. Lấy giá thực tế hiện tại cho từng lệnh (best-effort, không throw)
    const openTrades = await Promise.all(rawOpenTrades.map(async (t) => {
        try {
            const price = await fetchCurrentPrice(t.symbol, t.assetType);
            return { ...t, currentPrice: Number.isFinite(price) ? price : null };
        } catch {
            return { ...t, currentPrice: null };
        }
    }));

    // 4. Thống kê 30 ngày — tổng / auto / manual / LIVE / SIM
    let stats30d = {};
    let stats30dLive = {};
    let stats30dSim = {};
    let stats30dAuto = {};
    let stats30dManual = {};
    let hasManualEver = false;
    let statsToday = null;
    try {
        const [unified, today] = await Promise.all([
            getUnifiedTradeAnalytics({ days: 30 }),
            getTodayClosedTradesSummary(),
        ]);
        hasManualEver = unified.hasManualEver;
        stats30d = summarizeAnalytics(unified.combined);
        stats30dAuto = summarizeAnalytics(unified.auto.total);
        stats30dManual = summarizeAnalytics(unified.manual);
        stats30dLive = summarizeAnalytics(unified.auto.live);
        stats30dSim = summarizeAnalytics(unified.auto.sim);
        statsToday = today;
    } catch (err) {
        console.log(chalk.yellow(`[STATUS] Không lấy được analytics: ${err.message}`));
    }

    const usdVndRate = await getUsdVndRate().catch(() => 25_000);

    return {
        totalCapital,
        allocatedCapital,
        freeCapital: totalCapital - allocatedCapital,
        utilizationPct: totalCapital > 0 ? (allocatedCapital / totalCapital * 100) : 0,
        openCount:    openTrades.filter(t => t.status === 'OPEN').length,
        pendingCount: openTrades.filter(t => t.status === 'PENDING').length,
        maxConcurrent,
        riskLevel:    currentRiskLevel,
        riskName:     riskConfig.name,
        openTrades,
        stats30d,
        stats30dAuto,
        stats30dManual,
        stats30dLive,
        stats30dSim,
        hasManualEver,
        statsToday,
        usdVndRate,
        pipelineState: {
            manuallyStopped: autoTradeManuallyStopped,
            pipelineRunning: autoTradePipelineRunning,
            autoTradeEnabled,
        },
        generatedAt:  new Date().toISOString(),
    };
};

/**
 * handleTelegramCommand(text, meta)
 * Xử lý lệnh Telegram từ webhook. Trả lời về chatId người gửi (meta.chatId).
 */
export const handleTelegramCommand = async (text = '', meta = {}) => {
    const raw = String(text).trim();
    const cmd = raw.toLowerCase().replace(/^\//, '');
    const parts = cmd.split(/\s+/);
    const firstWord = parts[0];
    const secondArg = parts[1];
    const username = meta.username || 'unknown';

    const reply = async (msg, opts = {}) => {
        await sendTelegramMessage(msg, { chatId: meta.chatId, parseMode: 'none', ...opts }).catch(() => {});
    };

    // ── /trade — Lệnh manual khớp thẳng ra sàn LIVE ──
    if (firstWord === 'trade') {
        const result = await createManualTrade({ rawCommand: raw, requestedBy: username });
        if (!result.success) await reply(result.message);
        return result.message;
    }

    // ── /close <mã> ──
    if (firstWord === 'close') {
        const arg = secondArg;
        if (!arg) {
            const m = `❌ Cú pháp: /close <mã> (vd: /close gmx)`;
            await reply(m);
            return m;
        }
        const result = await closeManualTrade(arg, username);
        await reply(result.message);
        return result.message;
    }

    // ── /manual (/mtrade) ──
    if (firstWord === 'manual' || firstWord === 'mtrade') {
        try {
            const list = await listOpenManualTrades();
            if (!list.length) {
                const m = `🙋 Không có lệnh manual nào đang mở.`;
                await reply(m);
                return m;
            }
            const lines = list.map(t => {
                const tpDone = (t.tpFills || []).length;
                const st = t.status === 'PENDING_ENTRY' ? '⏳ chờ khớp' : '🟢 đang chạy';
                return `${st} ${t.symbol} @ ${t.entryPrice} [@${t.requestedBy}]\n   TP ${t.tpLevels.join('/')} (chốt ${tpDone}/${t.tpLevels.length}) | SL ${t.slPrice} | còn ${Number(t.remainingQty || 0).toFixed(6)}`;
            });
            const m = `🙋 LỆNH MANUAL ĐANG MỞ (${list.length})\n━━━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}`;
            await reply(m);
            return m;
        } catch (err) {
            const m = `❌ Lỗi /manual: ${err.message}`;
            await reply(m);
            return m;
        }
    }

    // ── /market (/mkt) ──
    if (firstWord === 'market' || firstWord === 'mkt') {
        try {
            const [vn, crypto, insight] = await Promise.all([
                getVnMarketContext().catch(() => null),
                getCryptoMacroContext().catch(() => null),
                getCachedMarketInsight().catch(() => null),
            ]);
            let btc = 'N/A', eth = 'N/A', vnIndex = null;
            try {
                const [b, e, idx] = await Promise.all([
                    axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', { timeout: 6000 }),
                    axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT', { timeout: 6000 }),
                    axios.get(
                        `https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${Math.floor(Date.now() / 1000) - 5 * 86400}&to=${Math.floor(Date.now() / 1000)}&symbol=VNINDEX&resolution=1D`,
                        { timeout: 6000 }
                    ).catch(() => null),
                ]);
                btc = `${Number(b.data.lastPrice).toLocaleString('en-US')} (${Number(b.data.priceChangePercent).toFixed(2)}%)`;
                eth = `${Number(e.data.lastPrice).toLocaleString('en-US')} (${Number(e.data.priceChangePercent).toFixed(2)}%)`;
                const closes = idx?.data?.c;
                if (closes?.length >= 2) {
                    const last = closes[closes.length - 1];
                    const prev = closes[closes.length - 2];
                    const pct = prev ? ((last - prev) / prev) * 100 : 0;
                    vnIndex = `${Number(last).toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
                }
            } catch (_) {}
            const m = buildMarketOverviewMessage({
                vn,
                crypto: crypto || {},
                insight,
                btc,
                eth,
                vnIndex,
                vnMarketOpen: isVNMarketOpen(),
            });
            await reply(m, { parseMode: 'HTML' });
            return m;
        } catch (err) {
            const m = `❌ Lỗi /market: ${err.message}`;
            await reply(m);
            return m;
        }
    }

    // ── /check (/status) ──
    if (firstWord === 'check' || firstWord === 'status') {
        console.log(chalk.cyan(`[TELEGRAM CMD] /check — Đang thu thập dữ liệu dashboard...`));
        try {
            const statusData = await getSystemStatus();
            const message = buildCheckDashboardMessage(statusData);
            await reply(message);
            console.log(chalk.green(`[TELEGRAM CMD] /check — Đã gửi dashboard (${statusData.openCount} lệnh mở)`));
            return message;
        } catch (err) {
            const errMsg = `❌ Lỗi khi lấy dữ liệu: ${err.message}`;
            await reply(errMsg);
            console.log(chalk.red(`[TELEGRAM CMD] /check lỗi: ${err.message}`));
            return errMsg;
        }
    }

    // ── /stop ──
    if (firstWord === 'stop') {
        autoTradeManuallyStopped = true;
        const msg = `⏸ Auto-trade đã TẮT — Gõ /start để bật lại.`;
        await reply(msg);
        console.log(chalk.yellow(`[TELEGRAM CMD] /stop — Pipeline đã bị khoá thủ công`));
        return msg;
    }

    // ── /start ──
    if (firstWord === 'start') {
        autoTradeManuallyStopped = false;
        const msg = `▶️ Auto-trade đã BẬT — Pipeline sẽ chạy chu kỳ tiếp theo.`;
        await reply(msg);
        console.log(chalk.green(`[TELEGRAM CMD] /start — Pipeline đã được mở khoá`));
        return msg;
    }

    // ── /sim ──
    if (firstWord === 'sim') {
        try {
            const [sims, stats30dSim] = await Promise.all([
                AutoTrade.find({
                    status: { $in: ['OPEN', 'PENDING'] },
                    executionMode: { $ne: 'LIVE' },
                }).sort({ openedAt: -1 }).limit(15).lean(),
                getTradeAnalytics({ days: 30, executionMode: 'SIMULATED' }),
            ]);
            const simTrades = await Promise.all(sims.map(async (t) => {
                try {
                    const price = await fetchCurrentPrice(t.symbol, t.assetType);
                    return { ...t, currentPrice: Number.isFinite(price) ? price : null };
                } catch {
                    return { ...t, currentPrice: null };
                }
            }));
            const msg = buildSimDetailMessage({
                simTrades,
                stats30dSim: summarizeAnalytics(stats30dSim),
            });
            await reply(msg);
            return msg;
        } catch (err) {
            const errMsg = `❌ Lỗi /sim: ${err.message}`;
            await reply(errMsg);
            return errMsg;
        }
    }

    // ── /live ──
    if (firstWord === 'live') {
        try {
            const usdVndRate = await getUsdVndRate().catch(() => 25_000);
            const [rawLive, recentOrders, stats30dLive] = await Promise.all([
                AutoTrade.find({ status: { $in: ['OPEN', 'PENDING'] }, executionMode: 'LIVE' })
                    .sort({ openedAt: -1 }).limit(10).lean(),
                ExchangeOrder.find({}).sort({ sentAt: -1 }).limit(5).lean(),
                getTradeAnalytics({ days: 30, executionMode: 'LIVE' }),
            ]);
            const liveTrades = await Promise.all(rawLive.map(async (t) => {
                try {
                    const price = await fetchCurrentPrice(t.symbol, t.assetType);
                    return { ...t, currentPrice: Number.isFinite(price) ? price : null };
                } catch {
                    return { ...t, currentPrice: null };
                }
            }));
            const msg = buildLiveDetailMessage({
                liveTrades,
                recentOrders,
                stats30dLive: summarizeAnalytics(stats30dLive),
                usdVndRate,
            });
            await reply(msg);
            return msg;
        } catch (err) {
            const errMsg = `❌ Lỗi /live: ${err.message}`;
            await reply(errMsg);
            return errMsg;
        }
    }

    // ── /portfolio (/pf) ──
    if (firstWord === 'portfolio' || firstWord === 'pf') {
        try {
            const portfolios = await UserOrder.find({
                allocationMode: 'PORTFOLIO',
                status: { $in: ['ACTIVE', 'PENDING'] },
            }).lean();

            if (!portfolios.length) {
                const msg = `💼 Không có gói portfolio nào đang chạy.`;
                await reply(msg);
                return msg;
            }
            const rows = portfolios.map((p) => {
                const matchedAllocs = getMatchedAllocations(p);
                const openAllocs = matchedAllocs.filter(a => !a.closedAt).length;
                const closedAllocs = matchedAllocs.filter(a => a.closedAt);
                const wins = closedAllocs.filter(a => a.pnl > 0).length;
                const winRate = closedAllocs.length > 0 ? Math.round(wins / closedAllocs.length * 100) : 0;
                const exp = computeExpectancyStats(closedAllocs, { getPnl: (a) => Number(a.pnl) || 0, unit: 'vnd' });
                const usedCapital = matchedAllocs.filter(a => !a.closedAt).reduce((s, a) => s + (Number(a.amount) || 0), 0);
                return {
                    username: p.username,
                    executionMode: p.executionMode,
                    effectiveCapital: getEffectivePortfolioCapital(p),
                    usedCapital,
                    openCount: openAllocs,
                    closedCount: closedAllocs.length,
                    realizedPnl: getMatchedRealizedPnl(p),
                    winRate,
                    avgWinVnd: exp.avgWin,
                    avgLossVnd: exp.avgLoss,
                    expectancyVnd: exp.expectancy,
                    allocationPercent: p.allocationPercent,
                    maxConcurrentOrders: p.maxConcurrentOrders,
                    dynamicSizing: p.dynamicSizing,
                };
            });
            const msg = buildPortfolioMessage(rows);
            await reply(msg);
            return msg;
        } catch (err) {
            const errMsg = `❌ Lỗi /portfolio: ${err.message}`;
            await reply(errMsg);
            return errMsg;
        }
    }

    // ── /stats (/thongke) [days] ──
    if (firstWord === 'stats' || firstWord === 'thongke') {
        try {
            const days = Math.min(90, Math.max(1, Number(secondArg) || 30));
            const unified = await getUnifiedTradeAnalytics({ days });
            const msg = buildStatsMessage({
                days,
                hasManualEver: unified.hasManualEver,
                combined: unified.combined,
                auto: unified.auto.total,
                autoLive: unified.auto.live,
                autoSim: unified.auto.sim,
                manual: unified.manual,
            });
            await reply(msg);
            return msg;
        } catch (err) {
            const errMsg = `❌ Lỗi /stats: ${err.message}`;
            await reply(errMsg);
            return errMsg;
        }
    }

    // ── /funnel (/scan) [crypto|vn|deriv] ──
    if (firstWord === 'funnel' || firstWord === 'scan') {
        try {
            const { key, label } = resolveFunnelAsset(secondArg);
            const funnel = getLatestFunnel(key);
            const msg = buildFunnelMessage(funnel, label);
            await reply(msg);
            return msg;
        } catch (err) {
            const errMsg = `❌ Lỗi /funnel: ${err.message}`;
            await reply(errMsg);
            return errMsg;
        }
    }

    // ── /insight (/baocao) ──
    if (firstWord === 'insight' || firstWord === 'baocao') {
        try {
            const insight = await getTodayInsight();
            const msg = buildInsightMessage(insight);
            await reply(msg, { parseMode: 'HTML' });
            return msg;
        } catch (err) {
            const errMsg = `❌ Lỗi /insight: ${err.message}`;
            await reply(errMsg);
            return errMsg;
        }
    }

    // ── /health (/system) ──
    if (firstWord === 'health' || firstWord === 'system') {
        try {
            const health = await getTelegramSystemHealth();
            const msg = buildHealthMessage(health);
            await reply(msg);
            return msg;
        } catch (err) {
            const errMsg = `❌ Lỗi /health: ${err.message}`;
            await reply(errMsg);
            return errMsg;
        }
    }

    // ── /settings (/cauhinh) ──
    if (firstWord === 'settings' || firstWord === 'cauhinh') {
        try {
            const settingsRaw = await Setting.find({
                key: { $in: ['autoTradeTotalCapital', 'autoTradeMaxConcurrent', 'autoTradeRiskLevel', 'autoTradeEnabled'] },
            }).lean();
            const settingsMap = settingsRaw.reduce((acc, s) => { acc[s.key] = s.value; return acc; }, {});
            const riskLevel = Number(settingsMap.autoTradeRiskLevel) || 2;
            const usdVndRate = await getUsdVndRate().catch(() => 25_000);
            const msg = buildSettingsMessage({
                autoTradeTotalCapital: Number(settingsMap.autoTradeTotalCapital) || 5_000_000_000,
                autoTradeMaxConcurrent: Number(settingsMap.autoTradeMaxConcurrent) || 10,
                autoTradeRiskLevel: riskLevel,
                riskName: getRiskConfig(riskLevel).name,
                autoTradeEnabled: !(settingsMap.autoTradeEnabled === false || settingsMap.autoTradeEnabled === 'false' || settingsMap.autoTradeEnabled === 0),
                usdVndRate,
            });
            await reply(msg);
            return msg;
        } catch (err) {
            const errMsg = `❌ Lỗi /settings: ${err.message}`;
            await reply(errMsg);
            return errMsg;
        }
    }

    // ── /ai (/lessons) ──
    if (firstWord === 'ai' || firstWord === 'lessons') {
        try {
            const [lessons, analytics] = await Promise.all([
                AiBehavior.find({}).sort({ date: -1 }).limit(5).lean(),
                getTradeAnalytics({ days: 30 }),
            ]);
            const msg = buildAiLessonsMessage({
                lessons,
                aiLearning: analytics.error ? {} : analytics.aiLearning,
            });
            await reply(msg);
            return msg;
        } catch (err) {
            const errMsg = `❌ Lỗi /ai: ${err.message}`;
            await reply(errMsg);
            return errMsg;
        }
    }

    // ── /broker (/sàn) ──
    if (firstWord === 'broker' || firstWord === 'sàn' || firstWord === 'san') {
        try {
            const connections = await ExchangeConnection.find({}).sort({ updatedAt: -1 }).limit(10).lean();
            const msg = buildBrokerStatusMessage(connections);
            await reply(msg);
            return msg;
        } catch (err) {
            const errMsg = `❌ Lỗi /broker: ${err.message}`;
            await reply(errMsg);
            return errMsg;
        }
    }

    // ── /pnl ──
    if (firstWord === 'pnl') {
        try {
            const today = await getTodayClosedTradesSummary();
            const msg = buildTodayPnLMessage({
                date: new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
                hasManualEver: today.hasManualEver,
                combined: today.combined,
                auto: today.auto,
                manual: today.manual,
                live: today.live,
                sim: today.sim,
                trades: today.trades,
                manualTrades: today.manualTrades,
            });
            await reply(msg);
            return msg;
        } catch (err) {
            const errMsg = `❌ Lỗi /pnl: ${err.message}`;
            await reply(errMsg);
            return errMsg;
        }
    }

    // ── /info (/i) — giá + kỹ thuật + tin/sentiment (không gọi AI live) ──
    if (firstWord === 'info' || firstWord === 'i') {
        const symbol = String(secondArg || '').toUpperCase().replace(/USDT$/i, '');
        if (!symbol) {
            const m = `❌ Cú pháp: /info <mã>\nVD: /info MBB  |  /info BTC`;
            await reply(m);
            return m;
        }
        try {
            await reply(`⏳ Đang lấy dữ liệu ${symbol}...`);
            console.log(chalk.cyan(`[TELEGRAM CMD] /info ${symbol}`));
            const data = await getSymbolInfo(symbol);
            const msg = buildSymbolInfoMessage(data);
            await reply(msg, { parseMode: 'HTML' });
            console.log(chalk.green(`[TELEGRAM CMD] /info ${symbol} — done (${data.asset})`));
            return msg;
        } catch (err) {
            const m = `❌ Lỗi /info ${symbol}: ${err.message}`;
            await reply(m);
            console.log(chalk.red(`[TELEGRAM CMD] /info lỗi: ${err.message}`));
            return m;
        }
    }

    // ── /help ──
    if (firstWord === 'help' || cmd === '') {
        const msg = buildHelpMessage();
        await reply(msg, { parseMode: 'HTML' });
        return msg;
    }

    // ── Lệnh không nhận dạng ──
    const unknown = `❓ Lệnh không hợp lệ: ${String(text).slice(0, 30)}\nGõ /help để xem danh sách lệnh.`;
    await reply(unknown);
    return unknown;
};
