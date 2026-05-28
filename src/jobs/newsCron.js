import axios from 'axios';
import * as cheerio from 'cheerio';
import cron from 'node-cron';
import chalk from 'chalk';
import DerivNews from '../../models/DerivNews.js';
import { scrapeArticleContent } from '../scrapers/contentScraper.js';
import { getBrowser } from '../utils/browserManager.js';

export let lastNewsSyncTime = new Date();

// ─── Sentiment ───────────────────────────────────────────────────────────────
const analyzeSentiment = (title) => {
    const text = title.toLowerCase();
    if ((text.includes('nhnn') || text.includes('ngân hàng nhà nước')) &&
        (text.includes('tuýt còi') || text.includes('yêu cầu xử lý') ||
         text.includes('giữ lãi suất') || text.includes('ổn định lãi suất'))) return 'positive';
    if (text.includes('giảm lãi suất') || text.includes('hạ lãi suất') ||
        text.includes('nới lỏng tiền tệ') || text.includes('hút ròng giảm')) return 'positive';
    if (text.includes('tăng lãi suất') && !text.includes('nhnn') &&
        !text.includes('ngân hàng nhà nước')) return 'negative';
    if (text.includes('hút ròng mạnh')) return 'negative';

    const positiveWords = ['bơm ròng', 'phục hồi', 'bình ổn', 'vượt đỉnh', 'kỷ lục', 'tích cực', 'nới lỏng', 'phát triển', 'hạ nhiệt', 'tăng trưởng', 'giải ngân', 'hỗ trợ', 'tăng trưởng gdp', 'xuất siêu'];
    const negativeWords = ['gây áp lực', 'bán tháo', 'rút ròng', 'hút ròng', 'căng thẳng', 'phá giá', 'tiêu cực', 'thủng', 'bắt bớ', 'lạm phát', 'nhập siêu', 'thâm hụt', 'suy thoái', 'khủng hoảng'];

    if (negativeWords.some(w => text.includes(w))) return 'negative';
    if (positiveWords.some(w => text.includes(w))) return 'positive';
    return 'neutral';
};

// ─── RSS queries vĩ mô ────────────────────────────────────────
const MACRO_RSS_QUERIES = [
    `https://news.google.com/rss/search?q=NHNN+OR+ngân+hàng+nhà+nước+lãi+suất+OR+tỷ+giá&hl=vi&gl=VN&ceid=VN:vi`,
    `https://news.google.com/rss/search?q=VN30+OR+VNINDEX+thị+trường+chứng+khoán&hl=vi&gl=VN&ceid=VN:vi`,
    `https://news.google.com/rss/search?q=phái+sinh+hợp+đồng+tương+lai+VN30F&hl=vi&gl=VN&ceid=VN:vi`,
    `https://news.google.com/rss/search?q=GDP+lạm+phát+kinh+tế+Việt+Nam+2025+OR+2026&hl=vi&gl=VN&ceid=VN:vi`,
    `https://news.google.com/rss/search?q=tỷ+giá+USD+VND+OR+FDI+OR+dự+trữ+ngoại+hối&hl=vi&gl=VN&ceid=VN:vi`,
    `https://news.google.com/rss/search?q=trái+phiếu+chính+phủ+OR+ngân+sách+nhà+nước&hl=vi&gl=VN&ceid=VN:vi`,
];

// ─── TÍCH HỢP HÀM BÓC LINK GOOGLE TẠI CHỖ ──────────────────────────────
const resolveGoogleLink = async (googleUrl) => {
    if (!googleUrl || !googleUrl.includes('google.com')) return googleUrl;
    
    try {
        const res = await axios.get(googleUrl, { maxRedirects: 0, validateStatus: s => s >= 200 && s < 400, timeout: 4000 });
        if (res.headers.location && !res.headers.location.includes('google.com')) return res.headers.location;
    } catch (err) {
        if (err.response?.headers?.location && !err.response.headers.location.includes('google.com')) {
            return err.response.headers.location;
        }
    }

    const browser = await getBrowser();
    if (!browser) return null;
    let page;
    try {
        page = await browser.newPage();
        await page.setRequestInterception(true);
        const finalUrl = await new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), 12000);
            page.on('request', (req) => {
                const url = req.url();
                if (['image','stylesheet','font','media'].includes(req.resourceType())) { req.abort(); return; }
                if (req.isNavigationRequest() && req.frame() === page.mainFrame() && !url.includes('news.google.com') && !url.includes('about:blank')) {
                    clearTimeout(timer); req.abort('aborted'); resolve(url); return;
                }
                req.continue();
            });
            page.goto(googleUrl).catch(() => {});
        });
        return finalUrl;
    } catch { return null; } 
    finally { if (page) await page.close().catch(()=>{}); }
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
//─── Cào với Concurrent Limit (Tối ưu RAM) ───────────────────
const scrapeWithConcurrencyLimit = async (articles, limit = 3) => {
    const results = [];
    for (let i = 0; i < articles.length; i += limit) {
        const batch = articles.slice(i, i + limit);
        const batchResults = await Promise.all(
            batch.map(async (article) => {
                if (article.source === 'Reddit F1M' || article.source === 'Facebook Group') {
                    return { ...article, content: article.title };
                }

                // Giải mã link Google
                let realLink = article.link;
                if (realLink && realLink.includes('google.com')) {
                    const decoded = decodeGoogleNewsUrl(realLink);
                    if (decoded) {
                        realLink = decoded;
                    } else {
                        const resolved = await resolveGoogleLink(realLink);
                        if (resolved) realLink = resolved;
                    }
                }

                const isCleanLink = realLink && !realLink.includes('google.com') && !realLink.includes('googleusercontent.com');
                
                if (!isCleanLink) {
                    return { ...article, link: realLink, content: article.title };
                }

                try {
                    // [TĂNG TIMEOUT] Lên 35s để Cào content thoải mái
                    const content = await Promise.race([
                        scrapeArticleContent(realLink),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 35000))
                    ]);
                    
                    return { 
                        ...article, 
                        link: realLink, 
                        content: (content && content.length > 80) ? content : article.title 
                    };
                } catch {
                    return { ...article, link: realLink, content: article.title };
                }
            })
        );
        results.push(...batchResults);
    }
    return results;
};

const extractRealLink = (descriptionHtml) => {
    if (!descriptionHtml) return null;
    const match = descriptionHtml.match(/href="([^"]+)"/);
    if (match && match[1] && !match[1].includes('google.com')) return match[1];
    return null;
};

// ─── Fetch RSS ─────────────────────────────
const fetchMacroRSS = async (url, maxItems = 10) => {
    try {
        const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
        const $ = cheerio.load(data, { xmlMode: true });
        const results = [];
        $('item').each((i, el) => {
            if (i >= maxItems) return false;
            const title       = $(el).find('title').text().replace(/ - .*$/, '').trim();
            const googleLink  = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
            const description = $(el).find('description').text().trim();
            const source      = $(el).find('source').text() || 'Báo Tài Chính';
            const realLink = extractRealLink(description) || googleLink;

            if (title && title.length > 20 && realLink) {
                results.push({
                    title, link: realLink, source, sentiment: analyzeSentiment(title),
                    timestamp: new Date($(el).find('pubDate').text() || Date.now()),
                });
            }
        });
        return results;
    } catch (err) {
        console.log(chalk.red(`[LỖI] RSS fetch failed: ${err.message}`));
        return [];
    }
};

// ─── Main fetch ──────────────────────────────────────────────────────────────
export const fetchAndSaveNews = async () => {
    console.log(chalk.gray('[HỆ THỐNG] Đang cào tin tức Vĩ mô...'));
    try {
        const allFetched = await Promise.all(MACRO_RSS_QUERIES.map(url => fetchMacroRSS(url, 10)));
        const seenLinks = new Set();
        const newArticles = [];
        for (const batch of allFetched) {
            for (const article of batch) {
                if (!seenLinks.has(article.link)) { seenLinks.add(article.link); newArticles.push(article); }
            }
        }

        if (newArticles.length === 0) {
            console.log(chalk.yellow('[CẢNH BÁO] Không lấy được bài nào từ RSS. Dừng.'));
            return;
        }

        console.log(chalk.cyan(`[CRON] Đã lấy ${newArticles.length} bài từ tất cả RSS queries.`));
        const existingLinks = new Set((await DerivNews.find({}, { link: 1 }).lean()).map(d => d.link));
        const brandNewArticles = newArticles.filter(a => !existingLinks.has(a.link));
        const alreadyHave = newArticles.length - brandNewArticles.length;

        console.log(chalk.gray(`[CRON] Đã có: ${alreadyHave} | Mới: ${brandNewArticles.length}`));

        if (brandNewArticles.length === 0) {
            console.log(chalk.gray('[CRON] Không có bài mới. Giữ nguyên DB, chờ cron tiếp theo.'));
        } else {
            const articlesWithContent = await scrapeWithConcurrencyLimit(brandNewArticles, 3);
            let addedCount = 0;
            for (const article of articlesWithContent) {
                try {
                    await DerivNews.create(article);
                    addedCount++;
                } catch (err) {
                    if (err.code !== 11000) console.log(chalk.yellow(`[CRON] Lỗi insert "${article.title}": ${err.message}`));
                }
            }
            console.log(chalk.green(`[CRON] Đã lưu thành công ${addedCount} tin tức kèm content bài báo vào DB.`));
        }

        const count = await DerivNews.countDocuments();
        if (count > 60) {
            const top60 = await DerivNews.find().sort({ timestamp: -1 }).limit(60).select('_id').lean();
            const top60Ids = top60.map(d => d._id);
            const deleted = await DerivNews.deleteMany({ _id: { $nin: top60Ids } });
            if (deleted.deletedCount > 0) console.log(chalk.gray(`[CRON] Đã dọn ${deleted.deletedCount} tin cũ.`));
        }
        lastNewsSyncTime = new Date();
    } catch (error) { console.error('[CRON-LỖI]', error.message); }
};

export const startCronJobs = () => {
    fetchAndSaveNews().catch(err => console.error(chalk.red('[CRON] Lỗi fetch lần đầu boot:'), err.message));
    cron.schedule('0 */3 * * *', fetchAndSaveNews);
    console.log(chalk.gray('[CRON] Đã lên lịch lấy dữ liệu tin vĩ mô mỗi 3h.'));
};