import axios from 'axios';

export const TCBS_HTTP_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/pdf,application/json,text/plain,*/*',
    'Referer': 'https://s.cafef.vn/'
};

const HEADERS = TCBS_HTTP_HEADERS;

export const getTcbsPdfUrl = (symbol) =>
    `https://static.tcbs.com.vn/oneclick/${String(symbol).toUpperCase()}.pdf`;

/** HEAD PDF TCBS — dùng etag/last-modified để phát hiện file mới. */
export const fetchTcbsPdfMeta = async (symbol) => {
    const ticker = String(symbol).toUpperCase();
    const pdfUrl = getTcbsPdfUrl(ticker);
    try {
        const res = await axios.head(pdfUrl, { headers: HEADERS, timeout: 10000, validateStatus: s => s < 500 });
        if (res.status !== 200) {
            return { url: pdfUrl, exists: false, revision: null, lastModified: null };
        }
        const etag = res.headers.etag || null;
        const lastModified = res.headers['last-modified'] || null;
        const contentLength = res.headers['content-length'] || null;
        return {
            url: pdfUrl,
            exists: true,
            etag,
            lastModified,
            contentLength,
            revision: etag || lastModified || contentLength || null,
        };
    } catch {
        return { url: pdfUrl, exists: false, revision: null, lastModified: null };
    }
};

export const fetchTcbsData = async (symbol) => {
    const ticker = symbol.toUpperCase();
    let logs = [];
    
    try {
         const [incomeRes, balanceRes, pdfMeta] = await Promise.all([
            axios.get(`https://cafef.vn/du-lieu/Ajax/PageNew/DataChiTieuByTime.ashx?symbol=${ticker}&type=1`, { headers: HEADERS })
                 .catch(e => { logs.push(`[LỖI] KQKD: ${e.message}`); return null; }),
                 
            axios.get(`https://cafef.vn/du-lieu/Ajax/PageNew/DataChiTieuByTime.ashx?symbol=${ticker}&type=2`, { headers: HEADERS })
                 .catch(e => { logs.push(`[LỖI] CĐKT: ${e.message}`); return null; }),

            fetchTcbsPdfMeta(ticker),
        ]);

        const validPdfUrl = pdfMeta.exists ? pdfMeta.url : null;
        if (validPdfUrl) {
            const modNote = pdfMeta.lastModified ? ` (cập nhật ${pdfMeta.lastModified})` : '';
            logs.push(`[THÀNH CÔNG] TCBS OneClick: Đã định vị PDF${modNote}.`);
        } else {
            logs.push(`[CẢNH BÁO] TCBS OneClick: Mã này chưa có Báo cáo PDF.`);
        }

         const rawData = {
            incomeStatement: incomeRes?.data || null,
            balanceSheet: balanceRes?.data || null,
            reportPdf: validPdfUrl,
            pdfRevision: pdfMeta.revision,
            pdfLastModified: pdfMeta.lastModified,
        };

        if (incomeRes?.data || balanceRes?.data) {
            logs.push(`[THÀNH CÔNG] BCTC: Đã lấy hết thông tin BCTC các Quý từ hệ thống ngầm CafeF.`);
        }

         return { success: true, rawData, validPdfUrl, pdfMeta, logs };

    } catch (error) {
        return { success: false, logs: [`[LỖI hệ thống] BCTC Service: ${error.message}`] };
    }
};