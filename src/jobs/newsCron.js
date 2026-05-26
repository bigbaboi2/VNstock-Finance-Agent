import axios from 'axios';
import * as cheerio from 'cheerio';
import cron from 'node-cron';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import DerivNews from '../../models/DerivNews.js';
import { scrapeArticleContent } from '../scrapers/contentScraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export let lastNewsSyncTime = new Date();

const analyzeSentiment = (title) => {
    const text = title.toLowerCase();
    if ((text.includes('nhnn') || text.includes('ngân hàng nhà nước')) && 
        (text.includes('tuýt còi') || text.includes('yêu cầu xử lý') || text.includes('giữ lãi suất') || text.includes('ổn định lãi suất'))) {
        return 'positive';
    }
    if (text.includes('giảm lãi suất') || text.includes('hạ lãi suất') || text.includes('hút ròng giảm')) return 'positive';
    if (text.includes('tăng lãi suất') && !text.includes('nhnn') && !text.includes('ngân hàng nhà nước')) return 'negative';
    if (text.includes('hút ròng mạnh')) return 'negative';

    const positiveWords = ['tăng', 'bình ổn', 'vượt đỉnh', 'bơm', 'hạ nhiệt', 'kỷ lục', 'phục hồi', 'tích cực', 'nới lỏng', 'phát triển', 'phao cứu sinh'];
    const negativeWords = ['giảm', 'gây áp lực', 'thủng', 'bán tháo', 'rút ròng', 'hút ròng', 'căng thẳng', 'phá giá', 'tiêu cực', 'bắt bớ'];
    
    if (negativeWords.some(w => text.includes(w))) return 'negative';
    if (positiveWords.some(w => text.includes(w))) return 'positive';
    return 'neutral';
};

export const fetchAndSaveNews = async () => {
    console.log('🔄 [CRON - ACTION] Đang cào tin tức Vĩ mô, Reddit & Facebook...');
    try {
        const mainUrl = `https://news.google.com/rss/search?q=tỷ+giá+OR+lãi+suất+OR+VN30+OR+phái+sinh+OR+NHNN&hl=vi&gl=VN&ceid=VN:vi`;
        const socialUrl = `https://news.google.com/rss/search?q=phái+sinh+VN30+(site:reddit.com+OR+site:facebook.com)&hl=vi&gl=VN&ceid=VN:vi`;
        
        const [mainRes, socialRes] = await Promise.all([
            axios.get(mainUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 })
                 .catch((err) => { console.log(chalk.red('❌ LỖI GOOGLE NEWS 1: ' + err.message)); return { data: '' }; }),
            axios.get(socialUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 })
                 .catch((err) => { console.log(chalk.red('❌ LỖI GOOGLE NEWS 2: ' + err.message)); return { data: '' }; })
        ]);
        
        const newArticles = [];
 
        if (mainRes.data) {
            const $ = cheerio.load(mainRes.data, { xmlMode: true });
            $('item').each((i, el) => {
                if (i < 12) {
                    const title = $(el).find('title').text();
                    if (title && title.length > 20) {
                        newArticles.push({
                            title: title, link: $(el).find('link').text(),
                            source: $(el).find('source').text() || 'Báo Tài Chính',
                            sentiment: analyzeSentiment(title),
                            timestamp: new Date($(el).find('pubDate').text())
                        });
                    }
                }
            });
        }
 
        if (socialRes.data) {
            const $ = cheerio.load(socialRes.data, { xmlMode: true });
            $('item').each((i, el) => {
                if (i < 10) {
                    let title = $(el).find('title').text();
                    const link = $(el).find('link').text();
                    let source = 'Mạng Xã Hội';
                    if (link.includes('reddit.com')) source = 'Reddit F1M';
                    if (link.includes('facebook.com')) source = 'Facebook Group';
                    title = title.replace(/ - .*$/, '').trim();
                    if (title && title.length > 15) {
                        const isDuplicate = newArticles.some(a => a.title.includes(title) || title.includes(a.title));
                        if (!isDuplicate) {
                            newArticles.push({
                                title: `[SOCIAL] ${title}`, link: link, source: source,
                                sentiment: analyzeSentiment(title),
                                timestamp: new Date($(el).find('pubDate').text())
                            });
                        }
                    }
                }
            });
        }
 
        if (newArticles.length === 0) {
            console.log(chalk.yellow('⚠️ [CRON] Không lấy được bài nào từ RSS. Dừng.'));
            return;
        }

        let addedCount = 0;
        const existingLinks = new Set((await DerivNews.find({}, { link: 1 })).map(d => d.link));
        const brandNewArticles = newArticles.filter(a => !existingLinks.has(a.link));
        const alreadyHave = newArticles.length - brandNewArticles.length;
 
        console.log(chalk.cyan(`ℹ️  [CRON] RSS trả về ${newArticles.length} bài. Đã có: ${alreadyHave}. Bài mới thực sự: ${brandNewArticles.length}`));
 
        if (brandNewArticles.length === 0) {
            const dbCount = await DerivNews.countDocuments();
            if (dbCount >= 20) {
                const oldest = await DerivNews.find().sort({ timestamp: 1 }).limit(5).select('_id link');
                const oldIds = oldest.map(d => d._id);
                const oldLinks = new Set(oldest.map(d => d.link));
                await DerivNews.deleteMany({ _id: { $in: oldIds } });
                console.log(chalk.yellow(`♻️  [CRON] Không có tin mới. Đã rotate xoá ${oldIds.length} tin cũ nhất để làm mới feed.`));
                for (const article of newArticles.filter(a => oldLinks.has(a.link)).slice(0, 5)) {
                    if (article.source !== 'Reddit F1M' && article.source !== 'Facebook Group') {
                        try { article.content = await scrapeArticleContent(article.link) || article.title; }
                        catch (e) { article.content = article.title; }
                    } else { article.content = article.title; }
                    await DerivNews.create(article);
                    addedCount++;
                }
            }
        } else {
            for (const article of brandNewArticles) {
                if (article.source !== 'Reddit F1M' && article.source !== 'Facebook Group') {
                    try { article.content = await scrapeArticleContent(article.link) || article.title; }
                    catch (e) { article.content = article.title; }
                } else { article.content = article.title; }
                await DerivNews.create(article);
                addedCount++;
            }
        }
 
        try {
            const latestForExport = await DerivNews.find().sort({ timestamp: -1 }).limit(20).lean();
            const localTestPath = path.join(__dirname, '../../deriv_news_local_test.json');
            fs.writeFileSync(localTestPath, JSON.stringify(latestForExport, null, 2), 'utf-8');
            const withContent = latestForExport.filter(a => a.content && a.content !== a.title).length;
            console.log(chalk.bgCyan.black.bold(` 📂 [TEST LOCAL] Đã xuất ${latestForExport.length} tin (${withContent} có full content) → ${localTestPath} `));
        } catch (fsErr) {
            console.error('❌ Lỗi ghi file test local:', fsErr.message);
        }
 
        console.log(`✅ [CRON] Đã nạp và cào full text ${addedCount} tin tức.`);
 
        const count = await DerivNews.countDocuments();
        if (count > 30) {
            const top30 = await DerivNews.find().sort({ timestamp: -1 }).limit(30).select('_id');
            const top30Ids = top30.map(doc => doc._id);
            await DerivNews.deleteMany({ _id: { $nin: top30Ids } });
        }
        lastNewsSyncTime = new Date();
    } catch (error) {
        console.error('❌ [CRON - LỖI]', error.message);
    }
};
 
export const startCronJobs = () => {
    cron.schedule('0 */6 * * *', fetchAndSaveNews);
    console.log('⏳ [CRON] Đã lên lịch lấy dữ liệu tin vĩ mô (Chu kỳ 6h).');
};