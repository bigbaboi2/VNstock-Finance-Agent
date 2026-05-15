import fs from 'fs/promises';
import path from 'path';

export async function exportToLog(ticker, data) {
    // Tạo thư mục logs nếu chưa có
    const LOG_DIR = path.resolve(process.cwd(), 'logs');
    
    const dateString = new Date().toISOString().slice(0,10).replace(/-/g, '');
    const fileName = `${ticker.toUpperCase()}_${dateString}.log`;
    const filePath = path.resolve(LOG_DIR, fileName);

    try {
        await fs.mkdir(LOG_DIR, { recursive: true });

        const timestamp = new Date().toLocaleString('vi-VN');
        let logContent = `==================================================\n`;
        logContent += `    BÁO CÁO DỮ LIỆU THÔ - MÃ CỔ PHIẾU: ${ticker.toUpperCase()}\n`;
        logContent += `    Thời gian xuất: ${timestamp}\n`;
        logContent += `==================================================\n\n`;

        // Ghi Hồ sơ
        if (data.companyProfile) {
            logContent += `[1] HỒ SƠ DOANH NGHIỆP:\n`;
            logContent += `- Tên công ty: ${data.companyProfile.fullName}\n`;
            logContent += `- Ngành nghề: ${data.companyProfile.industry}\n`;
            logContent += `- Tổng quan: ${data.companyProfile.overview}\n\n`;
        }

        // Ghi Giá
        if (data.stockInfo) {
            logContent += `[2] CHỈ SỐ TÀI CHÍNH:\n`;
            logContent += `- Giá hiện tại: ${data.stockInfo.currentPrice} VNĐ\n`;
            logContent += `- P/E: ${data.stockInfo.peRatio}\n\n`;
        }

        // Ghi Tin tức
        if (data.deepNewsData && data.deepNewsData.length > 0) {
            logContent += `[3] KHO TIN TỨC THÔ (${data.deepNewsData.length} BÀI):\n`;
            data.deepNewsData.forEach((news, i) => {
                logContent += `\n--------------------------------------------------\n`;
                logContent += `▶ BÀI [${i + 1}]: ${news.title}\n`;
                logContent += `🔗 Nguồn: ${news.source}\n`;
                logContent += `--------------------------------------------------\n`;
                logContent += `📝 Nội dung đã trích xuất:\n\n${news.content}\n`;
            });
        }

        // Ghi đè hoặc tạo mới file log
        await fs.writeFile(filePath, logContent, 'utf-8');
        return filePath;

    } catch (error) {
        console.error(`❌ Lỗi xuất file log: ${error.message}`);
        return null;
    }
}