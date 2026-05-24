import axios from 'axios';
import chalk from 'chalk';
import CryptoCoin from '../../models/CryptoCoin.js';

const TOP_COINS = 200;

export async function updateCryptoSymbols() {

    console.log(
        chalk.cyan('\n[CRYPTO] Đang quét danh sách coin từ CoinGecko...')
    );

    try {

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

        console.log(
            chalk.green(
                `✔ Đã cập nhật ${coins.length} coin phổ biến nhất.`
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