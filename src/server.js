import { analyzeWithGemini, getMarkdownFromTcbsPdf, searchNewsWithAI, getQuickActionWithGemini, analyzeDerivativesWithGemini, chatWithStockAI } from './services/aiService.js';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import chalk from 'chalk';
import path from 'path';
import axios from 'axios';
import fs from 'fs';
import { fetchCafefData } from './fetchers/cafefService.js';
import { fetchTcbsData } from './fetchers/tcbsService.js';
import { searchVnNewsDirectly } from './scrapers/vnNewsSearch.js';
import { scrapeArticleContent } from './scrapers/contentScraper.js';
import { getCachedData, saveToCache } from './services/cacheService.js';
import { updateSymbolsDatabase } from './services/symbolUpdater.js';
import mongoose from 'mongoose';
import Stock from '../models/Stock.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { scrapeCafefMarketOverview } from './scrapers/cafefMarketScraper.js';
import { analyzeMarketIntelligence } from './services/quantEngine.js';
import User from '../models/User.js';
import Portfolio from '../models/Portfolio.js';
import { updateCryptoSymbols } from './services/cryptoSymbolUpdater.js';
import CryptoCoin from '../models/CryptoCoin.js';
import { registerCryptoRoutes } from './services/cryptoService.js';
import cron from 'node-cron';
import * as cheerio from 'cheerio';
import DerivNews from '../models/DerivNews.js';

const app = express();
const PORT = 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log(chalk.bgGreen.black.bold(' ✔ KẾT NỐI MONGODB THÀNH CÔNG BẰNG LINK BYPASS ')))
    .catch(err => console.error(chalk.red('❌ Lỗi kết nối MongoDB:'), err));

const corsOptions = {
  origin: ['https://your-frontend.example.com', 'http://localhost:5173'],
  optionsSuccessStatus: 200,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
};

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 250, 
  message: 'Wait some minutes, server crashing!'
});

app.use(limiter);
app.use(cors(corsOptions)); 
app.use(express.json());

registerCryptoRoutes(app);

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
let lastNewsSyncTime = new Date();
const fetchAndSaveNews = async () => {
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
                            title: title,
                            link: $(el).find('link').text(),
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
                        const isDuplicate = newArticles.some(a =>
                            a.title.includes(title) || title.includes(a.title)
                        );
                        if (!isDuplicate) {
                            newArticles.push({
                                title: `[SOCIAL] ${title}`,
                                link: link,
                                source: source,
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
        const existingLinks = new Set(
            (await DerivNews.find({}, { link: 1 })).map(d => d.link)
        );
 
        //Separate actual new cards from existing cards
        const brandNewArticles = newArticles.filter(a => !existingLinks.has(a.link));
        const alreadyHave = newArticles.length - brandNewArticles.length;
 
        console.log(chalk.cyan(`ℹ️  [CRON] RSS trả về ${newArticles.length} bài. Đã có: ${alreadyHave}. Bài mới thực sự: ${brandNewArticles.length}`));
 
        //If there are no new posts → force-rotate: delete the oldest post to make room
        if (brandNewArticles.length === 0) {
            const dbCount = await DerivNews.countDocuments();
            if (dbCount >= 20) {
                //Get the 5 oldest messages and delete them
                const oldest = await DerivNews.find().sort({ timestamp: 1 }).limit(5).select('_id link');
                const oldIds = oldest.map(d => d._id);
                const oldLinks = new Set(oldest.map(d => d.link));
                await DerivNews.deleteMany({ _id: { $in: oldIds } });
                console.log(chalk.yellow(`♻️  [CRON] Không có tin mới. Đã rotate xoá ${oldIds.length} tin cũ nhất để làm mới feed.`));
                //Re-add articles from the current batch whose link was just removed (to actually have data)
                for (const article of newArticles.filter(a => oldLinks.has(a.link)).slice(0, 5)) {
                    if (article.source !== 'Reddit F1M' && article.source !== 'Facebook Group') {
                        try { article.content = await scrapeArticleContent(article.link) || article.title; }
                        catch (e) { article.content = article.title; }
                    } else {
                        article.content = article.title;
                    }
                    await DerivNews.create(article);
                    addedCount++;
                }
            } else {
                console.log(chalk.yellow(`[CRON] DB có ${dbCount} tin, không cần rotate.`));
            }
        } else {
           //There is real news → scrape content and save
            for (const article of brandNewArticles) {
                if (article.source !== 'Reddit F1M' && article.source !== 'Facebook Group') {
                    try { article.content = await scrapeArticleContent(article.link) || article.title; }
                    catch (e) { article.content = article.title; }
                } else {
                    article.content = article.title;
                }
                await DerivNews.create(article);
                addedCount++;
            }
        }
 
        //=======================================================================
        //FIX 2: EXPORT FILE TEST AFTER SCRAPE — has enough content
        //Fix: retrieve from DB after saving (including scratched content)
        //=======================================================================
        try {
            const latestForExport = await DerivNews.find().sort({ timestamp: -1 }).limit(20).lean();
            const localTestPath = path.join(__dirname, 'deriv_news_local_test.json');
            fs.writeFileSync(localTestPath, JSON.stringify(latestForExport, null, 2), 'utf-8');
            const withContent = latestForExport.filter(a => a.content && a.content !== a.title).length;
            console.log(chalk.bgCyan.black.bold(` 📂 [TEST LOCAL] Đã xuất ${latestForExport.length} tin (${withContent} có full content) → ${localTestPath} `));
        } catch (fsErr) {
            console.error('❌ Lỗi ghi file test local:', fsErr.message);
        }
 
        console.log(`✅ [CRON] Đã nạp và cào full text ${addedCount} tin tức.`);
 
        //Keep up to 30 messages in the DB
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
 
///launch cronjob
export const startCronJobs = () => {
        cron.schedule('0 */6 * * *', fetchAndSaveNews);

    console.log('⏳ [CRON] Đã lên lịch lấy dữ liệu tin vĩ mô (Chu kỳ 6h).');
};
//========================================================
//API: SYSTEM AUTHENTICATION PORT (AUTH)
//========================================================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const cleanUsername = username.trim();
        const escaped = cleanUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') } });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Username này đã có người sử dụng! Vui lòng chọn tên khác.' });
        }

        const newUser = new User({ username: cleanUsername, password });
        await newUser.save();
        return res.json({ success: true, message: 'Tạo tài khoản thành công!' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi server khi đăng ký hệ thống.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const cleanUsername = username.trim();

        const user = await User.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') } });
        if (!user || user.password !== password) {
            return res.status(400).json({ success: false, message: 'Tài khoản không tồn tại hoặc mật khẩu truy cập sai!' });
        }

        return res.json({ success: true, username: user.username });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi server khi đăng nhập.' });
    }
});

//==========================================
//API: SYMBOLS & INFO
//==========================================
app.get('/api/symbols', async (req, res) => {
    try {
        let symbolsData = await Stock.find({});
        
        if (!symbolsData || symbolsData.length === 0) {
            symbolsData = await updateSymbolsDatabase();
        }
        
        return res.json(symbolsData);
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi đọc danh sách mã từ hệ thống Cloud MongoDB.' });
    }
});

app.get('/api/info/:ticker', async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    
    const cached = getCachedData(ticker);
    if (cached && cached.timestamp && (Date.now() - cached.timestamp < 900000)) {
        return res.json({ success: true, logs: ['[OK] Đã tải dữ liệu từ bộ nhớ đệm cục bộ'], data: cached.data });
    }

    try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - (15 * 24 * 60 * 60);
        let systemLogs = [];

        const [dnseRes, cafefRes, tcbsRes] = await Promise.all([
            axios.get(`https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${from}&to=${to}&symbol=${ticker}&resolution=1D`).catch(() => null),
            fetchCafefData(ticker),
            fetchTcbsData(ticker)
        ]);

        if (cafefRes.logs) systemLogs.push(...cafefRes.logs);
        if (tcbsRes.logs) systemLogs.push(...tcbsRes.logs);

        let currentPrice = 0, change = 0, changePercent = 0, totalVolume = '---', dnseVol = 0;
        const dnseData = dnseRes?.data || {};

        if (dnseData.t && dnseData.t.length > 0) {
            const len = dnseData.c.length;
            currentPrice = dnseData.c[len - 1] * 1000; 
            const prevPrice = (dnseData.c[len - 2] || dnseData.c[len - 1]) * 1000;
            change = currentPrice - prevPrice;
            changePercent = prevPrice ? (change / prevPrice) * 100 : 0;
            dnseVol = dnseData.v[len - 1] || 0;
            totalVolume = dnseVol.toLocaleString('vi-VN');
        }

        const buyVolume = dnseVol ? Math.floor(dnseVol * 0.6).toLocaleString('vi-VN') : '---';
        const sellVolume = dnseVol ? Math.floor(dnseVol * 0.4).toLocaleString('vi-VN') : '---';

        let eps = '---', pb = '---', bvps = '---';
        if (cafefRes.rawData && cafefRes.rawData.finance) {
            const fData = cafefRes.rawData.finance;
            eps = fData.find(item => item.Code === "EPScoBan")?.Value || eps;
            pb = fData.find(item => item.Text?.includes("P/B") || item.Code === "Beta")?.Value || pb;
            bvps = fData.find(item => item.Code === "GiaTriSoSach")?.Value || bvps;
        }   

        let companyFullName = cafefRes.companyName || ticker;
        try {
            const foundSymbol = await Stock.findOne({ symbol: ticker });
            if (foundSymbol && (foundSymbol.companyName || foundSymbol.name)) {
                companyFullName = foundSymbol.companyName || foundSymbol.name;
            }
        } catch(e) {}

        let masterRecord = await Stock.findOne({ symbol: ticker });
        if (!masterRecord) masterRecord = new Stock({ symbol: ticker });

        masterRecord.companyName = companyFullName;
        masterRecord.exchange = cafefRes.exchange || 'VNX';
        masterRecord.lastUpdated = new Date();
        masterRecord.cafeF = cafefRes.rawData || null;
        masterRecord.tcbs = tcbsRes.rawData || null;

        await masterRecord.save();

        const responseData = {
            stockInfo: { symbol: ticker, currentPrice: currentPrice ? currentPrice.toLocaleString('vi-VN') : '---', change, changePercent, marketCap: cafefRes.mktCap || '---', pe: cafefRes.pe || '---', eps, pb, bvps, totalVolume, buyVolume, sellVolume, companyName: companyFullName, exchange: cafefRes.exchange || 'VNX' },
           companyProfile: {
            companyName:     companyFullName,
            overview:        cafefRes.overview || 'Hệ thống đang cập nhật...',
            marketCap:       cafefRes.mktCap || '---',
            peRatio:         cafefRes.pe || '---',
            exchange:        cafefRes.exchange || '---',
            industry:        cafefRes.profileData?.industry || null,
            listing_date:    cafefRes.profileData?.listingDate || null,
            charter_capital: cafefRes.profileData?.capital || null,
            shares_listed:   cafefRes.profileData?.sharesListed || null,
            address:         cafefRes.profileData?.address || null,
            phone:           cafefRes.profileData?.phone || null,
            email:           cafefRes.profileData?.email || null,
            website:         cafefRes.profileData?.website || null,
            description:     cafefRes.profileData?.description || null,
        },
            reportPdf: tcbsRes.validPdfUrl || null
        };

        saveToCache(ticker, responseData);
        return res.json({ success: true, logs: systemLogs, data: responseData });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/crypto-symbols', async (req, res) => {
    try {
        let coins = await CryptoCoin.find({}).sort({ marketCap: -1 });
        
        if (coins.length === 0) {
            coins = await updateCryptoSymbols();
        }
        
        return res.json(coins);
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

//========================================================
//API: VIRTUAL TRADING SYSTEM  
//========================================================
app.get('/api/portfolio/:username', async (req, res) => {
    try {
        let portfolio = await Portfolio.findOne({ username: req.params.username });
        if (!portfolio) {
            portfolio = new Portfolio({ username: req.params.username });
            await portfolio.save();
        }
        res.json({ success: true, data: portfolio });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/portfolio/cancel-order', async (req, res) => {
    const { username, orderId } = req.body;
    
    try {
        let portfolio = await Portfolio.findOne({ username });
        if (!portfolio) return res.status(404).json({ success: false, message: 'Không tìm thấy ví!' });

        const orderIndex = portfolio.pendingOrders.findIndex(o => o._id?.toString() === orderId);
        if (orderIndex === -1) {
            return res.status(400).json({ success: false, message: 'Lệnh không tồn tại hoặc đã được khớp từ trước!' });
        }

        const orderToCancel = portfolio.pendingOrders[orderIndex];

        if (orderToCancel.type === 'BUY') {
            const blockedValue = orderToCancel.volume * orderToCancel.targetPrice;
            portfolio.balance += blockedValue;
        }

        portfolio.pendingOrders.splice(orderIndex, 1);
        await portfolio.save();

        res.json({ success: true, data: portfolio, message: 'Đã hủy lệnh thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/portfolio/trade', async (req, res) => {
    const { username, assetType, symbol, type, orderType, volume, price, isMarketOpen } = req.body;
    
    try {
        let portfolio = await Portfolio.findOne({ username });
        if (!portfolio) return res.status(404).json({ success: false, message: 'Không tìm thấy ví!' });

        const totalValue = volume * price;

        if (!isMarketOpen || orderType === 'ATO' || orderType === 'ATC' || orderType === 'LO') {
            if (type === 'BUY') {
                const updatedPortfolio = await Portfolio.findOneAndUpdate(
                        { username, balance: { $gte: totalValue } },
                        { $inc: { balance: -totalValue } },
                        { new: true }
                );
                if (!updatedPortfolio) {
                    return res.status(400).json({ success: false, message: 'Số dư không đủ để đặt lệnh chờ!' });                
                }                
                portfolio = updatedPortfolio;
            }
            if (type === 'SELL') {
                const holding = portfolio.holdings.find(h => h.symbol === symbol);
                if (!holding || holding.volume < volume) {
                    return res.status(400).json({ success: false, message: 'Không đủ cổ phiếu khả dụng để đặt bán!' });
                }
            }

            await Portfolio.updateOne(
                { username },
                {
                    $push: {
                        pendingOrders: {
                            assetType,
                            symbol,
                            type,
                            orderType,
                            volume,
                            targetPrice: price,
                            status: 'PENDING'
                        }
                    }
                }
            );

            portfolio = await Portfolio.findOne({ username });
            return res.json({ success: true, isPending: true, data: portfolio, message: `Lệnh ${type} ${orderType} đã được đưa vào Sổ Lệnh chờ khớp!` });
        }

        let holdingIndex = portfolio.holdings.findIndex(h => h.symbol === symbol && h.assetType === assetType);
        let realizedPnL = 0;

        if (type === 'BUY') {
            const existingHolding = portfolio.holdings.find(h => h.symbol === symbol && h.assetType === assetType);
            if (existingHolding) {
                const oldVol = existingHolding.volume;
                const oldAvg = existingHolding.avgPrice;
                const newVol = oldVol + volume;
                const newAvg = ((oldVol * oldAvg) + totalValue) / newVol;

                const updatedPortfolio = await Portfolio.findOneAndUpdate(
                    {
                        username,
                        balance: { $gte: totalValue },
                        "holdings.symbol": symbol,
                        "holdings.assetType": assetType
                    },
                    {
                        $inc: { balance: -totalValue, "holdings.$.volume": volume },
                        $set: { "holdings.$.avgPrice": newAvg }
                    },
                    { new: true }
                );

                if (!updatedPortfolio) {
                    return res.status(400).json({ success: false, message: 'Số dư không đủ để mua!' });
                }
                portfolio = updatedPortfolio;
            } else {
                const updatedPortfolio = await Portfolio.findOneAndUpdate(
                    {
                        username,
                        balance: { $gte: totalValue }
                    },
                    {
                        $inc: { balance: -totalValue },
                        $push: {
                            holdings: { assetType, symbol, volume, avgPrice: price }
                        }
                    },
                    { new: true }
                );

                if (!updatedPortfolio) {
                    return res.status(400).json({ success: false, message: 'Số dư không đủ để mua!' });
                }
                portfolio = updatedPortfolio;
            }
        }
        else if (type === 'SELL') {
            const updatedPortfolio = await Portfolio.findOneAndUpdate(
                {
                    username,
                    holdings: {
                        $elemMatch: {
                            symbol,
                            assetType,
                            volume: { $gte: volume }
                        }
                    }
                },
                {
                    $inc: { "holdings.$.volume": -volume, balance: totalValue }
                },
                { new: true }
            );

            if (!updatedPortfolio) {
                return res.status(400).json({ success: false, message: 'Không đủ số lượng tài sản để bán!' });
            }

            portfolio = updatedPortfolio;
            holdingIndex = portfolio.holdings.findIndex(h => h.symbol === symbol && h.assetType === assetType);
            const avgPrice = portfolio.holdings[holdingIndex]?.avgPrice || 0;
            realizedPnL = (price - avgPrice) * volume;

            if (holdingIndex >= 0 && portfolio.holdings[holdingIndex].volume <= 0) {
                portfolio.holdings.splice(holdingIndex, 1);
            }
        }

        portfolio.history.push({ assetType, symbol, type, volume, price, totalValue, realizedPnL });
        await portfolio.save();

        res.json({ success: true, isPending: false, data: portfolio, message: `Khớp lệnh MP ${type} thành công!` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
//========================================================
//API: BACKGROUND ORDER MATCHING
//========================================================
setInterval(async () => {
    try {
        const now = new Date();
        const day = now.getDay();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const totalMinutes = hours * 60 + minutes;

        const isVnMarketOpen = day >= 1 && day <= 5 && totalMinutes >= 540 && totalMinutes <= 900;

        const portfolios = await Portfolio.find({ "pendingOrders": { $exists: true, $not: {$size: 0} } });
        if (portfolios.length === 0) return;

        const uniqueSymbols = new Set();
        portfolios.forEach(p => {
            p.pendingOrders.forEach(order => {
                if (order.status === 'PENDING') uniqueSymbols.add(order.symbol);
            });
        });

        if (uniqueSymbols.size === 0) return;

        const livePrices = {};
        const to = Math.floor(Date.now() / 1000);
        const from = to - (24 * 60 * 60);

        await Promise.all(Array.from(uniqueSymbols).map(async (symbol) => {
            try {
                const res = await axios.get(`https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${from}&to=${to}&symbol=${symbol}&resolution=1`);
                const c = res.data?.c || [];
                if (c.length > 0) {
                    livePrices[symbol] = c[c.length - 1] * 1000; 
                }
            } catch (e) {}
        }));

        for (let portfolio of portfolios) {
            let isUpdated = false;
            for (let i = portfolio.pendingOrders.length - 1; i >= 0; i--) {
                const order = portfolio.pendingOrders[i];
                if (order.status !== 'PENDING') continue;

                if (order.assetType === 'VN_STOCKS' || order.assetType === 'VN_DERIVATIVES') {
                    if (!isVnMarketOpen) continue; 
                }

                const currentPrice = livePrices[order.symbol];
                if (!currentPrice) continue;

                let isMatched = false;
                if (order.type === 'BUY' && currentPrice <= order.targetPrice) isMatched = true; 
                else if (order.type === 'SELL' && currentPrice >= order.targetPrice) isMatched = true; 

                if (isMatched) {
                    const totalValue = order.volume * currentPrice;
                    let holdingIndex = portfolio.holdings.findIndex(h => h.symbol === order.symbol);
                    
                    if (order.type === 'BUY') {
                        if (holdingIndex >= 0) {
                            const oldVol = portfolio.holdings[holdingIndex].volume;
                            const oldAvg = portfolio.holdings[holdingIndex].avgPrice;
                            const newVol = oldVol + order.volume;
                            portfolio.holdings[holdingIndex].avgPrice = ((oldVol * oldAvg) + totalValue) / newVol;
                            portfolio.holdings[holdingIndex].volume = newVol;
                        } else {
                            portfolio.holdings.push({ assetType: order.assetType, symbol: order.symbol, volume: order.volume, avgPrice: currentPrice });
                        }
                    } else if (order.type === 'SELL') {
                        portfolio.balance += totalValue;
                        let realizedPnL = 0;
                        if (holdingIndex >= 0) {
                            const avgPrice = portfolio.holdings[holdingIndex].avgPrice;
                            realizedPnL = (currentPrice - avgPrice) * order.volume;
                            portfolio.holdings[holdingIndex].volume -= order.volume;
                            if (portfolio.holdings[holdingIndex].volume === 0) portfolio.holdings.splice(holdingIndex, 1);
                        }
                        portfolio.history.push({ assetType: order.assetType, symbol: order.symbol, type: 'SELL', volume: order.volume, price: currentPrice, totalValue, realizedPnL });
                    }

                    if (order.type === 'BUY') {
                        portfolio.history.push({ assetType: order.assetType, symbol: order.symbol, type: 'BUY', volume: order.volume, price: currentPrice, totalValue, realizedPnL: 0 });
                    }

                    portfolio.pendingOrders.splice(i, 1);
                    isUpdated = true;
                }
            }
            if (isUpdated) await portfolio.save();
        }
    } catch (error) {}
}, 10000);
//==========================================
//API: GENERAL MARKET RADAR
//==========================================
app.get('/api/market-radar', async (req, res) => {
    try {
        const now = new Date();
        const day = now.getDay(); 
        const totalMinutes = now.getHours() * 60 + now.getMinutes();
        
        const isMarketOpen = day >= 1 && day <= 5 && totalMinutes >= 540 && totalMinutes <= 900;

        if (!isMarketOpen) {
            const cachedMarketRecord = await Stock.findOne({ symbol: 'VNINDEX' });
            
            if (cachedMarketRecord && cachedMarketRecord.cafeF?.lastQuantIntelligence) {
                return res.json({ 
                    success: true, 
                    isLive: false, 
                    data: cachedMarketRecord.cafeF.lastQuantIntelligence 
                });
            }
        }

        const scrapedData = await scrapeCafefMarketOverview();
        if (!scrapedData.success) throw new Error("Không thể trích xuất dữ liệu từ CafeF");

        const to = Math.floor(Date.now() / 1000);
        const from = to - (15 * 24 * 60 * 60);
        const vnRes = await axios.get(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${from}&to=${to}&symbol=VNINDEX&resolution=1D`);
        
        if (!vnRes.data || !vnRes.data.t) throw new Error("Mất kết nối dữ liệu VN-INDEX");

        const d = vnRes.data;
        const formattedVnIndex = d.t.map((timestamp, index) => ({
            close: Number(d.c[index]),
            volume: Number(d.v[index]) || 0 
        }));

        const symbolsDatabase = await Stock.find({});
        const finalIntelligence = analyzeMarketIntelligence(formattedVnIndex, scrapedData, symbolsDatabase);

        if (!finalIntelligence.success) throw new Error(finalIntelligence.error);

        let vnIndexRecord = await Stock.findOne({ symbol: 'VNINDEX' });
        if (!vnIndexRecord) vnIndexRecord = new Stock({ symbol: 'VNINDEX' });
        
        if (!vnIndexRecord.cafeF) vnIndexRecord.cafeF = {};
        vnIndexRecord.cafeF.lastQuantIntelligence = finalIntelligence.intelligence;
        vnIndexRecord.markModified('cafeF'); 
        await vnIndexRecord.save();

        return res.json({ success: true, isLive: true, data: finalIntelligence.intelligence });

    } catch (error) {
        const fallback = await Stock.findOne({ symbol: 'VNINDEX' });
        if (fallback && fallback.cafeF?.lastQuantIntelligence) {
            return res.json({ success: true, isLive: false, data: fallback.cafeF.lastQuantIntelligence });
        }
        return res.status(500).json({ success: false, message: error.message });
    }
});
//========================================================
//API: AUTOMATIC VN DERIVATIVES NEWS
//========================================================
app.get('/api/deriv-news', async (req, res) => {
    try {
        let newsList = await DerivNews.find().sort({ timestamp: -1 }).limit(20);
        
        if (!newsList || newsList.length === 0) {
            console.log(chalk.yellow('📭 [HỆ THỐNG] Kho dữ liệu tin trống. Đang tải tin tức mới nhất...'));
            await fetchAndSaveNews();            
            newsList = await DerivNews.find().sort({ timestamp: -1 }).limit(20);
        }
        
        res.json({ success: true, data: newsList });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi lấy tin tức' });
    }
});
//GATE 2: GET MORE NEWS
app.post('/api/deriv-news/refresh', async (req, res) => {
    try {
        await fetchAndSaveNews(); 
        const newsList = await DerivNews.find().sort({ timestamp: -1 }).limit(20);
        
         res.json({ 
            success: true, 
            data: newsList, 
            lastSave: lastNewsSyncTime.toLocaleTimeString('vi-VN') 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
///add new fixes, calculate due date,...
function getExpiryInfo() {
    const now = new Date();
    const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
 
    const getThirdThursdayOfMonth = (year, month) => {
        //month: 0-indexed
        const d = new Date(year, month, 1);
        const dayOfWeek = d.getDay(); //0=Sun, 4=Autumn
        //First Thursday
        const firstThursday = ((4 - dayOfWeek + 7) % 7) + 1;
        return new Date(year, month, firstThursday + 14); //+14 = week 3
    };
 
    let year  = vnNow.getFullYear();
    let month = vnNow.getMonth();
    let expiry = getThirdThursdayOfMonth(year, month);
 
    //this month's due date has passed ==> get next month
    if (vnNow >= expiry) {
        month = month + 1;
        if (month > 11) { month = 0; year++; }
        expiry = getThirdThursdayOfMonth(year, month);
    }
 
    const diffMs   = expiry - vnNow;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
 
    return {
        expiryDate:  expiry.toISOString().split('T')[0],
        daysToExpiry: diffDays,
        label: `${expiry.getDate()}/${expiry.getMonth() + 1}/${expiry.getFullYear()} (còn ${diffDays} ngày)`
    };
}
 
//─── HELPER: Fetch DXY + Dow Futures từ Yahoo Finance ───
async function fetchGlobalMarketContext() {
    const result = {
        dxy:        { value: null, change: null, changePercent: null },
        dowFutures: { value: null, change: null, changePercent: null },
        sp500:      { value: null, change: null, changePercent: null },
        fetchedAt:  new Date().toISOString(),
        fetchStatus: 'ok'
    };
 
    try {
        //Yahoo Finance v8 -get realtime quotes, no API key needed
        //DX-Y.NYB = DXY Index | YM=F = Dow Futures | ES=F = S&P500 Futures
        const symbols = ['DX-Y.NYB', 'YM=F', 'ES=F'];
        const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent`;
 
        const yahooRes = await axios.get(yahooUrl, {
            timeout: 6000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
            }
        });
 
        const quotes = yahooRes.data?.quoteResponse?.result || [];
 
        quotes.forEach(q => {
            const item = {
                value:         q.regularMarketPrice?.toFixed(2)        || null,
                change:        q.regularMarketChange?.toFixed(2)       || null,
                changePercent: q.regularMarketChangePercent?.toFixed(2) || null,
            };
            if (q.symbol === 'DX-Y.NYB') result.dxy        = item;
            if (q.symbol === 'YM=F')     result.dowFutures = item;
            if (q.symbol === 'ES=F')     result.sp500      = item;
        });
 
        console.log(chalk.green(`✔ [EXPORT] Đã fetch Yahoo Finance: DXY=${result.dxy.value}, Dow=${result.dowFutures.value}, SP500=${result.sp500.value}`));
 
    } catch (err) {
        //Try fallback endpoint v8 if v7 is rate-limited
        try {
            const fallbackUrl = `https://query2.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1m&range=1d`;
            const fallRes = await axios.get(fallbackUrl, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } });
            const meta = fallRes.data?.chart?.result?.[0]?.meta;
            if (meta) {
                result.dxy = {
                    value:         (meta.regularMarketPrice || meta.previousClose || null)?.toFixed(2),
                    change:        meta.regularMarketPrice && meta.previousClose
                                    ? (meta.regularMarketPrice - meta.previousClose).toFixed(2)
                                    : null,
                    changePercent: meta.regularMarketPrice && meta.previousClose
                                    ? (((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100).toFixed(2)
                                    : null,
                };
                console.log(chalk.yellow(`⚠ [EXPORT] Yahoo v7 lỗi, fallback v8 DXY=${result.dxy.value}`));
            }
        } catch (err2) {
            result.fetchStatus = `error: ${err.message}`;
            console.log(chalk.red(`❌ [EXPORT] Không fetch được dữ liệu Yahoo: ${err.message}`));
        }
    }
 
    return result;
}

//PORT 3: EXPORT FULL DATA DERIVATIVES TAB FOR WHO TO ANALYZE
app.post('/api/deriv-export', async (req, res) => {
    try {
        const {
            derivRadar,
            derivAnalysis,
            volumeProfile,
            derivChartData,
            derivInterval,
        } = req.body;
 
        //=== FIX 3: Get news within 30 days, remove old news ===
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const latestNews = await DerivNews.find({ timestamp: { $gte: thirtyDaysAgo } })
            .sort({ timestamp: -1 })
            .limit(20)
            .lean();
 
         const allNews = latestNews.length >= 5
            ? latestNews
            : await DerivNews.find().sort({ timestamp: -1 }).limit(20).lean();
 
         const expiryInfo = getExpiryInfo();
 
         const globalMarket = await fetchGlobalMarketContext();
 
         const f1mPrice  = parseFloat(derivRadar?.vn30f1m) || 0;
        const pocPrice  = parseFloat(volumeProfile?.pocPrice) || 0;
        const pocDistancePct = (f1mPrice && pocPrice)
            ? (((f1mPrice - pocPrice) / pocPrice) * 100).toFixed(2)
            : null;
 
        //=== BUILD PAYLOAD ===
        const exportPayload = {
            metadata: {
                exportedAt:    new Date().toISOString(),
                exportedAtVN:  new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
                interval:      derivInterval || 'N/A',
                note: 'Dữ liệu đầy đủ tab Phái sinh VN30F1M — dùng để AI phân tích'
            },
 
            //=== BLOCK 1: PRICE & REALTIME SPECS ===
            liveMarket: {
                vn30f1m:        derivRadar?.vn30f1m       || null,
                vn30Index:      derivRadar?.vn30           || null,
                basis:          derivRadar?.basis          || null,
                basisSpeed:     derivRadar?.basisSpeed     || null,
                change:         derivRadar?.change         || null,
                changePercent:  derivRadar?.changePercent  || null,
                oi:             derivRadar?.oi             || null,
                oiTrend:        derivRadar?.oiTrend        || null,
                foreignNet:     derivRadar?.foreignNet     || null,
            },
 
            //=== BLOCK 2: 10 VN30 LEADER PILLARS ===
            influencers: (derivRadar?.influencers || []).map(s => ({
                symbol:     s.symbol,
                change:     s.change,
                realImpact: s.realImpact,
                momentum:   s.momentum,
            })),
            totalImpact10Tru: (derivRadar?.influencers || [])
                .reduce((sum, s) => sum + (parseFloat(s.realImpact) || 0), 0)
                .toFixed(2),
 
            //=== BLOCK 3: TECHNICAL INDEX ===
            technicalIndicators: {
                ema3:            derivAnalysis?.ema3            || null,
                ema8:            derivAnalysis?.ema8            || null,
                atr:             derivAnalysis?.atr             || null,
                vwap:            derivAnalysis?.vwap            || null,
                sessionHigh:     derivAnalysis?.sessionHigh     || null,
                sessionLow:      derivAnalysis?.sessionLow      || null,
                cvd:             derivAnalysis?.cvd             || null,
                roc5:            derivAnalysis?.roc5            || null,
                confluenceScore: derivAnalysis?.score           || null,
                shortTermTrend:  derivAnalysis?.shortTermTrend  || null,
                oiSignal:        derivAnalysis?.oiInterpretation?.label || null,
            },
 
            //=== BLOCK 4: SIGNALS & TRADING PLAN ===
            tradingPlan: {
                mechTrend:  derivAnalysis?.mechTrend   || null,
                mechAction: derivAnalysis?.mechAction   || null,
                entry:      derivRadar?.vn30f1m         || null,
                sl:         derivAnalysis?.sl            || null,
                tp1:        derivAnalysis?.tp1           || null,
                tp2:        derivAnalysis?.tp2           || null,
                rrRatio:    derivAnalysis?.rrRatio       || null,
                 mechReason: derivAnalysis?.mechReason    || null,
            },
 
            //=== BLOCK 5: VOLUME PROFILE + pocDistance ===
            volumeProfile: {
                pocPrice:     volumeProfile?.pocPrice || null,
                //FIX 2: pocDistance calculated on server
                pocDistance:  pocDistancePct ? `${pocDistancePct}%` : null,
                pocNote: pocDistancePct
                    ? (parseFloat(pocDistancePct) > 0
                        ? `Giá đang CAO hơn POC ${pocDistancePct}% — vùng kẹt lệnh làm hỗ trợ phía dưới`
                        : `Giá đang THẤP hơn POC ${Math.abs(pocDistancePct)}% — vùng kẹt lệnh làm kháng cự phía trên`)
                    : null,
                maxVol: volumeProfile?.maxVol || null,
                bins: (volumeProfile?.bins || []).map(b => ({
                    priceCenter: b.priceCenter,
                    volume:      b.volume,
                })),
            },
 
            //=== BLOCK 6: PRICE HISTORY (50 LAST CANDLES) ===
            priceHistory: (derivChartData || []).slice(-50).map(c => ({
                time:   c.time,
                open:   c.open,
                high:   c.high,
                low:    c.low,
                close:  c.close,
                volume: c.volume,
            })),
 
            //=== BLOCK 7: MACRO NEWS (last 30 days only) ===
            macroNews: allNews.map(n => ({
                title:          n.title,
                source:         n.source,
                sentiment:      n.sentiment,
                timestamp:      n.timestamp,
                link:           n.link,
                contentSnippet: n.content ? n.content.substring(0, 1500) : null,
                hasFullContent: !!(n.content && n.content !== n.title && n.content.length > 100),
                daysAgo:        Math.round((Date.now() - new Date(n.timestamp)) / (1000 * 60 * 60 * 24)),
            })),
 
            //=== BLOCK 8: SENTIMENT SUMMARY ===
            newsSentimentSummary: {
                total:           allNews.length,
                positive:        allNews.filter(n => n.sentiment === 'positive').length,
                negative:        allNews.filter(n => n.sentiment === 'negative').length,
                neutral:         allNews.filter(n => n.sentiment === 'neutral').length,
                withFullContent: allNews.filter(n => n.content && n.content !== n.title && n.content.length > 100).length,
                newsWithin30Days: latestNews.length,
            },
 
            //=== BLOCK 9 (NEW): INTER-MARKET MACRO CONTEXT ===
             macroContext: {
                //Expiry date of F1M contract
                expiryDate:   expiryInfo.expiryDate,
                daysToExpiry: expiryInfo.daysToExpiry,
                expiryLabel:  expiryInfo.label,
 
                //USD Strength (DXY)
                dxy: {
                    value:         globalMarket.dxy.value,
                    change:        globalMarket.dxy.change,
                    changePercent: globalMarket.dxy.changePercent,
                    trend: globalMarket.dxy.change
                        ? (parseFloat(globalMarket.dxy.change) > 0 ? 'TĂNG (áp lực VND)' : 'GIẢM (hỗ trợ VND)')
                        : null,
                },
 
                //Dow Jones Futures
                dowFutures: {
                    value:         globalMarket.dowFutures.value,
                    change:        globalMarket.dowFutures.change,
                    changePercent: globalMarket.dowFutures.changePercent,
                    trend: globalMarket.dowFutures.change
                        ? (parseFloat(globalMarket.dowFutures.change) > 0 ? 'TĂNG (tích cực với VN30)' : 'GIẢM (tiêu cực với VN30)')
                        : null,
                },
 
                //S&P500 Futures
                sp500Futures: {
                    value:         globalMarket.sp500.value,
                    change:        globalMarket.sp500.change,
                    changePercent: globalMarket.sp500.changePercent,
                },
 
                //Exchange rate USD/VND
                usdVnd: await (async () => {
                    try {
                        const vcbRes = await axios.get(
                            'https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=10',
                            { timeout: 4000, headers: { 'User-Agent': 'Mozilla/5.0' } }
                        );
                        //Parse simple XML
                        const match = vcbRes.data.match(/<Exrate CurrencyCode="USD"[^>]*Transfer="([^"]+)"/);
                        const rate = match ? match[1].replace(',', '') : null;
                        return {
                            official: rate ? parseFloat(rate).toLocaleString('vi-VN') : null,
                            source: 'Vietcombank',
                            note: 'Tỷ giá bán chính thức (không có API chợ đen đáng tin cậy)'
                        };
                    } catch {
                        return { official: null, source: null, note: 'Không lấy được tỷ giá' };
                    }
                })(),
 
                //When to fetch
                globalDataFetchedAt: globalMarket.fetchedAt,
                globalDataStatus:    globalMarket.fetchStatus,
            },
        };
 
        //Ghi file disk
        const exportPath = path.join(__dirname, 'deriv_full_export.json');
        fs.writeFileSync(exportPath, JSON.stringify(exportPayload, null, 2), 'utf-8');
        console.log(chalk.bgGreen.black.bold(` 📊 [EXPORT] Xuất xong → ${exportPath} | DXY=${exportPayload.macroContext.dxy.value} | Dow=${exportPayload.macroContext.dowFutures.value} | Đáo hạn còn ${exportPayload.macroContext.daysToExpiry} ngày `));
 
        res.json({ success: true, data: exportPayload, filePath: exportPath });
 
    } catch (error) {
        console.error('❌ [EXPORT] Lỗi:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});
//========================================================
//API: DERIVATIVES RADAR (DERIVATIVES)
//========================================================
let globalDerivCache = {
    oi: 54210,         
    foreignNet: -1240,
    lastBasis: 0,       
    lastOi: 54210     
};
setInterval(async () => {
    try {
        const res = await axios.get(`https://finfo-api.vndirect.com.vn/v4/derivatives_prices?q=code:VN30F1M`, { 
            timeout: 3000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Origin': 'https://dboard.vndirect.com.vn',
                'Referer': 'https://dboard.vndirect.com.vn/'
            }
        });
        
        if (res.data && res.data.data && res.data.data.length > 0) {
            const derivInfo = res.data.data[0];
            globalDerivCache.oi = derivInfo.openInterest || globalDerivCache.oi;
            const foreignBuy = derivInfo.foreignBuyVolume || 0;
            const foreignSell = derivInfo.foreignSellVolume || 0;
            globalDerivCache.foreignNet = foreignBuy - foreignSell;
        }
    } catch (error) {}
}, 60000); 

const WeightingMatrix = { 
    VCB: 1.5, FPT: 1.2, HPG: 1.1, 
    TCB: 1.0, VHM: 0.9, CTG: 0.8, 
    VIC: 0.7, STB: 0.6, 
    MSN: 0.5, VNM: 0.5 
};

app.get('/api/deriv-radar', async (req, res) => {
    try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - (4 * 24 * 60 * 60); 

        const [vn30Res, vn30f1mRes, vndirectRes] = await Promise.all([
            axios.get(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${from}&to=${to}&symbol=VN30&resolution=1`, { timeout: 2000 }).catch(() => null),
            axios.get(`https://services.entrade.com.vn/chart-api/v2/ohlcs/derivative?from=${from}&to=${to}&symbol=VN30F1M&resolution=1`, { timeout: 2000 }).catch(() => null),
            axios.get(`https://finfo-api.vndirect.com.vn/v4/derivatives_prices?q=code:VN30F1M`, { 
                timeout: 2500,  
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Origin': 'https://dboard.vndirect.com.vn',
                    'Referer': 'https://dboard.vndirect.com.vn/'
                }
            }).catch(() => null)
        ]);

        const TRU_COT_LOI = [
            'VCB', 'FPT', 'HPG', 
            'VHM', 'VIC', 'TCB', 
            'CTG', 'STB', 'MSN', 
            'VNM'
        ];
        
        const truData = await Promise.all(TRU_COT_LOI.map(async (s) => {
            try {
                const r = await axios.get(`https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${from}&to=${to}&symbol=${s}&resolution=1`, { timeout: 1200 });
                const c = r.data?.c || [];
                const h = r.data?.h || [];
                const l = r.data?.l || [];
                const v = r.data?.v || [];
                if (c.length === 0) return { symbol: s, change: 0, momentum: 0 };
                const close = c[c.length - 1];
                const high = h[h.length - 1];
                const low = l[l.length - 1];
                const prevClose = c.length > 1 ? c[c.length - 2] : close;
                const volume = v[v.length - 1] || 0;
                const change = prevClose !== 0 ? ((close - prevClose) / prevClose * 100).toFixed(2) : 0;
                
                const realImpact = (change * (WeightingMatrix[s] || 0.5)).toFixed(2);
                let mfMultiplier = 0;
                if (high !== low) mfMultiplier = ((close - low) - (high - close)) / (high - low);
                return { 
                    symbol: s, change, 
                    momentum: (mfMultiplier * (volume / 1000)).toFixed(2), 
                    realImpact 
                };
            } catch (e) {
                return { symbol: s, change: 0, momentum: 0 };
            }
        }));

        if (vndirectRes && vndirectRes.data && vndirectRes.data.data && vndirectRes.data.data.length > 0) {
            const derivInfo = vndirectRes.data.data[0];
            globalDerivCache.oi = derivInfo.openInterest || globalDerivCache.oi;
            
            const foreignBuy = derivInfo.foreignBuyVolume || 0;
            const foreignSell = derivInfo.foreignSellVolume || 0;
            globalDerivCache.foreignNet = foreignBuy - foreignSell;
        }

        const c_f1m = vn30f1mRes?.data?.c || [];
        const c_vn30 = vn30Res?.data?.c || [];
        const latestF1M = c_f1m.length > 0 ? c_f1m[c_f1m.length - 1] : 0;
        const prevF1M = c_f1m.length > 1 ? c_f1m[c_f1m.length - 2] : latestF1M;
        const vn30Price = c_vn30.length > 0 ? c_vn30[c_vn30.length - 1] : 0;
        const currentBasis = (latestF1M !== 0 && vn30Price !== 0) ? (latestF1M - vn30Price).toFixed(2) : 0;
        const basisSpeed = (currentBasis - globalDerivCache.lastBasis).toFixed(2);
        globalDerivCache.lastBasis = currentBasis;

        let oiTrend = "ĐI NGANG";
        if (globalDerivCache.oi > globalDerivCache.lastOi) oiTrend = "TĂNG (Nạp tiền gom HĐ)";
        if (globalDerivCache.oi < globalDerivCache.lastOi) oiTrend = "GIẢM (Chốt lời/Cắt lỗ)";
        globalDerivCache.lastOi = globalDerivCache.oi;

        return res.json({
            success: true,
            data: {
                vn30: vn30Price,
                vn30f1m: latestF1M,
                basis: (latestF1M !== 0 && vn30Price !== 0) ? (latestF1M - vn30Price).toFixed(2) : 0,
                basisSpeed: basisSpeed,
                oiTrend: oiTrend,      
                change: latestF1M !== 0 ? (latestF1M - prevF1M).toFixed(2) : 0,              
                changePercent: prevF1M !== 0 ? ((latestF1M - prevF1M) / prevF1M * 100).toFixed(2) : 0, 
                influencers: truData, 
                oi: globalDerivCache.oi,          
                foreignNet: globalDerivCache.foreignNet 
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

//==========================================
//API: LIVE NEWS & AI
//==========================================
app.get('/api/news/:ticker', async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'ngrok-skip-browser-warning, Content-Type');
    res.setHeader('ngrok-skip-browser-warning', 'true');
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let isClientDisconnected = false;
    req.on('close', () => { isClientDisconnected = true; });

    try {
        let masterRecord = await Stock.findOne({ symbol: ticker });
        if (!masterRecord) masterRecord = new Stock({ symbol: ticker });

        let cachedNews = masterRecord.deepNewsData || [];
        let newDeepNewsData = [];

        for (const news of cachedNews.slice(0, )) {
            if (isClientDisconnected) break;
            res.write(`data: ${JSON.stringify(news)}\n\n`);
        }

        const fetchedLinks = await searchVnNewsDirectly(ticker);
        const seenLinks = new Set(cachedNews.map(n => n.link)); 
        const uniqueNewLinks = fetchedLinks.filter(item => !seenLinks.has(item.link));

        if (uniqueNewLinks.length > 0 && !isClientDisconnected) {
            for (const news of uniqueNewLinks.slice(0, 15)) {
                if (isClientDisconnected) break;
        try {
            const content = await scrapeArticleContent(news.link);
            const validNews = {
                title: news.title,
                link: news.link,
                source: news.link,
                content: (content && content.length > 50) ? content : news.title,
                date: new Date().toLocaleDateString('vi-VN')
            };
            newDeepNewsData.push(validNews);
            res.write(`data: ${JSON.stringify(validNews)}\n\n`);
        } catch (e) {
            const fallback = { title: news.title, link: news.link, source: news.link, content: news.title, date: new Date().toLocaleDateString('vi-VN') };
            newDeepNewsData.push(fallback);
            res.write(`data: ${JSON.stringify(fallback)}\n\n`);
        }
            }
        }

        if (newDeepNewsData.length > 0) {
            masterRecord = await Stock.findOne({ symbol: ticker });
            let combinedNews = [...newDeepNewsData, ...(masterRecord.deepNewsData || [])];
            masterRecord.deepNewsData = combinedNews.slice(0, 50); 
            await masterRecord.save();
        }

        if (!isClientDisconnected) {
            res.write('event: done\ndata: {}\n\n');
            res.end();
        }
    } catch (error) {
        if (!isClientDisconnected) {
            res.write(`event: error\ndata: {}\n\n`);
            res.end();
        }
    }
});
// AI analyze button
app.post('/api/analyze-derivatives', async (req, res) => {
    try {
        const payload = req.body;
        const report = await analyzeDerivativesWithGemini(payload);
        
        res.json({ 
            success: true, 
            data: report 
        });
    } catch (error) {
        console.error('❌ Lỗi AI Phái sinh:', error);
        res.status(500).json({ success: false, message: 'Không thể kết nối AI Phái sinh' });
    }
});

app.post('/api/analyze/:ticker', async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const fullData = req.body;
    const user = fullData.user || 'Unknown';

    try {
        if (!fullData || !fullData.stockInfo) return res.status(400).json({ success: false, message: 'Thiếu dữ liệu.' });

        let masterRecord = await Stock.findOne({ symbol: ticker });
        if (!masterRecord) masterRecord = new Stock({ symbol: ticker });

        let previousAnalysis = null;
        if (masterRecord.reports && masterRecord.reports.length > 0) {
            const userReports = masterRecord.reports.filter(r => r.user === user);
            if (userReports.length > 0) {
                previousAnalysis = userReports[userReports.length - 1].content;
            }
        }
        fullData.previousAnalysis = previousAnalysis;

        try {
            const marketScraped = await scrapeCafefMarketOverview();
            
            const to = Math.floor(Date.now() / 1000);
            const from = to - (15 * 24 * 60 * 60);
            const vnRes = await axios.get(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${from}&to=${to}&symbol=VNINDEX&resolution=1D`);
            
            if (vnRes.data && vnRes.data.t && marketScraped.success) {
                const d = vnRes.data;
                const rawVnIndex = d.t.map((timestamp, index) => ({
                    close: Number(d.c[index]),
                    volume: Number(d.v[index]) || 0 
                }));

                const symbolsDb = await Stock.find({});
                const marketIntelligence = analyzeMarketIntelligence(rawVnIndex, marketScraped, symbolsDb);
                
                if (marketIntelligence.success) {
                    fullData.marketContext = marketIntelligence.intelligence;
                }
            }
        } catch (quantError) {
            fullData.marketContext = "Không có dữ liệu bối cảnh thị trường lúc này.";
        }

        const markdownData = await getMarkdownFromTcbsPdf(ticker);
        if (markdownData) fullData.tcbsMarkdownData = markdownData; 

        const aiReport = await analyzeWithGemini(ticker, fullData);
        const actionPanelData = await getQuickActionWithGemini(ticker, fullData.stockInfo, aiReport);
        let finalAction = actionPanelData?.action || 'QUAN SÁT';

        if (!masterRecord.reports) masterRecord.reports = [];
        masterRecord.reports.push({
            user: user,
            timestamp: fullData.timestamp || new Date().toISOString(),
            content: aiReport,
            action: finalAction, 
            price: fullData.stockInfo.currentPrice,
            changePercent: parseFloat(fullData.stockInfo.changePercent) || 0
        });

        if (fullData.stockInfo.companyName) masterRecord.companyName = fullData.stockInfo.companyName;
        if (fullData.stockInfo.exchange) masterRecord.exchange = fullData.stockInfo.exchange;

        await masterRecord.save();

        return res.json({ success: true, aiReport, actionPanelData: actionPanelData });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});
app.post('/api/stock-chat/:ticker', async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const { question, history = [], aiReport, user } = req.body;
 
    if (!question || !question.trim()) {
        return res.status(400).json({ success: false, message: 'Câu hỏi không được để trống.' });
    }
 
    try {
         let reportContent = aiReport || null;
 
        if (!reportContent) {
            const masterRecord = await Stock.findOne({ symbol: ticker });
            if (masterRecord?.reports?.length > 0) {
                const userReports = user
                    ? masterRecord.reports.filter(r => r.user === user)
                    : [];
                const bestReport = userReports.length > 0
                    ? userReports[userReports.length - 1]
                    : masterRecord.reports[masterRecord.reports.length - 1];
                reportContent = bestReport?.content || null;
 
                if (reportContent) {
                    console.log(chalk.cyan(`[CHAT] Đã lấy báo cáo từ DB cho ${ticker} (user: ${user || 'any'})`));
                } else {
                    console.log(chalk.yellow(`[CHAT] Không tìm thấy báo cáo cho ${ticker} trong DB`));
                }
            }
        } else {
            console.log(chalk.cyan(`[CHAT] Nhận báo cáo từ client cho ${ticker}`));
        }
 
        const answer = await chatWithStockAI(ticker, question.trim(), history, reportContent);
        return res.json({ success: true, answer });
 
    } catch (error) {
        console.error(chalk.red(`❌ [CHAT ROUTE] ${ticker}:`), error.message);
        return res.status(500).json({
            success: false,
            message: 'AI đang bận, vui lòng thử lại sau vài giây.'
        });
    }
});
// API: SECTOR HEATMAP + WATCHLIST
app.get('/api/market-heatmap', async (req, res) => {
    const SECTORS = [
        { name: 'NGÂN HÀNG', stocks: ['VCB','TCB','MBB','CTG','BID','STB','VPB','LPB','HDB','ACB','EIB','MSB','TPB','OCB','SHB','NAB','ABB','PGB'] },
        { name: 'BẤT ĐỘNG SẢN', stocks: ['VHM','NVL','DIG','PDR','KDH','VIC','NLG','DXG','BCM','CEO','HDG','LDG','NRC','ITC','SCR','TDH','HDC','VPI'] },
        { name: 'CHỨNG KHOÁN', stocks: ['SSI','VND','VCI','SHS','HCM','BSI','FTS','AGR','APS','CTS','EVS','IVS','MBS','ORS','TVB','VDS'] },
        { name: 'THÉP', stocks: ['HPG','HSG','NKG','TLH','TVN','SMC','VGS','POM','TIS','TNA'] },
        { name: 'CÔNG NGHỆ', stocks: ['FPT','CMG','VGI','ELC','ITD','SAM','ST8','SGT','VTC','FOX','ONE','POW'] },
        { name: 'DẦU KHÍ', stocks: ['PVD','PVS','BSR','PLX','GAS','PVC','PVB','PVT','OIL','PXS','CNG','PGV'] },
        { name: 'BÁN LẺ', stocks: ['MWG','FRT','DGW','PNJ','AST','DPC','SVC','VRE','HAX','VGC','CTF','SFG'] },
        { name: 'HÓA CHẤT', stocks: ['DGC','DCM','DPM','CSV','BFC','LAS','PMB','PCE','TPC','DDV','PHP','VDB'] },
        { name: 'VẬN TẢI', stocks: ['GMD','HAH','VSC','SCS','VTP','VOS','VFR','NCT','ACV','MHC','TCL','TMS'] },
        { name: 'THỰC PHẨM', stocks: ['VNM','MSN','SAB','QNS','KDC','MCH','HNG','ANV','VHC','IDI','ACL','ABT','BAF','MML','SGC','VCF'] },
    ];
    const to = Math.floor(Date.now() / 1000);
    const from = to - (5 * 24 * 60 * 60);
    const allSymbols = SECTORS.flatMap(s => s.stocks);
    const priceMap = {};
    for (let i = 0; i < allSymbols.length; i += 8) {
        const chunk = allSymbols.slice(i, i+8);
        await Promise.all(chunk.map(async sym => {
            try {
                const r = await axios.get(
                    `https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${from}&to=${to}&symbol=${sym}&resolution=1D`,
                    { timeout: 5000 }
                );
                const c = r.data?.c || [], v = r.data?.v || [];
                if (c.length >= 2) {
                    const last = c[c.length-1], prev = c[c.length-2];
                    const vol5 = v.slice(-5);
                    priceMap[sym] = {
                        price: last * 1000,
                        changePct: parseFloat(((last-prev)/prev*100).toFixed(2)),
                        volume: v[v.length-1] || 0,
                        vol5dAvg: vol5.reduce((a,b)=>a+b,0) / vol5.length
                    };
                }
            } catch(e) {}
        }));
    }
        const sectorData = SECTORS.map(sec => {
        const stocks = sec.stocks.map(sym => ({ sym, ...priceMap[sym] })).filter(s => s.price);
        const avgChange = stocks.length
            ? stocks.reduce((a,b)=>a+parseFloat(b.changePct||0),0)/stocks.length : 0;
        const watchlist = stocks
            .filter(s => s.changePct > 0 && s.volume > s.vol5dAvg * 1.1)
            .sort((a,b) => b.changePct - a.changePct)
            .slice(0, 3)
            .map(s => ({ sym: s.sym, changePct: s.changePct, price: s.price }));

        const droplist = stocks
            .filter(s => s.changePct < 0 && s.volume > s.vol5dAvg * 1.1)
            .sort((a,b) => a.changePct - b.changePct)  
            .slice(0, 3)
            .map(s => ({ sym: s.sym, changePct: s.changePct, price: s.price }));

        return { 
            name: sec.name, 
            avgChange: parseFloat(avgChange.toFixed(2)), 
            stocks: stocks.map(s => ({ sym: s.sym, changePct: s.changePct, price: s.price, volume: s.volume || 0 })),
            watchlist,
            droplist
        };

    });
    return res.json({ success: true, data: sectorData });
});

app.get('/api/ai-news/:ticker', async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    try {
        let masterRecord = await Stock.findOne({ symbol: ticker });
        if (!masterRecord) masterRecord = new Stock({ symbol: ticker, deepNewsData: [] });
        
        const cachedNews = masterRecord.deepNewsData || [];
        const recentTitles = cachedNews.slice(0, 5).map(n => n.title);
        const aiNews = await searchNewsWithAI(ticker, recentTitles);

        const seenLinks = new Set(cachedNews.map(n => n.link));
        const validNewAiNews = [];
        let dbChanged = false; 

        for (const news of aiNews) {
            if (news.link) {
                if (!seenLinks.has(news.link)) {
                    validNewAiNews.push({ ...news, isAiGenerated: true });
                    seenLinks.add(news.link);
                    dbChanged = true;
                } else {
                    const existingIndex = cachedNews.findIndex(n => n.link === news.link);
                    if (existingIndex !== -1 && !cachedNews[existingIndex].isAiGenerated) {
                        cachedNews[existingIndex].isAiGenerated = true;
                        dbChanged = true;
                    }
                }
            }
        }

        if (dbChanged) {
            masterRecord.deepNewsData = [...validNewAiNews, ...cachedNews].slice(0, 50); 
            await masterRecord.save();
        }

        return res.status(200).json({ success: true, data: aiNews });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/action-panel/:ticker', async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const liveData = req.body;

    try {
        let masterRecord = await Stock.findOne({ symbol: ticker });
        let strategicContext = "";

        if (masterRecord && masterRecord.reports && masterRecord.reports.length > 0) {
            strategicContext = masterRecord.reports[masterRecord.reports.length - 1].content;
        }

        const actionData = await getQuickActionWithGemini(ticker, liveData, strategicContext);

        if (actionData && masterRecord && masterRecord.reports && masterRecord.reports.length > 0) {
            masterRecord.reports[masterRecord.reports.length - 1].action = actionData.action;
            await masterRecord.save();
        }

        return res.json({ success: true, data: actionData });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/user-history/:user', async (req, res) => {
    const user = req.params.user;
    const historyList = [];

    try {
        const allStocks = await Stock.find({});        
        allStocks.forEach(data => {
            if (data.reports && data.reports.length > 0) {
                const userReports = data.reports.filter(r => r.user === user);
                if (userReports.length > 0) {
                    const lastReport = userReports[userReports.length - 1]; 
                    historyList.push({
                        symbol: data.symbol,
                        companyName: data.companyName,
                        exchange: data.exchange,
                        timestamp: lastReport.timestamp,
                        price: lastReport.price,
                        changePercent: lastReport.changePercent,
                        lastAction: lastReport.action
                    });
                }
            }
        });

        historyList.sort((a, b) => {
            const isAActive = a.lastAction === 'MUA' || a.lastAction === 'BÁN';
            const isBActive = b.lastAction === 'MUA' || b.lastAction === 'BÁN';
            if (isAActive && !isBActive) return -1;
            if (!isAActive && isBActive) return 1;
            return new Date(b.timestamp) - new Date(a.timestamp); 
        });

        res.json({ success: true, data: historyList });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi đọc database', error: error.message });
    }
});

//==========================================
//API: HISTORY CHART (STOCKS & INDICES)
//==========================================
app.get('/api/history/:ticker', async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const interval = req.query.interval || '1 ngày'; 

    const isIndex = ['VNINDEX', 'HNX', 'VN30', 'UPCOM'].includes(ticker);
    
    let apiType = 'stock';
    if (isIndex) {
        apiType = 'index';
    } else if (ticker.startsWith('VN30F')) {
        apiType = 'derivative'; 
    }

    let resCode = '1D';
    let from;
    const to = Math.floor(Date.now() / 1000);
    
    let needsMonthYearAggregation = false; 
    let aggregateMinutes = 0; 

    switch (interval) {
        case '1 phút': 
            resCode = '1'; from = to - (4 * 24 * 60 * 60); break; 
        case '3 phút': 
            resCode = '1'; from = to - (4 * 24 * 60 * 60); aggregateMinutes = 3; break; 
        case '5 phút': 
            resCode = '5'; from = to - (10 * 24 * 60 * 60); break;
        case '15 phút': 
            resCode = '15'; from = to - (20 * 24 * 60 * 60); break;
        case '30 phút': 
            resCode = '30'; from = to - (30 * 24 * 60 * 60); break;
        case '1 giờ': 
            resCode = '30'; from = to - (45 * 24 * 60 * 60); aggregateMinutes = 60; break; 
        case '2 giờ': 
            resCode = '30'; from = to - (60 * 24 * 60 * 60); aggregateMinutes = 120; break; 
        case '4 giờ': 
            resCode = '30'; from = to - (60 * 24 * 60 * 60); aggregateMinutes = 240; break;
        case '1 ngày': 
            resCode = '1D'; 
            from = 946684800; 
            needsMonthYearAggregation = false; 
            break;
        case '1 tuần': 
            resCode = '1W'; 
            from = 946684800; 
            needsMonthYearAggregation = false; 
            break;
        case '1 tháng': 
            resCode = '1D'; 
            from = 946684800; 
            needsMonthYearAggregation = true;  
            break;
        case '1 năm': 
            resCode = '1D'; 
            from = 946684800; 
            needsMonthYearAggregation = true;  
            break;
        default: 
            resCode = '1D'; 
            from = 946684800;
            needsMonthYearAggregation = false; 
    }

    try {
        const dnseUrl = `https://services.entrade.com.vn/chart-api/v2/ohlcs/${apiType}?from=${from}&to=${to}&symbol=${ticker}&resolution=${resCode}`;
        const response = await axios.get(dnseUrl, { timeout: 8000 });

        let chartData = [];
        if (response.data && response.data.t) {
            const d = response.data;
            chartData = d.t.map((timestamp, index) => {
                const dateObj = new Date((timestamp * 1000) + (7 * 60 * 60 * 1000));
                const isIntraday = !['1D', '1W'].includes(resCode);
                const timeString = isIntraday 
                    ? dateObj.toISOString().replace('T', ' ').substring(0, 16) 
                    : dateObj.toISOString().split('T')[0];

                return {
                    _ts: timestamp, 
                    time: timeString, 
                    open: Number(d.o[index]),
                    high: Number(d.h[index]),
                    low: Number(d.l[index]),
                    close: Number(d.c[index]),
                    volume: Number(d.v[index]) || 0 
                };
            });
        }

        if (aggregateMinutes > 0 && chartData.length > 0) {
            const aggregated = [];
            let currentCandle = null;
            let bucketStart = 0;
            
            chartData.forEach(candle => {
                const intervalSeconds = aggregateMinutes * 60;
                const currentBucket = Math.floor(candle._ts / intervalSeconds) * intervalSeconds;
                
                if (!currentCandle || bucketStart !== currentBucket) {
                    if (currentCandle) aggregated.push(currentCandle);
                    bucketStart = currentBucket;
                    currentCandle = { ...candle }; 
                } else {
                    currentCandle.high = Math.max(currentCandle.high, candle.high);
                    currentCandle.low = Math.min(currentCandle.low, candle.low);
                    currentCandle.close = candle.close;
                    currentCandle.volume += candle.volume;
                }
            });
            if (currentCandle) aggregated.push(currentCandle);
            chartData = aggregated;
        }

        if (needsMonthYearAggregation && chartData.length > 0) {
            const aggregated = {};
            chartData.forEach(candle => {
                const key = interval === '1 tháng' 
                    ? candle.time.substring(0, 7) 
                    : candle.time.substring(0, 4);
                
                if (!aggregated[key]) {
                    aggregated[key] = {
                        time: interval === '1 tháng' ? `${key}-01` : `${key}-01-01`,
                        open: candle.open,
                        high: candle.high,
                        low: candle.low,
                        close: candle.close,
                        volume: candle.volume
                    };
                } else {
                    if (candle.high > aggregated[key].high) aggregated[key].high = candle.high;
                    if (candle.low < aggregated[key].low) aggregated[key].low = candle.low;
                    aggregated[key].close = candle.close;
                    aggregated[key].volume += candle.volume;
                }
            });
            chartData = Object.values(aggregated);
        }

        if (resCode === '1D' && !needsMonthYearAggregation) {
            try {
                const from1M = to - (24 * 60 * 60);
                const dnse1MUrl = `https://services.entrade.com.vn/chart-api/v2/ohlcs/${apiType}?from=${from1M}&to=${to}&symbol=${ticker}&resolution=1`;
                const res1M = await axios.get(dnse1MUrl, { timeout: 5000 });
                if (res1M.data && res1M.data.t && res1M.data.t.length > 0) {
                    const mData = res1M.data;
                    const latestClose = Number(mData.c[mData.c.length - 1]);
                    const todayStr = new Date().toISOString().split('T')[0];
                    const lastCandle = chartData[chartData.length - 1];

                    if (lastCandle && lastCandle.time.includes(todayStr)) {
                        lastCandle.close = latestClose;
                        if (latestClose > lastCandle.high) lastCandle.high = latestClose;
                        if (latestClose < lastCandle.low) lastCandle.low = latestClose;
                    } else if (chartData.length > 0) {
                        chartData.push({
                            time: todayStr,
                            open: Number(mData.o[0]),
                            high: Math.max(...mData.h.map(Number)),
                            low: Math.min(...mData.l.map(Number)),
                            close: latestClose,
                            volume: mData.v.reduce((sum, v) => sum + Number(v), 0)
                        });
                    }
                }
            } catch (err1M) {}
        }

        return res.status(200).json({ success: true, data: chartData });

    } catch (error) {
        return res.status(200).json({ success: false, data: [] });
    }
});

//History Crypto
app.get('/api/crypto/history/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const interval = req.query.interval || '1 ngày';   
    try {
        const data = await fetchCryptoData(symbol, interval); 
        return res.json({ success: true, data: data }); 
    } catch (e) {
        res.status(200).json({ success: false, data: null });
    }
});
//==========================================
//START SERVER
//==========================================
app.listen(PORT, async () => {
    console.log(chalk.bgGreen.black.bold(`\n 🚀 OMNI DUCK SERVER MONGODB READY: http://localhost:${PORT} `));
    await updateSymbolsDatabase();     
    await updateCryptoSymbols();   
    startCronJobs();    
});