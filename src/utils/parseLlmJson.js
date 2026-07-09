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
