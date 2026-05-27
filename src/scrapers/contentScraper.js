import puppeteer from 'puppeteer';
import axios from 'axios';
import * as cheerio from 'cheerio';

//─── Selector map prioritizes by domain ────────────────────
const DOMAIN_SELECTORS = {
    'cafef.vn':              ['.knc-content', '.detail-content', '#ArticleContent'],
    'vietstock.vn':          ['.article-content', '.content-detail', '.detail-content'],
    'baodautu.vn':           ['.detail-content', '.article__body', '.cms-body'],
    'tinnhanhchungkhoan.vn': ['.detail-content', '.article-body'],
    'vneconomy.vn':          ['.detail__cmain', '.detail-content'],
    'ndh.vn':                ['.article-body', '.post-content'],
    'dantri.com.vn':         ['.singular-content', '.detail-content'],
};

const GENERIC_SELECTORS = [
    'article', '[class*="article-body"]', '[class*="detail-content"]',
    '[class*="post-content"]', '[class*="content-body"]', '[id*="main-detail"]',
    '.cms-body', '.entry-content'
];

const TRASH_SELECTORS = [
    'script', 'style', 'iframe', 'header', 'footer', 'nav', 'aside',
    '.advertisement', '.ads', '.related', '.social-share', '.comment',
    '[class*="banner"]', '[class*="widget"]', '[class*="recommend"]',
    'figure', 'figcaption'
];

const getDomain = (url) => {
    try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
};

//─── [FIX] Decoding Google News redirect URL → Real report URL ──────────────────
export async function resolveGoogleNewsUrl(url) {
    if (!url || !url.includes('news.google.com')) return url;
    try {
        //Follow redirect with axios (don't stream to avoid leaks)
        const response = await axios.get(url, {
            maxRedirects: 5,
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            },
        });
        const finalUrl = response.request?.res?.responseUrl || response.config?.url || url;
        if (finalUrl && !finalUrl.includes('news.google.com')) {
            return finalUrl;
        }

        //Parse HTML response tìm canonical link hoặc meta refresh
        if (response.data && typeof response.data === 'string') {
            const $ = cheerio.load(response.data);
            const canonical = $('link[rel="canonical"]').attr('href');
            if (canonical && !canonical.includes('news.google.com')) return canonical;
            const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
            if (metaRefresh) {
                const match = metaRefresh.match(/url=(.+)/i);
                if (match && match[1] && !match[1].includes('news.google.com')) return match[1];
            }
            //Find links in JS redirect content
            const jsRedirect = response.data.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
            if (jsRedirect && jsRedirect[1] && !jsRedirect[1].includes('news.google.com')) {
                return jsRedirect[1];
            }
        }
        return url;
    } catch (err) {
        if (err.response?.headers?.location) {
            return err.response.headers.location;
        }
        return url;
    }
}

//─── [NEW] Scrape with axios + cheerio (lightweight, no need for Puppeteer) ──────────
async function scrapeWithAxios(resolvedUrl, maxChars = 4000) {
    try {
        const domain = getDomain(resolvedUrl);
        const { data } = await axios.get(resolvedUrl, {
            timeout: 12000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'vi-VN,vi;q=0.9',
            },
        });

        const $ = cheerio.load(data);

        //Delete trash
        TRASH_SELECTORS.forEach(sel => $(sel).remove());

        const prioritySelectors = DOMAIN_SELECTORS[domain] || [];

        //Try priority selectors first
        for (const sel of [...prioritySelectors, ...GENERIC_SELECTORS]) {
            const container = $(sel).first();
            if (!container.length) continue;

            const paras = [];
            container.find('p, h2, h3').each((_, el) => {
                const text = $(el).text().trim();
                if (text && text.length > 40) paras.push(text);
            });

            if (paras.length >= 3) {
                return paras.join('\n').replace(/\s+/g, ' ').substring(0, maxChars);
            }
        }

        //Fallback: get all <p>
        const allParas = [];
        $('p').each((_, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 50) allParas.push(text);
        });

        const result = allParas.join('\n').replace(/\s+/g, ' ').substring(0, maxChars);
        return result.length > 80 ? result : null;

    } catch {
        return null;
    }
}

//─── Main scraper — axios first, Puppeteer does fallback ─────────────────────
export async function scrapeArticleContent(url, maxChars = 4000) {
    let browser;
    try {

        const resolvedUrl = url;

        const axiosResult = await scrapeWithAxios(resolvedUrl, maxChars);
        if (axiosResult && axiosResult.length > 80) {
            return axiosResult;
        }

        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        await page.goto(resolvedUrl, { waitUntil: 'domcontentloaded', timeout: 18000 });

        const domain = getDomain(resolvedUrl);
        const prioritySelectors = DOMAIN_SELECTORS[domain] || [];

        const fullText = await page.evaluate(
            ({ prioritySelectors, GENERIC_SELECTORS, TRASH_SELECTORS, maxChars }) => {
                TRASH_SELECTORS.forEach(sel => {
                    document.querySelectorAll(sel).forEach(el => el.remove());
                });

                for (const sel of [...prioritySelectors, ...GENERIC_SELECTORS]) {
                    const container = document.querySelector(sel);
                    if (!container) continue;

                    const paras = [...container.querySelectorAll('p, h2, h3')]
                        .map(el => el.innerText?.trim())
                        .filter(t => t && t.length > 40);

                    if (paras.length >= 3) {
                        return paras.join('\n').replace(/\s+/g, ' ').substring(0, maxChars);
                    }
                }

                const allParas = [...document.querySelectorAll('p')]
                    .map(p => p.innerText?.trim())
                    .filter(t => t && t.length > 50);

                return allParas.join('\n').replace(/\s+/g, ' ').substring(0, maxChars) || null;
            },
            { prioritySelectors, GENERIC_SELECTORS, TRASH_SELECTORS, maxChars }
        );

        await browser.close();
        return (fullText && fullText.length > 80) ? fullText : null;

    } catch {
        if (browser) await browser.close().catch(() => {});
        return null;
    }
}