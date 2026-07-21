import axios from 'axios';
import crypto from 'crypto';

/**
 * BINANCE SPOT ADAPTER
 * LIVE:    https://api.binance.com
 * TESTNET: https://testnet.binance.vision
 * Signing: HMAC-SHA256 trên query string, header X-MBX-APIKEY
 */

const BASE_URLS = {
    LIVE: 'https://api.binance.com',
    TESTNET: 'https://testnet.binance.vision',
};

const ERROR_MAP = {
    '-2010': 'INSUFFICIENT_BALANCE — Số dư không đủ để đặt lệnh.',
    '-1121': 'INVALID_SYMBOL — Symbol không tồn tại trên sàn.',
    '-2011': 'ORDER_NOT_FOUND — Không tìm thấy lệnh (đã khớp hoặc đã hủy?).',
    '-1013': 'MIN_NOTIONAL — Giá trị lệnh quá nhỏ so với quy định sàn.',
    '-2015': 'INVALID_API_KEY — API key sai, hết hạn, hoặc IP chưa được whitelist.',
    '-1022': 'INVALID_SIGNATURE — Chữ ký không hợp lệ (kiểm tra lại Secret Key).',
};

const mapError = (err) => {
    const data = err.response?.data;
    if (data?.code !== undefined) {
        const mapped = ERROR_MAP[String(data.code)];
        return mapped || `Binance error ${data.code}: ${data.msg || 'Unknown'}`;
    }
    return err.message || 'Lỗi kết nối Binance.';
};

const sign = (secret, queryString) =>
    crypto.createHmac('sha256', secret).update(queryString).digest('hex');

const signedRequest = async (apiKey, secret, environment, method, path, params = {}) => {
    const base = BASE_URLS[environment] || BASE_URLS.TESTNET;
    const query = new URLSearchParams({
        ...params,
        timestamp: Date.now(),
        recvWindow: 5000,
    }).toString();
    const signature = sign(secret, query);
    const url = `${base}${path}?${query}&signature=${signature}`;

    const res = await axios({
        method,
        url,
        headers: { 'X-MBX-APIKEY': apiKey },
        timeout: 10000,
    });
    return res.data;
};

const parseBalances = (accountData) => {
    const balances = {};
    for (const b of accountData.balances || []) {
        const free = parseFloat(b.free);
        const locked = parseFloat(b.locked);
        if (free > 0 || locked > 0) balances[b.asset] = +(free + locked).toFixed(8);
    }
    return balances;
};

export const binanceAdapter = {
    name: 'BINANCE',

    async testConnection(apiKey, secret, _passphrase, environment) {
        const start = Date.now();
        try {
            const account = await signedRequest(apiKey, secret, environment, 'GET', '/api/v3/account');
            const permissions = [];
            if (account.canTrade !== false) permissions.push('TRADE');
            permissions.push('READ');
            if (account.canWithdraw === true) permissions.push('WITHDRAW'); // để cảnh báo user
            return {
                success: true,
                permissions,
                balances: parseBalances(account),
                latencyMs: Date.now() - start,
                message: 'Kết nối Binance thành công.',
            };
        } catch (err) {
            return { success: false, permissions: [], balances: {}, latencyMs: Date.now() - start, message: mapError(err) };
        }
    },

    async getBalance(apiKey, secret, _passphrase, environment) {
        const account = await signedRequest(apiKey, secret, environment, 'GET', '/api/v3/account');
        return parseBalances(account);
    },

    async placeOrder(apiKey, secret, _passphrase, environment, { symbol, side, qty, orderType = 'MARKET', price }) {
        try {
            const params = {
                symbol: symbol.toUpperCase(),
                side: side.toUpperCase(),
                type: orderType.toUpperCase(),
                quantity: qty,
            };
            if (orderType === 'LIMIT') {
                params.price = price;
                params.timeInForce = 'GTC';
            }
            const data = await signedRequest(apiKey, secret, environment, 'POST', '/api/v3/order', params);

            const fills = data.fills || [];
            let filledPrice = null;
            let feeUSDT = null;
            let feeAsset = null;
            if (fills.length > 0) {
                const totalQty = fills.reduce((s, f) => s + parseFloat(f.qty), 0);
                const totalQuote = fills.reduce((s, f) => s + parseFloat(f.qty) * parseFloat(f.price), 0);
                filledPrice = totalQty > 0 ? totalQuote / totalQty : null;

                let feeSumUsdt = 0;
                let convertedAll = true;
                const base = String(params.symbol || '').replace(/USDT$/i, '').toUpperCase();
                for (const f of fills) {
                    const commission = parseFloat(f.commission);
                    if (!Number.isFinite(commission) || commission === 0) continue;
                    const asset = String(f.commissionAsset || '').toUpperCase();
                    feeAsset = feeAsset || asset;
                    const px = parseFloat(f.price) || filledPrice || 0;
                    if (asset === 'USDT' || asset === 'BUSD' || asset === 'FDUSD' || asset === 'USD') {
                        feeSumUsdt += commission;
                    } else if (asset === base && px > 0) {
                        feeSumUsdt += commission * px;
                    } else {
                        // BNB or unknown — leave for brokerFeeService schedule fallback
                        convertedAll = false;
                        break;
                    }
                }
                if (convertedAll && feeSumUsdt > 0) feeUSDT = Math.round(feeSumUsdt * 1e8) / 1e8;
            }
            return {
                success: true,
                externalOrderId: String(data.orderId),
                status: data.status === 'FILLED' ? 'FILLED' : (data.status === 'PARTIALLY_FILLED' ? 'PARTIAL' : 'PENDING'),
                filledPrice,
                filledQuantity: parseFloat(data.executedQty || 0),
                feeUSDT,
                feeAsset: feeUSDT != null ? (feeAsset || 'USDT') : null,
                feeSource: feeUSDT != null ? 'API' : null,
                rawResponse: data,
            };
        } catch (err) {
            return { success: false, message: mapError(err), rawResponse: err.response?.data || null };
        }
    },

    async cancelOrder(apiKey, secret, _passphrase, environment, { externalOrderId, symbol }) {
        try {
            const data = await signedRequest(apiKey, secret, environment, 'DELETE', '/api/v3/order', {
                symbol: symbol.toUpperCase(),
                orderId: externalOrderId,
            });
            return { success: true, message: 'Đã hủy lệnh.', rawResponse: data };
        } catch (err) {
            return { success: false, message: mapError(err) };
        }
    },

    async getOrderStatus(apiKey, secret, _passphrase, environment, { externalOrderId, symbol }) {
        try {
            const data = await signedRequest(apiKey, secret, environment, 'GET', '/api/v3/order', {
                symbol: symbol.toUpperCase(),
                orderId: externalOrderId,
            });
            const statusMap = {
                NEW: 'PENDING', PARTIALLY_FILLED: 'PARTIAL', FILLED: 'FILLED',
                CANCELED: 'CANCELLED', REJECTED: 'FAILED', EXPIRED: 'CANCELLED',
            };
            return {
                success: true,
                status: statusMap[data.status] || 'PENDING',
                filledQty: parseFloat(data.executedQty || 0),
                filledPrice: parseFloat(data.cummulativeQuoteQty || 0) / Math.max(parseFloat(data.executedQty || 0), 1e-12),
            };
        } catch (err) {
            return { success: false, message: mapError(err) };
        }
    },

    async listTradableSymbols(environment, marketType = 'SPOT') {
        if (String(marketType).toUpperCase() !== 'SPOT') return [];
        try {
            const base = BASE_URLS[environment] || BASE_URLS.TESTNET;
            const res = await axios.get(`${base}/api/v3/exchangeInfo`, { timeout: 15000 });
            return (res.data.symbols || [])
                .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
                .map(s => s.symbol);
        } catch {
            return [];
        }
    },

    async getSymbolInfo(symbol, environment) {
        try {
            const base = BASE_URLS[environment] || BASE_URLS.TESTNET;
            const res = await axios.get(`${base}/api/v3/exchangeInfo?symbol=${symbol.toUpperCase()}`, { timeout: 8000 });
            const info = res.data.symbols?.[0];
            if (!info) return { exists: false };
            const lotFilter = (info.filters || []).find(f => f.filterType === 'LOT_SIZE') || {};
            const notionalFilter = (info.filters || []).find(f => ['MIN_NOTIONAL', 'NOTIONAL'].includes(f.filterType)) || {};
            return {
                exists: info.status === 'TRADING',
                minQty: parseFloat(lotFilter.minQty || 0),
                stepSize: parseFloat(lotFilter.stepSize || 0),
                minNotional: parseFloat(notionalFilter.minNotional || notionalFilter.notional || 0),
            };
        } catch {
            return { exists: false };
        }
    },
};

export default binanceAdapter;
