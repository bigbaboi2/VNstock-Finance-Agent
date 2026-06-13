import binanceAdapter from './binanceAdapter.js';
import binanceFuturesAdapter from './binanceFuturesAdapter.js';
import okxAdapter from './okxAdapter.js';
import bybitAdapter from './bybitAdapter.js';

/**
 * ADAPTER FACTORY — trả về đúng adapter theo tên sàn + loại thị trường.
 * SPOT: mua/bán tài sản. FUTURES: hợp đồng perpetual (hỗ trợ SHORT + đòn bẩy).
 * Mọi adapter implement chung interface:
 *   testConnection / getBalance / placeOrder / cancelOrder / getOrderStatus / getSymbolInfo
 * Adapter futures bổ sung: setLeverage / setMarginType + placeOrder nhận reduceOnly.
 */
const ADAPTERS = {
    BINANCE: binanceAdapter,
    OKX: okxAdapter,
    BYBIT: bybitAdapter,
};

const FUTURES_ADAPTERS = {
    BINANCE: binanceFuturesAdapter,
};

export const SUPPORTED_EXCHANGES = Object.keys(ADAPTERS);
export const FUTURES_SUPPORTED = Object.keys(FUTURES_ADAPTERS);

export const getAdapter = (exchangeName, marketType = 'SPOT') => {
    const key = String(exchangeName).toUpperCase();
    if (String(marketType).toUpperCase() === 'FUTURES') {
        const fut = FUTURES_ADAPTERS[key];
        if (!fut) throw new Error(`Futures cho sàn '${exchangeName}' chưa hỗ trợ. Hỗ trợ futures: ${FUTURES_SUPPORTED.join(', ') || 'chưa có'}`);
        return fut;
    }
    const adapter = ADAPTERS[key];
    if (!adapter) {
        throw new Error(`Sàn '${exchangeName}' chưa được hỗ trợ. Hỗ trợ: ${SUPPORTED_EXCHANGES.join(', ')}`);
    }
    return adapter;
};

export default getAdapter;
