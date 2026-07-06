import axios from 'axios';
import crypto from 'crypto';

/**
 * OKX SPOT ADAPTER
 * LIVE & DEMO cùng base URL: https://www.okx.com
 * Demo (testnet) phân biệt bằng header `x-simulated-trading: 1`
 * Signing: Base64(HMAC-SHA256(timestamp + method + path + body))
 * OKX symbol format: BTC-USDT (có dấu gạch) → tự convert từ BTCUSDT
 */

const BASE_URL = 'https://www.okx.com';

/** BTCUSDT → BTC-USDT */
const toOkxInstId = (symbol) => {
    const s = symbol.toUpperCase();
    if (s.includes('-')) return s;
    for (const quote of ['USDT', 'USDC', 'BTC', 'ETH']) {
        if (s.endsWith(quote) && s.length > quote.length) {
            return `${s.slice(0, -quote.length)}-${quote}`;
        }
    }
    return s;
};

const buildHeaders = (apiKey, secret, passphrase, environment, method, path, body = '') => {
    const timestamp = new Date().toISOString();
    const prehash = timestamp + method.toUpperCase() + path + body;
    const signature = crypto.createHmac('sha256', secret).update(prehash).digest('base64');
    const headers = {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': passphrase || '',
        'Content-Type': 'application/json',
    };
    if (environment === 'TESTNET') headers['x-simulated-trading'] = '1';
    return headers;
};

const okxRequest = async (apiKey, secret, passphrase, environment, method, path, bodyObj = null) => {
    const body = bodyObj ? JSON.stringify(bodyObj) : '';
    const headers = buildHeaders(apiKey, secret, passphrase, environment, method, path, body);
    const res = await axios({
        method,
        url: `${BASE_URL}${path}`,
        headers,
        data: bodyObj || undefined,
        timeout: 10000,
    });
    if (res.data.code !== '0') {
        const detail = res.data.data?.[0]?.sMsg || res.data.msg || 'Unknown OKX error';
        throw new Error(`OKX [${res.data.code}]: ${detail}`);
    }
    return res.data.data;
};

const mapError = (err) => {
    if (err.response?.data?.msg) return `OKX: ${err.response.data.msg}`;
    return err.message || 'Lỗi kết nối OKX.';
};

export const okxAdapter = {
    name: 'OKX',

    async testConnection(apiKey, secret, passphrase, environment) {
        const start = Date.now();
        try {
            if (!passphrase) {
                return { success: false, permissions: [], balances: {}, latencyMs: 0, message: 'OKX bắt buộc phải có Passphrase.' };
            }
            const data = await okxRequest(apiKey, secret, passphrase, environment, 'GET', '/api/v5/account/balance');
            const balances = {};
            for (const detail of data?.[0]?.details || []) {
                const total = parseFloat(detail.cashBal || detail.bal || 0);
                if (total > 0) balances[detail.ccy] = +total.toFixed(8);
            }
            return {
                success: true,
                permissions: ['READ', 'TRADE'], // OKX không expose flag chi tiết qua balance API
                balances,
                latencyMs: Date.now() - start,
                message: 'Kết nối OKX thành công.',
            };
        } catch (err) {
            return { success: false, permissions: [], balances: {}, latencyMs: Date.now() - start, message: mapError(err) };
        }
    },

    async getBalance(apiKey, secret, passphrase, environment) {
        const data = await okxRequest(apiKey, secret, passphrase, environment, 'GET', '/api/v5/account/balance');
        const balances = {};
        for (const detail of data?.[0]?.details || []) {
            const total = parseFloat(detail.cashBal || detail.bal || 0);
            if (total > 0) balances[detail.ccy] = +total.toFixed(8);
        }
        return balances;
    },

    async placeOrder(apiKey, secret, passphrase, environment, { symbol, side, qty, orderType = 'MARKET', price }) {
        try {
            const instId = toOkxInstId(symbol);
            const body = {
                instId,
                tdMode: 'cash',
                side: side.toLowerCase(),
                ordType: orderType === 'LIMIT' ? 'limit' : 'market',
                sz: String(qty),
                // Với market BUY, OKX mặc định sz tính theo quote currency → ép theo base để khớp qty coin
                ...(orderType === 'MARKET' && side.toUpperCase() === 'BUY' ? { tgtCcy: 'base_ccy' } : {}),
                ...(orderType === 'LIMIT' ? { px: String(price) } : {}),
            };
            const data = await okxRequest(apiKey, secret, passphrase, environment, 'POST', '/api/v5/trade/order', body);
            const order = data?.[0];
            return {
                success: true,
                externalOrderId: order?.ordId || null,
                status: 'PENDING', // OKX trả async → cần getOrderStatus để biết fill
                filledPrice: null,
                filledQuantity: 0,
                rawResponse: data,
            };
        } catch (err) {
            return { success: false, message: mapError(err), rawResponse: err.response?.data || null };
        }
    },

    async cancelOrder(apiKey, secret, passphrase, environment, { externalOrderId, symbol }) {
        try {
            const data = await okxRequest(apiKey, secret, passphrase, environment, 'POST', '/api/v5/trade/cancel-order', {
                instId: toOkxInstId(symbol),
                ordId: externalOrderId,
            });
            return { success: true, message: 'Đã hủy lệnh.', rawResponse: data };
        } catch (err) {
            return { success: false, message: mapError(err) };
        }
    },

    async getOrderStatus(apiKey, secret, passphrase, environment, { externalOrderId, symbol }) {
        try {
            const path = `/api/v5/trade/order?instId=${toOkxInstId(symbol)}&ordId=${externalOrderId}`;
            const data = await okxRequest(apiKey, secret, passphrase, environment, 'GET', path);
            const order = data?.[0];
            const stateMap = {
                live: 'PENDING', partially_filled: 'PARTIAL', filled: 'FILLED', canceled: 'CANCELLED',
            };
            return {
                success: true,
                status: stateMap[order?.state] || 'PENDING',
                filledQty: parseFloat(order?.accFillSz || 0),
                filledPrice: parseFloat(order?.avgPx || 0) || null,
            };
        } catch (err) {
            return { success: false, message: mapError(err) };
        }
    },

    async listTradableSymbols(environment, marketType = 'SPOT') {
        try {
            const instType = String(marketType).toUpperCase() === 'FUTURES' ? 'SWAP' : 'SPOT';
            const headers = {};
            if (environment === 'TESTNET') headers['x-simulated-trading'] = '1';
            const res = await axios.get(
                `${BASE_URL}/api/v5/public/instruments?instType=${instType}`,
                { headers, timeout: 15000 }
            );
            return (res.data.data || [])
                .filter(s => s.state === 'live' && String(s.instId).endsWith('-USDT'))
                .map(s => s.instId.replace('-', ''));
        } catch {
            return [];
        }
    },

    async getSymbolInfo(symbol) {
        try {
            const instId = toOkxInstId(symbol);
            const res = await axios.get(`${BASE_URL}/api/v5/public/instruments?instType=SPOT&instId=${instId}`, { timeout: 8000 });
            const info = res.data.data?.[0];
            if (!info) return { exists: false };
            return {
                exists: info.state === 'live',
                minQty: parseFloat(info.minSz || 0),
                stepSize: parseFloat(info.lotSz || 0),
                minNotional: 0,
            };
        } catch {
            return { exists: false };
        }
    },
};

export default okxAdapter;
