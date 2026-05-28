import axios from 'axios';
import chalk from 'chalk';
import Stock from '../../models/Stock.js';
import DerivNews from '../../models/DerivNews.js';
import { 
    analyzeWithGemini, 
    getMarkdownFromTcbsPdf, 
    searchNewsWithAI, 
    getQuickActionWithGemini, 
    analyzeDerivativesWithGemini, 
    chatWithStockAI 
} from '../services/aiService.js';
import { searchVnNewsDirectly, rescoreSentiment } from '../scrapers/vnNewsSearch.js';
import { scrapeArticleContent } from '../scrapers/contentScraper.js';
import { scrapeCafefMarketOverview } from '../scrapers/cafefMarketScraper.js';
import { analyzeMarketIntelligence } from '../services/quantEngine.js';

//Maximum number of records stored in DB per stock
const MAX_NEWS_DB = 80;
//Number of scraped messages per fetch
const MAX_SCRAPE  = 20;
//Number of parallel scrapes per batch
const BATCH_SIZE  = 5;

export const getLiveNews = async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const mode = ['official', 'balanced', 'negative', 'rumor'].includes(req.query.mode)
                 ? req.query.mode : 'balanced';

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

        const isBadNews = (n) => {
            if (!n) return true;
            if (!n.link || n.link === 'null' || n.link.trim() === '') return true; 
            if (!n.title || n.title === 'null' || n.title.trim() === '') return true; 
            if (n.link.includes('google.com') || n.link.includes('googleusercontent')) return true; 
            return false;
        };

        const staleCount = cachedNews.filter(isBadNews).length;
        if (staleCount > 0) {
            cachedNews = cachedNews.filter(n => !isBadNews(n));
            masterRecord.deepNewsData = cachedNews;
            await masterRecord.save();
            console.log(chalk.red.italic(`[FIX-DB] Đã xóa ${staleCount} bản ghi RÁC (null/google) của mã ${ticker} khỏi Database.`));
        }

        for (const news of cachedNews) {
            if (isClientDisconnected) break;
            const rescored = rescoreSentiment(news);
            res.write(`data: ${JSON.stringify(rescored)}\n\n`);
        }

console.log(chalk.yellowBright(`[HỆ THỐNG] Đang tìm tin tức mới cho ${ticker}... DB hiện có ${cachedNews.length} tin sạch.`));

        //---START LOOP FLIP PAGE FIND NEW NEWS ---
        const seenLinks = new Set(cachedNews.map(n => n.link));
        let uniqueNew = [];
        let currentPage = 1;
        const MAX_PAGES = 4;  
        const TARGET_NEW_NEWS = 5; //Try to find at least 5 new news

        while (uniqueNew.length < TARGET_NEW_NEWS && currentPage <= MAX_PAGES) {
            if (isClientDisconnected) break; //Exit the loop if Frontend disconnects
            
            //Each page scans 15 messages
            const currentBatch = await searchVnNewsDirectly(ticker, mode, 15, currentPage);
            
             if (currentBatch.length === 0) {
                console.log(chalk.gray(`[HỆ THỐNG] Đã cạn kiệt tài nguyên tin tức mạng ở Trang ${currentPage}.`));
                break; 
            }

            //Filter out news that has never been in the Database and must be a clean link
            const newItems = currentBatch.filter(item => {
                const isNew = !seenLinks.has(item.link);
                const isClean = item.link && !item.link.includes('google.com');
                return isNew && isClean;
            });

            if (newItems.length > 0) {
                //Insert new information into the total array and update seenLinks to avoid duplicate filtering in the following loop
                uniqueNew = [...uniqueNew, ...newItems];
                newItems.forEach(n => seenLinks.add(n.link));
                console.log(chalk.green(`[HỆ THỐNG] ↳ Trang ${currentPage}: Vớt được ${newItems.length} tin mới toanh!`));
            } else {
                console.log(chalk.yellow(`[HỆ THỐNG] ↳ Trang ${currentPage}: Toàn tin cũ đã có trong DB. Đang tự động lật sang Trang ${currentPage + 1}...`));
            }

            currentPage++;
        }

        if (uniqueNew.length === 0) {
            console.log(chalk.yellow(`[HỆ THỐNG] Dừng tìm kiếm. Không có bài báo nào mới trên mạng lưới về mã ${ticker}.`));
        } else {
            console.log(chalk.green.bold(`[HỆ THỐNG] TỔNG KẾT: Thu hoạch được ${uniqueNew.length} tin mới. Đang ném vào Scraper cào chữ...`));
        }

        if (uniqueNew.length > 0 && !isClientDisconnected) {
             const toScrape = uniqueNew.slice(0, MAX_SCRAPE);
            
            //---END OF LOOP ---
            
            const SAFE_BATCH_SIZE = 3;
            for (let i = 0; i < toScrape.length; i += SAFE_BATCH_SIZE) {
                if (isClientDisconnected) break;
                const batch   = toScrape.slice(i, i + SAFE_BATCH_SIZE);
                
                const scraped = await Promise.all(batch.map(async (news) => {
                    try {
                        const content = await Promise.race([
                            scrapeArticleContent(news.link),
                            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 35000))
                        ]);
                        const raw = {
                            title:       news.title,
                            link:        news.link,
                            source:      news.source || news.link,
                            sentiment:   news.sentiment || 'neutral',
                            content:     (content && content.length > 80) ? content : news.title,
                            date:        news.date || new Date().toLocaleDateString('vi-VN'),
                            publishedAt: news.publishedAt || new Date(),
                            mode,
                        };
                        return rescoreSentiment(raw);
                    } catch {
                        return {
                            title:       news.title,
                            link:        news.link,
                            source:      news.source || news.link,
                            sentiment:   news.sentiment || 'neutral',
                            content:     news.title,
                            date:        news.date || new Date().toLocaleDateString('vi-VN'),
                            publishedAt: news.publishedAt || new Date(),
                            mode,
                        };
                    }
                }));

                for (const item of scraped) {
                    if (isClientDisconnected) break;
                    newDeepNewsData.push(item);
                    res.write(`data: ${JSON.stringify(item)}\n\n`);
                }
            }
        }

        if (newDeepNewsData.length > 0) {
            masterRecord = await Stock.findOne({ symbol: ticker });
            const combined = [...newDeepNewsData, ...(masterRecord.deepNewsData || [])];
            const seen = new Set();
            
            const isBadNews = (n) => !n || !n.link || n.link === 'null' || n.link.includes('google.com');

            masterRecord.deepNewsData = combined
                .filter(n => {
                    if (isBadNews(n)) return false; 
                    if (seen.has(n.link)) return false;
                    seen.add(n.link);
                    return true;
                })
                .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
                .slice(0, MAX_NEWS_DB);
            
            await masterRecord.save();
            console.log(chalk.green(`[DB] Đã cập nhật thành công ${newDeepNewsData.length} tin tức SẠCH cho mã ${ticker}.`));
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
};

export const analyzeDerivatives = async (req, res) => {
    try {
        const payload = req.body;
        
         const aiResult = await analyzeDerivativesWithGemini(payload);

         return res.json({
            success: true,
            data: aiResult.aiReport,            
            actionPanelData: aiResult.actionPanelData 
        });

    } catch (error) {
        console.error("Lỗi AI Service:", error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const analyzeStock = async (req, res) => {
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

        const pdfMode = fullData.pdfMode || 'turbo';

        // ── Chạy song song  ─────────────────────────
        const fetchMarketContext = async () => {
            const marketScraped = await scrapeCafefMarketOverview();
            const to = Math.floor(Date.now() / 1000);
            const from = to - (15 * 24 * 60 * 60);
            const vnRes = await axios.get(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${from}&to=${to}&symbol=VNINDEX&resolution=1D`);
            if (vnRes.data && vnRes.data.t && marketScraped.success) {
                const d = vnRes.data;
                const rawVnIndex = d.t.map((timestamp, index) => ({ close: Number(d.c[index]), volume: Number(d.v[index]) || 0 }));
                const symbolsDb = await Stock.find({});
                const marketIntelligence = analyzeMarketIntelligence(rawVnIndex, marketScraped, symbolsDb);
                return marketIntelligence.success ? marketIntelligence.intelligence : null;
            }
            return null;
        };

        const fetchMacroNews = async () => {
            const macroNews = await DerivNews.find()
                .sort({ timestamp: -1 })
                .limit(20)
                .lean();
            return macroNews.map(n => ({
                title:     n.title,
                source:    n.source,
                sentiment: n.sentiment,
                timestamp: n.timestamp,
                content:   n.content || n.title,
            }));
        };

        console.log(chalk.cyan(`[AI CORE] Khởi chạy song song: MarketContext + PDF (${pdfMode.toUpperCase()}) + MacroNews...`));

        const [marketContext, markdownData, macroNews] = await Promise.all([
            fetchMarketContext().catch(err => {
                console.log(chalk.red('[AI] fetchMarketContext lỗi:', err.message));
                return null;
            }),
            getMarkdownFromTcbsPdf(ticker, pdfMode).catch(err => {
                console.log(chalk.red('[AI] getMarkdownFromTcbsPdf lỗi:', err.message));
                return null;
            }),
            fetchMacroNews().catch(err => {
                console.log(chalk.red('[AI] fetchMacroNews lỗi:', err.message));
                return [];
            }),
        ]);

        if (marketContext)         fullData.marketContext     = marketContext;
        else                       fullData.marketContext     = "Không có dữ liệu bối cảnh thị trường lúc này.";
        if (markdownData)          fullData.tcbsMarkdownData  = markdownData;
        if (macroNews?.length > 0) fullData.macroNews         = macroNews;

        const aiReport = await analyzeWithGemini(ticker, fullData);
        const actionPanelData = await getQuickActionWithGemini(ticker, fullData.stockInfo, aiReport);
        let finalAction = actionPanelData?.action || 'QUAN SÁT';

        if (!masterRecord.reports) masterRecord.reports = [];
        masterRecord.reports.push({
            user: user, timestamp: fullData.timestamp || new Date().toISOString(),
            content: aiReport, action: finalAction, actionData: actionPanelData, price: fullData.stockInfo.currentPrice,
            changePercent: parseFloat(fullData.stockInfo.changePercent) || 0
        });

        if (fullData.stockInfo.companyName) masterRecord.companyName = fullData.stockInfo.companyName;
        if (fullData.stockInfo.exchange) masterRecord.exchange = fullData.stockInfo.exchange;
        await masterRecord.save();

        return res.json({ success: true, aiReport, actionPanelData: actionPanelData });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getLatestVnStockReport = async (req, res) => {
    try {
        const { symbol } = req.params;
        const { user } = req.query;

        console.log(chalk.cyan(`[DB CACHE] Đang quét MongoDB tìm báo cáo cũ của ${symbol} cho user: ${user}...`));

        const masterRecord = await Stock.findOne({ symbol: symbol.toUpperCase() });
        
        if (!masterRecord || !masterRecord.reports || masterRecord.reports.length === 0) {
            console.log(chalk.yellow(`[DB CACHE] Mã ${symbol} chưa có báo cáo nào trong Database.`));
            return res.json({ success: false, message: 'Chưa có báo cáo cũ' });
        }

        const userReports = masterRecord.reports.filter(r => r.user === user);
        
        if (userReports.length === 0) {
            console.log(chalk.yellow(`[DB CACHE] Mã ${symbol} có báo cáo, nhưng KHÔNG PHẢI của user ${user}.`));
            return res.json({ success: false, message: 'Chưa có báo cáo cũ của user này' });
        }

        const latestReport = userReports[userReports.length - 1];
        console.log(chalk.green(`[DB CACHE] Đã tìm thấy báo cáo của ${symbol} (Tạo lúc: ${latestReport.timestamp}). Đang gửi về Frontend...`));

        return res.json({ 
            success: true, 
            data: {
                aiReport: latestReport.content,
                actionData: latestReport.actionData || { action: latestReport.action },
                timestamp: latestReport.timestamp
            } 
        });
    } catch (error) {
        console.error(chalk.red(`[DB LỖI] Không thể đọc báo cáo cũ:`), error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const debugFeed = async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const fullData = { ...req.body };
    const user = fullData.user || 'Unknown';

    try {
        const masterRecord = await Stock.findOne({ symbol: ticker });
        if (masterRecord?.reports?.length > 0) {
            const userReports = masterRecord.reports.filter(r => r.user === user);
            fullData.previousAnalysis = userReports.length > 0 ? userReports[userReports.length - 1].content : null;
        } else {
            fullData.previousAnalysis = null;
        }

        try {
            const marketScraped = await scrapeCafefMarketOverview();
            const to = Math.floor(Date.now() / 1000);
            const from = to - (15 * 24 * 60 * 60);
            const vnRes = await axios.get(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${from}&to=${to}&symbol=VNINDEX&resolution=1D`);
            if (vnRes.data?.t && marketScraped.success) {
                const d = vnRes.data;
                const rawVnIndex = d.t.map((ts, i) => ({ close: Number(d.c[i]), volume: Number(d.v[i]) || 0 }));
                const symbolsDb = await Stock.find({});
                const mi = analyzeMarketIntelligence(rawVnIndex, marketScraped, symbolsDb);
                if (mi.success) fullData.marketContext = mi.intelligence;
            }
        } catch { fullData.marketContext = 'Không lấy được dữ liệu thị trường'; }

        const markdownData = await getMarkdownFromTcbsPdf(ticker);
        if (markdownData) fullData.tcbsMarkdownData = markdownData;

         try {
            const macroNews = await DerivNews.find()
                .sort({ timestamp: -1 })
                .limit(20)
                .lean();
            if (macroNews.length > 0) {
                fullData.macroNews = macroNews.map(n => ({
                    title:     n.title,
                    source:    n.source,
                    sentiment: n.sentiment,
                    timestamp: n.timestamp,
                    content:   n.content || n.title,
                }));
            }
        } catch (macroErr) {
            console.log(chalk.redBright(`[DEBUG] Không lấy được macroNews: ${macroErr.message}`));
        }

        const jsonStr = JSON.stringify(fullData, null, 2);
        const sizeKB = (Buffer.byteLength(jsonStr, 'utf8') / 1024).toFixed(1);

        return res.json({
            success: true,
            _debugMeta: {
                ticker, exportedAt: new Date().toISOString(), totalSizeKB: sizeKB,
                fields: Object.keys(fullData), hasPreviousAnalysis: !!fullData.previousAnalysis,
                hasMarketContext: !!fullData.marketContext, hasTcbsData: !!fullData.tcbsMarkdownData,
                technicalBars: fullData.technicalData?.length || 0, newsCount: fullData.news?.length || 0,
                macroNewsCount: fullData.macroNews?.length || 0,
            },
            data: fullData
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const stockChat = async (req, res) => {
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
                const userReports = user ? masterRecord.reports.filter(r => r.user === user) : [];
                const bestReport = userReports.length > 0 ? userReports[userReports.length - 1] : masterRecord.reports[masterRecord.reports.length - 1];
                reportContent = bestReport?.content || null;
            }
        }
        const answer = await chatWithStockAI(ticker, question.trim(), history, reportContent);
        return res.json({ success: true, answer });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'AI đang bận, vui lòng thử lại sau vài giây.' });
    }
};

export const getAiNews = async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const mode   = ['official', 'balanced', 'negative', 'rumor'].includes(req.query.mode)
                   ? req.query.mode : 'balanced';
    try {
        let masterRecord = await Stock.findOne({ symbol: ticker });
        if (!masterRecord) masterRecord = new Stock({ symbol: ticker, deepNewsData: [] });

        const cachedNews    = masterRecord.deepNewsData || [];
        const recentTitles  = cachedNews.slice(0, 5).map(n => n.title);
        const aiNews        = await searchNewsWithAI(ticker, recentTitles, mode);

        const seenLinks     = new Set(cachedNews.map(n => n.link));
        const validNewAiNews = [];
        let dbChanged = false;

        for (const news of aiNews) {
            if (news.link) {
                if (!seenLinks.has(news.link)) {
                    validNewAiNews.push({ ...news, isAiGenerated: true, mode });
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
            const combined = [...validNewAiNews, ...cachedNews];
            const seen = new Set();
            masterRecord.deepNewsData = combined.filter(n => {
                if (seen.has(n.link)) return false;
                seen.add(n.link);
                return true;
            }).slice(0, MAX_NEWS_DB);
            await masterRecord.save();
        }
        return res.status(200).json({ success: true, data: aiNews });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getActionPanel = async (req, res) => {
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
            masterRecord.reports[masterRecord.reports.length - 1].actionData = actionData;  
            await masterRecord.save();
        }
        return res.json({ success: true, data: actionData });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getUserHistory = async (req, res) => {
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
                        symbol: data.symbol, companyName: data.companyName, exchange: data.exchange,
                        timestamp: lastReport.timestamp, price: lastReport.price,
                        changePercent: lastReport.changePercent, lastAction: lastReport.action
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
};