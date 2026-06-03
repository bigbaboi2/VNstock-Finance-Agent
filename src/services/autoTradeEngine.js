import chalk from 'chalk';
import AutoTrade from '../../models/AutoTrade.js';
import UserOrder from '../../models/UserOrder.js';
import AiBehavior from '../../models/AiBehavior.js';
import Stock from '../../models/Stock.js';
import { analyzeMarketIntelligence } from './quantEngine.js';
import { scrapeCafefMarketOverview } from '../scrapers/cafefMarketScraper.js';
import { generateWithRole } from './multiProviderRouter.js';
import axios from 'axios';

// ============================================================
// CONSTANTS & HELPERS
// ============================================================

const ENTRADE_BASE = 'https://services.entrade.com.vn/chart-api/v2/ohlcs';

/** Kiểm tra giờ giao dịch VN (T2-T6, 9:00–14:45) */
const isVNMarketOpen = () => {
    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6) return false;
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= 540 && mins <= 885;
};

/** Kiểm tra ATO (9:00–9:15) — tránh vào lệnh khi giá chưa ổn định */
const isATOPeriod = () => {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= 540 && mins <= 555;
};

/** Kiểm tra ATC (14:30–14:45) — tránh vào lệnh cuối phiên */
const isATCPeriod = () => {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= 870 && mins <= 885;
};

// ============================================================
// REAL-TIME PRICE FETCHING
// ============================================================
const fetchOHLCV = async (symbol, resolution = '1D', days = 30) => {
    const to = Math.floor(Date.now() / 1000);
    const from = to - (days * 24 * 60 * 60);
    const isIndex = ['VNINDEX', 'VN30', 'HNX'].includes(symbol);
    const endpoint = isIndex ? `${ENTRADE_BASE}/index` : `${ENTRADE_BASE}/stock`;

    const res = await axios.get(`${endpoint}?from=${from}&to=${to}&symbol=${symbol}&resolution=${resolution}`, {
        timeout: 10000
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
const fetchCurrentPrice = async (symbol) => {
    if (symbol === 'BTCUSDT') {
        // Binance public API cho crypto
        const res = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT`, {
            timeout: 8000
        });
        return parseFloat(res.data.price);
    }

    const candles = await fetchOHLCV(symbol, '15', 2);
    return candles[candles.length - 1].close;
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
    // Simple average of last `period` TRs
    const recent = trs.slice(-period);
    return recent.reduce((a, b) => a + b, 0) / period;
};

/** RSI */
const calcRSI = (closes, period = 14) => {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
    }
    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
};

const calcVolumeSurge = (volumes) => {
    if (volumes.length < 5) return 1;
    const avg = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
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
        bwPct: (std * 2 * stdMult / mean) * 100, // Bandwidth %
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

    // ── Tính điểm từng thành phần (0-100 mỗi thành phần) ──
    let breakdown = {};

    // 1. EMA Trend (ema9 > ema21 > ema50 = bullish full stack)
    let emaTrendScore = 50;
    if (ema9 && ema21 && ema50) {
        if (ema9 > ema21 && ema21 > ema50)       emaTrendScore = 90; // full bull
        else if (ema9 < ema21 && ema21 < ema50)  emaTrendScore = 10; // full bear
        else if (ema9 > ema21)                    emaTrendScore = 65; // partial bull
        else                                      emaTrendScore = 35; // partial bear
    }
    breakdown.emaTrend = Math.round(emaTrendScore);

    // 2. RSI (30-70 tốt, <30 oversold cơ hội long, >70 overbought cơ hội short)
    let rsiScore = 50;
    if      (rsi < 25)  rsiScore = 85; // oversold mạnh → cơ hội long
    else if (rsi < 35)  rsiScore = 70; // oversold → long
    else if (rsi > 75)  rsiScore = 15; // overbought → short
    else if (rsi > 65)  rsiScore = 30; // overbought nhẹ → short
    else                rsiScore = 55; // neutral
    breakdown.rsi = Math.round(rsiScore);

    // 3. Bollinger position
    let bollScore = 50;
    if (boll) {
        const pctB = (currentPrice - boll.lower) / (boll.upper - boll.lower); // 0 = lower, 1 = upper
        if      (currentPrice > boll.upper)  bollScore = 75; // breakout trên
        else if (currentPrice < boll.lower)  bollScore = 25; // breakdown dưới
        else if (pctB > 0.7)                 bollScore = 65;
        else if (pctB < 0.3)                 bollScore = 35;
        else                                 bollScore = 50;
    }
    breakdown.bollinger = Math.round(bollScore);

    // 4. Volume surge (xác nhận tín hiệu — không có volume surge thì giảm trọng số)
    let volScore = 50;
    if      (volSurge >= 2.5) volScore = 90;
    else if (volSurge >= 1.5) volScore = 70;
    else if (volSurge >= 1.0) volScore = 50;
    else                      volScore = 30;
    breakdown.volumeSurge = Math.round(volScore);

    // 5. Market Breadth (từ quantEngine)
    let breadthScore = breadthRatio; // trực tiếp dùng breadthRatio (0-100)
    breakdown.breadth = Math.round(breadthScore);

    // 6. Market Status bonus
    let statusBonus = 50;
    if      (statusType === 'bullish') statusBonus = 75;
    else if (statusType === 'bearish') statusBonus = 25;
    else if (statusType === 'warning') statusBonus = 40;
    breakdown.marketStatus = Math.round(statusBonus);

    // ── Tổng hợp điểm (có trọng số) ──
    const weightedScore =
        breakdown.emaTrend    * 0.30 +
        breakdown.rsi         * 0.15 +
        breakdown.bollinger   * 0.15 +
        breakdown.volumeSurge * 0.20 +
        breakdown.breadth     * 0.10 +
        breakdown.marketStatus* 0.10;

    const finalScore = Math.min(100, Math.max(0, Math.round(weightedScore)));

    // ── Xác định hướng lệnh ──
    let direction = 'NEUTRAL';
    if (finalScore >= 65) {
        // Ưu tiên LONG khi EMA bullish + breadth tốt
        direction = (emaTrendScore >= 50 && breadthRatio >= 45) ? 'LONG' : 'SHORT';
    } else if (finalScore <= 35) {
        // SHORT khi điểm thấp + EMA bearish
        direction = (emaTrendScore <= 50 && breadthRatio <= 55) ? 'SHORT' : 'NEUTRAL';
    }

    // Override nếu full bearish
    if (emaTrendScore <= 15 && rsiScore >= 75) direction = 'SHORT';
    if (emaTrendScore >= 85 && rsiScore <= 30) direction = 'LONG';

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

// ============================================================
// AI SIGNAL CONFIRMATION (dùng AI để xác nhận tín hiệu kỹ thuật)
// ============================================================

const getAISignalConfirmation = async (asset, signal, marketStatus, diagnosticDesc) => {
    try {
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

[TRẠNG THÁI VĨ MÔ]
- Tình trạng thị trường: ${marketStatus}
- Chẩn đoán: ${diagnosticDesc}

[CHI TIẾT ĐIỂM]
- EMA Trend: ${signal.breakdown.emaTrend}/100
- RSI Score: ${signal.breakdown.rsi}/100
- Bollinger: ${signal.breakdown.bollinger}/100
- Volume: ${signal.breakdown.volumeSurge}/100
- Breadth: ${signal.breakdown.breadth}/100

Hãy phân tích xác nhận hoặc bác bỏ tín hiệu này trong 2-3 câu ngắn gọn, rõ ràng bằng tiếng Việt. Kết thúc bằng: "XÁC NHẬN" hoặc "BÁC BỎ".`;

        const response = await generateWithRole('derivatives', prompt, {
            maxTokens: 300,
            temperature: 0.3
        });

        const confirmed = response.toUpperCase().includes('XÁC NHẬN');
        return { confirmed, reason: response.trim() };

    } catch (err) {
        // Nếu AI không phản hồi, mặc định tin tín hiệu kỹ thuật nếu score cao
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

const checkExitConditions = async (trade) => {
    try {
        let currentPrice;

        if (trade.assetType === 'CRYPTO') {
            currentPrice = await fetchCurrentPrice('BTCUSDT');
        } else if (trade.assetType === 'DERIVATIVES') {
            currentPrice = await fetchCurrentPrice(trade.symbol);
        } else {
            // VN_STOCK
            currentPrice = await fetchCurrentPrice(trade.symbol);
        }

        const isLong  = trade.direction === 'LONG' || trade.direction === 'MUA';
        const isShort = trade.direction === 'SHORT' || trade.direction === 'BÁN';

        let shouldClose = false;
        let exitReason  = '';

        if (isLong) {
            if (currentPrice >= trade.takeProfitPrice) {
                shouldClose = true;
                exitReason  = `TP HIT: Giá ${currentPrice} chạm mục tiêu ${trade.takeProfitPrice}`;
            } else if (currentPrice <= trade.stopLossPrice) {
                shouldClose = true;
                exitReason  = `SL HIT: Giá ${currentPrice} phá đáy cắt lỗ ${trade.stopLossPrice}`;
            }
        } else if (isShort) {
            if (currentPrice <= trade.takeProfitPrice) {
                shouldClose = true;
                exitReason  = `TP HIT (SHORT): Giá ${currentPrice} rơi đến mục tiêu ${trade.takeProfitPrice}`;
            } else if (currentPrice >= trade.stopLossPrice) {
                shouldClose = true;
                exitReason  = `SL HIT (SHORT): Giá ${currentPrice} bật lên phá cắt lỗ ${trade.stopLossPrice}`;
            }
        }

        // Time-based exit: CRYPTO giữ tối đa 8 tiếng, VN tối đa 2 phiên giao dịch
        const maxHoldMs = trade.assetType === 'CRYPTO' ? 8 * 3600_000 : 2 * 24 * 3600_000;
        const holdMs    = Date.now() - new Date(trade.openedAt).getTime();
        if (!shouldClose && holdMs > maxHoldMs) {
            shouldClose = true;
            exitReason  = `Timeout: Lệnh quá thời hạn giữ tối đa (${Math.round(holdMs / 3600000)}h). Đóng để quản lý rủi ro.`;
        }

        return { shouldClose, currentPrice, exitReason };
    } catch (err) {
        console.log(chalk.yellow(`[EXIT CHECK] Không fetch được giá realtime cho ${trade.symbol}: ${err.message}`));
        return { shouldClose: false, currentPrice: null, exitReason: '' };
    }
};

// ============================================================
// CORE ENGINE LOOP
// ============================================================

export const runAutoTradePipeline = async (forcedAssetType = null) => {
    if (forcedAssetType === 'ALL') forcedAssetType = null;
    console.log(chalk.bgMagenta.black(`\n[AUTODUCK ENGINE v2] Khởi chạy chu kỳ rà soát thị trường thực tế...`));

    try {
        // ── 1. Thu thập dữ liệu thị trường vĩ mô từ QuantEngine ──
        let breadthRatio   = 50;
        let marketStatus   = 'ĐI NGANG TÍCH LŨY';
        let statusType     = 'neutral';
        let diagnosticDesc = 'Chưa có dữ liệu vĩ mô.';
        let topGainersFromMarket = [];
        let topLosersFromMarket  = [];

        try {
            const marketScraped = await scrapeCafefMarketOverview();
            if (marketScraped.success) {
                const to   = Math.floor(Date.now() / 1000);
                const from = to - (5 * 24 * 60 * 60);
                const vnRes = await axios.get(
                    `${ENTRADE_BASE}/index?from=${from}&to=${to}&symbol=VNINDEX&resolution=1D`,
                    { timeout: 10000 }
                ).catch(() => null);

                if (vnRes?.data?.t) {
                    const d          = vnRes.data;
                    const rawVnIndex = d.t.map((ts, i) => ({ close: Number(d.c[i]), volume: Number(d.v[i]) || 0 }));
                    const symbolsDb  = await Stock.find({}).limit(200);
                    const intel      = analyzeMarketIntelligence(rawVnIndex, marketScraped, symbolsDb);
                    if (intel.success) {
                        breadthRatio          = parseFloat(intel.intelligence.breadthRatio) || 50;
                        marketStatus          = intel.intelligence.marketStatus;
                        statusType            = intel.intelligence.statusType;
                        diagnosticDesc        = intel.intelligence.diagnosticDesc;
                        topGainersFromMarket  = intel.intelligence.topGainers || [];
                        topLosersFromMarket   = intel.intelligence.topLosers  || [];
                    }
                }
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
            targetAssets.push('CRYPTO'); // Crypto luôn active 24/7
            if (isVNMarketOpen()) {
                if (!isATOPeriod() && !isATCPeriod()) {
                    targetAssets.push('VN_STOCK');
                    targetAssets.push('DERIVATIVES');
                } else {
                    console.log(chalk.yellow('[AUTODUCK] ATO/ATC period — bỏ qua VN_STOCK & DERIVATIVES để tránh slippage.'));
                }
            } else {
                console.log(chalk.yellow('[AUTODUCK] VN Market đóng cửa — chỉ quét CRYPTO.'));
            }
        }

        // ── 3. Quét từng phân khúc ──
        for (const asset of targetAssets) {
            console.log(chalk.cyan(`\n[AUTODUCK] ═══ Quét phân khúc: ${asset} ═══`));

            // Chọn danh sách symbol cần scan
            let symbolsToScan = [];

            if (asset === 'VN_STOCK') {
                // Ưu tiên top gainers từ market scan + thêm các mã volume lớn từ DB
                const topGainerSymbols = topGainersFromMarket.slice(0, 3).map(s => s.symbol);
                const dbHighVol = await Stock.find({ volume: { $gt: 1_000_000 } })
                                            .sort({ changePct: -1 })
                                            .limit(5)
                                            .lean();
                const dbSymbols = dbHighVol.map(s => s.symbol);
                symbolsToScan = [...new Set([...topGainerSymbols, ...dbSymbols])].slice(0, 5);
                if (symbolsToScan.length === 0) symbolsToScan = ['FPT', 'VHM', 'VCB', 'HPG', 'MBB'];

            } else if (asset === 'DERIVATIVES') {
                symbolsToScan = ['VN30F1M'];

            } else if (asset === 'CRYPTO') {
                symbolsToScan = ['BTCUSDT'];
            }

            // ── 4. Phân tích từng symbol ──
            for (const symbol of symbolsToScan) {
                try {
                    console.log(chalk.gray(`  [SCAN] ${symbol}...`));

                    // Fetch OHLCV lịch sử để tính indicators
                    let candles;
                    try {
                        if (asset === 'CRYPTO') {
                            // Binance klines 1D
                            const binanceRes = await axios.get(
                                `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=60`,
                                { timeout: 10000 }
                            );
                            candles = binanceRes.data.map(k => ({
                                time:   k[0] / 1000,
                                open:   parseFloat(k[1]),
                                high:   parseFloat(k[2]),
                                low:    parseFloat(k[3]),
                                close:  parseFloat(k[4]),
                                volume: parseFloat(k[5]),
                            }));
                        } else {
                            candles = await fetchOHLCV(symbol, '1D', 60);
                        }
                    } catch (fetchErr) {
                        console.log(chalk.yellow(`  [SCAN] Không fetch được OHLCV ${symbol}: ${fetchErr.message}`));
                        continue;
                    }

                    // Phân tích kỹ thuật thực
                    const techSignal = analyzeTechnicalSignal(candles, breadthRatio, statusType);
                    techSignal.symbol = symbol;

                    console.log(chalk.gray(
                        `  → Score: ${techSignal.score}/100 | Dir: ${techSignal.direction} | RSI: ${techSignal.rsi} | VolSurge: ${techSignal.volumeSurge}x | ATR: ${techSignal.atr}`
                    ));

                    // Bỏ qua nếu tín hiệu NEUTRAL hoặc điểm thấp
                    if (techSignal.direction === 'NEUTRAL' || techSignal.score < 60) {
                        console.log(chalk.gray(`  [SKIP] ${symbol} — điểm ${techSignal.score} hoặc hướng NEUTRAL.`));
                        continue;
                    }

                    // Kiểm tra xem đã có lệnh OPEN cho symbol này chưa (tránh duplicate)
                    const existingOpen = await AutoTrade.findOne({ symbol, assetType: asset, status: 'OPEN' });
                    if (existingOpen) {
                        console.log(chalk.gray(`  [SKIP] ${symbol} — đã có lệnh OPEN, bỏ qua.`));
                        continue;
                    }

                    // ── 5. AI xác nhận tín hiệu ──
                    const aiConfirm = await getAISignalConfirmation(asset, techSignal, marketStatus, diagnosticDesc);
                    console.log(chalk.blue(`  [AI CONFIRM] ${aiConfirm.confirmed ? '✅ XÁC NHẬN' : '❌ BÁC BỎ'} — ${aiConfirm.reason.slice(0, 120)}`));

                    if (!aiConfirm.confirmed && techSignal.score < 75) {
                        // AI bác bỏ + score không đủ cao → bỏ qua
                        console.log(chalk.gray(`  [SKIP] ${symbol} — AI bác bỏ + score < 75.`));
                        continue;
                    }

                    // ── 6. Tính SL/TP động theo ATR ──
                    const entryPrice = techSignal.entryPrice;
                    const atr        = techSignal.atr || entryPrice * 0.02; // fallback 2%

                    // Nhân ATR với hệ số phù hợp từng asset
                    const atrMultiplierTP = asset === 'CRYPTO' ? 3.0 : (asset === 'DERIVATIVES' ? 2.5 : 2.0);
                    const atrMultiplierSL = asset === 'CRYPTO' ? 2.0 : (asset === 'DERIVATIVES' ? 1.8 : 1.5);

                    let takeProfitPrice, stopLossPrice;
                    if (techSignal.direction === 'LONG' || techSignal.direction === 'MUA') {
                        takeProfitPrice = Math.round((entryPrice + atr * atrMultiplierTP) * 100) / 100;
                        stopLossPrice   = Math.round((entryPrice - atr * atrMultiplierSL) * 100) / 100;
                    } else {
                        // SHORT
                        takeProfitPrice = Math.round((entryPrice - atr * atrMultiplierTP) * 100) / 100;
                        stopLossPrice   = Math.round((entryPrice + atr * atrMultiplierSL) * 100) / 100;
                    }

                    const volume = asset === 'CRYPTO' ? 0.05 : (asset === 'DERIVATIVES' ? 5 : 2000);
                    const investedAmount = entryPrice * volume;

                    // Direction label theo asset type
                    const directionLabel = asset === 'VN_STOCK'
                        ? (techSignal.direction === 'LONG' ? 'MUA' : 'BÁN')
                        : techSignal.direction;

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
                        status: 'OPEN',
                        marketCondition: marketStatus,
                        signalBreakdown: techSignal.breakdown,
                    });
                    await newTrade.save();

                    console.log(chalk.green.bold(
                        `  [LỆNH MỚI] ${directionLabel} ${symbol} @ ${entryPrice} | TP: ${takeProfitPrice} | SL: ${stopLossPrice} | Score: ${techSignal.score}`
                    ));

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

                        userOrder.assignedTrade = newTrade._id;
                        userOrder.status        = 'MATCHED';
                        userOrder.result.message = `[${directionLabel}] Đã khớp vào ${symbol} @ ${entryPrice}. TP: ${takeProfitPrice} | SL: ${stopLossPrice}. Mục tiêu: +${userOrder.targetPct}%.`;
                        await userOrder.save();
                        console.log(chalk.bgGreen.black(`  [AUTO-MATCH] User ${userOrder.username} → lệnh ${newTrade._id}`));
                    }

                } catch (symbolErr) {
                    console.log(chalk.yellow(`  [ERROR] Lỗi xử lý ${symbol}: ${symbolErr.message}`));
                    continue;
                }
            }
        }

        // ── 9. Vòng đóng lệnh theo SL/TP realtime ──
        await runExitAndLearningPipeline(marketStatus);

    } catch (err) {
        console.error(chalk.red(`[AUTODUCK CRITICAL ERROR] ${err.message}`));
    }
};

// ============================================================
// EXIT + AI LEARNING PIPELINE
// ============================================================

async function runExitAndLearningPipeline(currentMarketStatus) {
    const openTrades = await AutoTrade.find({ status: 'OPEN' });
    if (openTrades.length === 0) return;

    console.log(chalk.gray(`\n[EXIT PIPELINE] Kiểm tra ${openTrades.length} lệnh đang mở...`));

    for (const trade of openTrades) {
        const { shouldClose, currentPrice, exitReason } = await checkExitConditions(trade);

        if (!shouldClose) {
            if (currentPrice) {
                const pctFromEntry = ((currentPrice - trade.entryPrice) / trade.entryPrice * 100).toFixed(2);
                const isLong       = trade.direction === 'LONG' || trade.direction === 'MUA';
                const floatingPnl  = isLong ? pctFromEntry : (-pctFromEntry).toFixed(2);
                console.log(chalk.gray(
                    `  [HOLD] ${trade.symbol} | Giá TT: ${currentPrice} | Float PnL: ${floatingPnl > 0 ? '+' : ''}${floatingPnl}% | TP: ${trade.takeProfitPrice} | SL: ${trade.stopLossPrice}`
                ));
            }
            continue;
        }

        // Tính PnL thực tế
        const isLong = trade.direction === 'LONG' || trade.direction === 'MUA';
        const priceDiff = isLong
            ? (currentPrice - trade.entryPrice)
            : (trade.entryPrice - currentPrice);

        trade.exitPrice  = currentPrice;
        trade.status     = 'CLOSED';
        trade.closedAt   = new Date();
        trade.pnlPercent = Math.round((priceDiff / trade.entryPrice) * 100 * 100) / 100;
        trade.pnl        = Math.round(trade.volume * trade.entryPrice * (priceDiff / trade.entryPrice));
        await trade.save();

        const pnlLabel = trade.pnlPercent >= 0 ? chalk.green(`+${trade.pnlPercent}%`) : chalk.red(`${trade.pnlPercent}%`);
        console.log(chalk.bgYellow.black(
            `[ĐÓNG LỆNH] ${trade.symbol} @ ${currentPrice} | PnL: ` + pnlLabel + ` | ${exitReason.slice(0, 60)}`
        ));

        // Cập nhật user orders liên kết
        const boundUserOrders = await UserOrder.find({ assignedTrade: trade._id, status: 'MATCHED' });
        for (const uOrder of boundUserOrders) {
            uOrder.status          = 'COMPLETED';
            uOrder.result.finalPnl = Math.round(uOrder.capital * (trade.pnlPercent / 100));
            uOrder.result.message  = `Vị thế đã đóng. PnL thực tế: ${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent}%. Lý do: ${exitReason.slice(0, 100)}`;
            await uOrder.save();
        }

        // AI Reflection Learning
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

            const lessonText = await generateWithRole('pm', reflectivePrompt, { maxTokens: 250, temperature: 0.4 });

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
            console.log(chalk.blueBright(`  [AI LEARN] ${lessonText.trim().slice(0, 100)}...`));

        } catch (aiErr) {
            console.log(chalk.gray(`  [AI LEARN] Không ghi được bài học: ${aiErr.message}`));
        }
    }
}

// ============================================================
// SCHEDULER
// ============================================================

export const startAutoDuckScheduler = () => {
    console.log(chalk.bold.green('🚀 [AUTODUCK v2 SCHEDULER] Hệ thống tuần hoàn lệnh thực tế đã lên lịch.'));

    // Chạy ngay lần đầu
    runAutoTradePipeline().catch(err => console.error(chalk.red(`[SCHEDULER BOOT] ${err.message}`)));

    // Crypto: mỗi 15 phút (24/7)
    setInterval(async () => {
        await runAutoTradePipeline('CRYPTO').catch(console.error);
    }, 15 * 60 * 1000);

    // VN_STOCK + DERIVATIVES: mỗi 30 phút (chỉ giờ giao dịch)
    setInterval(async () => {
        if (isVNMarketOpen()) {
            await runAutoTradePipeline().catch(console.error);
        }
    }, 30 * 60 * 1000);
};

/**
 * Export thêm để autoTrade.controller.js dùng
 * (calculateSignalScore giữ nguyên interface cũ cho backward compat)
 */
export const calculateSignalScore = (aiScore, sentimentType, breadthRatio, isVolumeConfirmed) => {
    let sentimentScore = 50;
    if (sentimentType === 'positive') sentimentScore = 90;
    if (sentimentType === 'negative') sentimentScore = 15;
    const volWeight = isVolumeConfirmed ? 100 : 40;
    return Math.min(100, Math.max(0, Math.round(
        (aiScore * 0.5) + (sentimentScore * 0.2) + (breadthRatio * 0.15) + (volWeight * 0.15)
    )));
};