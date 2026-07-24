import axios from 'axios';
import chalk from 'chalk';
import { cryptoCache } from '../services/cryptoService.js';

const TTL_FEAR_GREED    = 15 * 60 * 1000;
const TTL_GLOBAL_MARKET =  5 * 60 * 1000;

const isFresh = (updatedAt, ttl) => updatedAt > 0 && (Date.now() - updatedAt) < ttl;

const fetchFearGreed = async (force = false) => {
    if (!force && isFresh(cryptoCache.fearGreed.updatedAt, TTL_FEAR_GREED)) return;
    try {
        const res = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 5000 });
        if (res.data?.data?.[0]) {
            const d = res.data.data[0];
            cryptoCache.fearGreed = { value: parseInt(d.value), label: d.value_classification, updatedAt: Date.now() };
            console.log(chalk.cyan(`[CRYPTO] Fear & Greed: ${d.value} (${d.value_classification})`));
        }
    } catch (e) { console.log(chalk.yellow(`[CRYPTO] Fear & Greed lỗi: ${e.message}`)); }
};

const applyGlobalFromCoinGecko = (d) => {
    if (!d) return false;
    cryptoCache.dominance = {
        btc: parseFloat(d.market_cap_percentage?.btc || 50).toFixed(1),
        eth: parseFloat(d.market_cap_percentage?.eth || 17).toFixed(1),
        updatedAt: Date.now(),
    };
    cryptoCache.globalMarket = {
        totalMarketCap: d.total_market_cap?.usd || 0,
        volume24h: d.total_volume?.usd || 0,
        marketCapChangePercent: parseFloat(d.market_cap_change_percentage_24h_usd || 0).toFixed(2),
        updatedAt: Date.now(),
    };
    return !!(cryptoCache.globalMarket.totalMarketCap);
};

const applyGlobalFromCoinPaprika = (d) => {
    if (!d) return false;
    const btcDom = parseFloat(d.bitcoin_dominance_percentage || 50);
    cryptoCache.dominance = {
        btc: btcDom.toFixed(1),
        eth: parseFloat(cryptoCache.dominance?.eth || 17).toFixed(1),
        updatedAt: Date.now(),
    };
    cryptoCache.globalMarket = {
        totalMarketCap: d.market_cap_usd || 0,
        volume24h: d.volume_24h_usd || 0,
        marketCapChangePercent: parseFloat(d.market_cap_change_24h || 0).toFixed(2),
        updatedAt: Date.now(),
    };
    return !!(cryptoCache.globalMarket.totalMarketCap);
};

const fetchGlobalMarket = async (force = false) => {
    if (!force && isFresh(cryptoCache.globalMarket.updatedAt, TTL_GLOBAL_MARKET) && cryptoCache.globalMarket.totalMarketCap) {
        return;
    }
    // 1) CoinGecko
    try {
        const res = await axios.get('https://api.coingecko.com/api/v3/global', { timeout: 8000 });
        if (applyGlobalFromCoinGecko(res.data?.data)) {
            console.log(chalk.cyan(`[CRYPTO] Global market (CoinGecko) cập nhật lúc ${new Date().toLocaleTimeString('vi-VN')}`));
            return;
        }
    } catch (e) {
        console.log(chalk.yellow(`[CRYPTO] Global CoinGecko lỗi: ${e.message}`));
    }
    // 2) CoinPaprika fallback
    try {
        const res = await axios.get('https://api.coinpaprika.com/v1/global', { timeout: 8000 });
        if (applyGlobalFromCoinPaprika(res.data)) {
            console.log(chalk.cyan(`[CRYPTO] Global market (CoinPaprika) cập nhật lúc ${new Date().toLocaleTimeString('vi-VN')}`));
            return;
        }
    } catch (e) {
        console.log(chalk.yellow(`[CRYPTO] Global CoinPaprika lỗi: ${e.message}`));
    }
};

/** Đảm bảo radar có dữ liệu thật trước khi API trả về (tránh --- vì race với lazy updater). */
export const ensureRadarData = async ({ force = false } = {}) => {
    const needGlobal = force || !cryptoCache.globalMarket.totalMarketCap
        || !isFresh(cryptoCache.globalMarket.updatedAt, TTL_GLOBAL_MARKET);
    const needFg = force || !cryptoCache.fearGreed.updatedAt
        || !isFresh(cryptoCache.fearGreed.updatedAt, TTL_FEAR_GREED);
    await Promise.all([
        needFg ? fetchFearGreed(force) : Promise.resolve(),
        needGlobal ? fetchGlobalMarket(force) : Promise.resolve(),
    ]);
};

// ─── Lazy Updater ────────────────────────────────────────────────────────────
let _started = false;
let _fearGreedTimer  = null;
let _globalMktTimer  = null;
let _startPromise = null;

export const ensureCryptoUpdaterRunning = async () => {
    if (_started) return;
    if (!_startPromise) {
        _startPromise = (async () => {
            console.log(chalk.bgCyan.black(' [CRYPTO] Lazy updater khởi động lần đầu — có người dùng tab Crypto '));
            await Promise.all([fetchFearGreed(true), fetchGlobalMarket(true)]);
            _fearGreedTimer = setInterval(() => fetchFearGreed(false), TTL_FEAR_GREED);
            _globalMktTimer = setInterval(() => fetchGlobalMarket(false), TTL_GLOBAL_MARKET);
            _started = true;
        })().catch((err) => {
            _startPromise = null;
            console.log(chalk.yellow(`[CRYPTO] Lazy updater lỗi khởi động: ${err.message}`));
        });
    }
    await _startPromise;
};

export const stopCryptoUpdater = () => {
    if (!_started && !_startPromise) return;
    clearInterval(_fearGreedTimer);
    clearInterval(_globalMktTimer);
    _fearGreedTimer = null;
    _globalMktTimer = null;
    _started = false;
    _startPromise = null;
    console.log(chalk.gray('[CRYPTO] Lazy updater đã dừng.'));
};

export const startCryptoUpdater = ensureCryptoUpdaterRunning;
