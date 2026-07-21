export const API_BASE_URL = import.meta.env.DEV
    ? ''
    : (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

/** Bypass ngrok free interstitial so browser CORS sees real API headers. */
export const API_FETCH_HEADERS = { 'ngrok-skip-browser-warning': 'true' };

/** Embed PDF TCBS trực tiếp trong iframe (cách cũ, không qua Google Viewer / proxy). */
export const tcbsPdfEmbedUrl = (reportPdf) => {
    if (!reportPdf) return '';
    const base = String(reportPdf).split('#')[0];
    return `${base}#toolbar=0&navpanes=0`;
};

/** Proxy backend — dự phòng khi cần same-origin; ưu tiên tcbsPdfEmbedUrl cho UI. */
export const tcbsPdfViewerUrl = (symbol) =>
    `${API_BASE_URL}/api/tcbs-pdf/${String(symbol || '').toUpperCase()}`;
