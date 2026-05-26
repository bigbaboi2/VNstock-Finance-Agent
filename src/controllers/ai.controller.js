import axios from 'axios';
import chalk from 'chalk';
import Stock from '../../models/Stock.js';
import { 
    analyzeWithGemini, 
    getMarkdownFromTcbsPdf, 
    searchNewsWithAI, 
    getQuickActionWithGemini, 
    analyzeDerivativesWithGemini, 
    chatWithStockAI 
} from '../services/aiService.js';
import { searchVnNewsDirectly } from '../scrapers/vnNewsSearch.js';
import { scrapeArticleContent } from '../scrapers/contentScraper.js';
import { scrapeCafefMarketOverview } from '../scrapers/cafefMarketScraper.js';
import { analyzeMarketIntelligence } from '../services/quantEngine.js';

export const getLiveNews = async (req, res) => {
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
};

export const analyzeDerivatives = async (req, res) => {
    try {
        const payload = req.body;
        const report = await analyzeDerivativesWithGemini(payload);
        res.json({ success: true, data: report });
    } catch (error) {
        console.error('[LỖI] Lỗi AI Phái sinh:', error);
        res.status(500).json({ success: false, message: 'Không thể kết nối AI Phái sinh' });
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

        try {
            const marketScraped = await scrapeCafefMarketOverview();
            const to = Math.floor(Date.now() / 1000);
            const from = to - (15 * 24 * 60 * 60);
            const vnRes = await axios.get(`https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${from}&to=${to}&symbol=VNINDEX&resolution=1D`);
            
            if (vnRes.data && vnRes.data.t && marketScraped.success) {
                const d = vnRes.data;
                const rawVnIndex = d.t.map((timestamp, index) => ({ close: Number(d.c[index]), volume: Number(d.v[index]) || 0 }));
                const symbolsDb = await Stock.find({});
                const marketIntelligence = analyzeMarketIntelligence(rawVnIndex, marketScraped, symbolsDb);
                if (marketIntelligence.success) fullData.marketContext = marketIntelligence.intelligence;
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
            user: user, timestamp: fullData.timestamp || new Date().toISOString(),
            content: aiReport, action: finalAction, price: fullData.stockInfo.currentPrice,
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

        const jsonStr = JSON.stringify(fullData, null, 2);
        const sizeKB = (Buffer.byteLength(jsonStr, 'utf8') / 1024).toFixed(1);

        return res.json({
            success: true,
            _debugMeta: {
                ticker, exportedAt: new Date().toISOString(), totalSizeKB: sizeKB,
                fields: Object.keys(fullData), hasPreviousAnalysis: !!fullData.previousAnalysis,
                hasMarketContext: !!fullData.marketContext, hasTcbsData: !!fullData.tcbsMarkdownData,
                technicalBars: fullData.technicalData?.length || 0, newsCount: fullData.news?.length || 0,
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