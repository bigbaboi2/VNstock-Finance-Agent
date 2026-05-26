import axios from 'axios';
import chalk from 'chalk';
import { cryptoCache } from '../services/cryptoService.js';

const TTL_FEAR_GREED    = 15 * 60 * 1000;
const TTL_GLOBAL_MARKET =  5 * 60 * 1000;

const isFresh = (updatedAt, ttl) => updatedAt > 0 && (Date.now() - updatedAt) < ttl;

const fetchFearGreed = async () => {
    if (isFresh(cryptoCache.fearGreed.updatedAt, TTL_FEAR_GREED)) return;
    try {
        const res = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 5000 });
        if (res.data?.data?.[0]) {
            const d = res.data.data[0];
            cryptoCache.fearGreed = { value: parseInt(d.value), label: d.value_classification, updatedAt: Date.now() };
            console.log(chalk.cyan(`[CRYPTO] Fear & Greed: ${d.value} (${d.value_classification})`));
        }
    } catch (e) { console.log(chalk.yellow(`[CRYPTO] Fear & Greed lỗi: ${e.message}`)); }
};

const fetchGlobalMarket = async () => {
    if (isFresh(cryptoCache.globalMarket.updatedAt, TTL_GLOBAL_MARKET)) return;
    try {
        const res = await axios.get('https://api.coingecko.com/api/v3/global', { timeout: 8000 });
        const d = res.data?.data;
        if (d) {
            cryptoCache.dominance = { btc: parseFloat(d.market_cap_percentage?.btc || 50).toFixed(1), eth: parseFloat(d.market_cap_percentage?.eth || 17).toFixed(1), updatedAt: Date.now() };
            cryptoCache.globalMarket = { totalMarketCap: d.total_market_cap?.usd || 0, volume24h: d.total_volume?.usd || 0, marketCapChangePercent: parseFloat(d.market_cap_change_percentage_24h_usd || 0).toFixed(2), updatedAt: Date.now() };
            console.log(chalk.cyan(`[CRYPTO] Global market cập nhật lúc ${new Date().toLocaleTimeString('vi-VN')}`));
        }
    } catch (e) { console.log(chalk.yellow(`[CRYPTO] Global market lỗi: ${e.message}`)); }
};

export const startCryptoUpdater = () => {
    fetchFearGreed();
    fetchGlobalMarket();
    setInterval(fetchFearGreed, TTL_FEAR_GREED);
    setInterval(fetchGlobalMarket, TTL_GLOBAL_MARKET);
    console.log('[HỆ THỐNG] Giám sát Market Crypto đã khởi động...');
};