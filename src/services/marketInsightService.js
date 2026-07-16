/**
 * ============================================================
 * OMNI DUCK — MARKET INSIGHT SERVICE (Gemini Edition)
 * ============================================================
 * API key độc lập: GEMINI_API_KEY_INSIGHT
 * Model: getDynamicModels() — giống hệt aiService.js
 * Timeout: 30s per model
 *
 * Exports:
 *   runDailyMarketInsight({ force })  — Quét & phân tích toàn thị trường
 *   getTodayInsight()                 — Lấy report hôm nay (cache DB)
 *   getInsightHistory(days)           — Lịch sử reports
 *   scheduleMarketInsight()           — Scheduler 7:00 SA T2–T6
 * ============================================================
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

// ── Setup ─────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env'), override: true });

// ── Gemini client — key RIÊNG, độc lập với aiService.js ──────────────────────
const INSIGHT_API_KEY = process.env.GEMINI_API_KEY_INSIGHT;
if (!INSIGHT_API_KEY) {
    console.log(chalk.bgYellow.black('[INSIGHT] ⚠️  GEMINI_API_KEY_INSIGHT chưa được cấu hình trong .env'));
}
const genAI_Insight = INSIGHT_API_KEY ? new GoogleGenerativeAI(INSIGHT_API_KEY) : null;

// ── Dynamic models — clone pattern từ aiService.js ────────────────────────────
const FALLBACK_MODELS = [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-1.5-pro',
];
const MODEL_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 giờ

let _insightModelsCache   = [];
let _insightModelsCacheTS = 0;
let _insightModelsFetchP  = null;

async function getInsightModels() {
    // Trả về cache nếu còn hạn
    if (_insightModelsCache.length > 0 && (Date.now() - _insightModelsCacheTS) < MODEL_CACHE_TTL_MS) {
        return _insightModelsCache;
    }
    // Chống concurrent fetch
    if (_insightModelsFetchP) return _insightModelsFetchP;

    _insightModelsFetchP = (async () => {
        console.log(chalk.yellow('[INSIGHT] Đang đồng bộ danh sách Gemini model từ Google...'));
        try {
            const res = await axios.get(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${INSIGHT_API_KEY}`,
                { timeout: 10_000 }
            );

            let models = (res.data.models || [])
                .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
                .map(m => m.name.replace('models/', ''))
                .filter(n => (n.includes('flash') || n.includes('pro'))
                    && !n.includes('tts')
                    && !n.includes('image')
                    && !n.includes('vision')
                    && !n.includes('embedding')
                    && !n.includes('customtools')
                );

            // Ưu tiên stable trước, preview/exp sau
            const stable  = models.filter(n => !n.includes('preview') && !n.includes('exp'));
            const preview = models.filter(n =>  n.includes('preview') || n.includes('exp'));
            const toSort  = stable.length >= 2 ? stable : [...stable, ...preview];

            // Sort: version mới hơn → pro trước flash → bỏ lite/mini xuống dưới
            toSort.sort((a, b) => {
                const ver = n => { const m = n.match(/gemini-(\d+\.?\d*)/); return m ? parseFloat(m[1]) : 1.5; };
                const vA = ver(a), vB = ver(b);
                if (vA !== vB) return vB - vA;
                const proA = a.includes('pro') && !a.includes('flash');
                const proB = b.includes('pro') && !b.includes('flash');
                if (proA !== proB) return proA ? -1 : 1;
                const liteA = a.includes('lite') || a.includes('mini');
                const liteB = b.includes('lite') || b.includes('mini');
                return liteA ? 1 : liteB ? -1 : 0;
            });

            _insightModelsCache   = toSort.slice(0, 6);
            _insightModelsCacheTS = Date.now();
            console.log(chalk.green(`[INSIGHT] ✅ Models: ${_insightModelsCache.join(', ')}`));
            return _insightModelsCache;

        } catch (err) {
            console.log(chalk.red(`[INSIGHT] Quét models thất bại (${err.message}). Dùng fallback.`));
            _insightModelsCache   = [...FALLBACK_MODELS];
            _insightModelsCacheTS = Date.now();
            return _insightModelsCache;
        }
    })().finally(() => { _insightModelsFetchP = null; });

    return _insightModelsFetchP;
}

// ── Gọi Gemini với timeout 30s, fallback qua từng model ───────────────────────
const INSIGHT_TIMEOUT_MS = 30_000;

async function callGeminiInsight(prompt, options = {}) {
    if (!genAI_Insight) throw new Error('[INSIGHT] GEMINI_API_KEY_INSIGHT chưa được cấu hình');

    const models = await getInsightModels();
    const errors = [];

    for (const modelName of models) {
        let timeoutId;
        try {
            console.log(chalk.cyan(`[INSIGHT] Thử model: ${modelName}...`));

            const genConfig = {
                maxOutputTokens: options.maxTokens || 4000,
                temperature:     options.temperature ?? 0.6,
            };

            const model = genAI_Insight.getGenerativeModel({
                model: modelName,
                generationConfig: genConfig,
            });

            // Race với timeout thủ công (SDK Gemini không có built-in timeout)
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(
                    () => reject(new Error(`Timeout ${INSIGHT_TIMEOUT_MS / 1000}s`)),
                    INSIGHT_TIMEOUT_MS
                );
            });

            const result = await Promise.race([
                model.generateContent(prompt),
                timeoutPromise,
            ]);
            clearTimeout(timeoutId);

            const text = result.response.text();
            if (!text) throw new Error('Gemini trả về nội dung rỗng');

            console.log(chalk.green(`[INSIGHT] ✅ Thành công — model: ${modelName}`));
            return { text, model: modelName };

        } catch (err) {
            clearTimeout(timeoutId);
            const s   = err.status || err.response?.status;
            const msg = err.message || String(err);

            if (s === 429 || s === 503) {
                console.log(chalk.yellow(`[INSIGHT] ⚠️ ${modelName} rate-limit (${s}), thử tiếp...`));
            } else if (msg.includes('Timeout')) {
                console.log(chalk.yellow(`[INSIGHT] ⏱️ ${modelName} timeout 30s, thử tiếp...`));
            } else {
                console.log(chalk.yellow(`[INSIGHT] ⚠️ ${modelName} lỗi (${s || '?'}): ${msg.slice(0, 100)}`));
            }
            errors.push(`${modelName}: ${msg.slice(0, 60)}`);
        }
    }

    throw new Error(`[INSIGHT] Toàn bộ ${models.length} models thất bại. Chi tiết: ${errors.join(' | ')}`);
}

// ── Mongoose Schema ───────────────────────────────────────────────────────────
const MarketInsightSchema = new mongoose.Schema({
    date:            { type: String,  required: true, unique: true, index: true },
    report:          { type: String,  required: true },
    summary:         { type: String },
    topPicks: [{
        symbol:  String,
        action:  { type: String, enum: ['MUA', 'TRÁNH', 'THEO DÕI'] },
        horizon: { type: String, enum: ['NGẮN HẠN', 'DÀI HẠN', 'CẢ HAI'] },
        reason:  String,
        score:   Number,
    }],
    marketSentiment: { type: String, enum: ['TÍCH CỰC', 'TRUNG TÍNH', 'TIÊU CỰC'] },
    model:           { type: String },
    scannedAt:       { type: Date },
}, { timestamps: false });

const MarketInsight = mongoose.models?.MarketInsight
    || mongoose.model('MarketInsight', MarketInsightSchema);

// ── Helpers ───────────────────────────────────────────────────────────────────
const getVNDateStr = () => {
    const vn = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    return `${vn.getFullYear()}-${String(vn.getMonth()+1).padStart(2,'0')}-${String(vn.getDate()).padStart(2,'0')}`;
};

const isWorkday = (vnDate) => {
    const day = vnDate.getDay();
    return day !== 0 && day !== 6;
};

// ── Lấy OHLC từ Entrade ───────────────────────────────────────────────────────
async function fetchIndexOHLC(symbol = 'VNINDEX', days = 60) {
    try {
        const to   = Math.floor(Date.now() / 1000);
        const from = to - days * 86400;
        const url  = `https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${from}&to=${to}&symbol=${symbol}&resolution=1D`;
        const res  = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const d    = res.data;
        if (!d?.c?.length) return null;

        const last = d.c.length - 1;
        const prev = Math.max(0, last - 1);
        return {
            symbol,
            close:      d.c[last],
            changePct:  parseFloat(((d.c[last] - d.c[prev]) / d.c[prev] * 100).toFixed(2)),
            high5d:     Math.max(...d.c.slice(-5)),
            low5d:      Math.min(...d.c.slice(-5)),
            volume:     d.v[last],
            avgVol20:   Math.round(d.v.slice(-20).reduce((a,b)=>a+b,0) / 20),
            volRatio:   Math.round(d.v[last] / (d.v.slice(-20).reduce((a,b)=>a+b,0)/20) * 100),
            closes:     d.c.slice(-60),
        };
    } catch (err) {
        console.log(chalk.yellow(`[INSIGHT] Không lấy được OHLC ${symbol}: ${err.message}`));
        return null;
    }
}

const calcEMA = (closes, period) => {
    if (!closes || closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a,b) => a+b, 0) / period;
    for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
    return parseFloat(ema.toFixed(2));
};

const calcRSI = (closes, period = 14) => {
    if (!closes || closes.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff; else losses -= diff;
    }
    const rs = (gains / period) / (losses / period || 0.0001);
    return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
};

// ── Lấy top cổ phiếu từ DB ───────────────────────────────────────────────────
async function getTopCandidates(limit = 30) {
    try {
        const Stock = mongoose.models?.Stock || null;
        if (!Stock) return [];
        const stocks = await Stock.find({ exchange: { $in: ['HOSE', 'HNX'] }, marketCap: { $exists: true } })
            .sort({ totalVolume: -1 }).limit(limit).lean();
        return stocks.map(s => ({
            symbol:    s.symbol,
            name:      s.companyName || s.symbol,
            exchange:  s.exchange,
            price:     s.currentPrice,
            pe:        s.pe,
            marketCap: s.marketCap,
            sector:    s.industry || 'Khác',
        }));
    } catch {
        return [];
    }
}

// ── Build Prompt ──────────────────────────────────────────────────────────────
function buildInsightPrompt(vnIndex, vn30, hnx, topStocks, dateStr) {
    const indexSection = [vnIndex, vn30, hnx].filter(Boolean).map(idx => {
        const ema20 = calcEMA(idx.closes, 20);
        const ema50 = calcEMA(idx.closes, 50);
        const rsi   = calcRSI(idx.closes);
        const trend = idx.close > (ema20 || idx.close) ? '📈 Trên EMA20' : '📉 Dưới EMA20';
        return `### ${idx.symbol}
- Giá: ${idx.close.toLocaleString('vi-VN')} | Thay đổi: ${idx.changePct > 0 ? '+' : ''}${idx.changePct}%
- EMA20: ${ema20 || 'N/A'} | EMA50: ${ema50 || 'N/A'} | ${trend}
- RSI(14): ${rsi || 'N/A'}${rsi > 70 ? ' ⚠️ Quá mua' : rsi < 30 ? ' ✅ Quá bán' : ''}
- Vùng 5 phiên: ${idx.low5d?.toLocaleString()} – ${idx.high5d?.toLocaleString()}
- Volume hôm nay: ${idx.volume?.toLocaleString()} | TB20 phiên: ${idx.avgVol20?.toLocaleString()} | Tỉ lệ: ${idx.volRatio}%`;
    }).join('\n\n');

    const stockSection = topStocks.length > 0
        ? topStocks.slice(0, 20).map(s =>
            `- **${s.symbol}** (${s.exchange}) — ${s.name} | Ngành: ${s.sector} | P/E: ${s.pe || 'N/A'} | Giá: ${s.price || 'N/A'}`
          ).join('\n')
        : '(Không có dữ liệu cụ thể — phân tích dựa trên bối cảnh chung)';

    return `Bạn là chuyên gia phân tích tài chính cao cấp chuyên về TTCK Việt Nam (HOSE/HNX).

**Ngày phân tích: ${dateStr}**

## DỮ LIỆU THỊ TRƯỜNG

${indexSection}

## CỔ PHIẾU THANH KHOẢN CAO

${stockSection}

---

**HƯỚNG DẪN PHÂN TÍCH:**
1. Phân tích kỹ thuật VN-Index, VN30, HNX: xu hướng, momentum, thanh khoản
2. Chọn 5–7 mã tiềm năng nhất (MUA/TRÁNH/THEO DÕI) từ danh sách thanh khoản cao
3. Đánh giá tâm lý thị trường (TÍCH CỰC/TRUNG TÍNH/TIÊU CỰC)

**HƯỚNG DẪN OUTPUT:**
BẠN PHẢI TRẢ VỀ DƯỚI DẠNG JSON OBJECT THUẦN. KHÔNG PHÉP CÓ TEXT, KHÔNG PHÉP CÓ MARKDOWN.
OUTPUT CỦA BẠN CHỈ LÀ MỘT OBJECT JSON DUY NHẤT (CÓ THỂ SPAN NHIỀU DÒNG), KHÔNG CÓ GÌ KHÁC.

Cấu trúc JSON:
{
  "sentiment": "TÍCH CỰC" | "TRUNG TÍNH" | "TIÊU CỰC",
  "summary": "Một câu tóm tắt nhận định thị trường hôm nay",
  "topPicks": [
    { "symbol": "FPT", "action": "MUA", "horizon": "NGẮN HẠN", "reason": "Lý do giao dịch ngắn gọn", "score": 82 },
    { "symbol": "HPG", "action": "THEO DÕI", "horizon": "DÀI HẠN", "reason": "Lý do theo dõi ngắn gọn", "score": 71 },
    { "symbol": "VIC", "action": "TRÁNH", "horizon": "NGẮN HẠN", "reason": "Lý do tránh ngắn gọn", "score": 35 },
    ...thêm 2–4 mã nữa để có ít nhất 5 mã
  ]
}

Quy tắc:
- sentiment: CHỈ một trong ba giá trị: "TÍCH CỰC", "TRUNG TÍNH", "TIÊU CỰC"
- action: CHỈ "MUA", "TRÁNH", hoặc "THEO DÕI"
- horizon: CHỈ "NGẮN HẠN", "DÀI HẠN", hoặc "CẢ HAI"
- score: số nguyên 0–100
- topPicks: PHẢI có ít nhất 5 mã
- reason: câu ngắn (≤100 ký tự)
- JSON PHẢI hợp lệ (valid JSON)
- KHÔNG TEXT NÀO TRƯỚC/SAU JSON

TRỞ LẠI NGAY JSON, KHÔNG THÊM MARKDOWN, KHÔNG THÊM GIẢI THÍCH.
`;
}

// ── Parse JSON metadata từ response — robust multi-strategy ──────────────────
// Gemini đôi khi trả về: backtick Unicode, khoảng trắng lạ, JSON không fence,
// JSON ở giữa báo cáo, hoặc có text thừa sau block.
// → dùng nhiều chiến lược từ chính xác → rộng dần
function parseInsightMeta(rawText) {
    const VALID_SENTIMENTS = ['TÍCH CỰC', 'TRUNG TÍNH', 'TIÊU CỰC'];
    const VALID_ACTIONS    = ['MUA', 'TRÁNH', 'THEO DÕI'];
    const VALID_HORIZONS   = ['NGẮN HẠN', 'DÀI HẠN', 'CẢ HAI'];

    const sanitizePick = (p) => ({
        symbol:  String(p.symbol || '').toUpperCase().trim(),
        action:  VALID_ACTIONS.includes(p.action)  ? p.action  : 'THEO DÕI',
        horizon: VALID_HORIZONS.includes(p.horizon) ? p.horizon : 'NGẮN HẠN',
        reason:  String(p.reason || '').trim(),
        score:   Math.max(0, Math.min(100, parseInt(p.score) || 60)),
    });

    const tryParse = (str) => {
        try {
            // Làm sạch: backtick Unicode, zero-width chars, BOM
            const clean = str
                .replace(/[\u200B-\u200D\uFEFF]/g, '')
                .replace(/[\u0060\u2018\u2019\u201C\u201D]/g, '"')
                .trim();
            const p = JSON.parse(clean);
            if (typeof p !== 'object' || !p) return null;

            const picks = Array.isArray(p.topPicks)
                ? p.topPicks
                    .filter(x => x && typeof x.symbol === 'string' && x.symbol.length >= 2)
                    .map(sanitizePick)
                    .slice(0, 10)
                : [];

            return {
                sentiment: VALID_SENTIMENTS.includes(p.sentiment) ? p.sentiment : null,
                summary:   typeof p.summary === 'string' ? p.summary.trim() : '',
                topPicks:  picks,
            };
        } catch {
            return null;
        }
    };

    // ── Chiến lược 0: Thử parse toàn bộ response là JSON (chiến lược ưu tiên cho JSON-only prompt)
    const r0 = tryParse(rawText.trim());
    if (r0 && r0.topPicks.length > 0) {
        console.log(chalk.cyan('[INSIGHT] ✅ Parse JSON direct (full response)'));
        return { ...r0, sentiment: r0.sentiment || 'TRUNG TÍNH' };
    }

    // ── Chiến lược 1: Tìm CUỐI cùng của fence ```json...``` (ưu tiên block cuối)
    // Gemini đôi khi trả về: backtick Unicode, khoảng trắng lạ, JSON không fence,
    // JSON ở giữa báo cáo, hoặc có text thừa sau block.
    // → dùng nhiều chiến lược từ chính xác → rộng dần
    const allFences = [...rawText.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
    if (allFences.length > 0) {
        // Thử từ cuối lên để bắt đúng block metadata
        for (let i = allFences.length - 1; i >= 0; i--) {
            const candidate = allFences[i][1];
            if (!candidate.includes('topPicks') && !candidate.includes('sentiment')) continue;
            const r = tryParse(candidate);
            if (r && r.topPicks.length > 0) {
                console.log(chalk.cyan(`[INSIGHT] ✅ Parse JSON fence #${i + 1}/${allFences.length}`));
                return { ...r, sentiment: r.sentiment || 'TRUNG TÍNH' };
            }
        }
        // Parse được JSON nhưng picks rỗng → tiếp tục tìm
    }

    // ── Chiến lược 2: JSON object thuần (không có fence) — tìm block lớn nhất có topPicks
    // Dùng greedy match từ dấu { cuối cùng trở về trước
    const jsonCandidates = [...rawText.matchAll(/\{[^{}]*"topPicks"[\s\S]*?\}/g)];
    for (let i = jsonCandidates.length - 1; i >= 0; i--) {
        const r = tryParse(jsonCandidates[i][0]);
        if (r && r.topPicks.length > 0) {
            console.log(chalk.cyan('[INSIGHT] ✅ Parse JSON (no-fence fallback)'));
            return { ...r, sentiment: r.sentiment || 'TRUNG TÍNH' };
        }
    }

    // ── Chiến lược 3: Tìm JSON object lớn bất kỳ chứa "topPicks" bằng bracket matching
    const startIdx = rawText.lastIndexOf('"topPicks"');
    if (startIdx !== -1) {
        // Tìm { mở trước vị trí "topPicks"
        let braceStart = rawText.lastIndexOf('{', startIdx);
        if (braceStart !== -1) {
            let depth = 0, end = -1;
            for (let i = braceStart; i < rawText.length; i++) {
                if (rawText[i] === '{') depth++;
                else if (rawText[i] === '}') {
                    depth--;
                    if (depth === 0) { end = i; break; }
                }
            }
            if (end !== -1) {
                const r = tryParse(rawText.slice(braceStart, end + 1));
                if (r && r.topPicks.length > 0) {
                    console.log(chalk.cyan('[INSIGHT] ✅ Parse JSON (bracket-matching fallback)'));
                    return { ...r, sentiment: r.sentiment || 'TRUNG TÍNH' };
                }
            }
        }
    }

    // ── Chiến lược 4: Text-extraction fallback (không parse được JSON gì cả)
    console.log(chalk.yellow('[INSIGHT] ⚠️ Không parse được JSON block, dùng text-extraction fallback'));
    console.log(chalk.gray('[INSIGHT] --- 300 ký tự cuối response ---'));
    console.log(chalk.gray(rawText.slice(-300)));
    console.log(chalk.gray('[INSIGHT] --- end ---'));

    const sentimentFromText =
        /TÍ[CK]H\s*C[ƯỰ]C/i.test(rawText) ? 'TÍCH CỰC'  :
        /TI[EÊ]U\s*C[ƯỰ]C/i.test(rawText) ? 'TIÊU CỰC'  : 'TRUNG TÍNH';

    // Thử extract symbol từ patterns trong báo cáo dạng: **FPT**, ### FPT, - FPT:
    const symbolPattern = /(?:\*\*|###\s*|[-•]\s*)([A-Z]{2,10})(?:\*\*|\s*[:(—–])/g;
    const picksFromText = [];
    const seenSymbols = new Set();
    for (const m of rawText.matchAll(/"symbol"\s*:\s*"([A-Z0-9]{2,10})"/g)) {
        if (seenSymbols.has(m[1]) || picksFromText.length >= 8) continue;
        seenSymbols.add(m[1]);
        picksFromText.push({ symbol: m[1], action: 'THEO DÕI', horizon: 'NGẮN HẠN', reason: 'Được đề cập trong báo cáo', score: 60 });
    }

    return { sentiment: sentimentFromText, summary: '', topPicks: picksFromText };
}

// ── MAIN: Chạy quét & phân tích ──────────────────────────────────────────────
export async function runDailyMarketInsight({ force = false } = {}) {
    const dateStr = getVNDateStr();
    const vnNow   = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));

    if (!force && !isWorkday(vnNow)) {
        console.log(chalk.gray(`[INSIGHT] Cuối tuần — bỏ qua quét thị trường.`));
        return null;
    }

    if (!force) {
        const existing = await MarketInsight.findOne({ date: dateStr }).lean();
        if (existing) {
            console.log(chalk.gray(`[INSIGHT] Đã có report ${dateStr}, bỏ qua (force=false).`));
            return existing;
        }
    }

    console.log(chalk.bold.cyan(`\n[INSIGHT] 🔍 Bắt đầu quét thị trường ngày ${dateStr}...`));
    const t0 = Date.now();

    // 1. Thu thập dữ liệu song song
    const [vnIndex, vn30, hnx, topStocks] = await Promise.all([
        fetchIndexOHLC('VNINDEX', 60),
        fetchIndexOHLC('VN30',    60),
        fetchIndexOHLC('HNX',      30),
        getTopCandidates(30),
    ]);
    console.log(chalk.gray(`[INSIGHT] Dữ liệu: VN-Index=${vnIndex?.close}, VN30=${vn30?.close}, HNX=${hnx?.close}, Stocks=${topStocks.length}`));

    // 2. Build prompt
    const prompt = buildInsightPrompt(vnIndex, vn30, hnx, topStocks, dateStr);

    // 3. Gọi Gemini (key INSIGHT, model dynamic)
    console.log(chalk.cyan(`[INSIGHT] 🤖 Gọi Gemini AI (key: INSIGHT)...`));
    const { text: reportRaw, model: usedModel } = await callGeminiInsight(prompt, {
        maxTokens:   4000,
        temperature: 0.6,
    });

    // 4. Parse metadata
    let { sentiment, summary, topPicks } = parseInsightMeta(reportRaw);

    // 4b. Re-extract: nếu topPicks rỗng → gọi Gemini lần 2 chỉ để extract JSON thuần
    if (topPicks.length === 0) {
        console.log(chalk.yellow('[INSIGHT] ⚠️ topPicks rỗng sau parse → gọi re-extract...'));
        try {
            const reExtractPrompt =
                'BÀI TẬP TRÍCH XUẤT JSON TỪVN REPORT\n\n' +
                'Báo cáo gốc:\n---\n' + reportRaw.slice(0, 5000) + '\n---\n\n' +
                'HƯỚNG DẪN: Trích xuất và tạo một JSON object từ báo cáo trên.\n' +
                'OUTPUT: CHỈ JSON OBJECT, KHÔNG TEXT, KHÔNG MARKDOWN, KHÔNG GIẢI THÍCH.\n' +
                'PHẢI CÓ ÍT NHẤT 5 MÃ CỔ PHIẾU trong topPicks.\n\n' +
                'JSON format:\n{\n' +
                '  "sentiment": "TÍCH CỰC"|"TRUNG TÍNH"|"TIÊU CỰC",\n' +
                '  "summary": "Một câu tóm tắt",\n' +
                '  "topPicks": [\n' +
                '    {"symbol":"FPT","action":"MUA","horizon":"NGẮN HẠN","reason":"Ngắn gọn","score":75},\n' +
                '    {"symbol":"HPG","action":"TRÁNH","horizon":"NGẮN HẠN","reason":"Ngắn gọn","score":40},\n' +
                '    ... 3 mã thêm nữa\n' +
                '  ]\n' +
                '}\n\n' +
                'GỬI LẠI JSON NGAY, KHÔNG GIẢI THÍCH, KHÔNG TEXT KHÁC.';

            const { text: reText } = await callGeminiInsight(reExtractPrompt, { maxTokens: 1000, temperature: 0.1 });
            const cleaned = reText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
            const reResult = (() => { try { return JSON.parse(cleaned); } catch { return null; } })();

            if (reResult?.topPicks?.length > 0) {
                const VA = ['MUA', 'TRÁNH', 'THEO DÕI'];
                const VH = ['NGẮN HẠN', 'DÀI HẠN', 'CẢ HAI'];
                const VS = ['TÍCH CỰC', 'TRUNG TÍNH', 'TIÊU CỰC'];
                topPicks = reResult.topPicks
                    .filter(p => p?.symbol)
                    .map(p => ({
                        symbol:  String(p.symbol).toUpperCase().trim(),
                        action:  VA.includes(p.action)  ? p.action  : 'THEO DÕI',
                        horizon: VH.includes(p.horizon) ? p.horizon : 'NGẮN HẠN',
                        reason:  String(p.reason || '').trim(),
                        score:   Math.max(0, Math.min(100, parseInt(p.score) || 60)),
                    })).slice(0, 10);
                if (VS.includes(reResult.sentiment)) sentiment = reResult.sentiment;
                if (!summary && reResult.summary) summary = String(reResult.summary).trim();
                console.log(chalk.green(`[INSIGHT] ✅ Re-extract thành công: ${topPicks.length} picks`));
            } else {
                console.log(chalk.red('[INSIGHT] ❌ Re-extract cũng không lấy được picks'));
            }
        } catch (reErr) {
            console.log(chalk.red(`[INSIGHT] ❌ Re-extract thất bại: ${reErr.message}`));
        }
    }

    if (topPicks.length === 0 && topStocks.length > 0) {
        console.log(chalk.yellow('[INSIGHT] ⚠️ topPicks vẫn rỗng — dùng fallback topStocks để đảm bảo output không trống.'));
        topPicks = topStocks.slice(0, 5).map(s => ({
            symbol:  String(s.symbol).toUpperCase(),
            action:  'THEO DÕI',
            horizon: 'CẢ HAI',
            reason:  'Không parse được topPicks từ phản hồi AI, sử dụng mã thanh khoản cao.',
            score:   60,
        }));
        if (!summary) {
            summary = 'Không thể parse topPicks từ phản hồi AI, vì vậy dùng danh sách thanh khoản cao để tạo fallback.';
        }
    }

    console.log(chalk.green(`[INSIGHT] ✅ Xong sau ${((Date.now()-t0)/1000).toFixed(1)}s — sentiment: ${sentiment}, picks: ${topPicks.length}, model: ${usedModel}`));

    // 5. Upsert vào DB
    const doc = await MarketInsight.findOneAndUpdate(
        { date: dateStr },
        { date: dateStr, report: reportRaw, summary, topPicks, marketSentiment: sentiment, model: usedModel, scannedAt: new Date() },
        { upsert: true, returnDocument: 'after' }
    );
    return doc;
}

// ── Lấy report hôm nay (hoặc gần nhất nếu cuối tuần) ────────────────────────
export async function getTodayInsight() {
    const dateStr = getVNDateStr();
    const vnNow   = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));

    if (!isWorkday(vnNow)) {
        const recent = await MarketInsight.findOne({}).sort({ date: -1 }).lean();
        return recent ? { ...recent, isWeekend: true } : null;
    }

    const existing = await MarketInsight.findOne({ date: dateStr }).lean();
    if (existing) return existing;

    // Sau 7h → tự quét
    if (vnNow.getHours() >= 7) {
        console.log(chalk.cyan(`[INSIGHT] Chưa có report hôm nay, tự quét...`));
        return await runDailyMarketInsight();
    }

    // Trước 7h → trả report gần nhất
    return await MarketInsight.findOne({}).sort({ date: -1 }).lean() || null;
}

/**
 * Chỉ đọc DB — không kích hoạt quét AI.
 * Dùng cho /market và các lệnh tra cứu (tránh tốn quota).
 */
export async function getCachedMarketInsight() {
    const dateStr = getVNDateStr();
    const today = await MarketInsight.findOne({ date: dateStr }).lean();
    if (today) return today;
    const recent = await MarketInsight.findOne({}).sort({ date: -1 }).lean();
    if (!recent) return null;
    return {
        ...recent,
        isStale: recent.date !== dateStr,
        isWeekend: !isWorkday(new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))),
    };
}

// ── Lịch sử reports ───────────────────────────────────────────────────────────
export async function getInsightHistory(days = 7) {
    return await MarketInsight.find({})
        .sort({ date: -1 }).limit(Math.min(days, 30))
        .select('date summary marketSentiment topPicks scannedAt model')
        .lean();
}

// ── Scheduler 7:00 SA mỗi ngày T2–T6 ─────────────────────────────────────────
let _schedulerStarted = false;

export function scheduleMarketInsight() {
    if (_schedulerStarted) {
        console.log(chalk.gray('[INSIGHT] Scheduler đã chạy rồi.'));
        return;
    }
    _schedulerStarted = true;

    let lastTriggeredDate = null;

    setInterval(async () => {
        try {
            const vnNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
            if (!isWorkday(vnNow)) return;

            const today = getVNDateStr();
            const h = vnNow.getHours(), m = vnNow.getMinutes();

            // Trigger 7:00–7:04 sáng, mỗi ngày chỉ 1 lần
            if (h === 7 && m <= 4 && lastTriggeredDate !== today) {
                lastTriggeredDate = today;
                console.log(chalk.bold.green(`\n[INSIGHT] ⏰ 7:00 SA — Bắt đầu quét thị trường ${today}...`));
                await runDailyMarketInsight({ force: false });
            }
        } catch (err) {
            console.log(chalk.red(`[INSIGHT] Scheduler lỗi: ${err.message}`));
        }
    }, 60_000); // kiểm tra mỗi phút

    console.log(chalk.green('[INSIGHT] ✅ Scheduler khởi động — Quét lúc 7:00 SA (T2–T6), key: GEMINI_API_KEY_INSIGHT'));
}

export { MarketInsight };