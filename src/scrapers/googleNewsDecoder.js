/**
 * @param {string} url  
 * @returns {string|null}  
 */
export const decodeGoogleNewsUrl = (url) => {
    if (!url) return null;
    try {
        const match = url.match(/(?:articles|read)\/([a-zA-Z0-9\-_]+)/);
        if (!match) return null;
        const base64Str = match[1].replace(/-/g, '+').replace(/_/g, '/');
        const decoded   = Buffer.from(base64Str, 'base64').toString('utf-8');
        const urlMatch  = decoded.match(/https?:\/\/[^\x00-\x1F\s"']+/i);
        return urlMatch ? urlMatch[0] : null;
    } catch {
        return null;
    }
};