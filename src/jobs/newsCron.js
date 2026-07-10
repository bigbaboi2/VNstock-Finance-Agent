import axios from 'axios';
import * as cheerio from 'cheerio';
import cron from 'node-cron';
import chalk from 'chalk';
import DerivNews from '../../models/DerivNews.js';
import { scrapeArticleContent } from '../scrapers/contentScraper.js';
import { getBrowser } from '../utils/browserManager.js';
import { decodeGoogleNewsUrl } from '../utils/googleNewsDecoder.js';
import { detectSentiment } from '../scrapers/vnNewsSearch.js';
import Setting from '../../models/Setting.js';

export let lastNewsSyncTime = new Date();
 
const MACRO_RSS_QUERIES = [
    `https://news.google.com/rss/search?q=NHNN+OR+ngân+hàng+nhà+nước+lãi+suất+OR+tỷ+giá&hl=vi&gl=VN&ceid=VN:vi`,
    `https://news.google.com/rss/search?q=VN30+OR+VNINDEX+thị+trường+chứng+khoán&hl=vi&gl=VN&ceid=VN:vi`,
    `https://news.google.com/rss/search?q=phái+sinh+hợp+đồng+tương+lai+VN30F&hl=vi&gl=VN&ceid=VN:vi`,
    `https://news.google.com/rss/search?q=GDP+lạm+phát+kinh+tế+Việt+Nam+2025+OR+2026&hl=vi&gl=VN&ceid=VN:vi`,
    `https://news.google.com/rss/search?q=tỷ+giá+USD+VND+OR+FDI+OR+dự+trữ+ngoại+hối&hl=vi&gl=VN&ceid=VN:vi`,
    `https://news.google.com/rss/search?q=trái+phiếu+chính+phủ+OR+ngân+sách+nhà+nước&hl=vi&gl=VN&ceid=VN:vi`,
];
 
const DB_CAP = 300;
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_RESET_MS  = 5 * 60 * 1000;

const circuitState = new Map();

function getCircuit(domain) {
    if (!circuitState.has(domain)) {
        circuitState.set(domain, { failures: 0, openUntil: null });
    }
    return circuitState.get(domain);
}

function isCircuitOpen(domain) {
    const c = getCircuit(domain);
    if (c.openUntil && Date.now() < c.openUntil) return true;
    if (c.openUntil && Date.now() >= c.openUntil) {
        c.openUntil = null;
        console.log(chalk.blue(`[CIRCUIT] ${domain} → half-open, cho phép 1 request thử lại.`));
    }
    return false;
}

function recordCircuitSuccess(domain) {
    const c = getCircuit(domain);
    // [FIX-8] Reset hoàn toàn sau khi half-open thành công
    if (c.failures > 0) {
        console.log(chalk.green(`[CIRCUIT] ${domain} recovered — reset failure count.`));
    }
    c.failures = 0;
    c.openUntil = null;
}

function recordCircuitFailure(domain) {
    const c = getCircuit(domain);
    c.failures += 1;
    console.log(chalk.yellow(`[CIRCUIT] ${domain} failure ${c.failures}/${CIRCUIT_THRESHOLD}.`));
    if (c.failures >= CIRCUIT_THRESHOLD) {
        c.openUntil = Date.now() + CIRCUIT_RESET_MS;
        console.log(chalk.red(
            `[CIRCUIT] ${domain} tripped sau ${c.failures} lần timeout → open ${CIRCUIT_RESET_MS / 60000}p.`
        ));
    }
}
function cleanupCircuitState() {
    let deletedCount = 0;
    for (const [domain, state] of circuitState.entries()) {
        if (state.failures === 0 && state.openUntil === null) {
            circuitState.delete(domain);
            deletedCount++;
        }
    }
    if (deletedCount > 0) {
        console.log(chalk.gray(`[CIRCUIT] Đã dọn dẹp ${deletedCount} domain an toàn khỏi bộ nhớ.`));
    }
}

function extractDomain(url) {
    try { return new URL(url).hostname.replace('www.', ''); }
    catch { return 'unknown'; }
}

//─── Google News URL helpers ──────────────────────────────────────────────────
const resolveGoogleLink = async (googleUrl) => {
    if (!googleUrl || !googleUrl.includes('google.com')) return googleUrl;

    try {
        const res = await axios.get(googleUrl, {
            maxRedirects: 0,
            validateStatus: s => s >= 200 && s < 400,
            timeout: 4000,
        });
        if (res.headers.location && !res.headers.location.includes('google.com')) {
            return res.headers.location;
        }
    } catch (err) {
        if (err.response?.headers?.location && !err.response.headers.location.includes('google.com')) {
            return err.response.headers.location;
        }
    }

    const browser = await getBrowser();
    if (!browser) return null;
    let page;
    let timer; 

    try {
        page = await browser.newPage();
        await page.setRequestInterception(true);
        const finalUrl = await new Promise((resolve) => {
            timer = setTimeout(() => resolve(null), 12000);
            page.on('request', (req) => {
                const url = req.url();
                if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                    req.abort(); return;
                }
                if (req.isNavigationRequest() && req.frame() === page.mainFrame() &&
                    !url.includes('news.google.com') && !url.includes('about:blank')) {
                    clearTimeout(timer); req.abort('aborted'); resolve(url); return;
                }
                req.continue();
            });
            page.goto(googleUrl).catch(() => {});
        });
        return finalUrl;
    } catch { return null; }
    finally {
        if (timer) clearTimeout(timer); // [FIX] Dọn dẹp timer an toàn
        if (page) await page.close().catch(() => {});
    }
};
//─── [FIX-10] scrapeWithConcurrencyLimit — circuit breaker + browser health check ────

//[FIX-7] Reduced from 35s to 15s — old worst case: 3 articles × 35s = 105s/batch
//With timeout 15s and concurrency 5: worst case 5 × 15s = 75s/batch, ~30% faster
const SCRAPE_TIMEOUT_MS = 15_000;

const resolveArticleLinks = async (articles, limit = 5) => {
    const results = [];
    for (let i = 0; i < articles.length; i += limit) {
        const batch = articles.slice(i, i + limit);
        const resolvedBatch = await Promise.all(batch.map(async (article) => {
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
            return { ...article, link: realLink };
        }));
        results.push(...resolvedBatch);
    }
    return results;
};

const scrapeWithConcurrencyLimit = async (articles, limit = 5) => {
    const results = [];

    for (let i = 0; i < articles.length; i += limit) {
        const batch = articles.slice(i, i + limit);

        const batchResults = await Promise.all(
            batch.map(async (article) => {
                if (article.source === 'Reddit F1M' || article.source === 'Facebook Group') {
                    return { ...article, content: article.title };
                }

                const realLink = article.link; 
                const isCleanLink = realLink &&
                    !realLink.includes('google.com') &&
                    !realLink.includes('googleusercontent.com');

                if (!isCleanLink) {
                    return { ...article, content: article.title };
                }

                // Check circuit breaker
                const domain = extractDomain(realLink);
                if (isCircuitOpen(domain)) {
                    console.log(chalk.yellow(`[CIRCUIT] Bỏ qua ${domain} (circuit open).`));
                    return { ...article, content: article.title };
                }

                try {
                    const content = await Promise.race([
                        scrapeArticleContent(realLink),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('timeout')), SCRAPE_TIMEOUT_MS)
                        ),
                    ]);

                    recordCircuitSuccess(domain);

                    return {
                        ...article,
                        content: (content && content.length > 80) ? content : article.title,
                    };
                } catch (err) {
                    if (err.message === 'timeout') {
                        recordCircuitFailure(domain);
                        console.log(chalk.yellow(`[CIRCUIT] ${domain} timeout #${getCircuit(domain).failures}`));
                    }
                    return { ...article, content: article.title };
                }
            })
        );
        results.push(...batchResults);
    }
    return results;
};

//─── Fetch RSS ────────────────────────────────────────────────────────────────

const extractRealLink = (descriptionHtml) => {
    if (!descriptionHtml) return null;
    const match = descriptionHtml.match(/href="([^"]+)"/);
    if (match && match[1] && !match[1].includes('google.com')) return match[1];
    return null;
};

const fetchMacroRSS = async (url, maxItems = 10) => {
    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000,
        });
        const $ = cheerio.load(data, { xmlMode: true });
        const results = [];

        $('item').each((i, el) => {
            if (i >= maxItems) return false;
            const title       = $(el).find('title').text().replace(/ - .*$/, '').trim();
            const googleLink  = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
            const description = $(el).find('description').text().trim();
            const source      = $(el).find('source').text() || 'Báo Tài Chính';
            const realLink    = extractRealLink(description) || googleLink;

            if (title && title.length > 20 && realLink) {
                results.push({
                    title,
                    link: realLink,
                    source,
                    sentiment: detectSentiment(title, description),
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

//─── Main fetch ───────────────────────────────────────────────────────────────

export const fetchAndSaveNews = async () => {
    console.log(chalk.gray('[HỆ THỐNG] Đang cào tin tức Vĩ mô...'));

    try {
        const allFetched = await Promise.all(
            MACRO_RSS_QUERIES.map(url => fetchMacroRSS(url, 10))
        );

        const rawArticles = [];
        for (const batch of allFetched) {
            for (const article of batch) {
                rawArticles.push(article);
            }
        }

        if (rawArticles.length === 0) {
            console.log(chalk.yellow('[CẢNH BÁO] Không lấy được bài nào từ RSS. Dừng.'));
            return;
        }

        //STEP 1: DECODE THE ENTIRE LINK PREVIOUSLY
        console.log(chalk.gray(`[CRON] Đang giải mã URL cho ${rawArticles.length} bài viết...`));
        const resolvedArticles = await resolveArticleLinks(rawArticles);

        //STEP 2: FILTER INTERNAL DUPLICATES INTO NEW LIST
        const seenLinks = new Set();
        const newArticles = [];
        for (const article of resolvedArticles) {
            if (article.link && !seenLinks.has(article.link)) {
                seenLinks.add(article.link);
                newArticles.push(article);
            }
        }

        console.log(chalk.greenBright(`[CRON] Đã giải mã xong, lấy được ${newArticles.length} bài unique từ RSS.`));

        //STEP 3: CHECK DUPLICATE WITH DATABASE USING ORIGINAL LINK
        const existingLinks = new Set(
            (await DerivNews.find({}, { link: 1 }).lean()).map(d => d.link)
        );
        const brandNewArticles = newArticles.filter(a => !existingLinks.has(a.link));
        const alreadyHave = newArticles.length - brandNewArticles.length;

        console.log(chalk.gray(`[CRON] Đã có trong DB: ${alreadyHave} | Cần cào mới: ${brandNewArticles.length}`));

        if (brandNewArticles.length === 0) {
            console.log(chalk.gray('[CRON] Không có bài mới. Giữ nguyên DB, chờ cron tiếp theo.'));
        } else {
            //STEP 4: PROCEED TO SCRATCH THE CONTENT
            const articlesWithContent = await scrapeWithConcurrencyLimit(brandNewArticles);
            let addedCount = 0;

            for (const article of articlesWithContent) {
                try {
                    await DerivNews.create(article);
                    addedCount++;
                } catch (err) {
                    if (err.code !== 11000) {
                        console.log(chalk.yellow(`[CRON] Lỗi insert "${article.title}": ${err.message}`));
                    }
                }
            }

            console.log(chalk.green(
                `[CRON] Đã lưu thành công ${addedCount} tin tức kèm content bài báo vào DB.`
            ));
        }

        const count = await DerivNews.countDocuments();
        if (count > DB_CAP) {
            const topN = await DerivNews.find()
                .sort({ timestamp: -1 })
                .limit(DB_CAP)
                .select('_id')
                .lean();
            const topNIds = topN.map(d => d._id);
            const deleted = await DerivNews.deleteMany({ _id: { $nin: topNIds } });
            if (deleted.deletedCount > 0) {
                console.log(chalk.gray(`[CRON] Đã dọn ${deleted.deletedCount} tin cũ (cap=${DB_CAP}).`));
            }
        }

        lastNewsSyncTime = new Date();
        cleanupCircuitState(); 
        
        await Setting.findOneAndUpdate(
            { key: 'lastNewsCronRun' },
            { value: Date.now() },
            { upsert: true }
        ).catch(() => {});
    } catch (error) {
        console.error('[CRON-LỖI]', error.message);
    }
};

//─── Start ────────────────────────────────────────────────────────────────────

export const startCronJobs = () => {
    Setting.findOne({ key: 'lastNewsCronRun' }).then(setting => {
        const lastRun = setting ? Number(setting.value) : 0;
        const now = Date.now();
        if (now - lastRun > 120 * 60 * 1000) {
            fetchAndSaveNews().catch(err =>
                console.error(chalk.red('[CRON] Lỗi fetch lần đầu boot:'), err.message)
            );
        } else {
            console.log(chalk.yellow(`[CRON] Bỏ qua cào tin khởi động do mới quét cách đây ${Math.round((now - lastRun) / 60000)} phút.`));
        }
    }).catch(err => {
        console.error(chalk.yellow(`[CRON] Lỗi kiểm tra cooldown, vẫn chạy mặc định:`), err.message);
        fetchAndSaveNews().catch(err =>
            console.error(chalk.red('[CRON] Lỗi fetch lần đầu boot:'), err.message)
        );
    });

    cron.schedule('0 */3 * * *', fetchAndSaveNews);
    console.log(chalk.gray('[CRON] Đã lên lịch lấy dữ liệu tin vĩ mô mỗi 3h.'));
};