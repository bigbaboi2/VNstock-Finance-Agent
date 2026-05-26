import axios from 'axios';
import * as cheerio from 'cheerio';

export async function searchVnNewsDirectly(ticker) {
    const cleanTicker = ticker.toUpperCase();
    
    const url = `https://news.google.com/rss/search?q=${cleanTicker}+chứng+khoán&hl=vi&gl=VN&ceid=VN:vi`;

    try {
        const { data } = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000 
        });
        
        const $ = cheerio.load(data, { xmlMode: true });
        const results = [];

        $('item').each((i, el) => {
            if (i < 25) {
                results.push({
                    title: $(el).find('title').text(),
                    link: $(el).find('link').text()
                });
            }
        });

        return results;
    } catch (error) {
        console.error(`[LỖI] Google News RSS cho mã ${ticker}:`, error.message);
        return [];
    }
}