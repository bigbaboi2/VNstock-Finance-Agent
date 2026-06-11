import binanceAdapter from './binanceAdapter.js';
import okxAdapter from './okxAdapter.js';
import bybitAdapter from './bybitAdapter.js';

/**
 * ADAPTER FACTORY — trả về đúng adapter theo tên sàn.
 * Mọi adapter implement chung interface:
 *   testConnection / getBalance / placeOrder / cancelOrder / getOrderStatus / getSymbolInfo
 */
const ADAPTERS = {
    BINANCE: binanceAdapter,
    OKX: okxAdapter,
    BYBIT: bybitAdapter,
};

export const SUPPORTED_EXCHANGES = Object.keys(ADAPTERS);

export const getAdapter = (exchangeName) => {
    const adapter = ADAPTERS[String(exchangeName).toUpperCase()];
    if (!adapter) {
        throw new Error(`Sàn '${exchangeName}' chưa được hỗ trợ. Hỗ trợ: ${SUPPORTED_EXCHANGES.join(', ')}`);
    }
    return adapter;
};

export default getAdapter;
