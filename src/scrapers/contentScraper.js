import axios from 'axios';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { getBrowser } from '../utils/browserManager.js';

//─── Selectors ────────────────────────────────────────────────────────────────

const DOMAIN_SELECTORS = {
    'cafef.vn':              ['.knc-content', '.detail-content', '#ArticleContent', '.article-body'],
    'vietstock.vn':          ['.article-content', '.content-detail', '.detail-content', '#vts-content'],
    'baodautu.vn':           ['.detail-content', '.article__body', '.cms-body', '#content_detail_news'],
    'tinnhanhchungkhoan.vn': ['.detail-content', '.article-body', '.content-detail'],
    'vneconomy.vn':          ['.detail__cmain', '.detail-content', '.article-content'],
    'ndh.vn':                ['.article-body', '.post-content', '.detail-content'],
    'dantri.com.vn':         ['.singular-content', '.detail-content', '.article-content'],
    'thanhnien.vn':          ['.detail-content', '.article__body', '.content-body'],
    'tuoitre.vn':            ['.detail-content', '#main-detail-body'],
    'vnexpress.net':         ['.fck_detail', '.article-body', '.content_detail'],
    'baomoi.com':            ['.bm_C', '.article-body'],
};

const GENERIC_SELECTORS = [
    'article',
    '[class*="article-body"]',
    '[class*="detail-content"]',
    '[class*="post-content"]',
    '[class*="content-body"]',
    '[id*="main-detail"]',
    '.cms-body',
    'main',
];

const TRASH_QUERY = [
    'script', 'style', 'iframe', 'header', 'footer', 'nav', 'aside',
    '.advertisement', '.ads', '.related', '.social-share', '.comment',
    '[class*="banner"]', '[class*="widget"]', '[class*="recommend"]',
    'figure', '.tags', '.author', '.breadcrumb',
    '[class*="popup"]', '[class*="modal"]',
].join(', ');

 const CONTENT_TAGS = 'p, h2, h3, li';
const MIN_TEXT_LEN = 50;

//─── User Agents ──────────────────────────────────────────────────────────────

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
];

const getRandomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const isValidArticleUrl = (url) =>
    url && typeof url === 'string' &&
    url.startsWith('http') &&
    !url.includes('google.com') &&
    !url.includes('googleusercontent.com');

//─── [FIX-6] Per-domain rate limiter ─────────────────────────────────────────
 
const domainLastCall = new Map();

const DOMAIN_MIN_INTERVAL_MS = 2500; 
const JITTER_MS              = 1000;  

function getJitter() {
    return Math.floor(Math.random() * JITTER_MS);
}

async function enforceDomainRateLimit(domain) {
    const now  = Date.now();
    const last = domainLastCall.get(domain) || 0;
    const wait = DOMAIN_MIN_INTERVAL_MS + getJitter() - (now - last);
    if (wait > 0) {
        await new Promise(r => setTimeout(r, wait));
    }
    domainLastCall.set(domain, Date.now());
}

//─── [FIX-8] Charset detection & decode ──────────────────────────────────────
 
function detectCharset(contentTypeHeader, htmlBuffer) {
     if (contentTypeHeader) {
        const m = contentTypeHeader.match(/charset=([^\s;]+)/i);
        if (m) return m[1].toLowerCase().trim();
    }

     if (htmlBuffer) {
         const head = htmlBuffer.slice(0, 2000).toString('latin1');
        const m1   = head.match(/<meta[^>]+charset=["']?([^"'\s;/>]+)/i);
        if (m1) return m1[1].toLowerCase().trim();
        const m2   = head.match(/<meta[^>]+content=["'][^"']*charset=([^"'\s;]+)/i);
        if (m2) return m2[1].toLowerCase().trim();
    }

    return 'utf-8';
}
 
function decodeBuffer(buffer, charset) {
    try {
        if (iconv.encodingExists(charset)) {
            return iconv.decode(buffer, charset);
        }
    } catch {}
    return buffer.toString('utf-8');
}

//─── Shared text extraction ───────────────────────────────────────────────────
/**
 
 */
function extractParas($, container, maxChars) {
    const paras = [];
    container.find(CONTENT_TAGS).each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > MIN_TEXT_LEN && !text.includes('{')) {
            paras.push(text);
        }
    });
    if (paras.length < 2) return null;
    return paras.join('\n').replace(/\s+/g, ' ').substring(0, maxChars);
}

//─── [FIX-8] scrapeWithAxios — encoding-aware ────────────────────────────────
async function scrapeWithAxios(url, maxChars = 4000) {
    try {
        const domain = (new URL(url)).hostname.replace('www.', '');

         const response = await axios.get(url, {
            timeout: 10000,
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': getRandomUA(),
                'Accept': 'text/html,*/*',
            },
        });

        const buffer      = Buffer.from(response.data);
        const contentType = response.headers['content-type'] || '';
        const charset     = detectCharset(contentType, buffer);
        const html        = decodeBuffer(buffer, charset);

        const $ = cheerio.load(html);
        $(TRASH_QUERY).remove();

        for (const sel of [...(DOMAIN_SELECTORS[domain] || []), ...GENERIC_SELECTORS]) {
            const container = $(sel).first();
            if (!container.length) continue;
            const result = extractParas($, container, maxChars);
            if (result) return result;
        }

        //Fallback: entire <p> tag
        const allParas = [];
        $('p').each((_, el) => {
            const text = $(el).text().trim();
            if (text.length > MIN_TEXT_LEN) allParas.push(text);
        });
        if (allParas.length >= 2) {
            return allParas.join('\n').replace(/\s+/g, ' ').substring(0, maxChars);
        }

        return null;
    } catch { return null; }
}

//─── [FIX-6] scrapeWithPuppeteer — domain rate limited ───────────────────────
async function scrapeWithPuppeteer(url, maxChars = 4000) {
    const browser = await getBrowser();
    if (!browser) return null;

    const domain = (new URL(url)).hostname.replace('www.', '');

    //Enforce rate limit before opening the page
    await enforceDomainRateLimit(domain);

    let page;
    try {
        page = await browser.newPage();
        await page.setRequestInterception(true);

        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media', 'other'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.setUserAgent(getRandomUA());
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

        const prioritySelectors = DOMAIN_SELECTORS[domain] || [];

        const fullText = await page.evaluate(
            ({ prioritySelectors, GENERIC_SELECTORS, TRASH_QUERY, CONTENT_TAGS, MIN_TEXT_LEN, maxChars }) => {
                document.querySelectorAll(TRASH_QUERY).forEach(el => el.remove());

                function extractParasBrowser(container) {
                    const tags = container.querySelectorAll(CONTENT_TAGS);
                    const paras = [...tags]
                        .map(el => el.innerText?.trim())
                        .filter(t => t && t.length > MIN_TEXT_LEN && !t.includes('{'));
                    if (paras.length < 2) return null;
                    return paras.join('\n').replace(/\s+/g, ' ').substring(0, maxChars);
                }

                for (const sel of [...prioritySelectors, ...GENERIC_SELECTORS]) {
                    const container = document.querySelector(sel);
                    if (!container) continue;
                    const result = extractParasBrowser(container);
                    if (result) return result;
                }

                //Fallback
                const allParas = [...document.querySelectorAll('p')]
                    .map(p => p.innerText?.trim())
                    .filter(t => t && t.length > MIN_TEXT_LEN);
                if (allParas.length >= 2) {
                    return allParas.join('\n').replace(/\s+/g, ' ').substring(0, maxChars);
                }

                return null;
            },
            { prioritySelectors, GENERIC_SELECTORS, TRASH_QUERY, CONTENT_TAGS, MIN_TEXT_LEN, maxChars }
        );

        return fullText;
    } catch { return null; }
    finally { if (page) await page.close().catch(() => {}); }
}

//─── Public API ───────────────────────────────────────────────────────────────

export async function scrapeArticleContent(url, maxChars = 4000) {
    if (!isValidArticleUrl(url)) {
        console.warn(`[Scraper] Bỏ qua link không hợp lệ hoặc Google: ${url}`);
        return null;
    }

    try {
        const axiosResult = await scrapeWithAxios(url, maxChars);
        if (axiosResult && axiosResult.length > 100) return axiosResult;

        const puppeteerResult = await scrapeWithPuppeteer(url, maxChars);
        return (puppeteerResult && puppeteerResult.length > 100) ? puppeteerResult : null;
    } catch { return null; }
}

export async function resolveGoogleNewsUrl(url) {
    if (!url || !url.includes('google.com')) return url;
    return null;
}