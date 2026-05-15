import fs from 'fs/promises';
import path from 'path';

// Đường dẫn lưu file kho (Lưu trong thư mục data của project)
const CACHE_DIR = path.resolve(process.cwd(), 'data');
const CACHE_FILE = path.resolve(CACHE_DIR, 'market_cache.json');

// Thời gian sống của dữ liệu (Time-to-Live): 4 tiếng (Tính bằng mili-giây)
const CACHE_TTL = 4 * 60 * 60 * 1000; 

export async function getCachedData(ticker) {
    try {
        const fileContent = await fs.readFile(CACHE_FILE, 'utf-8');
        const cache = JSON.parse(fileContent);
        const record = cache[ticker.toUpperCase()];

        if (record) {
            const dataAge = Date.now() - record.timestamp;
            // Nếu dữ liệu còn "tươi" (chưa quá 4 tiếng)
            if (dataAge < CACHE_TTL) {
                return record.data;
            }
        }
        return null; // Dữ liệu đã cũ hoặc chưa từng tìm
    } catch (error) {
        return null; // File chưa tồn tại (Chạy lần đầu)
    }
}

export async function saveToCache(ticker, data) {
    try {
        // 1. Đảm bảo thư mục data đã tồn tại, nếu chưa thì tạo mới
        await fs.mkdir(CACHE_DIR, { recursive: true });

        // 2. Đọc kho cũ (nếu có)
        let cache = {};
        try {
            const fileContent = await fs.readFile(CACHE_FILE, 'utf-8');
            cache = JSON.parse(fileContent);
        } catch (e) {
            // Không sao, kho sẽ được tạo mới
        }

        // 3. Cập nhật dữ liệu mới cho mã này
        cache[ticker.toUpperCase()] = {
            timestamp: Date.now(),
            data: data
        };

        // 4. Ghi đè lại vào file
        await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
    } catch (error) {
        console.error("❌ Lỗi khi lưu vào kho:", error.message);
    }
}