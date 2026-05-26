import axios from 'axios';
import * as cheerio from 'cheerio';
import cron from 'node-cron';
import chalk from 'chalk';
import DerivNews from '../../models/DerivNews.js';
import { scrapeArticleContent } from '../scrapers/contentScraper.js';

export let lastNewsSyncTime = new Date();

// ─── Sentiment ───────────────────────────────────────────────────────────────
const analyzeSentiment = (title) => {
    const text = title.toLowerCase();

    // Rule 
    if ((text.includes('nhnn') || text.includes('ngân hàng nhà nước')) &&
        (text.includes('tuýt còi') || text.includes('yêu cầu xử lý') ||
         text.includes('giữ lãi suất') || text.includes('ổn định lãi suất'))) return 'positive';

    if (text.includes('giảm lãi suất') || text.includes('hạ lãi suất') ||
        text.includes('nới lỏng tiền tệ') || text.includes('hút ròng giảm')) return 'positive';

    if (text.includes('tăng lãi suất') && !text.includes('nhnn') &&
        !text.includes('ngân hàng nhà nước')) return 'negative';

    if (text.includes('hút ròng mạnh')) return 'negative';

    // Bag-of-words  
    const positiveWords = ['bơm ròng', 'phục hồi', 'bình ổn', 'vượt đỉnh', 'kỷ lục',
                           'tích cực', 'nới lỏng', 'phát triển', 'hạ nhiệt', 'tăng trưởng'];
    const negativeWords = ['gây áp lực', 'bán tháo', 'rút ròng', 'hút ròng',
                           'căng thẳng', 'phá giá', 'tiêu cực', 'thủng', 'bắt bớ'];

    if (negativeWords.some(w => text.includes(w))) return 'negative';
    if (positiveWords.some(w => text.includes(w))) return 'positive';
    return 'neutral';
};

//─── Scrape with limited concurrency (max 3 parallel) ───────────────────────
const scrapeWithConcurrencyLimit = async (articles, limit = 3) => {
    const results = [];
    for (let i = 0; i < articles.length; i += limit) {
        const batch = articles.slice(i, i + limit);
        const batchResults = await Promise.all(
            batch.map(async (article) => {
                if (article.source === 'Reddit F1M' || article.source === 'Facebook Group') {
                    return { ...article, content: article.title };
                }
                try {
                    const content = await Promise.race([
                        scrapeArticleContent(article.link),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('timeout')), 25000)
                        )
                    ]);
                    return { ...article, content: content || article.title };
                } catch {
                    return { ...article, content: article.title };
                }
            })
        );
        results.push(...batchResults);
    }
    return results;
};

// ─── Main fetch ──────────────────────────────────────────────────────────────
export const fetchAndSaveNews = async () => {
    console.log('[HỆ THỐNG] Đang cào tin tức Vĩ mô...');
    try {
        const mainUrl   = `https://news.google.com/rss/search?q=tỷ+giá+OR+lãi+suất+OR+VN30+OR+phái+sinh+OR+NHNN&hl=vi&gl=VN&ceid=VN:vi`;
        const socialUrl = `https://news.google.com/rss/search?q=phái+sinh+VN30+(site:reddit.com+OR+site:facebook.com)&hl=vi&gl=VN&ceid=VN:vi`;

        const [mainRes, socialRes] = await Promise.all([
            axios.get(mainUrl,   { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 })
                 .catch(err => { console.log(chalk.red('[LỖI] GOOGLE NEWS 1: ' + err.message)); return { data: '' }; }),
            axios.get(socialUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 })
                 .catch(err => { console.log(chalk.red('[LỖI] GOOGLE NEWS 2: ' + err.message)); return { data: '' }; })
        ]);

        const newArticles = [];

        if (mainRes.data) {
            const $ = cheerio.load(mainRes.data, { xmlMode: true });
            $('item').each((i, el) => {
                if (i >= 12) return false;
                const title = $(el).find('title').text();
                if (title && title.length > 20) {
                    newArticles.push({
                        title,
                        link:      $(el).find('link').text(),
                        source:    $(el).find('source').text() || 'Báo Tài Chính',
                        sentiment: analyzeSentiment(title),
                        timestamp: new Date($(el).find('pubDate').text())
                    });
                }
            });
        }

        if (socialRes.data) {
            const $ = cheerio.load(socialRes.data, { xmlMode: true });
            $('item').each((i, el) => {
                if (i >= 10) return false;
                let title  = $(el).find('title').text();
                const link = $(el).find('link').text();
                let source = 'Mạng Xã Hội';
                if (link.includes('reddit.com'))   source = 'Reddit F1M';
                if (link.includes('facebook.com')) source = 'Facebook Group';
                title = title.replace(/ - .*$/, '').trim();
                if (title && title.length > 15) {
                    const isDuplicate = newArticles.some(
                        a => a.title.includes(title) || title.includes(a.title)
                    );
                    if (!isDuplicate) {
                        newArticles.push({
                            title: `[SOCIAL] ${title}`, link, source,
                            sentiment: analyzeSentiment(title),
                            timestamp: new Date($(el).find('pubDate').text())
                        });
                    }
                }
            });
        }

        if (newArticles.length === 0) {
            console.log(chalk.yellow('[CẢNH BÁO] Không lấy được bài nào từ RSS. Dừng.'));
            return;
        }

        const existingLinks = new Set(
            (await DerivNews.find({}, { link: 1 }).lean()).map(d => d.link)
        );
        const brandNewArticles = newArticles.filter(a => !existingLinks.has(a.link));
        const alreadyHave      = newArticles.length - brandNewArticles.length;

        console.log(chalk.cyan(
            `[CRON] RSS: ${newArticles.length} bài | Đã có: ${alreadyHave} | Mới: ${brandNewArticles.length}`
        ));

        if (brandNewArticles.length === 0) {
            // ── FIX rotate bug: thay vì insert lại bài cũ vừa xóa,
            console.log(chalk.gray('[CRON] Không có bài mới. Giữ nguyên DB, chờ cron tiếp theo.'));
        } else {
            const articlesWithContent = await scrapeWithConcurrencyLimit(brandNewArticles, 3);

            let addedCount = 0;
            for (const article of articlesWithContent) {
                try {
                    await DerivNews.create(article);
                    addedCount++;
                } catch (err) {
                    if (err.code === 11000) {
                    } else {
                        console.log(chalk.yellow(`[CRON] Lỗi insert "${article.title}": ${err.message}`));
                    }
                }
            }
            console.log(chalk.green(`[CRON] Đã thêm ${addedCount} tin tức mới vào DB.`));
        }

        const count = await DerivNews.countDocuments();
        if (count > 30) {
            const top30 = await DerivNews.find().sort({ timestamp: -1 }).limit(30).select('_id').lean();
            const top30Ids = top30.map(d => d._id);
            const deleted = await DerivNews.deleteMany({ _id: { $nin: top30Ids } });
            if (deleted.deletedCount > 0)
                console.log(chalk.gray(`[CRON] Đã dọn ${deleted.deletedCount} tin cũ.`));
        }

        lastNewsSyncTime = new Date();
    } catch (error) {
        console.error('[CRON-LỖI]', error.message);
    }
};

// ─── Start  ────────────────────────────
export const startCronJobs = () => {
    fetchAndSaveNews().catch(err =>
        console.error(chalk.red('[CRON] Lỗi fetch lần đầu boot:'), err.message)
    );

    cron.schedule('0 */6 * * *', fetchAndSaveNews);
    console.log('[CRON] Đã lên lịch lấy dữ liệu tin vĩ mô mỗi 6h.');
};