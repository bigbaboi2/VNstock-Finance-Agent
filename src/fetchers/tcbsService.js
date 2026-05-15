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
        // Vẫn giữ ống hút BCTC từ CafeF
        const [incomeRes, balanceRes] = await Promise.all([
            axios.get(`https://cafef.vn/du-lieu/Ajax/PageNew/DataChiTieuByTime.ashx?symbol=${ticker}&type=1`, { headers: HEADERS })
                 .catch(e => { logs.push(`❌ Lỗi KQKD: ${e.message}`); return null; }),
                 
            axios.get(`https://cafef.vn/du-lieu/Ajax/PageNew/DataChiTieuByTime.ashx?symbol=${ticker}&type=2`, { headers: HEADERS })
                 .catch(e => { logs.push(`❌ Lỗi CĐKT: ${e.message}`); return null; })
        ]);

        // 🎯 TÍNH NĂNG MỚI: RADAR DÒ PDF ONECLICK CỦA TCBS
        const pdfUrl = `https://static.tcbs.com.vn/oneclick/${ticker}.pdf`;
        let validPdfUrl = null;
        try {
            // Dùng axios.head để ping nhẹ xem file có tồn tại không (không tải nội dung)
            const pdfCheck = await axios.head(pdfUrl);
            if (pdfCheck.status === 200) {
                validPdfUrl = pdfUrl;
                logs.push(`✅ TCBS OneClick: Đã định vị được kho báu PDF.`);
            }
        } catch (err) {
            logs.push(`⚠️ TCBS OneClick: Mã này chưa có Báo cáo PDF.`);
        }

        // Đóng gói data thô
        const rawData = {
            incomeStatement: incomeRes?.data || null,
            balanceSheet: balanceRes?.data || null,
            reportPdf: validPdfUrl // Lưu link vào DB để dự phòng
        };

        if (incomeRes?.data || balanceRes?.data) {
            logs.push(`✅ BCTC: Đã hút sạch BCTC các Quý từ hệ thống ngầm CafeF.`);
        }

        // Trả thêm validPdfUrl ra ngoài cho server.js
        return { success: true, rawData, validPdfUrl, logs };

    } catch (error) {
        return { success: false, logs: [`❌ BCTC Service Lỗi: ${error.message}`] };
    }
};