import axios from 'axios';
import * as cheerio from 'cheerio';
import { getBrowser } from '../utils/browserManager.js';

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

const GENERIC_SELECTORS = ['article', '[class*="article-body"]', '[class*="detail-content"]', '[class*="post-content"]', '[class*="content-body"]', '[id*="main-detail"]', '.cms-body', 'main'];
const TRASH_QUERY = 'script, style, iframe, header, footer, nav, aside, .advertisement, .ads, .related, .social-share, .comment, [class*="banner"], [class*="widget"], [class*="recommend"], figure, .tags, .author, .breadcrumb, [class*="popup"], [class*="modal"]';

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0'
];

const getRandomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const isValidArticleUrl = (url) => url && typeof url === 'string' && url.startsWith('http') && !url.includes('google.com') && !url.includes('googleusercontent.com');

async function scrapeWithAxios(url, maxChars = 4000) {
    try {
        const domain = (new URL(url)).hostname.replace('www.', '');
        const { data } = await axios.get(url, {
            timeout: 10000,
            headers: { 'User-Agent': getRandomUA(), 'Accept': 'text/html,*/*' },
        });

        const $ = cheerio.load(data);
        $(TRASH_QUERY).remove();  

         for (const sel of [...(DOMAIN_SELECTORS[domain] || []), ...GENERIC_SELECTORS]) {
            const container = $(sel).first();
            if (!container.length) continue;
            
            const paras = [];
            container.find('p, h2, h3, div').each((_, el) => {
                const text = $(el).text().trim();
                if (text.length > 50 && !text.includes('{')) paras.push(text);
            });
            if (paras.length >= 2) return paras.join('\n').replace(/\s+/g, ' ').substring(0, maxChars);
        }

         const allParas = [];
        $('p').each((_, el) => {
            const text = $(el).text().trim();
            if (text.length > 50) allParas.push(text);
        });
        if (allParas.length >= 2) return allParas.join('\n').replace(/\s+/g, ' ').substring(0, maxChars);

        return null;
    } catch { return null; }
}

async function scrapeWithPuppeteer(url, maxChars = 4000) {
    const browser = await getBrowser();
    if (!browser) return null;

    let page;
    try {
        page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            ['image', 'stylesheet', 'font', 'media', 'other'].includes(req.resourceType()) ? req.abort() : req.continue();
        });
        
        await page.setUserAgent(getRandomUA());
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

        const domain = (new URL(url)).hostname.replace('www.', '');
        const prioritySelectors = DOMAIN_SELECTORS[domain] || [];

        const fullText = await page.evaluate(({ prioritySelectors, GENERIC_SELECTORS, TRASH_QUERY, maxChars }) => {
            document.querySelectorAll(TRASH_QUERY).forEach(el => el.remove());
            
            for (const sel of [...prioritySelectors, ...GENERIC_SELECTORS]) {
                const container = document.querySelector(sel);
                if (!container) continue;
                const paras = [...container.querySelectorAll('p, h2, h3, div')].map(el => el.innerText?.trim()).filter(t => t && t.length > 50 && !t.includes('{'));
                if (paras.length >= 2) return paras.join('\n').replace(/\s+/g, ' ').substring(0, maxChars);
            }

            const allParas = [...document.querySelectorAll('p')].map(p => p.innerText?.trim()).filter(t => t && t.length > 50);
            if (allParas.length >= 2) return allParas.join('\n').replace(/\s+/g, ' ').substring(0, maxChars);

            return null;
        }, { prioritySelectors, GENERIC_SELECTORS, TRASH_QUERY, maxChars });

        return fullText;
    } catch { return null; } 
    finally { if (page) await page.close().catch(() => {}); }
}

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