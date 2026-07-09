import chalk from 'chalk';
import axios from 'axios';
import Stock from '../../models/Stock.js';
import CryptoCoin from '../../models/CryptoCoin.js';
import DerivNews from '../../models/DerivNews.js';
import { fetchCafefData } from '../fetchers/cafefService.js';
import { fetchTcbsData, getTcbsPdfUrl, TCBS_HTTP_HEADERS } from '../fetchers/tcbsService.js';
import { getCachedData, saveToCache } from '../services/cacheService.js';
import { updateSymbolsDatabase } from '../services/symbolUpdater.js';
import { updateCryptoSymbols } from '../services/cryptoSymbolUpdater.js';
import { scrapeCafefMarketOverview } from '../scrapers/cafefMarketScraper.js';
import { analyzeMarketIntelligence } from '../services/quantEngine.js';

// ─── Lock: chống block event loop khi quant đang chạy ───────────────────────
let _isQuantRunning = false;

//1. Get the list of stock codes
export const getSymbols = async (req, res) => {
    try {
        let symbolsData = await Stock.find({});
        if (!symbolsData || symbolsData.length === 0) {
            symbolsData = await updateSymbolsDatabase();
        }
        return res.json(symbolsData);
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi đọc danh sách mã từ hệ thống Cloud MongoDB.' });
    }
};

//2. Get detailed information about a code (Ticker)
export const getStockInfo = async (req, res) => {
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
            reportPdf: tcbsRes.validPdfUrl || null,
            reportPdfLastModified: tcbsRes.pdfMeta?.lastModified || null,
            reportPdfRevision: tcbsRes.pdfMeta?.revision || null,
            deepNewsData: masterRecord?.deepNewsData || [],
        };

        saveToCache(ticker, responseData);
        return res.json({ success: true, logs: systemLogs, data: responseData });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/** Proxy PDF TCBS — tránh Google Viewer và tải file "viewer" lỗi trên trình duyệt. */
export const streamTcbsPdf = async (req, res) => {
    const ticker = String(req.params.ticker || '').toUpperCase();
    if (!ticker) {
        return res.status(400).json({ success: false, message: 'Thiếu mã cổ phiếu' });
    }

    const pdfUrl = getTcbsPdfUrl(ticker);
    try {
        const upstream = await axios.get(pdfUrl, {
            responseType: 'stream',
            timeout: 20000,
            headers: TCBS_HTTP_HEADERS,
            validateStatus: (status) => status < 500,
        });

        if (upstream.status !== 200) {
            return res.status(404).json({
                success: false,
                message: `TCBS chưa có báo cáo PDF cho mã ${ticker}`,
            });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${ticker}_tcbs.pdf"`);
        res.setHeader('Cache-Control', 'public, max-age=900');
        if (upstream.headers['last-modified']) {
            res.setHeader('Last-Modified', upstream.headers['last-modified']);
        }
        if (upstream.headers.etag) {
            res.setHeader('ETag', upstream.headers.etag);
        }

        upstream.data.pipe(res);
    } catch (error) {
        return res.status(502).json({ success: false, message: error.message });
    }
};

// Get macro and recent symbol news for home page
export const getHomeNews = async (req, res) => {
    try {
        const macroNews = await DerivNews.find().sort({ date: -1 }).limit(10);
        
        const recentStocks = await Stock.find({ 'deepNewsData.0': { $exists: true } })
            .select('symbol deepNewsData')
            .lean();
            
        let userNews = [];
        recentStocks.forEach(stock => {
            if (stock.deepNewsData && stock.deepNewsData.length > 0) {
                const newsItems = stock.deepNewsData.slice(0, 3).map(n => ({
                    ...n,
                    title: `[${stock.symbol}] ${n.title}`
                }));
                userNews = userNews.concat(newsItems);
            }
        });
        
        userNews.sort((a, b) => new Date(b.date || b.fetchedAt || 0) - new Date(a.date || a.fetchedAt || 0));
        userNews = userNews.slice(0, 15);
        
        const combinedNews = [...macroNews.map(n => ({...n.toObject(), isMacro: true})), ...userNews];
        combinedNews.sort((a, b) => new Date(b.date || b.fetchedAt || 0) - new Date(a.date || a.fetchedAt || 0));
        
        return res.json({ success: true, data: combinedNews });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

//3. Market scanning radar (VNINDEX)
export const getMarketRadar = async (req, res) => {
    try {
        const now = new Date();
        const day = now.getDay(); 
        const totalMinutes = now.getHours() * 60 + now.getMinutes();
        const isMarketOpen = day >= 1 && day <= 5 && totalMinutes >= 540 && totalMinutes <= 900;

        if (!isMarketOpen) {
            const cachedMarketRecord = await Stock.findOne({ symbol: 'VNINDEX' });
            if (cachedMarketRecord && cachedMarketRecord.cafeF?.lastQuantIntelligence) {
                return res.json({ success: true, isLive: false, data: cachedMarketRecord.cafeF.lastQuantIntelligence });
            }
        }

        if (_isQuantRunning) {
            console.log(chalk.yellow('[QUANT] Tiến trình đang chạy, trả cache cho request này...'));
            const cached = await Stock.findOne({ symbol: 'VNINDEX' });
            if (cached?.cafeF?.lastQuantIntelligence) {
                return res.json({ success: true, isLive: false, _fromLock: true, data: cached.cafeF.lastQuantIntelligence });
            }
            return res.json({ success: true, isLive: false, _fromLock: true, data: null });
        }

        _isQuantRunning = true;
        try {
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

            const intel = finalIntelligence.intelligence;

            let vnIndexRecord = await Stock.findOne({ symbol: 'VNINDEX' });
            if (!vnIndexRecord) vnIndexRecord = new Stock({ symbol: 'VNINDEX' });
            
            if (!vnIndexRecord.cafeF) vnIndexRecord.cafeF = {};
            vnIndexRecord.cafeF.lastQuantIntelligence = intel;
            vnIndexRecord.markModified('cafeF'); 
            await vnIndexRecord.save();

            // Summarize logs and send them to the frontend terminal
            const quantLogs = [
                `[QUANT] ${intel.marketStatus} | ${intel.indexChangePct > 0 ? '+' : ''}${intel.indexChangePct}% | Breadth: ${intel.breadthRatio}%`,
                intel.strongSectors?.length ? `[QUANT] 📈 Mạnh: ${intel.strongSectors.map(s => s.name).join(', ')}` : null,
                intel.weakSectors?.length   ? `[QUANT] 📉 Yếu: ${intel.weakSectors.map(s => s.name).join(', ')}`   : null,
                intel.topGainers?.length    ? `[QUANT] Top tăng: ${intel.topGainers.map(s => `${s.symbol}(+${s.changePct}%)`).join(' ')}` : null,
            ].filter(Boolean);

            console.log(chalk.gray('─'.repeat(60)));
            return res.json({ success: true, isLive: true, logs: quantLogs, data: intel });

        } finally {
            _isQuantRunning = false;
        }

    } catch (error) {
        _isQuantRunning = false;
        const fallback = await Stock.findOne({ symbol: 'VNINDEX' });
        if (fallback && fallback.cafeF?.lastQuantIntelligence) {
            return res.json({ success: true, isLive: false, data: fallback.cafeF.lastQuantIntelligence });
        }
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getMarketHeatmap = async (req, res) => {
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
    try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - (5 * 24 * 60 * 60);
        const allSymbols = SECTORS.flatMap(s => s.stocks);
        const priceMap = {};
        for (let i = 0; i < allSymbols.length; i += 8) {
            const chunk = allSymbols.slice(i, i+8);
            await Promise.all(chunk.map(async sym => {
                try {
                    const r = await axios.get(`https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${from}&to=${to}&symbol=${sym}&resolution=1D`, { timeout: 5000 });
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
            const avgChange = stocks.length ? stocks.reduce((a,b)=>a+parseFloat(b.changePct||0),0)/stocks.length : 0;
            const watchlist = stocks.filter(s => s.changePct > 0 && s.volume > s.vol5dAvg * 1.1).sort((a,b) => b.changePct - a.changePct).slice(0, 3).map(s => ({ sym: s.sym, changePct: s.changePct, price: s.price }));
            const droplist = stocks.filter(s => s.changePct < 0 && s.volume > s.vol5dAvg * 1.1).sort((a,b) => a.changePct - b.changePct).slice(0, 3).map(s => ({ sym: s.sym, changePct: s.changePct, price: s.price }));

            return { 
                name: sec.name, 
                avgChange: parseFloat(avgChange.toFixed(2)), 
                stocks: stocks.map(s => ({ sym: s.sym, changePct: s.changePct, price: s.price, volume: s.volume || 0 })),
                watchlist,
                droplist
            };
        });
        return res.json({ success: true, data: sectorData });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi tải bản đồ nhiệt thị trường.' });
    }
};