import axios from 'axios';
import * as cheerio from 'cheerio';

const buildQueries = (ticker, mode) => {
    const t = encodeURIComponent(ticker);

    switch (mode) {
        case 'official':
            return [
                `https://news.google.com/rss/search?q=${t}+chứng+khoán+site:cafef.vn+OR+site:vietstock.vn+OR+site:baodautu.vn+OR+site:vneconomy.vn&hl=vi&gl=VN&ceid=VN:vi`,
                `https://news.google.com/rss/search?q=${t}+cổ+phiếu+site:tinnhanhchungkhoan.vn+OR+site:ndh.vn+OR+site:dantri.com.vn&hl=vi&gl=VN&ceid=VN:vi`,
            ];

        case 'negative':
            return [
                `https://news.google.com/rss/search?q=${t}+bán+tháo+OR+ngoại+bán+ròng+OR+nợ+xấu+OR+điều+tra+OR+vi+phạm&hl=vi&gl=VN&ceid=VN:vi`,
                `https://news.google.com/rss/search?q=${t}+margin+call+OR+cắt+lỗ+OR+thanh+khoản+kém+OR+thua+lỗ+OR+bị+xử+phạt&hl=vi&gl=VN&ceid=VN:vi`,
                `https://news.google.com/rss/search?q=${t}+siết+tín+dụng+OR+kiểm+toán+OR+đình+chỉ+OR+rủi+ro&hl=vi&gl=VN&ceid=VN:vi`,
            ];

        case 'rumor':
            return [
                `https://news.google.com/rss/search?q=${t}+chứng+khoán+site:cafef.vn+OR+site:webtretho.com+OR+site:reddit.com&hl=vi&gl=VN&ceid=VN:vi`,
                `https://news.google.com/rss/search?q=${t}+tin+đồn+OR+nội+bộ+OR+dòng+tiền+lớn+OR+tay+to+gom+hàng&hl=vi&gl=VN&ceid=VN:vi`,
                `https://news.google.com/rss/search?q=${t}+chứng+khoán+OR+cổ+phiếu+site:vietstock.vn&hl=vi&gl=VN&ceid=VN:vi`,
            ];

        case 'balanced':
        default:
            return [
                `https://news.google.com/rss/search?q=${t}+site:cafef.vn+OR+site:vietstock.vn+OR+site:baodautu.vn&hl=vi&gl=VN&ceid=VN:vi`,
                `https://news.google.com/rss/search?q=${t}+tăng+trưởng+OR+phục+hồi+OR+mua+ròng+OR+lợi+nhuận+OR+kỷ+lục&hl=vi&gl=VN&ceid=VN:vi`,
                `https://news.google.com/rss/search?q=${t}+rủi+ro+OR+giảm+OR+áp+lực+OR+bán+ròng+OR+nợ&hl=vi&gl=VN&ceid=VN:vi`,
                `https://news.google.com/rss/search?q=${t}+cổ+phiếu&hl=vi&gl=VN&ceid=VN:vi`,
            ];
    }
};

//─── Sentiment scoring — use points─────────────────────────
const NEGATIVE_PHRASES = [
    //Selling pressure
    { p: 'bán tháo',         w: 3 },
    { p: 'bán ròng',         w: 2 },
    { p: 'ngoại bán ròng',   w: 2 },
    { p: 'rút ròng',         w: 2 },
    { p: 'cắt lỗ',           w: 2 },
    { p: 'margin call',      w: 3 },
    //Bad business results
    { p: 'thua lỗ',          w: 3 },
    { p: 'lợi nhuận giảm',   w: 2 },
    { p: 'doanh thu giảm',   w: 2 },
    { p: 'nợ xấu',           w: 3 },
    { p: 'nợ tăng',          w: 2 },
    //Legal /management
    { p: 'vi phạm',          w: 3 },
    { p: 'bị xử phạt',       w: 3 },
    { p: 'điều tra',         w: 3 },
    { p: 'đình chỉ',         w: 3 },
    { p: 'kiểm toán',        w: 2 },
    //Bad market
    { p: 'chìm trong sắc đỏ',w: 2 },
    { p: 'sắc đỏ',           w: 1 },
    { p: 'lao dốc',          w: 2 },
    { p: 'thủng hỗ trợ',     w: 2 },
    { p: 'thanh khoản kém',  w: 2 },
    { p: 'siết tín dụng',    w: 2 },
    { p: 'căng thẳng',       w: 1 },
    { p: 'áp lực',           w: 1 },
    { p: 'rủi ro cao',       w: 2 },
    { p: 'cảnh báo',         w: 1 },
    { p: 'phá giá',          w: 2 },
    { p: 'tiêu cực',         w: 1 },
    { p: 'gây áp lực',       w: 1 },
];

const POSITIVE_PHRASES = [
//Positive cash flow
    { p: 'mua ròng',         w: 2 },
    { p: 'ngoại mua ròng',   w: 2 },
    { p: 'bơm ròng',         w: 2 },
//Good business results
    { p: 'lợi nhuận tăng',   w: 3 },
    { p: 'doanh thu tăng',   w: 2 },
    { p: 'tăng trưởng',      w: 2 },
    { p: 'kỷ lục',           w: 2 },
    { p: 'vượt đỉnh',        w: 2 },
    { p: 'đột phá',          w: 2 },
//Market recovery
    { p: 'phục hồi mạnh',    w: 2 },
    { p: 'hồi phục',         w: 1 },
    { p: 'khởi sắc',         w: 2 },
    { p: 'bứt phá',          w: 2 },
    { p: 'sắc xanh',         w: 1 },
    { p: 'tăng điểm',        w: 1 },
 //Support policy
    { p: 'nới lỏng',         w: 2 },
    { p: 'hỗ trợ',           w: 1 },
    { p: 'bình ổn',          w: 1 },
    { p: 'tích cực',         w: 1 },
    { p: 'phát triển',       w: 1 },
];

/**
 * weighted points system 
 * @param {string} title
 * @param {string} [content='']  — nội dung bổ sung (snippet, description)
 * @returns {'positive'|'negative'|'neutral'}
 */
export const detectSentiment = (title, content = '') => {
    const titleText   = title.toLowerCase();
    const contentText = content.toLowerCase();

    const hasNegPercent = /-\d+([.,]\d+)?%/.test(titleText);

    let negScore = NEGATIVE_PHRASES.reduce((acc, { p, w }) => {
        const inTitle   = titleText.includes(p)   ? w * 2 : 0;
        const inContent = contentText.includes(p) ? w     : 0;
        return acc + inTitle + inContent;
    }, hasNegPercent ? 2 : 0);

    let posScore = POSITIVE_PHRASES.reduce((acc, { p, w }) => {
        const inTitle   = titleText.includes(p)   ? w * 2 : 0;
        const inContent = contentText.includes(p) ? w     : 0;
        return acc + inTitle + inContent;
    }, 0);

    if (negScore >= 3 && negScore > posScore) return 'negative';
    if (posScore >= 3 && posScore > negScore) return 'positive';
    if (negScore >= 2 && negScore > posScore) return 'negative'; 
    if (posScore >= 2 && posScore > negScore) return 'positive';
    return 'neutral';
};

//─── Fetch RSS ─────────────────────────────────────────────────────────────────
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
            const title       = $(el).find('title').text().replace(/ - .*$/, '').trim();
            const link        = $(el).find('link').text().trim();
            const pub         = $(el).find('pubDate').text();
            const src         = $(el).find('source').text() || extractDomain(link);
            // Google News RSS thường có description/snippet — dùng làm content sơ bộ
            const description = $(el).find('description').text().trim();

            if (title && title.length > 15 && link) {
                results.push({
                    title,
                    link,
                    source:      src,
                    sentiment:   detectSentiment(title, description),
                    publishedAt: pub,
                });
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

//─── Re-score sau khi scrape nội dung đầy đủ ────────────────────────────────
export const rescoreSentiment = (newsItem) => {
    const refined = detectSentiment(newsItem.title, newsItem.content || '');
    return { ...newsItem, sentiment: refined };
};

//─── Phân phối sentiment đều ─────────────────────────────────
const distributeSentiment = (articles, mode) => {
    if (mode === 'negative') return articles;
    if (mode === 'official') return articles;

    const negatives = articles.filter(a => a.sentiment === 'negative');
    const positives = articles.filter(a => a.sentiment === 'positive');
    const neutrals  = articles.filter(a => a.sentiment === 'neutral');

    const result = [];
    const maxLen = Math.max(negatives.length, positives.length, neutrals.length);
    for (let i = 0; i < maxLen; i++) {
        if (i < negatives.length) result.push(negatives[i]);
        if (i < neutrals.length)  result.push(neutrals[i]);
        if (i < positives.length) result.push(positives[i]);
    }
    return result;
};

//─── Export  ─────────────────────────────────────────────────────────────────
export async function searchVnNewsDirectly(ticker, mode = 'balanced', limit = 30) {
    const cleanTicker = ticker.toUpperCase();
    const urls = buildQueries(cleanTicker, mode);

    const allResults = await Promise.all(urls.map(url => fetchRSS(url, 20)));
    const merged      = dedupByLink(allResults.flat());
    const distributed = distributeSentiment(merged, mode);

    return distributed.slice(0, limit);
}