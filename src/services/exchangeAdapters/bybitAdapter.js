import axios from 'axios';
import crypto from 'crypto';

/**
 * BYBIT SPOT ADAPTER (API v5, category=spot)
 * LIVE:    https://api.bybit.com
 * TESTNET: https://api-testnet.bybit.com
 * Signing: HMAC-SHA256(timestamp + apiKey + recvWindow + (queryString|jsonBody))
 */

const BASE_URLS = {
    LIVE: 'https://api.bybit.com',
    TESTNET: 'https://api-testnet.bybit.com',
};
const RECV_WINDOW = '5000';

const buildHeaders = (apiKey, secret, payload) => {
    const timestamp = String(Date.now());
    const prehash = timestamp + apiKey + RECV_WINDOW + payload;
    const sign = crypto.createHmac('sha256', secret).update(prehash).digest('hex');
    return {
        'X-BAPI-API-KEY': apiKey,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': RECV_WINDOW,
        'X-BAPI-SIGN': sign,
        'Content-Type': 'application/json',
    };
};

const bybitGet = async (apiKey, secret, environment, path, params = {}) => {
    const base = BASE_URLS[environment] || BASE_URLS.TESTNET;
    const query = new URLSearchParams(params).toString();
    const headers = buildHeaders(apiKey, secret, query);
    const res = await axios.get(`${base}${path}?${query}`, { headers, timeout: 10000 });
    if (res.data.retCode !== 0) throw new Error(`Bybit [${res.data.retCode}]: ${res.data.retMsg}`);
    return res.data.result;
};

const bybitPost = async (apiKey, secret, environment, path, bodyObj) => {
    const base = BASE_URLS[environment] || BASE_URLS.TESTNET;
    const body = JSON.stringify(bodyObj);
    const headers = buildHeaders(apiKey, secret, body);
    const res = await axios.post(`${base}${path}`, bodyObj, { headers, timeout: 10000 });
    if (res.data.retCode !== 0) throw new Error(`Bybit [${res.data.retCode}]: ${res.data.retMsg}`);
    return res.data.result;
};

const mapError = (err) => err.message || 'Lỗi kết nối Bybit.';

const parseWalletBalances = (result) => {
    const balances = {};
    for (const account of result?.list || []) {
        for (const coin of account.coin || []) {
            const total = parseFloat(coin.walletBalance || 0);
            if (total > 0) balances[coin.coin] = +total.toFixed(8);
        }
    }
    return balances;
};

export const bybitAdapter = {
    name: 'BYBIT',

    async testConnection(apiKey, secret, _passphrase, environment) {
        const start = Date.now();
        try {
            const result = await bybitGet(apiKey, secret, environment, '/v5/account/wallet-balance', { accountType: 'UNIFIED' });
            return {
                success: true,
                permissions: ['READ', 'TRADE'],
                balances: parseWalletBalances(result),
                latencyMs: Date.now() - start,
                message: 'Kết nối Bybit thành công.',
            };
        } catch (err) {
            return { success: false, permissions: [], balances: {}, latencyMs: Date.now() - start, message: mapError(err) };
        }
    },

    async getBalance(apiKey, secret, _passphrase, environment) {
        const result = await bybitGet(apiKey, secret, environment, '/v5/account/wallet-balance', { accountType: 'UNIFIED' });
        return parseWalletBalances(result);
    },

    async placeOrder(apiKey, secret, _passphrase, environment, { symbol, side, qty, orderType = 'MARKET', price }) {
        try {
            const body = {
                category: 'spot',
                symbol: symbol.toUpperCase(),
                side: side.charAt(0).toUpperCase() + side.slice(1).toLowerCase(), // Buy | Sell
                orderType: orderType === 'LIMIT' ? 'Limit' : 'Market',
                qty: String(qty),
                // Market BUY mặc định qty là quote currency → ép base để khớp qty coin
                ...(orderType === 'MARKET' && side.toUpperCase() === 'BUY' ? { marketUnit: 'baseCoin' } : {}),
                ...(orderType === 'LIMIT' ? { price: String(price) } : {}),
            };
            const result = await bybitPost(apiKey, secret, environment, '/v5/order/create', body);
            return {
                success: true,
                externalOrderId: result?.orderId || null,
                status: 'PENDING',
                filledPrice: null,
                filledQuantity: 0,
                rawResponse: result,
            };
        } catch (err) {
            return { success: false, message: mapError(err), rawResponse: err.response?.data || null };
        }
    },

    async cancelOrder(apiKey, secret, _passphrase, environment, { externalOrderId, symbol }) {
        try {
            const result = await bybitPost(apiKey, secret, environment, '/v5/order/cancel', {
                category: 'spot',
                symbol: symbol.toUpperCase(),
                orderId: externalOrderId,
            });
            return { success: true, message: 'Đã hủy lệnh.', rawResponse: result };
        } catch (err) {
            return { success: false, message: mapError(err) };
        }
    },

    async getOrderStatus(apiKey, secret, _passphrase, environment, { externalOrderId, symbol }) {
        try {
            const result = await bybitGet(apiKey, secret, environment, '/v5/order/realtime', {
                category: 'spot',
                symbol: symbol.toUpperCase(),
                orderId: externalOrderId,
            });
            const order = result?.list?.[0];
            const statusMap = {
                New: 'PENDING', PartiallyFilled: 'PARTIAL', Filled: 'FILLED',
                Cancelled: 'CANCELLED', Rejected: 'FAILED', PartiallyFilledCanceled: 'PARTIAL',
            };
            return {
                success: true,
                status: statusMap[order?.orderStatus] || 'PENDING',
                filledQty: parseFloat(order?.cumExecQty || 0),
                filledPrice: parseFloat(order?.avgPrice || 0) || null,
            };
        } catch (err) {
            return { success: false, message: mapError(err) };
        }
    },

    async listTradableSymbols(environment, marketType = 'SPOT') {
        try {
            const base = BASE_URLS[environment] || BASE_URLS.TESTNET;
            const category = String(marketType).toUpperCase() === 'FUTURES' ? 'linear' : 'spot';
            const res = await axios.get(
                `${base}/v5/market/instruments-info?category=${category}`,
                { timeout: 15000 }
            );
            return (res.data.result?.list || [])
                .filter(s => s.status === 'Trading' && String(s.symbol).endsWith('USDT'))
                .map(s => s.symbol);
        } catch {
            return [];
        }
    },

    async getSymbolInfo(symbol, environment) {
        try {
            const base = BASE_URLS[environment] || BASE_URLS.TESTNET;
            const res = await axios.get(
                `${base}/v5/market/instruments-info?category=spot&symbol=${symbol.toUpperCase()}`,
                { timeout: 8000 }
            );
            const info = res.data.result?.list?.[0];
            if (!info) return { exists: false };
            return {
                exists: info.status === 'Trading',
                minQty: parseFloat(info.lotSizeFilter?.minOrderQty || 0),
                stepSize: parseFloat(info.lotSizeFilter?.basePrecision || 0),
                minNotional: parseFloat(info.lotSizeFilter?.minOrderAmt || 0),
            };
        } catch {
            return { exists: false };
        }
    },
};

export default bybitAdapter;
