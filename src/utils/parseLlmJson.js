/**
 * Parse JSON từ output LLM — chịu markdown fence và text thừa sau object.
 */

export function stripMarkdownJsonFences(text) {
    return String(text ?? '')
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();
}

/** Cắt object JSON đầu tiên (balanced braces, tôn trọng string). */
export function extractFirstJsonObject(text) {
    const s = stripMarkdownJsonFences(text);
    const start = s.indexOf('{');
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < s.length; i++) {
        const ch = s[i];
        if (inString) {
            if (escape) {
                escape = false;
            } else if (ch === '\\') {
                escape = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === '{') depth++;
        if (ch === '}') {
            depth--;
            if (depth === 0) return s.slice(start, i + 1);
        }
    }
    return null;
}

/**
 * @param {unknown} text - Raw LLM output
 * @param {object|null} fallback - Giá trị trả về khi parse thất bại
 * @returns {object|null}
 */
export function parseLlmJson(text, fallback = null) {
    const raw = stripMarkdownJsonFences(
        typeof text === 'string' ? text : String(text ?? '')
    );
    if (!raw) return fallback;

    try {
        return JSON.parse(raw);
    } catch {
        // Có prose / JSON thừa sau object — cắt object đầu tiên
    }

    const chunk = extractFirstJsonObject(raw);
    if (!chunk) return fallback;

    try {
        return JSON.parse(chunk);
    } catch {
        return fallback;
    }
}

/**
 * Regex fallback: trích xuất action panel data từ PM decision text.
 * Dùng khi AI JSON extraction thất bại hoàn toàn.
 * @param {string} pmText - Văn bản phán quyết PM dạng markdown
 * @returns {object|null} - Action panel data hoặc null nếu không tìm được gì
 */
export function extractActionFromPmText(pmText) {
    if (!pmText || typeof pmText !== 'string') return null;

    const text = pmText.replace(/\*\*/g, '').replace(/\*/g, '');

    // Helper: tìm giá trị sau label
    const grab = (patterns) => {
        for (const p of patterns) {
            const m = text.match(p);
            if (m && m[1]?.trim()) return m[1].trim();
        }
        return null;
    };

    const action = grab([
        /RATING\s*[:：]\s*(.+?)(?:\n|$)/i,
        /Khuyến\s*nghị\s*[:：]\s*(.+?)(?:\n|$)/i,
        /Quyết\s*định\s*[:：]\s*(.+?)(?:\n|$)/i,
    ]);

    const entry = grab([
        /(?:Vùng\s*mua|Entry)\s*(?:lý\s*tưởng)?\s*[:：]\s*(.+?)(?:\n|$)/i,
        /(?:Giá\s*vào|Mua\s*tại|Giá\s*entry)\s*[:：]\s*(.+?)(?:\n|$)/i,
    ]);

    const stoploss = grab([
        /(?:Cắt\s*lỗ|Stoploss|Stop\s*loss|SL)\s*[:：]\s*(.+?)(?:\n|$)/i,
    ]);

    const target1 = grab([
        /(?:Mục\s*tiêu\s*1|Target\s*1|TP\s*1|Chốt\s*lời\s*1|Mục\s*tiêu\s*ngắn\s*hạn)\s*[:：]\s*(.+?)(?:\n|$)/i,
        /(?:Target\s*ngắn\s*hạn)\s*[:：]?\s*(.+?)(?:\n|$)/i,
    ]);

    const target2 = grab([
        /(?:Mục\s*tiêu\s*2|Target\s*2|TP\s*2|Chốt\s*lời\s*2|Mục\s*tiêu\s*dài\s*hạn)\s*[:：]\s*(.+?)(?:\n|$)/i,
    ]);

    const conviction = grab([
        /Conviction\s*[:：]\s*(.+?)(?:\n|$)/i,
        /Mức\s*độ\s*tự\s*tin\s*[:：]\s*(.+?)(?:\n|$)/i,
        /Độ\s*tin\s*cậy\s*[:：]\s*(.+?)(?:\n|$)/i,
    ]);

    const horizon = grab([
        /(?:Thời\s*gian\s*nắm\s*giữ|Horizon|Thời\s*hạn)\s*[:：]\s*(.+?)(?:\n|$)/i,
    ]);

    const reason = grab([
        /(?:Lý\s*do\s*(?:quyết\s*định)?|Reason)\s*[:：]\s*(.+?)(?:\n|$)/i,
    ]);

    // Chỉ trả về nếu tìm được ít nhất action
    if (!action) return null;

    return {
        action: action.replace(/[[\]]/g, '').trim(),
        entry: entry || '---',
        stoploss: stoploss || '---',
        target1: target1 || '---',
        target2: target2 || 'N/A',
        conviction: conviction || 'Trung bình',
        horizon: horizon || 'Ngắn hạn',
        reason: reason || 'Trích xuất từ phán quyết PM.',
    };
}
