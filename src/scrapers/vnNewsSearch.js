import axios from 'axios';
import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { getBrowser } from '../utils/browserManager.js';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const cacheMap  = new Map();

 const MARKET_OPEN_HOUR  = 9;
const MARKET_CLOSE_HOUR = 15; 

function getActiveCacheTTL() {
    const now = new Date();
     const ictHour = (now.getUTCHours() + 7) % 24;
    const isWeekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
    const isMarketHours = ictHour >= MARKET_OPEN_HOUR && ictHour < MARKET_CLOSE_HOUR;
    return (isWeekday && isMarketHours)
        ? 3  * 60 * 1000   
        : 30 * 60 * 1000; 
}

// ─── [FIX-1] decodeGoogleNewsUrl — export để newsCron.js  
export const decodeGoogleNewsUrl = (url) => {
    if (!url) return null;
    try {
        const match = url.match(/(?:articles|read)\/([a-zA-Z0-9\-_]+)/);
        if (!match) return null;
         const base64Str = match[1].replace(/-/g, '+').replace(/_/g, '/');
        const decoded   = Buffer.from(base64Str, 'base64').toString('utf-8');
        const urlMatch  = decoded.match(/https?:\/\/[^\x00-\x1F\s"']+/i);
        return urlMatch ? urlMatch[0] : null;
    } catch {
        return null;
    }
};

// ─── Query builders ───────────────────────────────────────────────────────────
const buildGoogleNewsQueries = (ticker, mode) => {
    const t    = encodeURIComponent(ticker);
    const base = 'hl=vi&gl=VN&ceid=VN:vi';
    switch (mode) {
        case 'official':
            return [
                `https://news.google.com/rss/search?q=${t}+site:cafef.vn+OR+site:vietstock.vn+OR+site:baodautu.vn+OR+site:vneconomy.vn&${base}`,
                `https://news.google.com/rss/search?q=${t}+site:tinnhanhchungkhoan.vn+OR+site:dantri.com.vn&${base}`,
            ];
        case 'negative':
            return [
                `https://news.google.com/rss/search?q=${t}+bán+tháo+OR+ngoại+bán+ròng+OR+nợ+xấu+OR+điều+tra+OR+vi+phạm&${base}`,
                `https://news.google.com/rss/search?q=${t}+margin+call+OR+cắt+lỗ+OR+thua+lỗ+OR+bị+xử+phạt+OR+rủi+ro&${base}`,
            ];
        case 'rumor':
            return [
                `https://news.google.com/rss/search?q=${t}+tin+đồn+OR+nội+bộ+OR+dòng+tiền+lớn+OR+tay+to+OR+thâu+tóm&${base}`,
                `https://news.google.com/rss/search?q=${t}+cổ+phiếu+chứng+khoán&${base}`,
            ];
        case 'balanced':
        default:
            return [
                `https://news.google.com/rss/search?q=${t}+cổ+phiếu+OR+chứng+khoán+OR+thị+trường&${base}`,
                `https://news.google.com/rss/search?q=${t}+tin+tức+OR+doanh+nghiệp+OR+đầu+tư&${base}`,
                `https://news.google.com/rss/search?q=${t}&${base}`,
            ];
    }
};

const DIRECT_RSS_SOURCES = [
    { name: 'VietStock CK',  url: 'https://vietstock.vn/rss/chung-khoan.rss',       domain: 'vietstock.vn'          },
    { name: 'CafeF CK',      url: 'https://cafef.vn/thi-truong-chung-khoan.rss',     domain: 'cafef.vn'              },
    { name: 'VnEconomy CK',  url: 'https://vneconomy.vn/chung-khoan.rss',            domain: 'vneconomy.vn'          },
    { name: 'BaoDauTu CK',   url: 'https://baodautu.vn/chung-khoan.rss',             domain: 'baodautu.vn'           },
    { name: 'TNCK',          url: 'https://tinnhanhchungkhoan.vn/rss/chung-khoan.rss', domain: 'tinnhanhchungkhoan.vn' },
];

const SEARCH_SOURCES = [
    {
        name: 'CafeF', domain: 'cafef.vn',
        buildUrl: (t) => `https://cafef.vn/tim-kiem.chn?keywords=${encodeURIComponent(t)}`,
        itemSelector: '.knc-name a, .tlitem h3 a, .list-content .news-item a',
    },
    {
        name: 'VietStock', domain: 'vietstock.vn',
        buildUrl: (t) => `https://vietstock.vn/search/?q=${encodeURIComponent(t)}`,
        itemSelector: '.news-list .item a[href*="/"], .search-result a[href*="/"]',
    },
];

// ─── [FIX-2] Sentiment engine nâng cấp ───────────────────────────────────────

const NEG_MAP = new Map([
    //Price down /sell
    ['bán tháo', 3], ['bán ròng', 2], ['xả hàng', 2], ['rút vốn', 2], ['tháo chạy', 3],
    //Loss /debt
    ['cắt lỗ', 2], ['margin call', 3], ['thua lỗ', 3], ['lỗ ròng', 3], ['nợ xấu', 3],
    ['nợ quá hạn', 2], ['âm vốn', 3], ['mất vốn', 3],
    //Legal
    ['vi phạm', 3], ['bị xử phạt', 3], ['điều tra', 3], ['khởi tố', 4], ['bắt tạm giam', 4],
    ['cưỡng chế', 3], ['sai phạm', 3],
    //General risks /negatives
    ['rủi ro cao', 2], ['lao dốc', 3], ['sụt giảm mạnh', 2], ['giảm sâu', 2],
    ['phá sản', 4], ['giải thể', 3], ['tạm dừng giao dịch', 3], ['bị hủy niêm yết', 4],
    ['cảnh báo', 2], ['kiểm soát đặc biệt', 3],
]);

const POS_MAP = new Map([
    //Cash flow /purchases
    ['mua ròng', 2], ['mua vào', 1], ['gom hàng', 2], ['tích lũy', 1],
    //Business results
    ['lợi nhuận tăng', 3], ['doanh thu tăng', 2], ['lãi kỷ lục', 3], ['lợi nhuận vượt', 2],
    ['vượt kế hoạch', 2], ['hoàn thành chỉ tiêu', 2],
    //Price /market trend
    ['tăng trưởng', 2], ['vượt đỉnh', 2], ['đột phá', 2], ['khởi sắc', 2], ['bứt phá', 2],
    ['phục hồi', 1], ['kỳ vọng tăng', 2], ['nâng mục tiêu giá', 2],
    //Business
    ['ký hợp đồng lớn', 2], ['mở rộng', 1], ['hợp tác chiến lược', 1], ['phát hành thành công', 2],
    ['chia cổ tức', 2], ['thưởng cổ phiếu', 1], ['mua lại cổ phiếu', 2],
]);

 const NEGATION_WINDOW = 20; 
const NEGATION_WORDS  = ['không', 'chưa', 'chẳng', 'chả', 'không hề', 'chưa hề', 'không phải', 'ngoại trừ', 'loại trừ'];

const REGEX_NEG = new RegExp(Array.from(NEG_MAP.keys()).join('|'), 'gi');
const REGEX_POS = new RegExp(Array.from(POS_MAP.keys()).join('|'), 'gi');

 
function isNegated(text, index) {
    const lookBack = text.slice(Math.max(0, index - NEGATION_WINDOW), index).toLowerCase();
    return NEGATION_WORDS.some(w => lookBack.includes(w));
}
 
function countScoreWithNegation(text, regex, map, weight, oppositeAccum) {
    let score = 0;
    let match;
     regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
        const keyword   = match[0].toLowerCase();
        const points    = (map.get(keyword) || 1) * weight;
        const negated   = isNegated(text, match.index);
        if (negated) {
             oppositeAccum.v += Math.round(points / 2);
        } else {
            score += points;
        }
    }
    return score;
}
 
export const detectSentiment = (title = '', content = '') => {
    const tLow = title.toLowerCase();
    const cLow = content.toLowerCase();

     const negFromPosNegation = { v: 0 };   
    const posFromNegNegation = { v: 0 };  

    let neg = countScoreWithNegation(tLow, REGEX_NEG, NEG_MAP, 2, posFromNegNegation)
            + countScoreWithNegation(cLow, REGEX_NEG, NEG_MAP, 1, posFromNegNegation);

    let pos = countScoreWithNegation(tLow, REGEX_POS, POS_MAP, 2, negFromPosNegation)
            + countScoreWithNegation(cLow, REGEX_POS, POS_MAP, 1, negFromPosNegation);

     neg += negFromPosNegation.v;
    pos += posFromNegNegation.v;

     const pctMatches = tLow.match(/-\d+([.,]\d+)?%/g) || [];
    pctMatches.forEach(pm => {
        const pmIdx   = tLow.indexOf(pm);
        const context = tLow.slice(Math.max(0, pmIdx - 15), pmIdx + 10);
        const hasPosContext = NEGATION_WORDS.some(w => context.includes(w))
            || /phục hồi|vượt|từ mức|từ đáy|giảm nhẹ/.test(context);
        if (!hasPosContext) neg += 2;
    });

     if (neg >= 3 && neg > pos + 1) return 'negative';
    if (pos >= 3 && pos > neg + 1) return 'positive';
    if (neg >= 2 && neg > pos)     return 'negative';
    if (pos >= 2 && pos > neg)     return 'positive';
    return 'neutral';
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const parsePubDate = (s) => {
    const d = new Date(s);
    return (!s || isNaN(d.getTime()))
        ? { publishedAt: new Date(), date: new Date().toLocaleDateString('vi-VN') }
        : { publishedAt: d, date: d.toLocaleDateString('vi-VN') };
};

const extractDomain      = (url) => { try { return new URL(url).hostname.replace('www.', ''); } catch { return 'Internet'; } };
const isValidArticleLink = (url) => url && typeof url === 'string' && url.startsWith('http')
    && !url.includes('google.com') && !url.includes('googleusercontent.com');

// ─── Google News RSS fetch ────────────────────────────────────────────────────
const fetchGoogleNewsRSS = async (url, maxItems = 25) => {
    try {
        const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
        const itemsList = [].concat(xmlParser.parse(data)?.rss?.channel?.item || []);
        return itemsList.slice(0, maxItems).map(el => {
            const title   = (el?.title || '').toString().replace(/ - [^-]+$/, '').trim();
            const rawLink = el?.link || el?.guid?.['#text'] || el?.guid || '';
            if (title.length < 10 || !rawLink) return null;
            return {
                ...parsePubDate(el.pubDate),
                title,
                rawLink,
                sourceName:  typeof el.source === 'string' ? el.source : (el.source?.['#text'] || 'Google News'),
                description: el.description || '',
            };
        }).filter(Boolean);
    } catch { return []; }
};

// ─── Google link resolution ───────────────────────────────────────────────────
const preflightCheck = async (url) => {
    try {
        const res = await axios.get(url, { maxRedirects: 0, validateStatus: s => s >= 200 && s < 400, timeout: 4000 });
        return res.headers.location || url;
    } catch (err) { return err.response?.headers?.location || url; }
};

const resolveOneGoogleLink = async (browser, googleUrl) => {
    if (!googleUrl) return null;
    if (isValidArticleLink(googleUrl)) return googleUrl;
    if (!googleUrl.includes('google.com')) return null;

    //Try base64 decoding first (fast, no network needed) — [FIX-1] uses general export
    const decoded = decodeGoogleNewsUrl(googleUrl);
    if (decoded && isValidArticleLink(decoded)) return decoded;

    //Try HTTP redirect (no browser needed)
    const preflightUrl = await preflightCheck(googleUrl);
    if (isValidArticleLink(preflightUrl) && !preflightUrl.includes('google.com')) return preflightUrl;

    //Fallback: open browser page and catch redirect
    let page;
    try {
        page = await browser.newPage();
        await page.setRequestInterception(true);

        const finalUrl = await new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), 15000);
            page.on('request', (req) => {
                const u = req.url();
                if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) { req.abort(); return; }
                if (u.includes('consent.google.com')) {
                    clearTimeout(timer); req.abort('aborted'); resolve(null); return;
                }
                if (req.isNavigationRequest() && req.frame() === page.mainFrame()
                    && !u.includes('news.google.com') && !u.includes('about:blank')) {
                    clearTimeout(timer); req.abort('aborted'); resolve(u); return;
                }
                req.continue();
            });
            page.goto(googleUrl).catch(() => {});
        });

        return (finalUrl && isValidArticleLink(finalUrl)) ? finalUrl : null;
    } catch { return null; }
    finally { if (page) await page.close().catch(() => {}); }
};

 
const PUPPETEER_GLOBAL_TIMEOUT = 60_000; 

const resolveGoogleLinksParallel = async (items, concurrency = 5) => {
    const doResolve = async () => {
        const browser = await getBrowser();
        if (!browser) return [];

        const results = [];
        for (let i = 0; i < items.length; i += concurrency) {
            const batch = items.slice(i, i + concurrency);
            const resolved = await Promise.all(batch.map(async (item) => {
                const realLink = await resolveOneGoogleLink(browser, item.rawLink);
                if (!realLink) return null;
                return {
                    title:       item.title,
                    link:        realLink,
                    source:      item.sourceName,
                    domain:      extractDomain(realLink),
                    sentiment:   detectSentiment(item.title, item.description),
                    publishedAt: item.publishedAt,
                    date:        item.date,
                    fromGoogle:  true,
                };
            }));
            results.push(...resolved.filter(Boolean));
        }
        return results;
    };

    const timeout = new Promise((resolve) =>
        setTimeout(() => {
            console.warn('[vnNewsSearch] ⚠ Puppeteer global timeout — trả kết quả một phần.');
            resolve([]);
        }, PUPPETEER_GLOBAL_TIMEOUT)
    );

    return Promise.race([doResolve(), timeout]);
};

// ─── Direct RSS ───────────────────────────────────────────────────────────────
const fetchDirectRSS = async (source, ticker, maxItems = 50) => {
    try {
        const { data }   = await axios.get(source.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
        const itemsRaw   = [].concat(xmlParser.parse(data)?.rss?.channel?.item || []);
        const tickerPat  = new RegExp(`(^|\\s|\\(|\\[|:)${ticker.toUpperCase()}(\\s|\\)|\\]|:|$|,|\\.)`);
        const tickerUp   = ticker.toUpperCase();

        return itemsRaw.slice(0, maxItems).map(el => {
            const title    = (el?.title || '').toString();
            const rawLink  = el?.link || el?.guid?.['#text'] || el?.guid || '';
            const titleUp  = title.toUpperCase();
            if (!isValidArticleLink(rawLink) || title.length < 15) return null;
            if (!tickerPat.test(titleUp) && !titleUp.includes(` ${tickerUp} `)) return null;
            return {
                ...parsePubDate(el.pubDate),
                title,
                link:      rawLink,
                source:    source.name,
                domain:    source.domain || extractDomain(rawLink),
                sentiment: detectSentiment(title, el.description || ''),
                fromGoogle: false,
            };
        }).filter(Boolean);
    } catch { return []; }
};

// ─── Site search scrape ───────────────────────────────────────────────────────
const searchOnSite = async (source, ticker, maxItems = 10) => {
    try {
        const { data } = await axios.get(source.buildUrl(ticker), {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': `https://${source.domain}/` },
            timeout: 12000,
        });
        const $         = cheerio.load(data);
        const results   = [];
        const tickerUp  = ticker.toUpperCase();

        $(source.itemSelector).each((i, el) => {
            if (i >= maxItems) return false;
            const $el  = $(el);
            const href = $el.attr('href');
            const title = ($el.text().trim() || $el.attr('title') || '').replace(/\s+/g, ' ').trim();

            if (!title || title.length < 15 || !href || !title.toUpperCase().includes(tickerUp)) return;
            const link = href.startsWith('/') ? `https://${source.domain}${href}` : href;
            if (!isValidArticleLink(link) || !link.includes(source.domain)) return;

            results.push({
                title, link, source: source.name, domain: source.domain,
                sentiment:   detectSentiment(title),
                publishedAt: new Date(),
                date:        new Date().toLocaleDateString('vi-VN'),
                fromGoogle:  false,
                fromSearch:  true,
            });
        });
        return results;
    } catch { return []; }
};

 export const rescoreSentiment = (item) => ({
    ...item,
    sentiment: detectSentiment(item.title, item.content || ''),
});

// ─── Deduplication ────────────────────────────────────────────────────────────
const dedupByLink = (articles) => {
    const seen = new Set();
    return articles.filter(a => {
        const key = a.link.split('?')[0].replace(/\/$/, '').toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};
 
const OFFICIAL_DOMAINS = ['cafef.vn', 'vietstock.vn', 'baodautu.vn', 'tinnhanhchungkhoan.vn', 'vneconomy.vn'];

const filterByMode = (articles, mode, minCount = 10) => {
    switch (mode) {
        case 'negative': {
            const primary   = articles.filter(a => a.sentiment === 'negative'
                || /bán tháo|lao dốc|thua lỗ|vi phạm|điều tra|cắt lỗ|lao dốc|margin call/i.test(a.title));
            if (primary.length >= minCount) return primary;
             const neutral   = articles.filter(a => a.sentiment === 'neutral' && !primary.includes(a));
            return [...primary, ...neutral].slice(0, Math.max(primary.length, minCount));
        }
        case 'official': {
            const primary   = articles.filter(a => OFFICIAL_DOMAINS.includes(a.domain));
            if (primary.length >= minCount) return primary;
            const rest      = articles.filter(a => !primary.includes(a));
            return [...primary, ...rest];
        }
        case 'rumor': {
            const primary   = articles.filter(a =>
                /tin đồn|nội bộ|thâu tóm|tay to|dòng tiền lớn/i.test(a.title)
                || ['dantri.com.vn', 'vnexpress.net', 'cafebiz.vn'].includes(a.domain));
            if (primary.length >= minCount) return primary;
            const neutral   = articles.filter(a => a.sentiment === 'neutral' && !primary.includes(a));
            return [...primary, ...neutral];
        }
        default:
            return articles;
    }
};

// ─── Sentiment distribution (balanced mode) ───────────────────────────────────
const distributeSentiment = (articles, mode) => {
    if (mode === 'negative' || mode === 'official') return articles;
    const neg = articles.filter(a => a.sentiment === 'negative');
    const pos = articles.filter(a => a.sentiment === 'positive');
    const neu = articles.filter(a => a.sentiment === 'neutral');
    const result = [];
    const maxLen = Math.max(neg.length, pos.length, neu.length);
    for (let i = 0; i < maxLen; i++) {
        if (i < neg.length) result.push(neg[i]);
        if (i < neu.length) result.push(neu[i]);
        if (i < pos.length) result.push(pos[i]);
    }
    return result;
};

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export async function searchVnNewsDirectly(ticker, mode = 'balanced', limit = 30) {
    const clean    = ticker.toUpperCase();
    const cacheKey = `${clean}_${mode}_${limit}`;

    // [FIX-5] TTL động
    const ttl = getActiveCacheTTL();
    const cached = cacheMap.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < ttl)) {
        console.log(`[vnNewsSearch] Cache hit — ${clean} (TTL ${ttl / 1000}s)`);
        return cached.data;
    }

    // Chạy song song: Google RSS + Direct RSS + Site search
    const [googleRawItems, rssResults, searchResults] = await Promise.all([
        Promise.all(buildGoogleNewsQueries(clean, mode).map(q => fetchGoogleNewsRSS(q, 25)))
            .then(r => r.flat()),
        Promise.allSettled(DIRECT_RSS_SOURCES.map(s => fetchDirectRSS(s, clean, 50)))
            .then(r => r.filter(x => x.status === 'fulfilled').flatMap(x => x.value)),
        Promise.allSettled(SEARCH_SOURCES.map(s => searchOnSite(s, clean, 10)))
            .then(r => r.filter(x => x.status === 'fulfilled').flatMap(x => x.value)),
    ]);

    // [FIX-3] Bọc global timeout 60s
    const googleResolved = await resolveGoogleLinksParallel(googleRawItems.slice(0, 60), 5);

    // Merge, dedup, sort theo thời gian
    const merged = dedupByLink([...googleResolved, ...rssResults, ...searchResults])
        .sort((a, b) => b.publishedAt - a.publishedAt);

    // [FIX-4] Filter đúng mode, không fallback ngẫu nhiên
    const filtered = filterByMode(merged, mode);

    const out = distributeSentiment(filtered, mode).slice(0, limit);

    cacheMap.set(cacheKey, { timestamp: Date.now(), data: out });

    const sentimentSummary = {
        positive: out.filter(a => a.sentiment === 'positive').length,
        negative: out.filter(a => a.sentiment === 'negative').length,
        neutral:  out.filter(a => a.sentiment === 'neutral').length,
    };
    console.log(
        `[vnNewsSearch] ${clean} | mode=${mode} | ${out.length} tin`
        + ` | +${sentimentSummary.positive} -${sentimentSummary.negative} ~${sentimentSummary.neutral}`
        + ` | TTL=${ttl / 1000}s`
    );

    return out;
}