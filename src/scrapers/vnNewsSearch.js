import axios from 'axios';
import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { getBrowser } from '../utils/browserManager.js';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const cacheMap = new Map();
const CACHE_TTL = 3 * 60 * 1000; 

const buildGoogleNewsQueries = (ticker, mode) => {
    const t = encodeURIComponent(ticker);
    const base = `hl=vi&gl=VN&ceid=VN:vi`;
    switch (mode) {
        case 'official': return [`https://news.google.com/rss/search?q=${t}+site:cafef.vn+OR+site:vietstock.vn+OR+site:baodautu.vn+OR+site:vneconomy.vn&${base}`, `https://news.google.com/rss/search?q=${t}+site:tinnhanhchungkhoan.vn+OR+site:dantri.com.vn&${base}`];
        case 'negative': return [`https://news.google.com/rss/search?q=${t}+bán+tháo+OR+ngoại+bán+ròng+OR+nợ+xấu+OR+điều+tra+OR+vi+phạm&${base}`, `https://news.google.com/rss/search?q=${t}+margin+call+OR+cắt+lỗ+OR+thua+lỗ+OR+bị+xử+phạt+OR+rủi+ro&${base}`];
        case 'rumor': return [`https://news.google.com/rss/search?q=${t}+tin+đồn+OR+nội+bộ+OR+dòng+tiền+lớn+OR+tay+to+OR+thâu+tóm&${base}`, `https://news.google.com/rss/search?q=${t}+cổ+phiếu+chứng+khoán&${base}`];
        case 'balanced':
        default: return [
            `https://news.google.com/rss/search?q=${t}+cổ+phiếu+OR+chứng+khoán+OR+thị+trường&${base}`, 
            `https://news.google.com/rss/search?q=${t}+tin+tức+OR+doanh+nghiệp+OR+đầu+tư&${base}`, 
            `https://news.google.com/rss/search?q=${t}&${base}` 
        ];
    }
};

const DIRECT_RSS_SOURCES = [
    { name: 'VietStock CK', url: 'https://vietstock.vn/rss/chung-khoan.rss', domain: 'vietstock.vn' },
    { name: 'CafeF CK', url: 'https://cafef.vn/thi-truong-chung-khoan.rss', domain: 'cafef.vn' },
    { name: 'VnEconomy CK', url: 'https://vneconomy.vn/chung-khoan.rss', domain: 'vneconomy.vn' },
    { name: 'BaoDauTu CK', url: 'https://baodautu.vn/chung-khoan.rss', domain: 'baodautu.vn' },
];

const SEARCH_SOURCES = [
    { name: 'CafeF', domain: 'cafef.vn', buildUrl: (t) => `https://cafef.vn/tim-kiem.chn?keywords=${encodeURIComponent(t)}`, itemSelector: '.knc-name a, .tlitem h3 a, .list-content .news-item a' },
    { name: 'VietStock', domain: 'vietstock.vn', buildUrl: (t) => `https://vietstock.vn/search/?q=${encodeURIComponent(t)}`, itemSelector: '.news-list .item a[href*="/"], .search-result a[href*="/"]' },
];

const NEG_MAP = new Map([['bán tháo',3],['bán ròng',2],['cắt lỗ',2],['margin call',3],['thua lỗ',3],['nợ xấu',3],['vi phạm',3],['bị xử phạt',3],['điều tra',3],['rủi ro cao',2]]);
const POS_MAP = new Map([['mua ròng',2],['lợi nhuận tăng',3],['doanh thu tăng',2],['tăng trưởng',2],['vượt đỉnh',2],['đột phá',2],['khởi sắc',2],['bứt phá',2]]);
const REGEX_NEG = new RegExp(Array.from(NEG_MAP.keys()).join('|'), 'gi');
const REGEX_POS = new RegExp(Array.from(POS_MAP.keys()).join('|'), 'gi');

const countScore = (text, regex, map, weight) => (text.match(regex) || []).reduce((sum, match) => sum + (map.get(match.toLowerCase()) || 0) * weight, 0);

export const detectSentiment = (title, content = '') => {
    const t = title.toLowerCase(), c = content.toLowerCase();
    let neg = (/-\d+([.,]\d+)?%/.test(t) ? 2 : 0) + countScore(t, REGEX_NEG, NEG_MAP, 2) + countScore(c, REGEX_NEG, NEG_MAP, 1);
    let pos = countScore(t, REGEX_POS, POS_MAP, 2) + countScore(c, REGEX_POS, POS_MAP, 1);
    if (neg >= 3 && neg > pos) return 'negative';
    if (pos >= 3 && pos > neg) return 'positive';
    if (neg >= 2 && neg > pos) return 'negative';
    if (pos >= 2 && pos > neg) return 'positive';
    return 'neutral';
};

const parsePubDate = (s) => {
    const d = new Date(s);
    return (!s || isNaN(d.getTime())) ? { publishedAt: new Date(), date: new Date().toLocaleDateString('vi-VN') } : { publishedAt: d, date: d.toLocaleDateString('vi-VN') };
};
const extractDomain = (url) => { try { return new URL(url).hostname.replace('www.',''); } catch { return 'Internet'; } };
const isValidArticleLink = (url) => url && typeof url === 'string' && url.startsWith('http') && !url.includes('google.com') && !url.includes('googleusercontent.com');

const fetchGoogleNewsRSS = async (url, maxItems = 25) => {  
    try {
        const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
        const itemsList = [].concat(xmlParser.parse(data)?.rss?.channel?.item || []);
        return itemsList.slice(0, maxItems).map(el => {
            const title = (el?.title || '').toString().replace(/ - [^-]+$/, '').trim();
            const rawLink = el?.link || el?.guid?.['#text'] || el?.guid || '';
            if (title.length < 10 || !rawLink) return null;
            return { ...parsePubDate(el.pubDate), title, rawLink, sourceName: typeof el.source === 'string' ? el.source : (el.source?.['#text'] || 'Google News'), description: el.description || '' };
        }).filter(Boolean);
    } catch { return []; }
};

const preflightCheck = async (url) => {
    try {
        const res = await axios.get(url, { maxRedirects: 0, validateStatus: s => s >= 200 && s < 400, timeout: 4000 });
        return res.headers.location || url;
    } catch (err) { return err.response?.headers?.location || url; }
};

const decodeGoogleNewsUrl = (url) => {
    try {
        const match = url.match(/(?:articles|read)\/([a-zA-Z0-9-_]+)/);
        if (match) {
            const base64Str = match[1].replace(/-/g, '+').replace(/_/g, '/');
            const decoded = Buffer.from(base64Str, 'base64').toString('utf-8');
            const urlMatch = decoded.match(/https?:\/\/[^\x00-\x1F\s"']+/i);
            if (urlMatch) return urlMatch[0];
        }
    } catch (e) {}
    return null;
};

const resolveOneGoogleLink = async (browser, googleUrl) => {
    if (!googleUrl) return null;
    if (isValidArticleLink(googleUrl)) return googleUrl;
    if (!googleUrl.includes('google.com')) return null;

    const decoded = decodeGoogleNewsUrl(googleUrl);
    if (decoded && isValidArticleLink(decoded)) return decoded;

    const preflightUrl = await preflightCheck(googleUrl);
    if (isValidArticleLink(preflightUrl) && !preflightUrl.includes('google.com')) return preflightUrl; 

    let page;
    try {
        page = await browser.newPage();
        await page.setRequestInterception(true);
        const finalUrl = await new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), 15000);
            page.on('request', (req) => {
                const url = req.url();
                if (['image','stylesheet','font','media'].includes(req.resourceType())) { req.abort(); return; }
                if (url.includes('consent.google.com')) {
                    clearTimeout(timer); req.abort('aborted'); resolve(null); return; 
                }
                if (req.isNavigationRequest() && req.frame() === page.mainFrame() && !url.includes('news.google.com') && !url.includes('about:blank')) {
                    clearTimeout(timer); req.abort('aborted'); resolve(url); return;
                }
                req.continue();
            });
            page.goto(googleUrl).catch(() => {});
        });
        return (finalUrl && isValidArticleLink(finalUrl)) ? finalUrl : null;
    } catch { return null; } finally { if(page) await page.close().catch(() => {}); }
};

const resolveGoogleLinksParallel = async (items, concurrency = 5) => { 
    const browser = await getBrowser();
    if (!browser) return [];
    const results = [];
    for (let i = 0; i < items.length; i += concurrency) {
        const resolved = await Promise.all(items.slice(i, i + concurrency).map(async (item) => {
            const realLink = await resolveOneGoogleLink(browser, item.rawLink);
            if (!realLink) return null;
            return { title: item.title, link: realLink, source: item.sourceName, domain: extractDomain(realLink), sentiment: detectSentiment(item.title, item.description), publishedAt: item.publishedAt, date: item.date, fromGoogle: true };
        }));
        results.push(...resolved.filter(Boolean));
    }
    return results;
};

const fetchDirectRSS = async (source, ticker, maxItems = 50) => {
    try { 
        const { data } = await axios.get(source.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
        const itemsRaw = [].concat(xmlParser.parse(data)?.rss?.channel?.item || []);
        const tickerPattern = new RegExp(`(^|\\s|\\(|\\[|:)${ticker.toUpperCase()}(\\s|\\)|\\]|:|$|,|\\.)`);
        
        return itemsRaw.slice(0, maxItems).map(el => {
            const title = (el?.title || '').toString();
            const rawLink = el?.link || el?.guid?.['#text'] || el?.guid || '';
            const titleUpper = title.toUpperCase();
            if (!isValidArticleLink(rawLink) || title.length < 15 || (!tickerPattern.test(titleUpper) && !titleUpper.includes(` ${ticker.toUpperCase()} `))) return null;
            return { ...parsePubDate(el.pubDate), title, link: rawLink, source: source.name, domain: source.domain || extractDomain(rawLink), sentiment: detectSentiment(title, el.description), fromGoogle: false };
        }).filter(Boolean);
    } catch { return []; }
};

const searchOnSite = async (source, ticker, maxItems = 10) => {
    try {
        const { data } = await axios.get(source.buildUrl(ticker), {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': `https://${source.domain}/` },
            timeout: 12000,
        });
        const $ = cheerio.load(data);
        const results = [];
        const tickerUpper = ticker.toUpperCase();

        $(source.itemSelector).each((i, el) => {
            if (i >= maxItems) return false;
            const $el = $(el);
            const href = $el.attr('href');
            const title = ($el.text().trim() || $el.attr('title') || '').replace(/\s+/g,' ').trim();

            if (!title || title.length < 15 || !href || !title.toUpperCase().includes(tickerUpper)) return;
            let link = href.startsWith('/') ? `https://${source.domain}${href}` : href;
            if (!isValidArticleLink(link) || !link.includes(source.domain)) return;

            results.push({
                title, link, source: source.name, domain: source.domain, sentiment: detectSentiment(title),
                publishedAt: new Date(), date: new Date().toLocaleDateString('vi-VN'), fromGoogle: false, fromSearch: true
            });
        });
        return results;
    } catch { return []; }
};

export const rescoreSentiment = (item) => ({ ...item, sentiment: detectSentiment(item.title, item.content || '') });

const dedupByLink = (articles) => {
    const seen = new Set();
    return articles.filter(a => {
        const key = a.link.split('?')[0].replace(/\/$/,'').toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key); return true;
    });
};

const filterByMode = (articles, mode) => {
    switch(mode) {
        case 'negative': return articles.filter(a => a.sentiment==='negative' || /bán tháo|lao dốc|thua lỗ|vi phạm|điều tra/i.test(a.title));
        case 'official': return articles.filter(a => ['cafef.vn','vietstock.vn','baodautu.vn','tinnhanhchungkhoan.vn','vneconomy.vn'].includes(a.domain));
        case 'rumor': return articles.filter(a => /tin đồn|nội bộ|thâu tóm/i.test(a.title) || ['dantri.com.vn','vnexpress.net'].includes(a.domain));
        default: return articles;
    }
};

const distributeSentiment = (articles, mode) => {
    if (mode === 'negative' || mode === 'official') return articles;
    const neg = articles.filter(a=>a.sentiment==='negative'), pos = articles.filter(a=>a.sentiment==='positive'), neu = articles.filter(a=>a.sentiment==='neutral');
    const result = [];
    for (let i=0; i<Math.max(neg.length, pos.length, neu.length); i++) {
        if (i<neg.length) result.push(neg[i]);
        if (i<neu.length) result.push(neu[i]);
        if (i<pos.length) result.push(pos[i]);
    }
    return result;
};

// MAIN EXPORT
export async function searchVnNewsDirectly(ticker, mode = 'balanced', limit = 30) {
    const clean = ticker.toUpperCase();
    const cacheKey = `${clean}_${mode}_${limit}`;
    const cachedData = cacheMap.get(cacheKey);
    if (cachedData && (Date.now() - cachedData.timestamp < CACHE_TTL)) return cachedData.data;

    const [googleRawItems, rssResults, searchResults] = await Promise.all([
        Promise.all(buildGoogleNewsQueries(clean, mode).map(q => fetchGoogleNewsRSS(q, 25))).then(r => r.flat()),
        Promise.allSettled(DIRECT_RSS_SOURCES.map(s => fetchDirectRSS(s, clean, 50))).then(r => r.filter(x=>x.status==='fulfilled').flatMap(x=>x.value)),
        Promise.allSettled(SEARCH_SOURCES.map(s => searchOnSite(s, clean, 10))).then(r => r.filter(x=>x.status==='fulfilled').flatMap(x=>x.value)),
    ]);

     const googleItemsToResolve = googleRawItems.slice(0, 60); 
    const googleResolved = await resolveGoogleLinksParallel(googleItemsToResolve, 5);
    
    const merged = dedupByLink([...googleResolved, ...rssResults, ...searchResults]).sort((a, b) => b.publishedAt - a.publishedAt);
    
    let filtered = filterByMode(merged, mode);
     if (filtered.length < 15) filtered = merged;  
    
    const out = distributeSentiment(filtered, mode).slice(0, limit);

    cacheMap.set(cacheKey, { timestamp: Date.now(), data: out });
    console.log(`[vnNewsSearch] ${clean} | Tìm thấy: ${out.length} tin chuẩn.`);
    return out;
}