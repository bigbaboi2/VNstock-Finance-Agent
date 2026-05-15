import axios from 'axios';
import * as cheerio from 'cheerio';

export async function searchVnNewsDirectly(ticker) {
    const cleanTicker = ticker.toUpperCase();
    
    // Sử dụng Google News RSS - Nhanh, chuẩn, bất tử
    const url = `https://news.google.com/rss/search?q=${cleanTicker}+chứng+khoán&hl=vi&gl=VN&ceid=VN:vi`;

    try {
        const { data } = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000 
        });
        
        // Cần parse dưới dạng XML
        const $ = cheerio.load(data, { xmlMode: true });
        const results = [];

        // Tìm các thẻ <item> chứa tin tức
        $('item').each((i, el) => {
            if (i < 20) { // Lấy 6 tin mới nhất
                results.push({
                    title: $(el).find('title').text(),
                    link: $(el).find('link').text()
                });
            }
        });

        return results;
    } catch (error) {
        console.error(`❌ Lỗi Google News RSS cho mã ${ticker}:`, error.message);
        return [];
    }
}