import axios from 'axios';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import DerivNews from '../../models/DerivNews.js';
//
import { globalDerivCache } from '../jobs/derivUpdater.js';

function getExpiryInfo() {
    const now = new Date();
    const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
 
    const getThirdThursdayOfMonth = (year, month) => {
        //month: 0-indexed
        const d = new Date(year, month, 1);
        const dayOfWeek = d.getDay(); 
        //First Thursday
        const firstThursday = ((4 - dayOfWeek + 7) % 7) + 1;
        return new Date(year, month, firstThursday + 14); 
    };
 
    let year  = vnNow.getFullYear();
    let month = vnNow.getMonth();
    let expiry = getThirdThursdayOfMonth(year, month);
 
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
export const getDerivRadar = async (req, res) => {
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
};

export const exportDerivData = async (req, res) => {
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
 
        const exportPath = path.join(__dirname, 'deriv_full_export.json');
        fs.writeFileSync(exportPath, JSON.stringify(exportPayload, null, 2), 'utf-8');
        console.log(chalk.bgGreen.black.bold(` 📊 [EXPORT] Xuất xong → ${exportPath} | DXY=${exportPayload.macroContext.dxy.value} | Dow=${exportPayload.macroContext.dowFutures.value} | Đáo hạn còn ${exportPayload.macroContext.daysToExpiry} ngày `));
 
        res.json({ success: true, data: exportPayload, filePath: exportPath });
 
    } catch (error) {
        console.error('❌ [EXPORT] Lỗi:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getDerivNews = async (req, res) => {
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
    }};

export const refreshDerivNews = async (req, res) => {
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
};