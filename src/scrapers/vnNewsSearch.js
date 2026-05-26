import axios from 'axios';
import * as cheerio from 'cheerio';

//─── Query builders theo mode ─────────────────────────────────────────────────
const RISK_KEYWORDS = 'bán tháo OR "margin call" OR "ngoại bán ròng" OR "bán ròng" OR nợ xấu OR "vi phạm" OR "kiểm toán" OR "siết tín dụng" OR "thanh khoản kém" OR thua lỗ OR "cắt lỗ" OR "bị xử phạt" OR điều tra OR "đình chỉ"';

const RUMOR_SITES   = 'site:cafef.vn OR site:vietstock.vn OR site:tinnhanhchungkhoan.vn OR site:reddit.com OR site:webtretho.com';

const buildQueries = (ticker, mode) => {
    const t = encodeURIComponent(ticker);
    const base = ticker;

    switch (mode) {
        case 'official':
            return [
                `https://news.google.com/rss/search?q=${t}+chứng+khoán+site:cafef.vn+OR+site:vietstock.vn+OR+site:baodautu.vn+OR+site:vneconomy.vn&hl=vi&gl=VN&ceid=VN:vi`,
                `https://news.google.com/rss/search?q=${t}+cổ+phiếu+site:tinnhanhchungkhoan.vn+OR+site:ndh.vn+OR+site:dantri.com.vn&hl=vi&gl=VN&ceid=VN:vi`,
            ];

        case 'negative':
            return [
                //Risky and negative news
                `https://news.google.com/rss/search?q=${t}+bán+tháo+OR+ngoại+bán+ròng+OR+nợ+xấu+OR+điều+tra+OR+vi+phạm&hl=vi&gl=VN&ceid=VN:vi`,
                `https://news.google.com/rss/search?q=${t}+margin+call+OR+cắt+lỗ+OR+thanh+khoản+kém+OR+thua+lỗ+OR+bị+xử+phạt&hl=vi&gl=VN&ceid=VN:vi`,
                `https://news.google.com/rss/search?q=${t}+siết+tín+dụng+OR+kiểm+toán+OR+đình+chỉ+OR+rủi+ro&hl=vi&gl=VN&ceid=VN:vi`,
            ];

        case 'rumor':
            return [
                //Forums, social networks, rumors
                `https://news.google.com/rss/search?q=${t}+chứng+khoán+site:cafef.vn+OR+site:webtretho.com+OR+site:reddit.com&hl=vi&gl=VN&ceid=VN:vi`,
                `https://news.google.com/rss/search?q=${t}+tin+đồn+OR+nội+bộ+OR+dòng+tiền+lớn+OR+tay+to+gom+hàng&hl=vi&gl=VN&ceid=VN:vi`,
                `https://news.google.com/rss/search?q=${t}+chứng+khoán+OR+cổ+phiếu+site:vietstock.vn&hl=vi&gl=VN&ceid=VN:vi`,
            ];

        case 'balanced':
        default:
            return [
                //Orthodoxy
                `https://news.google.com/rss/search?q=${t}+chứng+khoán+site:cafef.vn+OR+site:vietstock.vn+OR+site:baodautu.vn&hl=vi&gl=VN&ceid=VN:vi`,
                //Negative /risk
                `https://news.google.com/rss/search?q=${t}+bán+tháo+OR+rủi+ro+OR+ngoại+bán+ròng+OR+điều+tra+OR+vi+phạm&hl=vi&gl=VN&ceid=VN:vi`,
                //Broad summary
                `https://news.google.com/rss/search?q=${t}+cổ+phiếu&hl=vi&gl=VN&ceid=VN:vi`,
            ];
    }
};

//─── Sentiment ────────────────────────────────────────────────────────────────
const NEGATIVE_PHRASES = [
    'bán tháo', 'margin call', 'ngoại bán ròng', 'bán ròng', 'nợ xấu',
    'vi phạm', 'kiểm toán', 'siết tín dụng', 'thanh khoản kém',
    'thua lỗ', 'cắt lỗ', 'bị xử phạt', 'điều tra', 'đình chỉ',
    'gây áp lực', 'rút ròng', 'hút ròng mạnh', 'căng thẳng', 'phá giá',
    'tiêu cực', 'bắt bớ', 'thủng hỗ trợ', 'rủi ro cao', 'cảnh báo'
];
const POSITIVE_PHRASES = [
    'bơm ròng', 'phục hồi mạnh', 'bình ổn', 'vượt đỉnh', 'kỷ lục',
    'tích cực', 'nới lỏng tiền tệ', 'phát triển', 'tăng trưởng', 'khởi sắc',
    'đột phá', 'ngoại mua ròng', 'mua ròng', 'hồi phục', 'lợi nhuận tăng'
];

export const detectSentiment = (title) => {
    const text = title.toLowerCase();
    if (NEGATIVE_PHRASES.some(p => text.includes(p))) return 'negative';
    if (POSITIVE_PHRASES.some(p => text.includes(p))) return 'positive';
    return 'neutral';
};

//─── Fetch RSS a URL, returns array of articles ─────────────────────────────────
const fetchRSS = async (url, maxItems = 15) => {
    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });
        const $ = cheerio.load(data, { xmlMode: true });
        const results = [];
        $('item').each((i, el) => {
            if (i >= maxItems) return false;
            const title = $(el).find('title').text().replace(/ - .*$/, '').trim();
            const link  = $(el).find('link').text().trim();
            const pub   = $(el).find('pubDate').text();
            const src   = $(el).find('source').text() || extractDomain(link);
            if (title && title.length > 15 && link) {
                results.push({ title, link, source: src, sentiment: detectSentiment(title), publishedAt: pub });
            }
        });
        return results;
    } catch {
        return [];
    }
};

const extractDomain = (url) => {
    try { return new URL(url).hostname.replace('www.', ''); } catch { return 'Internet'; }
};

const dedupByLink = (articles) => {
    const seen = new Set();
    return articles.filter(a => {
        if (seen.has(a.link)) return false;
        seen.add(a.link);
        return true;
    });
};

//─── Balance sentiment  ────────────────────────
const balanceSentiment = (articles, mode) => {
    if (mode === 'negative') return articles; 
    if (mode === 'official') return articles;

    const negatives = articles.filter(a => a.sentiment === 'negative');
    const positives = articles.filter(a => a.sentiment === 'positive');
    const neutrals  = articles.filter(a => a.sentiment === 'neutral');

    const minNeg = Math.max(3, Math.floor(articles.length * 0.30));
    if (negatives.length >= minNeg) return articles;

    return [...negatives, ...neutrals, ...positives];
};

//─── Export  ─────────────────────────────────────────────────────────────
/**
 *@param {string} ticker 
 *@param {string} mode   
 *@param {number} limit  
 */
export async function searchVnNewsDirectly(ticker, mode = 'balanced', limit = 30) {
    const cleanTicker = ticker.toUpperCase();
    const urls = buildQueries(cleanTicker, mode);

    const allResults = await Promise.all(urls.map(url => fetchRSS(url, 20)));
    const merged  = dedupByLink(allResults.flat());
    const balanced = balanceSentiment(merged, mode);

    return balanced.slice(0, limit);
}
