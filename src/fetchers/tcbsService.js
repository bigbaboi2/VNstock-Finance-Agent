import axios from 'axios';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://s.cafef.vn/'
};

export const fetchTcbsData = async (symbol) => {
    const ticker = symbol.toUpperCase();
    let logs = [];
    
    try {
         const [incomeRes, balanceRes] = await Promise.all([
            axios.get(`https://cafef.vn/du-lieu/Ajax/PageNew/DataChiTieuByTime.ashx?symbol=${ticker}&type=1`, { headers: HEADERS })
                 .catch(e => { logs.push(`[LỖI] KQKD: ${e.message}`); return null; }),
                 
            axios.get(`https://cafef.vn/du-lieu/Ajax/PageNew/DataChiTieuByTime.ashx?symbol=${ticker}&type=2`, { headers: HEADERS })
                 .catch(e => { logs.push(`[LỖI] CĐKT: ${e.message}`); return null; })
        ]);

         const pdfUrl = `https://static.tcbs.com.vn/oneclick/${ticker}.pdf`;
        let validPdfUrl = null;
        try {
             const pdfCheck = await axios.head(pdfUrl);
            if (pdfCheck.status === 200) {
                validPdfUrl = pdfUrl;
                logs.push(`[THÀNH CÔNG] TCBS OneClick: Đã định vị được nguồn PDF.`);
            }
        } catch (err) {
            logs.push(`[CẢNH BÁO] TCBS OneClick: Mã này chưa có Báo cáo PDF.`);
        }

         const rawData = {
            incomeStatement: incomeRes?.data || null,
            balanceSheet: balanceRes?.data || null,
            reportPdf: validPdfUrl 
        };

        if (incomeRes?.data || balanceRes?.data) {
            logs.push(`[THÀNH CÔNG] BCTC: Đã lấy hết thông tin BCTC các Quý từ hệ thống ngầm CafeF.`);
        }

         return { success: true, rawData, validPdfUrl, logs };

    } catch (error) {
        return { success: false, logs: [`[LỖI hệ thống] BCTC Service: ${error.message}`] };
    }
};