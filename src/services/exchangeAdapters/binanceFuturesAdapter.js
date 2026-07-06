import axios from 'axios';
import crypto from 'crypto';

/**
 * BINANCE USD-M FUTURES ADAPTER (perpetual) — hỗ trợ SHORT + đòn bẩy.
 * LIVE:    https://fapi.binance.com
 * TESTNET: https://testnet.binancefuture.com
 * Signing: HMAC-SHA256 trên query string, header X-MBX-APIKEY (giống spot).
 *
 * Giả định ONE-WAY MODE (positionSide BOTH) — chế độ mặc định của Binance.
 * SHORT = mở bằng SELL; đóng SHORT = BUY reduceOnly. LONG = BUY; đóng = SELL reduceOnly.
 */

const BASE_URLS = {
    LIVE: 'https://fapi.binance.com',
    TESTNET: 'https://testnet.binancefuture.com',
};

const ERROR_MAP = {
    '-2019': 'MARGIN_INSUFFICIENT — Số dư ký quỹ (ví Futures) không đủ.',
    '-1121': 'INVALID_SYMBOL — Symbol futures không tồn tại.',
    '-2011': 'ORDER_NOT_FOUND — Không tìm thấy lệnh.',
    '-1013': 'MIN_NOTIONAL — Giá trị lệnh quá nhỏ so với quy định sàn.',
    '-2015': 'INVALID_API_KEY — API key sai/hết hạn/IP chưa whitelist, hoặc CHƯA bật quyền Futures.',
    '-1022': 'INVALID_SIGNATURE — Chữ ký sai (kiểm tra Secret Key).',
    '-4131': 'PRICE_FILTER — Giá vượt biên cho phép.',
    '-4061': 'POSITION_SIDE_NOT_MATCH — Tài khoản đang ở Hedge mode; adapter này yêu cầu One-way mode.',
};

const mapError = (err) => {
    const data = err.response?.data;
    if (data?.code !== undefined) return ERROR_MAP[String(data.code)] || `Binance Futures error ${data.code}: ${data.msg || 'Unknown'}`;
    return err.message || 'Lỗi kết nối Binance Futures.';
};

const sign = (secret, q) => crypto.createHmac('sha256', secret).update(q).digest('hex');

const signedRequest = async (apiKey, secret, environment, method, path, params = {}) => {
    const base = BASE_URLS[environment] || BASE_URLS.TESTNET;
    const query = new URLSearchParams({ ...params, timestamp: Date.now(), recvWindow: 5000 }).toString();
    const signature = sign(secret, query);
    const url = `${base}${path}?${query}&signature=${signature}`;
    const res = await axios({ method, url, headers: { 'X-MBX-APIKEY': apiKey }, timeout: 10000 });
    return res.data;
};

export const binanceFuturesAdapter = {
    name: 'BINANCE_FUTURES',

    async testConnection(apiKey, secret, _passphrase, environment) {
        const start = Date.now();
        try {
            const account = await signedRequest(apiKey, secret, environment, 'GET', '/fapi/v2/account');
            const permissions = ['READ'];
            if (account.canTrade !== false) permissions.push('TRADE');
            const usdt = (account.assets || []).find(a => a.asset === 'USDT');
            return {
                success: true,
                permissions,
                balances: { USDT: usdt ? +parseFloat(usdt.availableBalance).toFixed(8) : 0 },
                latencyMs: Date.now() - start,
                message: 'Kết nối Binance Futures thành công.',
            };
        } catch (err) {
            return { success: false, permissions: [], balances: {}, latencyMs: Date.now() - start, message: mapError(err) };
        }
    },

    async getBalance(apiKey, secret, _passphrase, environment) {
        const data = await signedRequest(apiKey, secret, environment, 'GET', '/fapi/v2/balance');
        const out = {};
        for (const b of data || []) {
            const avail = parseFloat(b.availableBalance);
            if (avail > 0) out[b.asset] = +avail.toFixed(8);
        }
        return out;
    },

    /** Đặt đòn bẩy cho symbol (best-effort). */
    async setLeverage(apiKey, secret, _passphrase, environment, { symbol, leverage }) {
        try {
            await signedRequest(apiKey, secret, environment, 'POST', '/fapi/v1/leverage', {
                symbol: symbol.toUpperCase(), leverage: Math.max(1, Math.round(leverage || 1)),
            });
            return { success: true };
        } catch (err) {
            return { success: false, message: mapError(err) };
        }
    },

    /** Đặt chế độ ký quỹ ISOLATED/CROSSED (bỏ qua lỗi -4046 "không cần đổi"). */
    async setMarginType(apiKey, secret, _passphrase, environment, { symbol, marginType = 'ISOLATED' }) {
        try {
            await signedRequest(apiKey, secret, environment, 'POST', '/fapi/v1/marginType', {
                symbol: symbol.toUpperCase(), marginType,
            });
            return { success: true };
        } catch (err) {
            if (String(err.response?.data?.code) === '-4046') return { success: true }; // đã đúng chế độ
            return { success: false, message: mapError(err) };
        }
    },

    async placeOrder(apiKey, secret, _passphrase, environment, { symbol, side, qty, orderType = 'MARKET', price, reduceOnly = false }) {
        try {
            const params = {
                symbol: symbol.toUpperCase(),
                side: side.toUpperCase(),
                type: orderType.toUpperCase(),
                quantity: qty,
            };
            if (orderType === 'LIMIT') { params.price = price; params.timeInForce = 'GTC'; }
            if (reduceOnly) params.reduceOnly = 'true';
            const data = await signedRequest(apiKey, secret, environment, 'POST', '/fapi/v1/order', params);
            return {
                success: true,
                externalOrderId: String(data.orderId),
                status: data.status === 'FILLED' ? 'FILLED' : (data.status === 'PARTIALLY_FILLED' ? 'PARTIAL' : 'PENDING'),
                filledPrice: parseFloat(data.avgPrice || 0) || null,
                filledQuantity: parseFloat(data.executedQty || 0),
                rawResponse: data,
            };
        } catch (err) {
            return { success: false, message: mapError(err), rawResponse: err.response?.data || null };
        }
    },

    async cancelOrder(apiKey, secret, _passphrase, environment, { externalOrderId, symbol }) {
        try {
            const data = await signedRequest(apiKey, secret, environment, 'DELETE', '/fapi/v1/order', {
                symbol: symbol.toUpperCase(), orderId: externalOrderId,
            });
            return { success: true, message: 'Đã hủy lệnh.', rawResponse: data };
        } catch (err) {
            return { success: false, message: mapError(err) };
        }
    },

    async getOrderStatus(apiKey, secret, _passphrase, environment, { externalOrderId, symbol }) {
        try {
            const data = await signedRequest(apiKey, secret, environment, 'GET', '/fapi/v1/order', {
                symbol: symbol.toUpperCase(), orderId: externalOrderId,
            });
            const statusMap = {
                NEW: 'PENDING', PARTIALLY_FILLED: 'PARTIAL', FILLED: 'FILLED',
                CANCELED: 'CANCELLED', REJECTED: 'FAILED', EXPIRED: 'CANCELLED',
            };
            return {
                success: true,
                status: statusMap[data.status] || 'PENDING',
                filledQty: parseFloat(data.executedQty || 0),
                filledPrice: parseFloat(data.avgPrice || 0),
            };
        } catch (err) {
            return { success: false, message: mapError(err) };
        }
    },

    async listTradableSymbols(environment, marketType = 'FUTURES') {
        if (String(marketType).toUpperCase() !== 'FUTURES') return [];
        try {
            const base = BASE_URLS[environment] || BASE_URLS.TESTNET;
            const res = await axios.get(`${base}/fapi/v1/exchangeInfo`, { timeout: 15000 });
            return (res.data.symbols || [])
                .filter(s => s.status === 'TRADING' && s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT')
                .map(s => s.symbol);
        } catch {
            return [];
        }
    },

    async getSymbolInfo(symbol, environment) {
        try {
            const base = BASE_URLS[environment] || BASE_URLS.TESTNET;
            const res = await axios.get(`${base}/fapi/v1/exchangeInfo`, { timeout: 8000 });
            const info = (res.data.symbols || []).find(s => s.symbol === symbol.toUpperCase());
            if (!info) return { exists: false };
            const lotFilter = (info.filters || []).find(f => f.filterType === 'LOT_SIZE') || {};
            const notionalFilter = (info.filters || []).find(f => ['MIN_NOTIONAL', 'NOTIONAL'].includes(f.filterType)) || {};
            return {
                exists: info.status === 'TRADING',
                minQty: parseFloat(lotFilter.minQty || 0),
                stepSize: parseFloat(lotFilter.stepSize || 0),
                minNotional: parseFloat(notionalFilter.notional || notionalFilter.minNotional || 0),
            };
        } catch {
            return { exists: false };
        }
    },
};

export default binanceFuturesAdapter;
