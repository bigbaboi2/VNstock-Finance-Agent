import { analyzeWithGemini, getMarkdownFromTcbsPdf, searchNewsWithAI, getQuickActionWithGemini, analyzeDerivativesWithGemini } from './services/aiService.js';
import express from 'express';
import cors from 'cors';
import chalk from 'chalk';
import path from 'path';
import axios from 'axios';
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
{}
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log(chalk.bgGreen.black.bold(' ✔ KẾT NỐI MONGODB THÀNH CÔNG BẰNG LINK BYPASS ')))
    .catch(err => console.error(chalk.red('❌ Lỗi kết nối MongoDB:'), err));

const app = express();
const PORT = 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());
registerCryptoRoutes(app);

// ==========================================
// API: CỔNG XÁC THỰC HỆ THỐNG (AUTH)
// ==========================================
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

// ==========================================
// API: SYMBOLS & INFO
// ==========================================
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
            companyProfile: { companyName: companyFullName, overview: cafefRes.overview || 'Hệ thống đang cập nhật...', marketCap: cafefRes.mktCap || '---', peRatio: cafefRes.pe || '---' },
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

// ==========================================
// API: HỆ THỐNG GIAO DỊCH ẢO  
// ==========================================
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

// ==========================================
// API: KHỚP LỆNH NỀN
// ==========================================
setInterval(async () => {
    try {
        const now = new Date();
        const day = now.getDay();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const totalMinutes = hours * 60 + minutes;

        const isMarketOpen = day >= 1 && day <= 5 && totalMinutes >= 540 && totalMinutes <= 900;

        if (!isMarketOpen) return; 

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

// ==========================================
// API: GENERAL MARKET RADAR
// ==========================================
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

// ==========================================
// API: DERIVATIVES RADAR (PHÁI SINH)
// ==========================================
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

// ==========================================
// API: LIVE NEWS & AI
// ==========================================
app.get('/api/news/:ticker', async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
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

        for (const news of cachedNews.slice(0, 15)) {
            if (isClientDisconnected) break;
            res.write(`data: ${JSON.stringify(news)}\n\n`);
        }

        const fetchedLinks = await searchVnNewsDirectly(ticker);
        const seenLinks = new Set(cachedNews.map(n => n.link)); 
        const uniqueNewLinks = fetchedLinks.filter(item => !seenLinks.has(item.link));

        if (uniqueNewLinks.length > 0 && !isClientDisconnected) {
            for (const news of uniqueNewLinks.slice(0, 10)) {
                if (isClientDisconnected) break;
                try {
                    const content = await scrapeArticleContent(news.link);
                    if (content && content.length > 50) {
                        const validNews = { title: news.title, link: news.link, source: news.link, content: content, date: new Date().toLocaleDateString('vi-VN') };
                        newDeepNewsData.push(validNews);
                        res.write(`data: ${JSON.stringify(validNews)}\n\n`);
                    }
                } catch (e) {}
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

// ==========================================
// API: HISTORY CHART (STOCKS & INDICES)
// ==========================================
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

// ==========================================
// API: CRYPTO HISTORY & RADAR
// ==========================================
import { fetchCryptoData } from './fetchers/cryptoFetcher.js';

app.get('/api/crypto-radar', async (req, res) => {
    try {
        const [btc, eth] = await Promise.all([
            fetchCryptoData('BTC'),
            fetchCryptoData('ETH')
        ]);

        return res.json({ 
            success: true, 
            data: { btc, eth } 
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});
// History Crypto
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
// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, async () => {
    console.log(chalk.bgGreen.black.bold(`\n 🚀 OMNI DUCK SERVER MONGODB READY: http://localhost:${PORT} `));
    await updateSymbolsDatabase();     
    await updateCryptoSymbols();       
});