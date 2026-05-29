import axios from 'axios';
import chalk from 'chalk';
import Stock from '../../models/Stock.js';
import DerivNews from '../../models/DerivNews.js';
import crypto from 'crypto';
import { 
    analyzeWithGemini, 
    analyzeWithGeminiStream, 
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
const AI_REPORT_CACHE_TTL_MS = Number(process.env.AI_REPORT_CACHE_TTL_MS) || 15 * 60 * 1000;

const stableNormalize = (value) => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(stableNormalize);
    if (value && typeof value === 'object') {
        return Object.keys(value)
            .sort()
            .reduce((acc, key) => {
                const normalized = stableNormalize(value[key]);
                if (normalized !== undefined) acc[key] = normalized;
                return acc;
            }, {});
    }
    return value;
};

const getLatestNewsTitle = (news = []) => {
    if (!Array.isArray(news) || news.length === 0) return null;
    const withTitle = news.find(item => item?.title);
    return withTitle?.title || null;
};

const buildStockAnalysisFingerprint = (ticker, fullData, user) => {
    const technicalData = Array.isArray(fullData?.technicalData) ? fullData.technicalData : [];
    const news = Array.isArray(fullData?.news) ? fullData.news : (Array.isArray(fullData?.newsList) ? fullData.newsList : []);
    const importantPayload = {
        ticker,
        user,
        currentPrice: fullData?.stockInfo?.currentPrice ?? null,
        changePercent: fullData?.stockInfo?.changePercent ?? null,
        lastCandle: technicalData.length > 0 ? technicalData[technicalData.length - 1] : null,
        newsCount: news.length,
        latestNewsTitle: getLatestNewsTitle(news),
        pdfMode: fullData?.pdfMode || 'turbo',
    };

    return crypto
        .createHash('sha256')
        .update(JSON.stringify(stableNormalize(importantPayload)))
        .digest('hex');
};

const getLatestUserReport = (masterRecord, user) => {
    const reports = masterRecord?.reports || [];
    return reports
        .filter(report => report.user === user)
        .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))[0] || null;
};

const getCachedStockAnalysis = async (ticker, user, inputHash) => {
    const masterRecord = await Stock.findOne({ symbol: ticker });
    const latestReport = getLatestUserReport(masterRecord, user);
    if (!latestReport || latestReport.inputHash !== inputHash) return null;

    const reportTime = new Date(latestReport.timestamp).getTime();
    if (!Number.isFinite(reportTime) || Date.now() - reportTime > AI_REPORT_CACHE_TTL_MS) return null;

    return {
        aiReport: latestReport.content,
        actionPanelData: latestReport.actionData || { action: latestReport.action },
        timestamp: latestReport.timestamp,
        inputHash: latestReport.inputHash,
    };
};
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
            console.log(chalk.gray(`[HỆ THỐNG] Dừng tìm kiếm. Không có bài báo nào mới trên mạng lưới về mã ${ticker}.`));
        } else {
            console.log(chalk.gray.bold(`[HỆ THỐNG] TỔNG KẾT: Thu hoạch được ${uniqueNew.length} tin mới. Đang ném vào Scraper cào chữ...`));
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
            console.log(chalk.gray(`[DB] Đã cập nhật thành công ${newDeepNewsData.length} tin tức SẠCH cho mã ${ticker}.`));
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

const runStockAnalysis = async (ticker, fullData, user, emitProgress = () => {}, inputHash = null, onChunk = null) => {
    if (!fullData || !fullData.stockInfo) {
        const err = new Error('Thiếu dữ liệu.');
        err.statusCode = 400;
        throw err;
    }

    emitProgress({ step: 'INIT', message: 'Khởi tạo engine phân tích và kiểm tra dữ liệu đầu vào', progress: 5 });

        let masterRecord = await Stock.findOne({ symbol: ticker });
        if (!masterRecord) masterRecord = new Stock({ symbol: ticker });

        let previousAnalysis = null;
    if (masterRecord.reports && masterRecord.reports.length > 0) {
        const latestUserReport = getLatestUserReport(masterRecord, user);
        if (latestUserReport) {
            previousAnalysis = latestUserReport.content;
        }
    }
    fullData.previousAnalysis = previousAnalysis;

    const pdfMode = fullData.pdfMode || 'turbo';

    const fetchMarketContext = async () => {
        emitProgress({ step: 'MARKET_CONTEXT', message: 'Đang lấy dữ liệu thị trường VN-Index và độ rộng thị trường', progress: 14 });
        const marketScraped = await scrapeCafefMarketOverview();
        const to = Math.floor(Date.now() / 1000);
        const from = to - (15 * 24 * 60 * 60);
        const vnRes = await axios.get(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${from}&to=${to}&symbol=VNINDEX&resolution=1D`);
        if (vnRes.data && vnRes.data.t && marketScraped.success) {
            const d = vnRes.data;
            const rawVnIndex = d.t.map((timestamp, index) => ({ close: Number(d.c[index]), volume: Number(d.v[index]) || 0 }));
            const symbolsDb = await Stock.find({});
            const marketIntelligence = analyzeMarketIntelligence(rawVnIndex, marketScraped, symbolsDb);
            emitProgress({ step: 'MARKET_CONTEXT_DONE', message: 'Đã xử lý xong bối cảnh thị trường và dữ liệu VN-Index', progress: 42 });
            return marketIntelligence.success ? marketIntelligence.intelligence : null;
        }
        return null;
    };

    const fetchMacroNews = async () => {
        emitProgress({ step: 'MACRO_NEWS', message: 'Đang đọc dữ liệu tin vĩ mô và sentiment thị trường', progress: 20 });
        const macroNews = await DerivNews.find()
            .sort({ timestamp: -1 })
            .limit(20)
            .lean();
        emitProgress({ step: 'MACRO_NEWS_DONE', message: 'Đã lấy xong tin vĩ mô và sentiment thị trường', progress: 40 });
        return macroNews.map(n => ({
            title:     n.title,
            source:    n.source,
            sentiment: n.sentiment,
            timestamp: n.timestamp,
            content:   n.content || n.title,
        }));
    };

    console.log(chalk.cyan(`[AI CORE] Khởi chạy song song: MarketContext + PDF (${pdfMode.toUpperCase()}) + MacroNews...`));
    emitProgress({ step: 'PARALLEL_FETCH', message: `Đang tải song song BCTC PDF, VN-Index và tin vĩ mô (${pdfMode.toUpperCase()})`, progress: 12 });

    const [marketContext, markdownData, macroNews] = await Promise.all([
        fetchMarketContext().catch(err => {
            console.log(chalk.red('[AI] fetchMarketContext lỗi:', err.message));
            emitProgress({ step: 'MARKET_CONTEXT_FAILED', message: 'Không lấy được bối cảnh thị trường, tiếp tục với dữ liệu đang có', progress: 42 });
            return null;
        }),
        getMarkdownFromTcbsPdf(ticker, pdfMode, emitProgress).catch(err => {
            console.log(chalk.red('[AI] getMarkdownFromTcbsPdf lỗi:', err.message));
            emitProgress({ step: 'TCBS_PDF_FAILED', message: 'Không bóc tách được BCTC PDF, tiếp tục với dữ liệu đang có', progress: 46 });
            return null;
        }),
        fetchMacroNews().catch(err => {
            console.log(chalk.red('[AI] fetchMacroNews lỗi:', err.message));
            emitProgress({ step: 'MACRO_NEWS_FAILED', message: 'Không lấy được tin vĩ mô, tiếp tục với dữ liệu đang có', progress: 40 });
            return [];
        }),
    ]);

    emitProgress({ step: 'DATA_MERGE', message: 'Đang hợp nhất dữ liệu BCTC, lịch sử giá, tin tức và market context', progress: 54 });
    if (marketContext)         fullData.marketContext     = marketContext;
    else                       fullData.marketContext     = "Không có dữ liệu bối cảnh thị trường lúc này.";
    if (markdownData)          fullData.tcbsMarkdownData  = markdownData;
    if (macroNews?.length > 0) fullData.macroNews         = macroNews;

    const aiReport = typeof onChunk === 'function'
        ? await analyzeWithGeminiStream(ticker, fullData, emitProgress, onChunk)
        : await analyzeWithGemini(ticker, fullData, emitProgress);
    emitProgress({ step: 'ACTION_PANEL', message: 'Đang viết khuyến nghị đầu tư và action panel', progress: 92 });
    const actionPanelData = await getQuickActionWithGemini(ticker, fullData.stockInfo, aiReport);
    let finalAction = actionPanelData?.action || 'QUAN SÁT';

    emitProgress({ step: 'SAVE_REPORT', message: 'Đang lưu báo cáo AI vào Database', progress: 96 });
    if (!masterRecord.reports) masterRecord.reports = [];
    masterRecord.reports.push({
        user: user, timestamp: fullData.timestamp || new Date().toISOString(),
        content: aiReport, action: finalAction, actionData: actionPanelData, price: fullData.stockInfo.currentPrice,
        changePercent: parseFloat(fullData.stockInfo.changePercent) || 0,
        inputHash
    });

    if (fullData.stockInfo.companyName) masterRecord.companyName = fullData.stockInfo.companyName;
    if (fullData.stockInfo.exchange) masterRecord.exchange = fullData.stockInfo.exchange;
    await masterRecord.save();
    emitProgress({ step: 'DONE', message: 'Hoàn tất phân tích AI và lưu dữ liệu', progress: 100 });

    return { aiReport, actionPanelData };
};

        export const analyzeStock = async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const fullData = req.body;
    const user = fullData.user || 'Unknown';

         try {
        const inputHash = buildStockAnalysisFingerprint(ticker, fullData, user);
        const cachedResult = await getCachedStockAnalysis(ticker, user, inputHash);
        if (cachedResult) {
            console.log(chalk.green(`[AI CACHE] Hit cho ${ticker}/${user}, bỏ qua Gemini.`));
            return res.json({ success: true, ...cachedResult, cached: true });
        }

        const { aiReport, actionPanelData } = await runStockAnalysis(ticker, fullData, user, undefined, inputHash);
        return res.json({ success: true, aiReport, actionPanelData, cached: false });
    } catch (error) {
        return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
};

        export const analyzeStockStream = async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const fullData = req.body;
    const user = fullData.user || 'Unknown';
    const startedAt = Date.now();
    let lastProgress = 1;

        res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'ngrok-skip-browser-warning, Content-Type');
    res.setHeader('ngrok-skip-browser-warning', 'true');
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const writeEvent = (event, payload) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const emitProgress = (payload) => {
        const progress = Math.max(lastProgress, Math.min(100, Number(payload.progress) || lastProgress));
        lastProgress = progress;
        const elapsedMs = Date.now() - startedAt;
        const estimatedTotalMs = progress > 0 ? Math.round(elapsedMs / (progress / 100)) : null;
        let etaSeconds = estimatedTotalMs ? Math.max(0, Math.ceil((estimatedTotalMs - elapsedMs) / 1000)) : null;

       //[FIX] Realistic buffer injection (Less optimistic)
        if (etaSeconds !== null) {
            if (progress < 30) etaSeconds += 25;      
            else if (progress < 60) etaSeconds += 15; 
            else if (progress < 85) etaSeconds += 8;  
        }

        writeEvent('progress', {
            ...payload,
            progress,
            elapsedSeconds: Number((elapsedMs / 1000).toFixed(1)),
            etaSeconds,
        });
    };

        try {
        const onChunk = (chunkText) => {
            if (!chunkText) return;
            writeEvent('report_chunk', { text: chunkText });
        };
        const inputHash = buildStockAnalysisFingerprint(ticker, fullData, user);
        const cachedResult = await getCachedStockAnalysis(ticker, user, inputHash);
        if (cachedResult) {
            emitProgress({ step: 'CACHE_HIT', message: 'Dữ liệu đầu vào không đổi, dùng lại báo cáo AI trong cache', progress: 100 });
            writeEvent('done', { success: true, ...cachedResult, cached: true, elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)) });
            res.end();
            return;
        }

        const result = await runStockAnalysis(ticker, fullData, user, emitProgress, inputHash, onChunk);
        writeEvent('done', { success: true, ...result, cached: false, elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)) });
        res.end();
    } catch (error) {
        writeEvent('error', { success: false, message: error.message });
        res.end();
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