/**
 * ============================================================
 * OMNI DUCK — MULTI-PROVIDER AI ROUTER
 * ============================================================
 * Kiến trúc: mỗi "role" phân tích được gán 1 chain provider
 * theo thứ tự ưu tiên. Nếu provider đầu bị limit/lỗi,
 * tự động fallback sang provider tiếp theo.
 *
 * ROLE MAP:
 *  - main        → Gemini Pro (paid) → Gemini Flash → Groq
 *  - tech        → Groq → Cerebras → SambaNova → Gemini Flash
 *  - fundamental → Cerebras → SambaNova → Groq → Gemini Flash
 *  - news        → SambaNova → Groq → DeepInfra → Gemini Flash
 *  - bull        → Groq → Cerebras → OpenRouter → Gemini Flash
 *  - bear        → Cerebras → SambaNova → Groq → Gemini Flash
 *  - pm          → Groq → Cerebras → Gemini Flash → Gemini Pro
 *  - action      → Gemini Flash → Groq → Cerebras
 *  - chat        → Groq → Gemini Flash → Cerebras
 *  - derivatives → Gemini Pro → Gemini Flash → Groq
 *  - crypto      → Groq → Gemini Flash → Cerebras
 *  - json        → Gemini Flash → Groq → Cerebras
 * ============================================================
 */

import axios from 'axios';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendTelegramMessage, buildSystemAlertMessage } from './telegramService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env'), override: true });

// ============================================================
// RATE LIMIT TRACKER (in-memory, reset theo sliding window)
// ============================================================
const rateLimitTracker = new Map();
 
const RATE_LIMIT_COOLDOWN_MS = {
    default:   60_000,    
    groq:      30_000,  
    cerebras:  60_000,
    sambanova: 60_000,
    openrouter:60_000,
    deepsinfra: 60_000,
    gemini:    90_000,   
};

function isProviderBlocked(providerKey) {
    const state = rateLimitTracker.get(providerKey);
    if (!state) return false;
    if (Date.now() < state.blockedUntil) {
        const remainSec = Math.ceil((state.blockedUntil - Date.now()) / 1000);
        console.log(chalk.gray(`[ROUTER] ⏳ ${providerKey} đang cooldown ${remainSec}s`));
        return true;
    }
    return false;
}

function markProviderBlocked(providerKey, reason = 'rate_limit') {
    const cooldown = RATE_LIMIT_COOLDOWN_MS[providerKey.split(':')[0]] || RATE_LIMIT_COOLDOWN_MS.default;
    const prev = rateLimitTracker.get(providerKey);
    const failCount = (prev?.failCount || 0) + 1;
    // Exponential backoff: tối đa 5 phút
    const backoff = Math.min(cooldown * Math.pow(1.5, failCount - 1), 5 * 60_000);
    rateLimitTracker.set(providerKey, {
        blockedUntil: Date.now() + backoff,
        failCount,
        reason,
    });
    const cooldownSec = (backoff / 1000).toFixed(0);
    console.log(chalk.yellow(`[ROUTER] 🚫 ${providerKey} bị block (${reason}), cooldown ${cooldownSec}s`));

    if (failCount === 1 || failCount % 10 === 0) {
        const issue = reason === 'rate_limit' ? 'Vượt quá Rate Limit (429/503)' : 'Lỗi kết nối / API Key có vấn đề';
        const alertMsg = buildSystemAlertMessage(
            'AI Router',
            `Provider [${providerKey}] ngừng hoạt động`,
            `Lý do: ${issue}\nĐóng băng: ${cooldownSec}s\nSố lần lỗi liên tiếp: ${failCount}`
        );
        sendTelegramMessage(alertMsg).catch(() => {});
    }
}

function clearProviderBlock(providerKey) {
    if (rateLimitTracker.has(providerKey)) {
        rateLimitTracker.set(providerKey, { blockedUntil: 0, failCount: 0 });
    }
}

// ============================================================
// PROVIDER DEFINITIONS
// ============================================================

/**
 * Mỗi provider có interface chuẩn: generate(prompt, options) → string
 * Các hàm này wrap các SDK/API khác nhau về 1 interface chung.
 */

// ---------- HELPER: OpenAI-compatible REST call ----------
async function openAICompatibleCall(baseUrl, apiKey, model, prompt, options = {}) {
    let messages;

    if (typeof prompt === 'string') {
        messages = [{ role: 'user', content: prompt }];
    } else if (Array.isArray(prompt)) {
        const isGeminiFormat = prompt.every(p => typeof p === 'object' && ('text' in p || 'inlineData' in p || 'fileData' in p));
        if (isGeminiFormat) {
            const combinedText = prompt
                .filter(p => typeof p.text === 'string')
                .map(p => p.text)
                .join('\n\n');
            messages = [{ role: 'user', content: combinedText }];
        } else {
            messages = prompt;
        }
    } else {
        messages = [{ role: 'user', content: String(prompt) }];
    }

    const response = await axios.post(
        `${baseUrl}/chat/completions`,
        {
            model,
            messages,
            max_tokens: options.maxTokens || 2000,
            temperature: options.temperature ?? 0.7,
            ...(options.responseFormat ? { response_format: { type: options.responseFormat } } : {}),
        },
        {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                ...(options.extraHeaders || {}), 
            },
            timeout: options.timeout || 60_000,
        }
    );

    return response.data.choices[0].message.content;
}

// ---------- GROQ ----------
const GROQ_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.1-70b-versatile',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
];

async function groqGenerate(prompt, options = {}) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY chưa được cấu hình');

    for (const model of GROQ_MODELS) {
        try {
            const result = await openAICompatibleCall(
                'https://api.groq.com/openai/v1',
                apiKey,
                model,
                prompt,
                { ...options, timeout: 45_000 }
            );
            console.log(chalk.cyan(`[GROQ] ✅ Thành công với model: ${model}`));
            return result;
        } catch (err) {
            const status = err.response?.status;
            if (status === 429 || status === 503) {
                console.log(chalk.yellow(`[GROQ] ⚠️ Model ${model} bị rate limit, thử model khác...`));
                continue;
            }
            console.log(chalk.yellow(`[GROQ] ⚠️ Model ${model} lỗi ${status}: ${err.message}`));
            continue;
        }
    }
    throw new Error('[GROQ] Toàn bộ models đều thất bại');
}

// ---------- CEREBRAS ----------
const CEREBRAS_MODELS = [
    'llama-3.3-70b',
    'llama-3.1-70b',
    'llama-3.1-8b',
];
async function cerebrasGenerate(prompt, options = {}) {
    const apiKey = process.env.CEREBRAS_API_KEY;
    if (!apiKey) throw new Error('CEREBRAS_API_KEY chưa được cấu hình');

    for (const model of CEREBRAS_MODELS) {
        try {
            const result = await openAICompatibleCall(
                'https://api.cerebras.ai/v1',
                apiKey,
                model,
                prompt,
                { ...options, timeout: 60_000 }
            );
            console.log(chalk.cyan(`[CEREBRAS] ✅ Thành công với model: ${model}`));
            return result;
        } catch (err) {
            const status = err.response?.status;
            if (status === 429 || status === 503) {
                console.log(chalk.yellow(`[CEREBRAS] ⚠️ ${model} rate limit, thử model khác...`));
                continue;
            }
            console.log(chalk.yellow(`[CEREBRAS] ⚠️ ${model} lỗi ${status}`));
            continue;
        }
    }
    throw new Error('[CEREBRAS] Toàn bộ models đều thất bại');
}

// ---------- SAMBANOVA ----------
const SAMBANOVA_MODELS = [
    'Meta-Llama-3.3-70B-Instruct',
    'Meta-Llama-3.1-70B-Instruct',
    'Qwen2.5-72B-Instruct',
];

async function sambanovaGenerate(prompt, options = {}) {
    const apiKey = process.env.SAMBANOVA_API_KEY;
    if (!apiKey) throw new Error('SAMBANOVA_API_KEY chưa được cấu hình');

    for (const model of SAMBANOVA_MODELS) {
        try {
            const result = await openAICompatibleCall(
                'https://api.sambanova.ai/v1',
                apiKey,
                model,
                prompt,
                { ...options, timeout: 60_000 }
            );
            console.log(chalk.cyan(`[SAMBANOVA] ✅ Thành công với model: ${model}`));
            return result;
        } catch (err) {
            const status = err.response?.status;
            if (status === 429 || status === 503) {
                console.log(chalk.yellow(`[SAMBANOVA] ⚠️ ${model} rate limit`));
                continue;
            }
            console.log(chalk.yellow(`[SAMBANOVA] ⚠️ ${model} lỗi ${status}`));
            continue;
        }
    }
    throw new Error('[SAMBANOVA] Toàn bộ models đều thất bại');
}

// ---------- OPENROUTER ----------
const OPENROUTER_MODELS = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
    'google/gemma-2-9b-it:free',
    'microsoft/phi-3-mini-128k-instruct:free',
];

async function openrouterGenerate(prompt, options = {}) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY chưa được cấu hình');

    for (const model of OPENROUTER_MODELS) {
        try {
            const result = await openAICompatibleCall(
                'https://openrouter.ai/api/v1',
                apiKey,
                model,
                prompt,
                {
                    ...options,
                    timeout: 60_000,
                     extraHeaders: {
                        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3001',
                        'X-Title': 'OmniDuck',
                    }
                }
            );
            console.log(chalk.cyan(`[OPENROUTER] ✅ Thành công với model: ${model}`));
            return result;
        } catch (err) {
            const status = err.response?.status;
            if (status === 429 || status === 503) {
                console.log(chalk.yellow(`[OPENROUTER] ⚠️ ${model} rate limit`));
                continue;
            }
            console.log(chalk.yellow(`[OPENROUTER] ⚠️ ${model} lỗi ${status}`));
            continue;
        }
    }
    throw new Error('[OPENROUTER] Toàn bộ models đều thất bại');
}

// ---------- DEEPINFRA ----------
const DEEPINFRA_MODELS = [
    'meta-llama/Meta-Llama-3.1-70B-Instruct',
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    'Qwen/Qwen2.5-72B-Instruct',
];

async function deepinfraGenerate(prompt, options = {}) {
    const apiKey = process.env.DEEPINFRA_API_KEY;
    if (!apiKey) throw new Error('DEEPINFRA_API_KEY chưa được cấu hình');

    for (const model of DEEPINFRA_MODELS) {
        try {
            const result = await openAICompatibleCall(
                'https://api.deepinfra.com/v1/openai',
                apiKey,
                model,
                prompt,
                { ...options, timeout: 60_000 }
            );
            console.log(chalk.cyan(`[DEEPINFRA] ✅ Thành công với model: ${model}`));
            return result;
        } catch (err) {
            const status = err.response?.status;
            if (status === 429 || status === 503) {
                console.log(chalk.yellow(`[DEEPINFRA] ⚠️ ${model} rate limit`));
                continue;
            }
            console.log(chalk.yellow(`[DEEPINFRA] ⚠️ ${model} lỗi ${status}`));
            continue;
        }
    }
    throw new Error('[DEEPINFRA] Toàn bộ models đều thất bại');
}

// ============================================================
// PROVIDER REGISTRY — map tên → hàm generate
// ============================================================
const PROVIDER_REGISTRY = {
    groq:       groqGenerate,
    cerebras:   cerebrasGenerate,
    sambanova:  sambanovaGenerate,
    openrouter: openrouterGenerate,
    deepinfra:  deepinfraGenerate,
 
    gemini: null, 
};

// ============================================================
// ROLE → PROVIDER CHAIN CONFIG
// ============================================================
// Mỗi role có 1 chain ưu tiên. Provider đầu tiên = ưu tiên cao nhất.
// 'gemini_pro' = Gemini Pro  
// 'gemini_flash' = Gemini Flash  
const ROLE_PROVIDER_CHAINS = {
     main:        ['gemini_pro', 'gemini_flash', 'groq', 'cerebras'],

     tech:        ['groq', 'cerebras', 'sambanova', 'gemini_flash'],

     fundamental: ['cerebras', 'sambanova', 'groq', 'gemini_flash'],

     news:        ['sambanova', 'groq', 'deepinfra', 'gemini_flash'],

     bull:        ['groq', 'cerebras', 'openrouter', 'gemini_flash'],

     bear: ['sambanova', 'groq', 'gemini_flash'],

     pm:          ['groq', 'cerebras', 'gemini_flash', 'gemini_pro'],

     bull_defense: ['groq', 'cerebras', 'sambanova', 'gemini_flash'],

     action:      ['gemini_flash', 'groq', 'cerebras'],

     chat:        ['groq', 'gemini_flash', 'cerebras'],

     derivatives: ['gemini_pro', 'gemini_flash', 'groq'],

     crypto:      ['groq', 'gemini_flash', 'cerebras'],

     json:        ['gemini_flash', 'groq', 'cerebras'],

     default:     ['gemini_flash', 'groq', 'cerebras', 'sambanova'],
};

// ============================================================
// CORE ROUTER FUNCTION
// ============================================================

/**
 * Inject Gemini generators từ aiService.js
 * (tránh circular dependency)
 */
let _geminiProGenerator  = null;
let _geminiFlashGenerator = null;

export function injectGeminiGenerators({ proGenerator, flashGenerator }) {
    _geminiProGenerator  = proGenerator;
    _geminiFlashGenerator = flashGenerator;
    console.log(chalk.green('[ROUTER] ✅ Gemini generators đã được inject thành công'));
}

/**
 * generateWithRole(role, prompt, options)
 *
 * @param {string} role - Vai trò phân tích 
 * @param {string|Array} prompt - Nội dung prompt
 * @param {object} options - { maxTokens, temperature, responseFormat, timeout }
 * @returns {Promise<string>} - Văn bản phản hồi
 */
export async function generateWithRole(role, prompt, options = {}) {
    const chain = ROLE_PROVIDER_CHAINS[role] || ROLE_PROVIDER_CHAINS.default;
    const normalizedRole = role.toUpperCase();

    const errors = [];

    for (const providerKey of chain) {
        // Kiểm tra xem provider có đang bị block không
        if (isProviderBlocked(providerKey)) {
            errors.push(`${providerKey}: đang bị cooldown`);
            continue;
        }

        try {
            let result;

            if (providerKey === 'gemini_pro') {
                if (!_geminiProGenerator) {
                    console.log(chalk.yellow(`[ROUTER] ⚠️ gemini_pro chưa được inject, bỏ qua`));
                    errors.push('gemini_pro: chưa inject generator');
                    continue;
                }
                result = await _geminiProGenerator(prompt, { ...options, useProModel: true });

            } else if (providerKey === 'gemini_flash') {
                if (!_geminiFlashGenerator) {
                    console.log(chalk.yellow(`[ROUTER] ⚠️ gemini_flash chưa được inject, bỏ qua`));
                    errors.push('gemini_flash: chưa inject generator');
                    continue;
                }
                result = await _geminiFlashGenerator(prompt, options);

            } else {
                const providerFn = PROVIDER_REGISTRY[providerKey];
                if (!providerFn) {
                    errors.push(`${providerKey}: provider không tồn tại`);
                    continue;
                }
                result = await providerFn(prompt, options);
            }

            clearProviderBlock(providerKey);
            console.log(chalk.dim(`[ROUTER] ✅ Role [${normalizedRole}] hoàn tất qua [${providerKey.toUpperCase()}]`));
            return result;

        } catch (err) {
            const errMsg = err.message || String(err);
            const isRateLimit = /429|rate.?limit|quota|too.?many/i.test(errMsg)
                || err.response?.status === 429
                || err.response?.status === 503;

            if (isRateLimit) {
                markProviderBlocked(providerKey, 'rate_limit');
            } else {
                console.log(chalk.yellow(`[ROUTER] ⚠️ [${providerKey}] lỗi không phải rate limit: ${errMsg}`));
            }

            errors.push(`${providerKey}: ${errMsg.slice(0, 80)}`);
            console.log(chalk.yellow(`[ROUTER] ↪ Fallback sang provider tiếp theo...`));
        }
    }

    // Toàn bộ chain thất bại
    const errorSummary = errors.join(' | ');
    console.log(chalk.bgRed.white(`[ROUTER] ❌ Role [${normalizedRole}] — toàn bộ chain thất bại: ${errorSummary}`));
        const alertMsg = buildSystemAlertMessage(
            'AI Router',
            `Toàn bộ chain cho Role [${normalizedRole}] thất bại`,
            `Chi tiết lỗi: ${errorSummary}`
        );
        sendTelegramMessage(alertMsg).catch(() => {});
    throw new Error(`[ROUTER] Toàn bộ providers cho role "${role}" đều thất bại. Chi tiết: ${errorSummary}`);
}
 
export async function generateWithRoleStream(role, prompt, onChunk, options = {}) {
    const chain = ROLE_PROVIDER_CHAINS[role] || ROLE_PROVIDER_CHAINS.default;
    const normalizedRole = role.toUpperCase();

    const errors = [];

    for (const providerKey of chain) {
        if (isProviderBlocked(providerKey)) {
            errors.push(`${providerKey}: đang bị cooldown`);
            continue;
        }

        try {
            let fullText = '';

            if (providerKey === 'gemini_pro' || providerKey === 'gemini_flash') {
                // Gemini hỗ trợ streaming thực
                const useProModel = providerKey === 'gemini_pro';
                const streamFn = useProModel ? _geminiProGenerator : _geminiFlashGenerator;
                if (!streamFn) {
                    console.log(chalk.yellow(`[ROUTER STREAM] ⚠️ ${providerKey} chưa được inject, bỏ qua`));
                    errors.push(`${providerKey}: chưa inject generator`);
                    continue;
                }
                fullText = await streamFn(prompt, { ...options, streamCallback: onChunk, useProModel });

            } else {
                const providerFn = PROVIDER_REGISTRY[providerKey];
                if (!providerFn) {
                    errors.push(`${providerKey}: provider không tồn tại`);
                    continue;
                }
                fullText = await providerFn(prompt, options);
                const chunkSize = 50;
                for (let i = 0; i < fullText.length; i += chunkSize) {
                    if (typeof onChunk === 'function') {
                        onChunk(fullText.slice(i, i + chunkSize));
                    }
                    await new Promise(r => setTimeout(r, 5));
                }
            }

            clearProviderBlock(providerKey);
            console.log(chalk.dim(`[ROUTER STREAM] ✅ Role [${normalizedRole}] hoàn tất qua [${providerKey.toUpperCase()}]`));
            return fullText;

        } catch (err) {
            const errMsg = err.message || String(err);
            const isRateLimit = /429|rate.?limit|quota|too.?many/i.test(errMsg)
                || err.response?.status === 429
                || err.response?.status === 503;

            if (isRateLimit) {
                markProviderBlocked(providerKey, 'rate_limit');
            } else {
                console.log(chalk.yellow(`[ROUTER STREAM] ⚠️ [${providerKey}] lỗi: ${errMsg}`));
            }

            errors.push(`${providerKey}: ${errMsg.slice(0, 80)}`);
            console.log(chalk.yellow(`[ROUTER STREAM] ↪ Fallback sang provider tiếp theo...`));
        }
    }

    const errorSummary = errors.join(' | ');
        const alertMsg = buildSystemAlertMessage(
            'AI Router',
            `Toàn bộ chain STREAM cho Role [${normalizedRole}] thất bại`,
            `Chi tiết lỗi: ${errorSummary}`
        );
        sendTelegramMessage(alertMsg).catch(() => {});
    throw new Error(`[ROUTER STREAM] Toàn bộ providers cho role "${role}" đều thất bại. ${errorSummary}`);
}

/**
 * debug endpoint: getRateLimitStatus() — xem trạng thái block hiện tại của các providers
 */
export function getRateLimitStatus() {
    const status = {};
    const now = Date.now();

    for (const [key, state] of rateLimitTracker.entries()) {
        status[key] = {
            blocked: state.blockedUntil > now,
            remainingMs: Math.max(0, state.blockedUntil - now),
            failCount: state.failCount,
            reason: state.reason,
        };
    }

     const allProviders = ['groq', 'cerebras', 'sambanova', 'openrouter', 'deepinfra', 'gemini_pro', 'gemini_flash'];
    for (const p of allProviders) {
        if (!status[p]) {
            status[p] = { blocked: false, remainingMs: 0, failCount: 0 };
        }
    }

    return status;
}

/**
 * resetProviderBlock(providerKey) — manual reset (dùng cho admin endpoint)
 */
export function resetProviderBlock(providerKey) {
    rateLimitTracker.delete(providerKey);
    console.log(chalk.green(`[ROUTER] 🔓 Đã reset block cho provider: ${providerKey}`));
}