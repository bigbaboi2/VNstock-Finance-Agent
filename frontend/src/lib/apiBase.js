export const API_BASE_URL = import.meta.env.DEV
    ? ''
    : (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/+$/, '').replace(/\/api$/i, '');

/** Bypass ngrok free interstitial so browser CORS sees real API headers. */
export const API_FETCH_HEADERS = { 'ngrok-skip-browser-warning': 'true' };

/** Proxy backend — same-origin, tránh CORS khi embed PDF TCBS. */
export const tcbsPdfViewerUrl = (symbol) =>
    `${API_BASE_URL}/api/tcbs-pdf/${String(symbol || '').toUpperCase()}?ngrok-skip-browser-warning=true`;

/**
 * URL embed PDF trong iframe.
 * Ưu tiên proxy `/api/tcbs-pdf/:ticker` (same-origin) — không dùng mozilla PDF.js
 * vì TCBS chặn CORS từ origin khác.
 */
export const tcbsPdfEmbedUrl = (reportPdf, symbolHint) => {
    if (!reportPdf && !symbolHint) return '';

    let ticker = String(symbolHint || '').trim().toUpperCase();
    if (!ticker && reportPdf) {
        const match = String(reportPdf).match(/\/([A-Za-z0-9]+)\.pdf(?:$|[?#])/i);
        ticker = match?.[1]?.toUpperCase() || '';
    }

    if (ticker) {
        return `${tcbsPdfViewerUrl(ticker)}#toolbar=0&navpanes=0&view=FitH`;
    }

    // Fallback: embed trực tiếp URL TCBS (Chrome PDF viewer)
    const base = String(reportPdf).split('#')[0];
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}ngrok-skip-browser-warning=true#toolbar=0&navpanes=0&view=FitH`;
};
