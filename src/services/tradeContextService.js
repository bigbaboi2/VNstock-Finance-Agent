import axios from 'axios';
import chalk from 'chalk';
import Stock from '../../models/Stock.js';
import CryptoCoin from '../../models/CryptoCoin.js';
import { scrapeCafefMarketOverview } from '../scrapers/cafefMarketScraper.js';
import { analyzeMarketIntelligence } from './quantEngine.js';
import { globalDerivCache } from '../jobs/derivUpdater.js';
import { getCachedData, saveToCache } from './cacheService.js';

const ENTRADE_BASE = 'https://services.entrade.com.vn/chart-api/v2/ohlcs';
const MEMORY_TTL = 2 * 60 * 1000;
const VN_BATCH_SCAN_CACHE_KEY = 'VN_BATCH_SCAN_RANKING';
const VN_BATCH_SCAN_TTL = 12 * 60 * 1000;
const VN_OHLCV_CACHE_TTL = 15 * 60 * 1000;

const memoryCache = new Map();

const getMemory = (key, customTTL = MEMORY_TTL) => {
    const cached = memoryCache.get(key);
    if (!cached || Date.now() - cached.updatedAt > customTTL) return null;
    return cached.data;
};

const setMemory = (key, data) => {
    memoryCache.set(key, { data, updatedAt: Date.now() });
    return data;
};

const isFreshPayload = (payload, ttlMs) => {
    const ts = payload?.fetchedAt || payload?.updatedAt;
    if (!ts) return false;
    const time = new Date(ts).getTime();
    return Number.isFinite(time) && Date.now() - time < ttlMs;
};

const chunkArray = (items, size) => {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
};

const uniqSymbols = (symbols) => [
    ...new Set(
        (symbols || [])
            .map(s => typeof s === 'string' ? s : s?.symbol || s?.sym)
            .filter(Boolean)
            .map(s => String(s).toUpperCase().trim())
            .filter(s => /^[A-Z0-9]{2,10}$/.test(s))
    )
];

const fetchEntradeCandles = async (symbol, resolution = '1D', days = 10, type = 'stock') => {
    const to = Math.floor(Date.now() / 1000);
    const from = to - (days * 24 * 60 * 60);
    const res = await axios.get(
        `${ENTRADE_BASE}/${type}?from=${from}&to=${to}&symbol=${symbol}&resolution=${resolution}`,
        { timeout: 7000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );

    const d = res.data || {};
    if (!d.t?.length) return [];
    return d.t.map((time, i) => ({
        time,
        open: Number(d.o?.[i]),
        high: Number(d.h?.[i]),
        low: Number(d.l?.[i]),
        close: Number(d.c?.[i]),
        volume: Number(d.v?.[i]) || 0,
    }));
};

const fetchCachedVnStockCandles = async (symbol, { resolution = '1D', days = 30 } = {}) => {
    const cacheKey = `VN_OHLCV_${symbol}_${resolution}_${days}`;
    const inMemory = getMemory(cacheKey);
    if (inMemory && isFreshPayload(inMemory, VN_OHLCV_CACHE_TTL)) return inMemory.candles;

    const dbCached = await getCachedData(cacheKey);
    if (dbCached && isFreshPayload(dbCached, VN_OHLCV_CACHE_TTL)) {
        setMemory(cacheKey, dbCached);
        return dbCached.candles || [];
    }

    const candles = await fetchEntradeCandles(symbol, resolution, days, 'stock');
    const payload = { symbol, resolution, days, candles, fetchedAt: new Date().toISOString() };
    setMemory(cacheKey, payload);
    await saveToCache(cacheKey, payload);
    return candles;
};

const scoreVnCandidate = (symbol, candles, marketContext) => {
    if (!candles || candles.length < 8) return null;

    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    if (!last?.close || !prev?.close || !last.volume) return null;

    const closes = candles.map(c => Number(c.close)).filter(Number.isFinite);
    const volumes = candles.map(c => Number(c.volume || 0));
    const avgVol20Base = volumes.slice(-21, -1);
    const avgVol20 = avgVol20Base.length
        ? avgVol20Base.reduce((sum, v) => sum + v, 0) / avgVol20Base.length
        : last.volume;
    const changePct = ((last.close - prev.close) / prev.close) * 100;
    
    // Bỏ qua các mã đã tăng trần hoặc giảm sàn (biên độ >= 6.8%) vì không còn khả năng giao dịch
    if (Math.abs(changePct) >= 6.8) {
        return null;
    }

    const momentum5Base = candles.at(-6)?.close || prev.close;
    const momentum5d = momentum5Base ? ((last.close - momentum5Base) / momentum5Base) * 100 : changePct;
    const volSurge = avgVol20 > 0 ? last.volume / avgVol20 : 1;
    const liquidityValue = last.close * 1000 * last.volume;
    const pricePosition = closes.length > 1
        ? (last.close - Math.min(...closes)) / Math.max(0.0001, Math.max(...closes) - Math.min(...closes))
        : 0.5;

    const intel = marketContext?.intelligence || {};
    const strongSectorTickers = new Set((intel.strongSectors || []).flatMap(s => s.tickers || []));
    const topVolumeTickers = new Set((intel.topVolume || []).map(s => s.symbol));
    const topGainerTickers = new Set((intel.topGainers || []).map(s => s.symbol));

    const changeScore = Math.max(0, Math.min(100, 50 + changePct * 8));
    const momentumScore = Math.max(0, Math.min(100, 50 + momentum5d * 5));
    const volumeScore = Math.max(0, Math.min(100, 35 + volSurge * 22));
    const liquidityScore = Math.max(0, Math.min(100, Math.log10(Math.max(1, liquidityValue)) * 7));
    const positionScore = Math.max(0, Math.min(100, pricePosition * 100));
    const contextBonus =
        (strongSectorTickers.has(symbol) ? 8 : 0) +
        (topVolumeTickers.has(symbol) ? 6 : 0) +
        (topGainerTickers.has(symbol) ? 6 : 0);

    const preScore = Math.round(Math.max(0, Math.min(100,
        changeScore * 0.24 +
        momentumScore * 0.22 +
        volumeScore * 0.24 +
        liquidityScore * 0.18 +
        positionScore * 0.08 +
        contextBonus
    )));

    return {
        symbol,
        preScore,
        changePct: Math.round(changePct * 100) / 100,
        momentum5d: Math.round(momentum5d * 100) / 100,
        volume: last.volume,
        avgVol20: Math.round(avgVol20),
        volSurge: Math.round(volSurge * 100) / 100,
        liquidityValue: Math.round(liquidityValue),
        lastClose: last.close,
        contextBonus,
    };
};

export const runVnBatchSymbolScanner = async ({
    marketContext = null,
    forceRefresh = false,
    chunkSize = 12,
    topLimit = 20,
} = {}) => {
    if (!forceRefresh) {
        const inMemory = getMemory(VN_BATCH_SCAN_CACHE_KEY);
        if (inMemory && isFreshPayload(inMemory, VN_BATCH_SCAN_TTL)) return inMemory;

        const dbCached = await getCachedData(VN_BATCH_SCAN_CACHE_KEY);
        if (dbCached && isFreshPayload(dbCached, VN_BATCH_SCAN_TTL)) {
            return setMemory(VN_BATCH_SCAN_CACHE_KEY, dbCached);
        }
    }

    const symbolsDb = await Stock.find({
        symbol: { $nin: ['VNINDEX', 'VN30', 'HNX'] },
    }, { symbol: 1, sector: 1, exchange: 1 }).lean();

    const symbols = uniqSymbols(symbolsDb).filter(symbol => !symbol.includes('INDEX'));
    const chunks = chunkArray(symbols, Math.max(5, Math.min(20, chunkSize)));
    const ranked = [];
    const failed = [];

    for (const chunk of chunks) {
        const results = await Promise.all(chunk.map(async (symbol) => {
            try {
                const candles = await fetchCachedVnStockCandles(symbol, { resolution: '1D', days: 35 });
                return scoreVnCandidate(symbol, candles, marketContext);
            } catch (err) {
                failed.push({ symbol, reason: err.message });
                return null;
            }
        }));

        ranked.push(...results.filter(Boolean));
    }

    ranked.sort((a, b) => b.preScore - a.preScore);
    const payload = {
        success: true,
        source: 'VN_FULL_DB_BATCH_SCANNER',
        fetchedAt: new Date().toISOString(),
        scannedCount: symbols.length,
        rankedCount: ranked.length,
        failedCount: failed.length,
        chunkSize: Math.max(5, Math.min(20, chunkSize)),
        top: ranked.slice(0, topLimit),
        failed: failed.slice(0, 30),
    };

    setMemory(VN_BATCH_SCAN_CACHE_KEY, payload);
    await saveToCache(VN_BATCH_SCAN_CACHE_KEY, payload);
    return payload;
};

export const getVnMarketContext = async ({ forceRefresh = false } = {}) => {
    if (!forceRefresh) {
        const inMemory = getMemory('VN_MARKET_CONTEXT', 14 * 60 * 1000); // 14 mins TTL
        if (inMemory) return inMemory;

        const cached = await Stock.findOne({ symbol: 'VNINDEX' }).lean();
        const cachedIntel = cached?.cafeF?.lastQuantIntelligence;
        if (cachedIntel) {
            return setMemory('VN_MARKET_CONTEXT', {
                success: true,
                isLive: false,
                intelligence: cachedIntel,
                source: 'VNINDEX_DB_CACHE',
                fetchedAt: cached.lastUpdated || new Date(),
            });
        }
    }

    const marketScraped = await scrapeCafefMarketOverview();
    if (!marketScraped.success) throw new Error('Khong lay duoc market overview CafeF');

    const vnIndexCandles = await fetchEntradeCandles('VNINDEX', '1D', 15, 'index');
    const vnIndexData = vnIndexCandles.map(c => ({ close: c.close, volume: c.volume }));
    const symbolsDb = await Stock.find({}).lean();
    const intel = analyzeMarketIntelligence(vnIndexData, marketScraped, symbolsDb);
    if (!intel.success) throw new Error(intel.error || 'QuantEngine khong tra ve market intelligence');

    await Stock.findOneAndUpdate(
        { symbol: 'VNINDEX' },
        {
            symbol: 'VNINDEX',
            cafeF: { lastQuantIntelligence: intel.intelligence },
            lastUpdated: new Date(),
        },
        { upsert: true }
    );

    return setMemory('VN_MARKET_CONTEXT', {
        success: true,
        isLive: true,
        intelligence: intel.intelligence,
        source: 'CAFEF_ENTRADE_LIVE',
        fetchedAt: new Date(),
    });
};

export const buildVnStockScanUniverse = async (marketContext, limit = 25) => {
    try {
        const batchRanking = await runVnBatchSymbolScanner({
            marketContext,
            chunkSize: 15,
            topLimit: Math.max(limit, 40),
        });

        const batchSymbols = uniqSymbols(batchRanking.top || []);
        if (batchSymbols.length >= Math.min(8, limit)) {
            return batchSymbols.slice(0, limit);
        }
    } catch (err) {
        console.log(chalk.yellow(`[VN BATCH SCANNER] Fallback sang universe nhanh: ${err.message}`));
    }

    const intel = marketContext?.intelligence || {};
    const fromTopLists = uniqSymbols([
        ...(intel.topGainers || []).slice(0, 8),
        ...(intel.topVolume || []).slice(0, 8),
        ...(intel.strongSectors || []).flatMap(s => s.tickers || []).slice(0, 10),
    ]);

    const dbCandidates = await Stock.find({
        symbol: { $nin: ['VNINDEX', 'VN30', 'HNX'] },
        $or: [
            { volume: { $gt: 500_000 } },
            { changePct: { $gt: 0 } },
            { sector: { $nin: [null, '', 'KH%C3%81C'] } },
        ],
    })
        .sort({ changePct: -1, lastUpdated: -1 })
        .limit(30)
        .lean()
        .catch(() => []);

    const fromDb = uniqSymbols(dbCandidates);
    const fallback = ['FPT', 'VCB', 'HPG', 'MBB', 'TCB', 'SSI', 'VHM', 'VIC', 'MWG', 'DGC', 'GAS', 'PVD'];

    return uniqSymbols([...fromTopLists, ...fromDb, ...fallback]).slice(0, limit);
};

const calcRSI = (closes, period = 14) => {
    // BUG FIX #5: dùng Wilder smoothing (giống autoTradeEngine) thay vì simple average cắt cụt
    if (closes.length < period + 1) return 50;

    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
};

// ============================================================
// CRYPTO BATCH SCANNER & UNIVERSE
// ============================================================
const scoreCryptoCandidate = (symbol, candles) => {
    if (!candles || candles.length < 20) return null;

    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    if (!last?.close || !prev?.close || !last.volume) return null;

    const closes = candles.map(c => Number(c.close)).filter(Number.isFinite);
    const volumes = candles.map(c => Number(c.volume || 0));
    const avgVol20Base = volumes.slice(-21, -1);
    const avgVol20 = avgVol20Base.length
        ? avgVol20Base.reduce((sum, v) => sum + v, 0) / avgVol20Base.length
        : last.volume;
    const rsi = calcRSI(closes, 14);
    
    const changePct = ((last.close - prev.close) / prev.close) * 100;
    const momentum5Base = candles.at(-6)?.close || prev.close;
    const momentum5d = momentum5Base ? ((last.close - momentum5Base) / momentum5Base) * 100 : changePct;
    const volSurge = avgVol20 > 0 ? last.volume / avgVol20 : 1;
    const liquidityValue = last.close * last.volume;

    let rsiScore = 50;
    if (rsi > 78) rsiScore = 15; // Phạt nặng overbought
    else if (rsi > 70) rsiScore = 35;
    else if (rsi > 60) rsiScore = 85; // Đà tăng tốt
    else if (rsi > 50) rsiScore = 75;
    else if (rsi < 25) rsiScore = 70; // Có khả năng bật lại
    else if (rsi < 35) rsiScore = 55;
    else rsiScore = 60;

    // Điểm kỹ thuật sơ bộ (preScore) để lọc ra top ứng viên
    const changeScore = Math.max(0, Math.min(100, 50 + changePct * 10)); // Giảm trọng số
    const momentumScore = Math.max(0, Math.min(100, 50 + momentum5d * 8));
    const volumeScore = Math.max(0, Math.min(100, 40 + volSurge * 20));
    const liquidityScore = Math.max(0, Math.min(100, Math.log10(Math.max(1, liquidityValue)) * 8));

    const preScore = Math.round(Math.max(0, Math.min(100,
        momentumScore * 0.30 +
        volumeScore * 0.30 +
        rsiScore * 0.25 +
        changeScore * 0.05 +
        liquidityScore * 0.10
    )));

    return { symbol, preScore, changePct: Math.round(changePct * 100) / 100, volSurge: Math.round(volSurge * 100) / 100, rsi: Math.round(rsi) };
};

const CRYPTO_BATCH_SCAN_CACHE_KEY = 'CRYPTO_BATCH_SCAN_RANKING';
const CRYPTO_BATCH_SCAN_TTL = 15 * 60 * 1000; // Cache 15 phút

export const runCryptoBatchSymbolScanner = async ({ forceRefresh = false, chunkSize = 15, topLimit = 20 } = {}) => {
    if (!forceRefresh) {
        const inMemory = getMemory(CRYPTO_BATCH_SCAN_CACHE_KEY);
        if (inMemory && isFreshPayload(inMemory, CRYPTO_BATCH_SCAN_TTL)) return inMemory;
        const dbCached = await getCachedData(CRYPTO_BATCH_SCAN_CACHE_KEY);
        if (dbCached && isFreshPayload(dbCached, CRYPTO_BATCH_SCAN_TTL)) return setMemory(CRYPTO_BATCH_SCAN_CACHE_KEY, dbCached);
    }

    // Lấy top 200 coin có vốn hóa tốt nhất từ DB
    const coinsDb = await CryptoCoin.find({ symbol: { $nin: ['USDT', 'USDC', 'FDUSD', 'DAI', 'TUSD', 'USDD'] } })
        .sort({ marketCap: -1 }).limit(200).lean();

    let symbols = uniqSymbols(coinsDb.map(c => c.symbol.toUpperCase() + 'USDT'));
    const chunks = chunkArray(symbols, Math.max(5, Math.min(20, chunkSize)));
    const ranked = [];

    for (const chunk of chunks) {
        const results = await Promise.all(chunk.map(async (symbol) => {
            try {
                const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=120`, { timeout: 8000 });
                const candles = res.data.map(k => ({ time: k[0], open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]) }));
                return scoreCryptoCandidate(symbol, candles);
            } catch (err) { return null; }
        }));
        ranked.push(...results.filter(Boolean));
        await new Promise(r => setTimeout(r, 400)); // Nghỉ 400ms tránh bị Binance chặn Rate Limit
    }

    ranked.sort((a, b) => b.preScore - a.preScore);
    const payload = { success: true, fetchedAt: new Date().toISOString(), top: ranked.slice(0, topLimit) };
    setMemory(CRYPTO_BATCH_SCAN_CACHE_KEY, payload);
    await saveToCache(CRYPTO_BATCH_SCAN_CACHE_KEY, payload);
    return payload;
};

export const buildCryptoScanUniverse = async (limit = 200) => {
    try {
        const batchRanking = await runCryptoBatchSymbolScanner({ chunkSize: 15, topLimit: Math.max(limit, 20) });
        const batchSymbols = uniqSymbols(batchRanking.top || []);
        if (batchSymbols.length >= Math.min(8, limit)) return batchSymbols.slice(0, limit);
    } catch (err) {
        console.log(chalk.yellow(`[CRYPTO BATCH SCANNER] Fallback sang universe nhanh: ${err.message}`));
    }
    const dbCandidates = await CryptoCoin.find({ symbol: { $nin: ['USDT', 'USDC', 'FDUSD', 'DAI'] } })
        .sort({ change24h: -1 }).limit(20).lean().catch(() => []);
    const fromDb = uniqSymbols(dbCandidates.map(c => c.symbol + 'USDT'));
    const fallback = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'AVAXUSDT'];
    return uniqSymbols([...fromDb, ...fallback]).slice(0, limit);
};

export const getCryptoTradeContext = async (symbol = 'BTCUSDT') => {
    const cacheKey = `CRYPTO_CONTEXT_${symbol}`;
    const cached = getMemory(cacheKey);
    if (cached) return cached;

    const [tickerRes, depthRes, fundingRes, oiRes, longShortRes] = await Promise.all([
        axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, { timeout: 5000 }).catch(() => null),
        axios.get(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=20`, { timeout: 4000 }).catch(() => null),
        axios.get(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`, { timeout: 5000 }).catch(() => null),
        axios.get(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`, { timeout: 5000 }).catch(() => null),
        axios.get(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`, { timeout: 5000 }).catch(() => null),
    ]);

    const bids = depthRes?.data?.bids || [];
    const asks = depthRes?.data?.asks || [];
    const bidSize = bids.reduce((sum, b) => sum + Number(b[1] || 0), 0);
    const askSize = asks.reduce((sum, a) => sum + Number(a[1] || 0), 0);
    const bestBid = Number(bids[0]?.[0] || 0);
    const bestAsk = Number(asks[0]?.[0] || 0);

    const context = {
        symbol,
        source: 'BINANCE_SPOT_FUTURES_CONTEXT',
        fetchedAt: new Date(),
        change24h: Number(tickerRes?.data?.priceChangePercent || 0),
        quoteVolume24h: Number(tickerRes?.data?.quoteVolume || 0),
        orderbook: {
            bidPct: bidSize + askSize > 0 ? Math.round((bidSize / (bidSize + askSize)) * 1000) / 10 : null,
            askPct: bidSize + askSize > 0 ? Math.round((askSize / (bidSize + askSize)) * 1000) / 10 : null,
            ratio: askSize > 0 ? Math.round((bidSize / askSize) * 100) / 100 : null,
            spread: bestBid && bestAsk ? Math.round((bestAsk - bestBid) * 100) / 100 : null,
        },
        derivatives: {
            fundingRatePct: Number(fundingRes?.data?.lastFundingRate || 0) * 100,
            openInterest: Number(oiRes?.data?.openInterest || 0),
            longShortRatio: Number(longShortRes?.data?.[0]?.longShortRatio || 0),
        },
    };

    return setMemory(cacheKey, context);
};

export const getDerivativesTradeContext = async () => {
    const cached = getMemory('DERIV_CONTEXT', 60 * 1000); // 1 phút TTL cho phái sinh
    if (cached) return cached;

    const [f1mCandles, vn30Candles] = await Promise.all([
        fetchEntradeCandles('VN30F1M', '15', 5, 'derivative').catch(() => []),
        fetchEntradeCandles('VN30', '15', 5, 'index').catch(() => []),
    ]);

    const lastF1M = f1mCandles.at(-1)?.close || null;
    const lastVN30 = vn30Candles.at(-1)?.close || null;
    const prevF1M = f1mCandles.at(-2)?.close || lastF1M;
    const basis = lastF1M && lastVN30 ? Math.round((lastF1M - lastVN30) * 100) / 100 : null;
    const changePct = lastF1M && prevF1M ? Math.round(((lastF1M - prevF1M) / prevF1M) * 10000) / 100 : null;

    const context = {
        source: 'ENTRADE_DERIVATIVES_CONTEXT',
        fetchedAt: new Date(),
        vn30f1m: lastF1M,
        vn30: lastVN30,
        basis,
        changePct,
        volume: f1mCandles.at(-1)?.volume || null,
        oi: globalDerivCache?.oi || null,
        oiTrend: globalDerivCache?.lastOi
            ? globalDerivCache.oi > globalDerivCache.lastOi ? 'UP' : globalDerivCache.oi < globalDerivCache.lastOi ? 'DOWN' : 'FLAT'
            : 'FLAT',
        foreignNet: globalDerivCache?.foreignNet || null,
    };

    if (!lastF1M) {
        console.log(chalk.yellow('[TRADE CONTEXT] Khong lay duoc VN30F1M context, tiep tuc voi context rong.'));
    }

    return setMemory('DERIV_CONTEXT', context);
};