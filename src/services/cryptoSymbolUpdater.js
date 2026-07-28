import axios from 'axios';
import chalk from 'chalk';
import CryptoCoin from '../../models/CryptoCoin.js';
import Setting from '../../models/Setting.js';

const TOP_COINS = 200;
const CRYPTO_CATALOG_SYNC_KEY = 'cryptoCatalogSync';
const DEFAULT_CRYPTO_CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

const getTtlMs = () => {
    const configured = Number(process.env.CRYPTO_CATALOG_CACHE_TTL_MS);
    return Number.isFinite(configured) && configured >= 0
        ? configured
        : DEFAULT_CRYPTO_CATALOG_TTL_MS;
};

const getFreshCatalogCache = async () => {
    const [syncState, coinCount] = await Promise.all([
        Setting.findOne({ key: CRYPTO_CATALOG_SYNC_KEY }).lean(),
        CryptoCoin.countDocuments({}),
    ]);
    const syncedAt = new Date(syncState?.value?.syncedAt || 0).getTime();
    const ageMs = Date.now() - syncedAt;
    const ttlMs = getTtlMs();
    return {
        isFresh: coinCount >= TOP_COINS && syncedAt > 0 && ageMs >= 0 && ageMs < ttlMs,
        coinCount,
        ageMs,
        ttlMs,
    };
};

export async function updateCryptoSymbols({ force = false } = {}) {
    try {
        const cache = await getFreshCatalogCache();
        if (!force && cache.isFresh) {
            const remainingMinutes = Math.max(0, Math.ceil((cache.ttlMs - cache.ageMs) / 60_000));
            console.log(chalk.cyan(
                `[HỆ THỐNG] Danh mục crypto đang dùng cache MongoDB (${cache.coinCount} coin, refresh sau ~${remainingMinutes} phút).`
            ));
            return CryptoCoin.find({}, { symbol: 1, name: 1, image: 1, _id: 0 }).lean();
        }

        const res = await axios.get(
            `https://api.coingecko.com/api/v3/coins/markets`,
            {
                params: {
                    vs_currency: 'usd',
                    order: 'market_cap_desc',
                    per_page: TOP_COINS,
                    page: 1
                },
                timeout: 10000
            }
        );

        const coins = (res.data || []).map(coin => ({
            symbol: coin.symbol?.toUpperCase() || '',
            name: coin.name || '',
            image: coin.image || '',
            marketCap: coin.market_cap || 0,
            currentPrice: coin.current_price || 0,
            change24h: coin.price_change_percentage_24h || 0
        }));

        if (coins.length === 0) {
            console.log(
                chalk.yellow('[CRYPTO] Không nhận được dữ liệu coin.')
            );
            return [];
        }

        const ops = coins.map(coin => ({
            updateOne: {
                filter: {
                    symbol: coin.symbol
                },

                update: {
                    $set: coin
                },

                upsert: true
            }
        }));

        await CryptoCoin.bulkWrite(ops);
        await Setting.updateOne(
            { key: CRYPTO_CATALOG_SYNC_KEY },
            {
                $set: {
                    value: {
                        syncedAt: new Date(),
                        coinCount: coins.length,
                        source: 'coingecko',
                    },
                },
            },
            { upsert: true }
        );

        console.log(
            chalk.green(
                `[HỆ THỐNG] Đã cập nhật ${coins.length} coin phổ biến nhất.`
            )
        );

        return coins;

    } catch (error) {

        console.error(
            chalk.red('[CRYPTO] Lỗi cập nhật symbols:'),
            error.message
        );

        return [];
    }
}
