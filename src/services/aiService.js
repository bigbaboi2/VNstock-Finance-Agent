import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import mongoose from 'mongoose';

// ─── MULTI-PROVIDER ROUTER ─────────────────────────────────────────────────────
import {
    injectGeminiGenerators,
    generateWithRole,
    generateWithRoleStream,
    getRateLimitStatus,
    resetProviderBlock,
} from './multiProviderRouter.js';
// ──────────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env'), override: true });

const apiKeyMain = process.env.GEMINI_API_KEY_MAIN || process.env.GEMINI_API_KEY || process.env.API_KEY;
const apiKeyAction = process.env.GEMINI_API_KEY_ACTION || apiKeyMain;

if (!apiKeyMain) {    
    console.log(chalk.bgRed.white.bold('[LỖI CHÍ MẠNG] Biến GEMINI_API_KEY_MAIN đang trống rỗng!'));
}

const genAI_Main = new GoogleGenerativeAI(apiKeyMain);
const genAI_Action = new GoogleGenerativeAI(apiKeyAction);
const fileManager = new GoogleAIFileManager(apiKeyMain);

// ─── GEMINI GENERATOR WRAPPERS FOR ROUTER ───────────────────────────────────── */
async function _geminiProGenerator(prompt, options = {}) {
    const modelsToTry = await getDynamicModels();
    const proModels   = modelsToTry.filter(m => m.includes('pro'));
    const flashModels = modelsToTry.filter(m => m.includes('flash'));
    const ordered     = [...proModels, ...flashModels];

    const { streamCallback, maxTokens, temperature, responseFormat, ...geminiOpts } = options;

    for (const modelName of ordered) {
        try {
            const genConfig = {
                ...(maxTokens    !== undefined ? { maxOutputTokens: maxTokens } : {}),
                ...(temperature  !== undefined ? { temperature } : {}),
                ...(responseFormat === 'json_object' ? { responseMimeType: 'application/json' } : {}),
            };
            const model = genAI_Main.getGenerativeModel({
                model: modelName,
                ...(Object.keys(genConfig).length > 0 ? { generationConfig: genConfig } : {}),
                ...geminiOpts,
            });

            if (streamCallback) {
                const result = await model.generateContentStream(prompt);
                let fullText = '';
                for await (const chunk of result.stream) {
                    const t = chunk.text();
                    if (!t) continue;
                    fullText += t;
                    streamCallback(t);
                }
                console.log(chalk.greenBright(`[GEMINI PRO] ✅ Stream xong [${modelName}]`));
                return fullText;
            } else {
                const result = await model.generateContent(prompt);
                console.log(chalk.greenBright(`[GEMINI PRO] ✅ Done [${modelName}]`));
                return result.response.text();
            }
        } catch (err) {
            const s = err.status || err.response?.status;
            if (s === 429 || s === 503) {
                console.log(chalk.yellow(`[GEMINI PRO] ⚠️ ${modelName} rate limit, thử tiếp...`));
                continue;
            }
            console.log(chalk.yellow(`[GEMINI PRO] ⚠️ ${modelName} lỗi ${s}: ${err.message}`));
            continue;
        }
    }
    throw new Error('[GEMINI PRO] Toàn bộ models thất bại');
}

/**
 * Internal Gemini Flash generator — dùng key ACTION, cho các task nhẹ hơn.
 */
async function _geminiFlashGenerator(prompt, options = {}) {
    const modelsToTry = await getDynamicModels();
    const { streamCallback, maxTokens, temperature, responseFormat, ...geminiOpts } = options;

    for (const modelName of modelsToTry) {
        try {
            const genConfig = {
                ...(maxTokens    !== undefined ? { maxOutputTokens: maxTokens } : {}),
                ...(temperature  !== undefined ? { temperature } : {}),
                ...(responseFormat === 'json_object' ? { responseMimeType: 'application/json' } : {}),
            };
            const model = genAI_Action.getGenerativeModel({
                model: modelName,
                ...(Object.keys(genConfig).length > 0 ? { generationConfig: genConfig } : {}),
                ...geminiOpts,
            });

            if (streamCallback) {
                const result = await model.generateContentStream(prompt);
                let fullText = '';
                for await (const chunk of result.stream) {
                    const t = chunk.text();
                    if (!t) continue;
                    fullText += t;
                    streamCallback(t);
                }
                console.log(chalk.greenBright(`[GEMINI FLASH] ✅ Stream xong [${modelName}]`));
                return fullText;
            } else {
                const result = await model.generateContent(prompt);
                console.log(chalk.greenBright(`[GEMINI FLASH] ✅ Done [${modelName}]`));
                return result.response.text();
            }
        } catch (err) {
            const s = err.status || err.response?.status;
            if (s === 429 || s === 503) {
                console.log(chalk.yellow(`[GEMINI FLASH] ⚠️ ${modelName} rate limit`));
                continue;
            }
            console.log(chalk.yellow(`[GEMINI FLASH] ⚠️ ${modelName} lỗi ${s}`));
            continue;
        }
    }
    throw new Error('[GEMINI FLASH] Toàn bộ models thất bại');
}

// Inject ngay sau khi genAI được khởi tạo
injectGeminiGenerators({
    proGenerator:   _geminiProGenerator,
    flashGenerator: _geminiFlashGenerator,
});
// ──────────────────────────────────────────────────────────────────────────────

let ALL_MODELS_CACHE = [];
let ALL_MODELS_CACHE_TS = 0;
let _modelsFetchPromise = null;  
const MODEL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;  

async function getDynamicModels() {
    // Trả cache nếu còn hạn
    if (ALL_MODELS_CACHE.length > 0 && (Date.now() - ALL_MODELS_CACHE_TS) < MODEL_CACHE_TTL_MS) {
        return ALL_MODELS_CACHE;
    }

    // Dedup: nếu đang fetch rồi thì đợi kết quả đó, không fetch lại
    if (_modelsFetchPromise) return _modelsFetchPromise;

    _modelsFetchPromise = (async () => {
        console.log(chalk.yellow('[HỆ THỐNG] Đang kết nối Google để đồng bộ danh sách Model...'));
        try {
            const response = await axios.get(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKeyMain}`,
                { timeout: 10_000 }
            );

            const rawModelsCount = response.data.models?.length || 0;
            console.log(chalk.blue(`[HỆ THỐNG] Google trả về tổng cộng: ${rawModelsCount} model thô.`));

            let dynamicModels = response.data.models
            .filter(m => m.supportedGenerationMethods.includes('generateContent'))
            .map(m => m.name.replace('models/', ''))
            .filter(name => name.includes('flash') || name.includes('pro'))
            .filter(name =>
                !name.includes('tts') &&
                !name.includes('image') &&
                !name.includes('vision') &&
                !name.includes('embedding') &&
                !name.includes('customtools')
                // BỎ filter 'preview' và 'exp' ở đây
            );

             const stableModels  = dynamicModels.filter(n => !n.includes('preview') && !n.includes('exp'));
            const previewModels = dynamicModels.filter(n =>  n.includes('preview') || n.includes('exp'));

             const modelsToSort = stableModels.length >= 2 ? stableModels : [...stableModels, ...previewModels];

            modelsToSort.sort((a, b) => {
                const getVersion = name => {
                    const m = name.match(/gemini-(\d+\.?\d*)/);
                    return m ? parseFloat(m[1]) : 1.5;
                };
                const vA = getVersion(a), vB = getVersion(b);
                if (vA !== vB) return vB - vA;
                const isProA = a.includes('pro') && !a.includes('flash');
                const isProB = b.includes('pro') && !b.includes('flash');
                if (isProA !== isProB) return isProA ? -1 : 1;
                const isLiteA = a.includes('lite') || a.includes('mini');
                const isLiteB = b.includes('lite') || b.includes('mini');
                return isLiteA ? 1 : isLiteB ? -1 : 0;
            });

            ALL_MODELS_CACHE = modelsToSort.slice(0, 6);
            ALL_MODELS_CACHE_TS = Date.now();

            console.log(chalk.green(`[HỆ THỐNG] Đã nạp ${ALL_MODELS_CACHE.length} Model vào Cache:`));
            ALL_MODELS_CACHE.forEach((m, i) => console.log(chalk.green.bold(`  [${i + 1}] ${m}`)));

            return ALL_MODELS_CACHE;

        } catch (error) {
            console.log(chalk.red(`[LỖI] Quét Model động thất bại (${error.message}). Dùng models dự phòng.`));
            // Tên model thực tế đã được xác nhận tồn tại trên API
            ALL_MODELS_CACHE = [
                'gemini-2.5-flash',
                'gemini-2.5-flash-lite',
                'gemini-2.5-pro',
                'gemini-1.5-pro',
            ];
            ALL_MODELS_CACHE_TS = Date.now();
            return ALL_MODELS_CACHE;
        }
    })().finally(() => {
        _modelsFetchPromise = null;
    });

    return _modelsFetchPromise;
}
// GỌI AI VỚI AUTO SWITCH MODEL  
export const generateWithAutoSwitch = async (promptData, options = {}, useActionKey = false) => {
    const modelsToTry = await getDynamicModels();
    const activeGenAI = useActionKey ? genAI_Action : genAI_Main;
    const MAX_RETRIES = 3;  
    const BASE_DELAY = 2000;  

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        for (const modelName of modelsToTry) {
            try {
                const model = activeGenAI.getGenerativeModel({ model: modelName, ...options });
                const result = await model.generateContent(promptData);
                console.log(chalk.greenBright(`[AI CORE] Đã trả lời thành công với [${modelName}] (Key: ${useActionKey ? 'ACTION' : 'MAIN'})`));
                return result; 
            } catch (error) {
                const errStatus = error.status || 'LỖI';
                
                if (errStatus === 429 || errStatus === 503) {
                    console.log(chalk.yellow(`[LỖI ${errStatus}] Model [${modelName}] kẹt đạn. Đang chuyển súng...`));
                    continue;  
                }
                console.log(chalk.yellow(`[CẢNH BÁO] Bỏ qua [${modelName}] (Mã lỗi: ${errStatus}).`));
                continue; 
            }
        }
        
         if (attempt < MAX_RETRIES) {
            const delay = BASE_DELAY * Math.pow(2, attempt);  
            console.log(chalk.bgRed.white(`[QUÁ TẢI] Toàn bộ Model đều kẹt đạn. Hệ thống ngủ đông ${delay/1000}s trước khi thử lại đợt ${attempt + 1}...`));
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw new Error("[Lỗi 429] Google đã chặn toàn bộ Model do spam quá nhanh. Vui lòng đợi 1 phút rồi thử lại.");
};

export const generateStreamWithAutoSwitch = async (promptData, onChunk, options = {}, useActionKey = false) => {
    const modelsToTry = await getDynamicModels();
    const activeGenAI = useActionKey ? genAI_Action : genAI_Main;
    const MAX_RETRIES = 3;
    const BASE_DELAY = 2000;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        for (const modelName of modelsToTry) {
            try {
                const model = activeGenAI.getGenerativeModel({ model: modelName, ...options });
                const result = await model.generateContentStream(promptData);
                let fullText = '';

                for await (const chunk of result.stream) {
                    const chunkText = chunk.text();
                    if (!chunkText) continue;
                    fullText += chunkText;
                    if (typeof onChunk === 'function') onChunk(chunkText);
                }

                console.log(chalk.greenBright(`[AI CORE] Đã stream thành công với [${modelName}] (Key: ${useActionKey ? 'ACTION' : 'MAIN'})`));
                return fullText;
            } catch (error) {
                const errStatus = error.status || 'LỖI';
                
                if (errStatus === 429 || errStatus === 503) {
                    console.log(chalk.yellow(`[LỖI ${errStatus}] Model [${modelName}] kẹt đạn lúc stream. Đang chuyển súng...`));
                    continue;
                }
                console.log(chalk.yellow(`[CẢNH BÁO] Bỏ qua [${modelName}] (Mã lỗi: ${errStatus}).`));
                continue;
            }
        }
        
        if (attempt < MAX_RETRIES) {
            const delay = BASE_DELAY * Math.pow(2, attempt); 
            console.log(chalk.bgRed.white(`[QUÁ TẢI STREAM] Hệ thống ngủ đông ${delay/1000}s trước khi thử lại đợt ${attempt + 1}...`));
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw new Error("[Lỗi 429] Google đã chặn toàn bộ Model do spam quá nhanh. Đợi 1 phút rồi thử lại.");
};

// =========================================================
// KHUNG LƯU TRỮ PDF TRÊN MONGODB
// =========================================================
const TCBS_PDF_TTL = 4 * 60 * 60 * 1000;
const TCBS_PDF_TTL_SECONDS = Math.floor(TCBS_PDF_TTL / 1000);

const TcbsMarkdownCacheSchema = new mongoose.Schema({
    ticker: { type: String, required: true, uppercase: true, trim: true },
    mode: { type: String, required: true, trim: true, default: 'turbo' },
    markdown: { type: String, required: true },
    timestamp: { type: Date, default: Date.now, expires: TCBS_PDF_TTL_SECONDS }
});

TcbsMarkdownCacheSchema.index({ ticker: 1, mode: 1 }, { unique: true });

const TcbsMarkdownCacheModel = mongoose.models.TcbsMarkdownCache || mongoose.model('TcbsMarkdownCache', TcbsMarkdownCacheSchema);
// =========================================================
// 2. HÀM TẢI VÀ DỊCH BÁO CÁO TCBS  
// =========================================================
const _tcbsPdfCache = new Map();

export async function getMarkdownFromTcbsPdf(ticker, pdfMode = 'turbo', onProgress = null) {
    const tickerUpper = ticker.toUpperCase();
    const validModes = ['turbo', 'fast', 'balanced', 'full'];
    const safeMode = validModes.includes(pdfMode) ? pdfMode : 'turbo';

    // Cache key includes mode so switching mode forces re-extract
    const cacheKey = `${tickerUpper}__${safeMode}`;
    const emitProgress = (payload) => {
    if (typeof onProgress === 'function') onProgress(payload);
    };
    const cached = _tcbsPdfCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < TCBS_PDF_TTL) {
        console.log(chalk.yellowBright(`[HỆ THỐNG] Dùng cache RAM TCBS PDF cho ${tickerUpper} mode=${safeMode} (còn ${Math.round((TCBS_PDF_TTL - (Date.now() - cached.ts)) / 60000)} phút)`));
        emitProgress({ step: 'TCBS_PDF_CACHE_HIT', message: 'Đã có dữ liệu BCTC PDF trong cache RAM', progress: 28 });
        return cached.markdown;
    }
     if (mongoose.connection.readyState === 1) {
        try {
            const mongoCached = await TcbsMarkdownCacheModel.findOne({ ticker: tickerUpper, mode: safeMode }).lean();
            const cachedTimestamp = mongoCached?.timestamp ? new Date(mongoCached.timestamp).getTime() : 0;
            const isMongoCacheValid = Boolean(
                mongoCached?.markdown
                && cachedTimestamp
                && (Date.now() - cachedTimestamp) < TCBS_PDF_TTL
            );

            if (isMongoCacheValid) {
                _tcbsPdfCache.set(cacheKey, { markdown: mongoCached.markdown, ts: cachedTimestamp });
                console.log(chalk.yellow(`[HỆ THỐNG] Dùng cache MongoDB TCBS PDF cho ${tickerUpper} mode=${safeMode} (còn ${Math.round((TCBS_PDF_TTL - (Date.now() - cachedTimestamp)) / 60000)} phút)`));
                emitProgress({ step: 'TCBS_PDF_CACHE_HIT', message: 'Đã có dữ liệu BCTC PDF trong cache MongoDB', progress: 28 });
                return mongoCached.markdown;
            }
        } catch (error) {
            console.log(chalk.yellow(`[CẢNH BÁO] Không đọc được cache MongoDB TCBS PDF: ${error.message}`));
        }
    }
    const pdfUrl = `https://static.tcbs.com.vn/oneclick/${tickerUpper}.pdf`;
    
    try {
        console.log(chalk.cyan(`[HỆ THỐNG] Đang tải PDF ${tickerUpper} từ TCBS...`));
        emitProgress({ step: 'TCBS_PDF_DOWNLOAD', message: 'Đang tải dữ liệu PDF từ TCBS', progress: 18 });
        
        const response = await axios.get(pdfUrl, { responseType: 'arraybuffer', timeout: 15000 });
        const pdfBuffer = Buffer.from(response.data);
        emitProgress({ step: 'TCBS_PDF_DOWNLOADED', message: 'Đã tải PDF, đang bóc tách dữ liệu BCTC', progress: 24 });

        console.log(chalk.yellow(`[HỆ THỐNG] Đang chuyển tệp sang Trạm Python Docling để làm sạch...`));
        
        const formData = new FormData();
        formData.append('file', pdfBuffer, { 
            filename: `${tickerUpper}_Report.pdf`, 
            contentType: 'application/pdf' 
        });

        console.log(chalk.cyan(`[HỆ THỐNG] Gọi Docling với mode=${safeMode.toUpperCase()}...`));
        emitProgress({ step: 'DOCLING_PARSE', message: `Đang xử lý PDF bằng AI Docling (${safeMode.toUpperCase()})`, progress: 32 });
        
        try {
            const doclingResponse = await axios.post(`http://localhost:8000/parse-pdf?mode=${safeMode}`, formData, {
                headers: formData.getHeaders(),
                timeout: 300000 
            });

            // --- 1. NẾU DOCLING THÀNH CÔNG ---
            if (doclingResponse.data.success) {
                let rawMarkdown = doclingResponse.data.markdown;
                let cleanMarkdown = rawMarkdown;
                
                cleanMarkdown = cleanMarkdown
                    .replace(/Techcom Securities/g, '')
                    .replace(/Hotline: 1800 588 826; cskh@tcbs\.com\.vn/g, '')
                    .replace(/Giải thích các chỉ tiêu tài chính/g, '')
                    .replace(/\n*/g, '');

                for (let i = 0; i < 6; i++) {
                    cleanMarkdown = cleanMarkdown
                        .replace(/(\S)  ([À-ỹđĐ])  (\S)/g, '$1$2$3')
                        .replace(/(\S)  ([À-ỹđĐ])  /g, '$1$2 ')
                        .replace(/ ([À-ỹđĐ])  (\S)/g, ' $1$2');
                }
                for (let i = 0; i < 8; i++) {
                    cleanMarkdown = cleanMarkdown
                        .replace(/([À-ỹA-Za-z(]) ([À-ỹ]{1,3}) ([A-Za-zÀ-ỹ)])/g, '$1$2$3');
                }
                cleanMarkdown = cleanMarkdown.replace(/\n{3,}/g, '\n\n').trim();

                const cacheTimestamp = Date.now();
                _tcbsPdfCache.set(cacheKey, { markdown: cleanMarkdown, ts: cacheTimestamp });

                if (mongoose.connection.readyState === 1) {
                    try {
                        await TcbsMarkdownCacheModel.findOneAndUpdate(
                            { ticker: tickerUpper, mode: safeMode },
                            { $set: { ticker: tickerUpper, mode: safeMode, markdown: cleanMarkdown, timestamp: new Date(cacheTimestamp) } },
                            { upsert: true, setDefaultsOnInsert: true }
                        );
                        console.log(chalk.yellow(`[CACHE SAVE] Đã lưu nội dung PDF bóc tách của ${tickerUpper} vào RAM và MongoDB!`));
                    } catch (error) {
                        console.log(chalk.yellow(`[CẢNH BÁO] Không ghi được cache MongoDB TCBS PDF: ${error.message}`));
                    }
                }
                console.log(chalk.green(`[THÀNH CÔNG] Trạm Docling đã bóc tách PDF hoàn tất!`));
                return cleanMarkdown;
            } else {
                throw new Error(doclingResponse.data.error || "Lỗi không xác định từ Docling");
            }
        } 
        // --- 2. NẾU DOCLING  ---
        catch (doclingError) {
            console.log(chalk.yellow(`[CẢNH BÁO] Trạm Docling sập hoặc lỗi: ${doclingError.message}. Khởi động AI Fallback bóc PDF...`));
            emitProgress({ step: 'DOCLING_FAILED', message: 'Docling lỗi, đang dùng Gemini AI Vision để đọc PDF thay thế...', progress: 38 });
            
            const tempPdfPath = path.join(__dirname, `temp_${tickerUpper}_${Date.now()}.pdf`);
            try {
                fs.writeFileSync(tempPdfPath, pdfBuffer);

                const uploadResponse = await fileManager.uploadFile(tempPdfPath, {
                    mimeType: "application/pdf",
                    displayName: `BCTC_${tickerUpper}`
                });

                // Xóa ngay sau khi upload xong, TRƯỚC khi gọi AI
                // (file đã lên Google server rồi, không cần giữ local nữa)
                try { fs.unlinkSync(tempPdfPath); } catch (_) {}

                const model = genAI_Main.getGenerativeModel({ model: "gemini-1.5-pro" });
                const result = await model.generateContent([
                    { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
                    { text: "Hãy bóc tách toàn bộ các bảng số liệu tài chính trong file báo cáo này thành định dạng Markdown (table). Phải giữ sự chính xác tuyệt đối của các con số." }
                ]);

                const aiMarkdown = result.response.text();
                _tcbsPdfCache.set(cacheKey, { markdown: aiMarkdown, ts: Date.now() });
                console.log(chalk.green(`[THÀNH CÔNG] Gemini Vision đã bóc tách PDF thành công thay cho Docling!`));
                return aiMarkdown;

            } catch (aiError) {
                // Đảm bảo cleanup dù lỗi bất kỳ đâu
                try { if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath); } catch (_) {}
                console.log(chalk.red(`[LỖI] Fallback Gemini Vision báo lỗi: ${aiError.message}`));
                emitProgress({ step: 'DOCLING_FAILED', message: 'Docling và Vision đều lỗi, tiếp tục phân tích bằng dữ liệu thị trường', progress: 46 });
                return null;
            }
        }

    } catch (error) {
        console.log(chalk.red(`[LỖI] Luồng TCBS PDF thất bại: ${error.message}`));
        emitProgress({ step: 'TCBS_PDF_FAILED', message: 'Không tải được BCTC PDF, tiếp tục với dữ liệu còn lại', progress: 46 });
        return null;
    }
}

// =========================================================
// 3. HÀM PHÂN TÍCH LÕI CỦA OMNI DUCK
// =========================================================
const buildAnalyzePromptParts = (ticker, data, debateResult = null) => {
    const companyName = data?.companyProfile?.companyName || ticker;
    const overview = data?.companyProfile?.overview || "Chưa có thông tin tổng quan";
    const currentPrice = data?.stockInfo?.currentPrice || "Đang cập nhật";
    const buyVol = data?.stockInfo?.buyVolume || "N/A";
    const sellVol = data?.stockInfo?.sellVolume || "N/A";
    
    const newsArray = data?.news || [];
    const newsSummary = newsArray.slice(0, 20).map((n, i) => {
        return `${i + 1}. [${n.sentiment || 'neutral'}][${n.date || 'Mới nhất'}] ${n.title}`;
    }).join('\n');
    
    const debateSection = debateResult ? `

    ## ⚔️ [BỔ SUNG] TRANH LUẬN AI QUYẾT ĐỊNH ĐỘC LẬP

    > *Hội đồng gồm chuyên gia Kỹ thuật, Cơ bản, Tâm lý và Portfolio Manager đã tranh luận độc lập. Kết quả được tổng hợp bên dưới.*

    ### 📐 Góc nhìn Kỹ thuật
    ${debateResult.techAnalysis}

    ### 🏦 Góc nhìn Cơ bản
    ${debateResult.fundAnalysis}

    ### 📰 Góc nhìn Tâm lý & Vĩ mô
    ${debateResult.newsAnalysis}

    ### 🟢 Luận điểm Phe Bò
    ${debateResult.bullCase}

    ### 🔴 Phản biện Phe Gấu
    ${debateResult.bearCase}

    ### 🟢 Phản công Phe Bò
    ${debateResult.bullDefense}

    ### 🏛️ Phán quyết Portfolio Manager
    ${debateResult.pmDecision}
    ` : '';
    
   const systemPrompt = `Bạn là Giám đốc Nghiên cứu Chiến lược Phân tích Định lượng của hệ thống OMNI DUCK. 
Nhiệm vụ của bạn là tổng hợp toàn bộ dữ liệu thị trường thực tế (Cafef, Entrade) kết hợp với SIÊU VĂN BẢN KHÁCH QUAN TRÍCH XUẤT TỪ FILE PDF mặc định (Xử lý bởi Docling).

BẠN PHẢI ĐỌC HIỂU TOÀN BỘ CÁC BẢNG SỐ LIỆU TÀI CHÍNH MÀU SẮC MÀ DOCLING ĐÃ CHUYỂN ĐỔI THÀNH DẠNG MARKDOWN, tuy nhiên một số chữ do hệ thống markdown chưa chuẩn ở tiếng Việt, nên có thể bị sai chính tả, thừa dấu cách, hãy tự dịch và hiểu (|).

YÊU CẦU PHÂN TÍCH FILE PDF ĐẦU VÀO CỰC KỲ CHI TIẾT:
1. Rút ra các chỉ số tài chính cốt lõi: Biên lãi thuần (NIM), Hiệu quả vốn (ROE, ROA), Tăng trưởng LNST. Đối chiếu số liệu quá khứ và dự phóng tương lai có trong văn bản.
2. Bóc tách chất lượng tài sản: Tỷ lệ nợ xấu (NPL), Tỷ lệ bao phủ nợ xấu. Đánh giá bộ đệm rủi ro của doanh nghiệp tăng hay giảm qua các quý.
3. Tìm kiếm xung đột số liệu: Đối chiếu giữa nhận định định tính (văn bản báo cáo) và dữ liệu định lượng (các con số thực tế trong bảng số liệu). Chỉ ra điểm sáng và góc tối ngầm.

Xưng "tôi" và gọi người dùng là "bạn" với thái độ là người bạn đồng hành, hỗ trợ, trợ lý quản gia cung cấp lập luận sắc bén, chuyên nghiệp, ngôn phong thực chiến, không lý thuyết suông.

BÁO CÁO PHẢI XUẤT RA THEO ĐÚNG CẤU TRÚC MARKDOWN SAU:
## 📊 [1] BÁO CÁO TÀI CHÍNH VÀ PHÂN TÍCH KỸ THUẬT, VI MÔ
(Thông báo về trạng thái đọc báo cáo file pdf xem có dữ liệu chưa, nếu chưa có thì dựa vào thông tin bctc thị trường - ví dụ: đọc BCTC từ TCBS thất bại, dựa vào kết quả thị trường thực tế hoặc Đọc BCTC thành công, dưới đây là phân tích...)
- **Tóm tắt luận điểm từ tài liệu:** [Nêu rõ tài liệu này cung cấp góc nhìn gì mới?]
- **Bóc tách bảng dữ liệu tài chính:** [Liệt kê chính xác các con số ROE, NIM, Nợ xấu trích xuất từ bảng Markdown. Đánh giá xu hướng tăng trưởng rõ ràng qua từng giai đoạn]
- **Tác động ngầm của tài liệu:** [Tài liệu này cho thấy doanh nghiệp đang tốt lên thực sự hay chỉ là bánh vẽ tài chính?]
- Phân tích, cực sâu vào các chỉ số Cơ bản (P/E, P/B) và Dòng tiền (Mua/Bán chủ động). Nếu không thấy báo cáo TCBS, dồn lực phân tích dữ liệu đang có. Đánh giá P/E và P/B.
- **Biểu đồ Hành vi Giá (Price Action):** Dùng khối mã \`\`\`text ... \`\`\` để vẽ sơ đồ ASCII trực quan mô phỏng đường đi của giá và Volume.
- Nhận định Tay To: Lực mua/bán này đang "tố cáo" âm mưu gì của tạo lập?

## 🌐 PHẦN 2: PHÂN TÍCH VĨ MÔ & CHẤT XÚC TÁC (MACRO & CATALYSTS)
- BỘ LỌC NHIỄU: Phớt lờ toàn bộ tin tức không liên quan tài chính đến mã đang cần phân tích ( bao gồm cả nội dung tin tức). ( không cần gửi thông báo là: "đã bỏ qua các thông tin nhiễu" hoặc tương tự, chỉ cần phân tích các phần bên dưới)
- Bóc tách 2-5 tin tức mới nhất, nóng nhất tác động của nó vẫn còn hiện hữu (gồm tin tiêu cực , tin chính thống , tin đồn) có "Sức sát thương" lớn nhất, mới nhất. Lý do ảnh hưởng theo chiều hướng nào, tâm lý nhà đầu tư.

${debateSection}

## 🎯 [3] NHẬN ĐỊNH TOÀN DIỆN VÀ KHUYẾN NGHỊ CHIẾN LƯỢC
[Kết hợp dữ liệu PDF và giá thực tế để đưa ra kết luận cốt lõi, đưa ra dự đoán biến động giá, trong ngắn hạn, dài hạn] 
QUY TẮC TÔ MÀU (KỶ LUẬT THÉP - TIẾT CHẾ TỐI ĐA):
- BẠN BỊ CẤM tô màu tràn lan. Báo cáo tĩnh lặng mới là báo cáo nguy hiểm. Không bọc $số liệu$ trong thẻ $$, sử dụng thẻ in đậm, in nghiêng chuẩn quy tắc markdown để làm nổi bật.
- Trong toàn bộ báo cáo, CHỈ ĐƯỢC PHÉP tô màu TỐI ĐA 5 TỪ KHÓA TÍCH CỰC và 5 TỪ KHÓA TIÊU CỰC mang tính quyết định nhất (ví dụ: MUA MẠNH, SẬP GÃY, VƯỢT ĐỈNH, DÒNG TIỀN RÚT).
- Tích cực: bọc trong <span className="text-emerald-500 font-black uppercase">từ khóa</span>
- Tiêu cực: bọc trong <span className="text-red-500 font-black uppercase">từ khóa</span>
 
## 🎯 KẾT LUẬN & CHIẾN LƯỢC LỆNH (ACTION PLAN)
Dựa trên mục tiêu lợi nhuận, ( giả định cả đang nắm giữ cho mục tiêu bán) đây là kịch bản chuẩn xác:
- <span className="text-yellow-500 font-black text-lg">RATING: [MUA / NẮM GIỮ / BÁN]</span>
- **Vùng Mua (Entry):** [Mức giá]
- **Cắt Lỗ (Stoploss):** [Mức giá]
- **Chốt Lời Ngắn Hạn (Target):** [Mức giá]
- **Thời Gian Ngắn Hạn:** [Dự kiến bao lâu đạt Target, VD: 3-5 phiên, 1-2 tuần]
- **Mục Tiêu Dài Hạn:** [Mức giá mục tiêu 6-12 tháng tới]
- **Thời Gian Dài Hạn:** [Dự kiến bao lâu đạt mốc Dài Hạn, VD: 2 quý, năm 2026]
- **Kế hoạch Vốn (Position Sizing):** [% NAV]`;

    const userPrompt = `DỮ LIỆU ĐẦU VÀO TỪ HỆ THỐNG:
1. Thông tin doanh nghiệp: ${companyName}
2. Cốt lõi kinh doanh: ${overview}
3. Giá giao dịch hiện tại: ${currentPrice} VNĐ
4. Dòng tiền (Mua/Bán chủ động): Mua ${buyVol} - Bán ${sellVol}
5. Lịch sử nhận định cũ: ${data?.previousAnalysis || 'Chưa có dữ liệu'}
6. Tin tức mới nhất:
${newsSummary || 'Không có tin tức nổi bật.'}`;

    const promptParts = [
        { text: `${systemPrompt}\n\n${userPrompt}` }
    ];

    if (data.tcbsMarkdownData) {
        promptParts.push({
            text: `\n\n--- DỮ LIỆU TỪ BÁO CÁO TÀI CHÍNH TCBS (Trích xuất bởi Docling) ---\n${data.tcbsMarkdownData}\n-------------------`
        });
    }
    
    return promptParts;
};

export async function analyzeWithGemini(ticker, data, onProgress = null) {
    const emitProgress = (payload) => {
        if (typeof onProgress === 'function') onProgress(payload);
    };
    console.log(chalk.whiteBright(`[AI CORE] Bắt đầu đọc dữ liệu đa chiều cho ${ticker.toUpperCase()}...`));
    emitProgress({ step: 'AI_CONTEXT_READING', message: 'Đang đọc dữ liệu BCTC, lịch sử giá, tin tức và bối cảnh thị trường', progress: 62 });

    const promptParts = buildAnalyzePromptParts(ticker, data, data.debateResult || null);

    try {
        emitProgress({ step: 'AI_GENERATING', message: 'Đang gửi dữ liệu BCTC sang AI và sinh báo cáo chiến lược', progress: 76 });
         const aiReport = await generateWithRole('main', promptParts);
        emitProgress({ step: 'AI_REPORT_DONE', message: 'AI đã hoàn tất báo cáo chiến lược', progress: 88 });
        return aiReport;

    } catch (error) {
        console.error(chalk.bgRed.white("[LỖI] Gọi AI Main thất bại: "), error.message);
        throw error;
    }
}

export async function analyzeWithGeminiStream(ticker, data, onProgress = null, onChunk = null) {
    const emitProgress = (payload) => {
        if (typeof onProgress === 'function') onProgress(payload);
    };
    console.log(chalk.whiteBright(`[AI CORE] Bắt đầu stream dữ liệu đa chiều cho ${ticker.toUpperCase()}...`));
    emitProgress({ step: 'AI_CONTEXT_READING', message: 'Đang đọc dữ liệu BCTC, lịch sử giá, tin tức và bối cảnh thị trường', progress: 62 });

    const promptParts = buildAnalyzePromptParts(ticker, data, data.debateResult || null);

    try {
        emitProgress({ step: 'AI_GENERATING', message: 'Đang stream dữ liệu BCTC sang AI và sinh báo cáo chiến lược', progress: 76 });
        // Stream báo cáo chính — ưu tiên Gemini Pro với stream thực, fallback fake-stream từ provider khác
        const aiReport = await generateWithRoleStream('main', promptParts, onChunk);
        emitProgress({ step: 'AI_REPORT_DONE', message: 'AI đã hoàn tất báo cáo chiến lược', progress: 88 });
        return aiReport;

    } catch (error) {
        console.error(chalk.bgRed.white("[LỖI] Stream AI Main thất bại: "), error.message);
        throw error;
    }
}

// =========================================================
// 4. HÀM SĂN TIN TỨC BẰNG AI
// =========================================================
export async function searchNewsWithAI(ticker, existingTitles = [], mode = 'balanced') {
    console.log(chalk.cyan(`[AI CORE] Săn tin ${ticker.toUpperCase()} | mode: ${mode}...`));

    const knownContext = existingTitles.length > 0
        ? `\nTIN ĐÃ BIẾT (không lặp lại): ${existingTitles.join(' | ')}.`
        : '';

    const modeInstruction = {
        official: `Tìm 6 bài báo MỚI NHẤT từ nguồn chính thống (CafeF, VietStock, Báo Đầu tư, VnEconomy, NDH) về cổ phiếu ${ticker}. Ưu tiên: kết quả kinh doanh, thay đổi nhân sự cấp cao, M&A, chia cổ tức, phát hành cổ phiếu.`,
        balanced: `Tìm 8 bài báo MỚI NHẤT về cổ phiếu ${ticker}. YÊU CẦU CÂN BẰNG: ít nhất 3 bài phải là TIN XẤU hoặc RỦI RO (bán tháo, margin call, ngoại bán ròng, nợ xấu, vi phạm, điều tra, kiểm toán, thanh khoản kém). Phần còn lại: tin tích cực, kết quả kinh doanh, dòng tiền.`,
        negative: `Tìm 8 bài báo về các RỦI RO và TIN XẤU của cổ phiếu ${ticker}. Ưu tiên tuyệt đối: bán tháo, margin call, ngoại bán ròng, nợ xấu, vi phạm pháp luật, bị điều tra, kiểm toán ngoại trừ, siết tín dụng, thanh khoản kém, cổ đông lớn thoái vốn, nội bộ lục đục. Chấp nhận cả tin đồn chưa kiểm chứng nếu có nguồn.`,
        rumor:    `Tìm 8 bài viết/thảo luận về cổ phiếu ${ticker} từ diễn đàn, mạng xã hội, group Facebook, Reddit, Webtretho. Ưu tiên: tin đồn nội bộ, dòng tiền lớn bất thường, tay to gom hàng, thông tin xám chưa kiểm chứng, tâm lý đám đông. Không cần từ báo chính thống.`,
    }[mode] || '';

    const prompt = `${modeInstruction}${knownContext}
Không lấy tin giới thiệu chung chung ("Giới thiệu về ${ticker}", "Các mã ngành...").
Không lấy tin quảng cáo, PR doanh nghiệp.
Trả về JSON array, không có text thừa:
[ { "title": "...", "link": "...", "date": "DD/MM/YYYY", "source": "tên báo/diễn đàn", "sentiment": "positive|negative|neutral" } ]`;

    try {
 
        let text;
        try {
            // Ưu tiên: Gemini với googleSearch tool
            const result = await generateWithAutoSwitch(prompt, {
                tools: [{ googleSearch: {} }],
                generationConfig: { responseMimeType: "application/json" }
            });
            text = result.response.text();
        } catch (geminiErr) {
            console.log(chalk.yellow(`[AI NEWS] Gemini search thất bại (${geminiErr.message}), dùng fallback provider không có search tool...`));
            // Fallback: các provider khác sẽ dùng kiến thức huấn luyện
            text = await generateWithRole('news', prompt, { responseFormat: 'json_object' });
        }

        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const newsArray = JSON.parse(text);

        console.log(chalk.green(`[THÀNH CÔNG] AI săn ${newsArray.length} bài | mode: ${mode}`));
        return newsArray;
    } catch (error) {
        console.error(chalk.red("[LỖI] AI săn tin thất bại: "), error.message);
        return [];
    }
}

// =========================================================
// 5. HÀM ACTION PANEL 
// =========================================================
export async function getQuickActionWithGemini(ticker, liveData, strategicContext = "") {
    const prompt = `Bạn là Giám đốc Giao dịch HFT chuyên nghiệp.
    KẾT LUẬN CHIẾN LƯỢC TỔNG THỂ TRƯỚC ĐÓ: ${strategicContext || 'Chưa có'}
    
    DỮ LIỆU LIVE HIỆN TẠI:
    - Mã: ${ticker}. Biến động: ${liveData.currentPrice} (${liveData.changePercent}%).
    - Lệnh: Mua ${liveData.buyVolume} - Bán ${liveData.sellVolume}.
    
    Nhiệm vụ: Đưa ra lệnh thực thi ngay lập tức, kèm theo dự báo chính xác về khung thời gian kỳ vọng.
    LƯU Ý: Nếu chiến lược trước đó báo "TRÁNH XA/BÁN" do nội bộ xấu hoặc rác, tuyệt đối KHÔNG được báo "MUA MẠNH" dù giá đang xanh, hãy báo "ĐỨNG NGOÀI" hoặc "THOÁT HÀNG".
    
    BẮT BUỘC TRẢ VỀ ĐỊNH DẠNG JSON KHỚP 100% MẪU SAU (Cấm kèm chữ thừa ngoài JSON):
    {
      "action": "MUA / BÁN / ĐỨNG NGOÀI / THOÁI HÀNG",
      "entry": "Mức giá hoặc 'N/A'",
      "stoploss": "Mức giá hoặc 'N/A'",
      "target": "Mức giá hoặc 'N/A'",
      "shortTermHorizon": "Dự kiến đạt Target ngắn hạn trong vòng bao lâu? (Ví dụ: 3-5 phiên, 1-2 tuần)",
      "longTermTarget": "Mức giá mục tiêu dài hạn (Khung 6-12 tháng) hoặc 'N/A'",
      "longTermHorizon": "Dự kiến đạt Target dài hạn trong vòng bao lâu? (Ví dụ: 2 quý, cuối năm 2026)",
      "reason": "Giải thích ngắn gọn, phải lột tả được yếu tố thời gian và khớp chiến lược tổng thể."
    }`;

    try {
         const text = await generateWithRole('action', prompt, {
            responseFormat: 'json_object',
            temperature: 0.3,
        });
        return JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());
    } catch (error) {
        console.error(chalk.red("[LỖI] AI Action Panel thất bại: "), error.message);
        return null;
    }
}

// =========================================================
// 5B. AI PHÂN TÍCH PHÁI SINH CHUYÊN SÂU (QUANT MCP LOGIC)
// =========================================================
export async function analyzeDerivativesWithGemini(derivData) {
    const { previousAiReport, ...otherData } = derivData;
    console.log(chalk.yellow(`[AI CORE] Đang chạy thuật toán Quant MCP cho VN30F1M...`));
    const previousReportContext = previousAiReport 
    ? `\n--- BÁO CÁO PHÂN TÍCH CỦA BẠN Ở LẦN GẦN NHẤT ---\n${previousAiReport}\n--------------------------------------------\n` 
    : "\n--- CHƯA CÓ BÁO CÁO TRƯỚC ĐÓ ---\n";
    const prompt = `
Bạn là OMNI DUCK - Giám đốc Hệ thống Giao dịch Định lượng (Quant Hedge Fund AI).
Bạn đang phân tích dữ liệu Phái sinh VN30F1M (Thị trường Việt Nam) dựa trên thuật toán đọc Chart tự động.

[DỮ LIỆU ĐẦU VÀO REALTIME]
- Giá VN30F1M hiện tại: ${derivData.currentF1M} | VN30 INDEX: ${derivData.vn30}
- Độ lệch (Basis): ${derivData.basis} | Tốc độ xé Basis: ${derivData.speed} điểm/nhịp
- Vùng kẹt lệnh (POC): ${derivData.poc} | Khoảng cách đến POC: ${derivData.pocDistance}%
- Khối lượng mở (OI): ${derivData.oi} HĐ | Xu thái OI: ${derivData.oiTrend}
- Khối ngoại ròng (Net): ${derivData.fNet} HĐ
- Đường xu hướng EMA (3 vs 8): EMA3=${derivData.ema3}, EMA8=${derivData.ema8}
- Biến động (ATR): ${derivData.atr} | Tổng lực 10 Trụ dẫn dắt: ${derivData.totalImpact} điểm
- Điểm hợp lưu hệ thống (Confluence Score): ${derivData.score}/100
- Đề xuất Máy móc: ${derivData.mechTrend} -> ${derivData.mechAction}
- Thông số Risk/Reward (R:R) hệ thống đề xuất: 1:${derivData.rrRatio} (SL: ${derivData.sl}, TP1: ${derivData.tp1}, TP2: ${derivData.tp2})
- Báo cáo phân tích trước đó của bạn: ${previousReportContext}

${derivData.newsHeadlines ? `\n[TIN TỨC VĨ MÔ GẦN NHẤT]\n${derivData.newsHeadlines}` : ''}

[QUY TẮC TƯ DUY RÀNG BUỘC - CHAIN OF THOUGHT]
Bạn PHẢI phân tích theo đúng trình tự 4 bước sau trước khi đưa ra kết luận:
1. ĐỌC ORDERFLOW & THANH KHOẢN (Liquidity): Đối chiếu độ lệch Basis, vị thế Khối ngoại và khối lượng OI để xem phe nào đang bị kẹp hàng (Trapped), Đối chiếu thêm với tin tức vĩ mô gần nhất nếu có.
2. KIỂM TRA VÙNG POC (Point of Control): Giá đang ở trên hay dưới POC? Lực hút về POC có mạnh không?
3. ĐÁNH GIÁ SỨC MẠNH TRỤ (Influencers): Lực của 10 mã vốn hóa lớn nhất đang thuận hay nghịch với Basis?
4. ĐỐI CHIẾU MICRO-STRUCTURE: Tốc độ xé Basis và EMA3/EMA8 có ủng hộ điểm đảo chiều ngắn hạn (Scalp/Day Trade) không?

[YÊU CẦU ĐẦU RA]
QUAN TRỌNG: Bạn BẮT BUỘC phải trả về kết quả dưới dạng JSON thuần túy (không bọc trong markdown \`\`\`json) với cấu trúc chính xác như sau:
{
  "aiReport": "Bài phân tích chi tiết định dạng Markdown của bạn...",
  "actionPanelData": {
    "action": "LONG" | "SHORT" | "QUAN SÁT",
    "entry": "Mức giá khuyến nghị vào lệnh (ví dụ: 1990.5) hoặc '---' nếu quan sát",
    "sl": "Mức giá cắt lỗ (ví dụ: 1985.0) hoặc '---'",
    "tp": "Mức giá chốt lời mục tiêu (ví dụ: 2005.0) hoặc '---'",
    "reason": "Giải thích NGẮN GỌN 2-3 câu lý do đưa ra lệnh này dựa trên Vĩ mô và Kỹ thuật."
  }
}

Trong đó, phần "aiReport" phải tuân thủ nghiêm ngặt định dạng Markdown sau:
## 📡 1. GIẢI MÃ DÒNG TIỀN (ORDERFLOW & BASIS)
- [Bóc tách Basis, OI và Khối ngoại. Chỉ ra phe Long hay Short đang nắm quyền kiểm soát hoặc đang bị sập bẫy]

## 🎯 2. ĐỘNG LỰC NGẮN HẠN & VÙNG KẸT LỆNH (MICRO-STRUCTURE)
- [Đánh giá lực của Trụ, sự giao cắt EMA và vị thế giá so với vùng kẹt lệnh POC]

## ⚡ 3. KỊCH BẢN HÀNH ĐỘNG (ACTION PLAN)
- **Tín hiệu chủ đạo:** [Tên tín hiệu rõ ràng: CANH LONG / CANH SHORT / ĐỨNG NGOÀI]
- **Tỷ lệ thắng dự kiến (Confidence):** [Ví dụ: 75%]
- **Kịch bản vào lệnh (Entry):** [Vùng giá cụ thể. KHÔNG báo giá chung chung]
- **Vùng vô hiệu (Stoploss):** [Mức giá cắt lỗ, giải thích ngắn gọn tại sao chọn mức này]
- **Mục tiêu (Take Profit):** [Mức giá chốt lời 1 và 2]
- **Lưu ý nguy hiểm:** [Cảnh báo rủi ro bẻ kèo (Ví dụ: "Hủy lệnh nếu Trụ VIC, VHM bị bán tháo")]
`;

try {
        // Phái sinh cần chất lượng cao, ưu tiên Gemini Pro
        const text = await generateWithRole('derivatives', [prompt], {
            responseFormat: 'json_object',
        });

        const cleanJsonString = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsedData = JSON.parse(cleanJsonString);
        return parsedData;

    } catch (error) {
        console.error(chalk.red("[LỖI] AI Phái sinh thất bại: "), error.message);
        throw error;
    }
}
// =========================================================
// 6. AI PHÂN TÍCH TÍN HIỆU CRYPTO & PHÁI SINH CRYPTO
// =========================================================
export async function analyzeCryptoSignalWithGemini(symbol, liveData) {
    const newsContext = liveData.newsList?.slice(0, 10).map(n => `- [${n.sentiment}] ${n.title}`).join('\n') || 'Không có tin tức.';

    const prompt = `Bạn là Giám đốc Quỹ Đầu tư Định lượng OMNI DUCK.
    Hãy phân tích đồng ${symbol} dựa trên dữ liệu realtime:

    --- THÔNG SỐ KỸ THUẬT ---
    - Giá: ${liveData.currentPrice} | Score: ${liveData.technicalScore}/100
    - RSI: ${liveData.techDetails?.rsi} | MACD: ${liveData.techDetails?.macdLine}
    - ATR: ${liveData.techDetails?.atr} | CVD: ${liveData.techDetails?.cvd}

    --- DỮ LIỆU PHÁI SINH ---
    - Funding Rate: ${liveData.derivatives?.fundingRate}%
    - Long/Short Ratio: ${liveData.derivatives?.longPercent}% / ${liveData.derivatives?.shortPercent}%

    --- TIN TỨC & VĨ MÔ ---
    ${newsContext}

    YÊU CẦU TRẢ VỀ JSON CHUẨN (CẤM CHỮ THỪA):
    {
      "signal": "LONG / SHORT / WAIT",
      "confidence": "0-100%",
      "tech_analysis": "Phân tích ngắn gọn về đồ thị và chỉ báo.",
      "macro_analysis": "Phân tích về tin tức và dòng tiền phái sinh.",
      "entry": "Giá vào lệnh",
      "sl": "Giá cắt lỗ",
      "tp": "Giá chốt lời",
      "horizon": "Thời gian nắm giữ dự kiến",
      "risk_reward": "Tỷ lệ R:R",
      "advice": "Lời khuyên chiến thuật cuối cùng."
    }`;

    try {
        // Crypto — Groq nhanh, Gemini Flash fallback
        const text = await generateWithRole('crypto', [prompt], {
            responseFormat: 'json_object',
        });
        return JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());
    } catch (error) {
        return { signal: "WAIT", confidence: "0%", advice: "Lỗi AI: " + error.message };
    }
}

// =========================================================
// 7. CHAT WITH AI — READ SAVED REPORTS
// =========================================================
export async function chatWithStockAI(ticker, question, history = [], aiReport = null) {

     const reportContext = aiReport
        ? `\n\n[BÁO CÁO PHÂN TÍCH ĐÃ LƯU — ${ticker.toUpperCase()}]\n${aiReport}\n[HẾT BÁO CÁO]`
        : `\n\n[CẢNH BÁO: Chưa có báo cáo lưu cho ${ticker}. Trả lời dựa trên kiến thức chung về TTCK Việt Nam.]`;
 
     const historyText = history.length > 0
        ? '\n\n[LỊCH SỬ CHAT GẦN ĐÂY]\n' +
          history.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n')
        : '';
 
    const prompt = `Bạn là OMNI DUCK — Trợ lý phân tích tài chính cho TTCK Việt Nam.
Nhiệm vụ: Trả lời câu hỏi về mã ${ticker.toUpperCase()} dựa trên báo cáo phân tích đã lưu bên dưới.
 
NGUYÊN TẮC:
1. Ưu tiên tuyệt đối thông tin từ BÁO CÁO ĐÃ LƯU.
2. Trả lời trực tiếp, súc tích, dùng số liệu cụ thể.
3. Nếu báo cáo chưa đề cập → nói rõ "Báo cáo hiện tại chưa đề cập điểm này." và trả lời dựa trên kiến thức chung về thị trường Việt Nam có thể tra cứu internet, tránh suy đoán vô căn cứ.
4. Dùng **bold** cho số liệu quan trọng, bullet points khi liệt kê.
5. KHÔNG bịa số liệu. KHÔNG đưa lời khuyên đầu tư tuyệt đối.
6. Tối đa 300 từ (trừ khi câu hỏi yêu cầu chi tiết hơn).
${reportContext}${historyText}
 
[CÂU HỎI]
${question}
 
Trả lời bằng tiếng Việt, chuyên nghiệp, đi thẳng vào vấn đề:`;
 
    try {
        // Chat ưu tiên Groq (nhanh), fallback Gemini Flash
        const answer = await generateWithRole('chat', [prompt]);
        console.log(chalk.whiteBright(`[THÀNH CÔNG] Đã trả lời Chat cho ${ticker} (${answer.length} ký tự)`));
        return answer;
    } catch (error) {
        console.error(chalk.red(`[LỖI] Trả lời Chat ${ticker} thất bại:`), error.message);
        throw error;
    }
}

// =========================================================
export { generateWithRole, generateWithRoleStream, getRateLimitStatus, resetProviderBlock };