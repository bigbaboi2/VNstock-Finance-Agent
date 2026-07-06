import chalk from 'chalk';
import ExchangeConnection from '../../models/ExchangeConnection.js';
import UserOrder from '../../models/UserOrder.js';
import Setting from '../../models/Setting.js';
import { getAdapter } from './exchangeAdapters/index.js';

const normalizeCryptoSymbol = (symbol) => {
    const s = String(symbol).toUpperCase().replace(/-/g, '');
    return s.endsWith('USDT') ? s : `${s}USDT`;
};

const CACHE_TTL_MS = Number(process.env.TESTNET_SYMBOL_CACHE_MS) || 6 * 60 * 60 * 1000;
const symbolCache = new Map();

const cacheKey = (exchangeName, environment, marketType) =>
    `${String(exchangeName).toUpperCase()}:${environment}:${String(marketType).toUpperCase()}`;

export const invalidateTestnetSymbolCache = (exchangeName = null, environment = 'TESTNET', marketType = null) => {
    if (!exchangeName) {
        symbolCache.clear();
        return;
    }
    const ex = String(exchangeName).toUpperCase();
    for (const key of [...symbolCache.keys()]) {
        if (key.startsWith(`${ex}:${environment}:`) && (!marketType || key.endsWith(`:${String(marketType).toUpperCase()}`))) {
            symbolCache.delete(key);
        }
    }
};

/**
 * Lấy tập symbol USDT đang TRADING trên testnet (cache TTL).
 * Chỉ dùng khi environment === TESTNET.
 */
export const fetchTradableSymbolsSet = async ({ exchangeName, environment, marketType = 'SPOT' }) => {
    if (environment !== 'TESTNET') return null;

    const key = cacheKey(exchangeName, environment, marketType);
    const cached = symbolCache.get(key);
    if (cached && Date.now() < cached.expiresAt) return cached.symbols;

    const adapter = getAdapter(exchangeName, marketType);
    if (typeof adapter.listTradableSymbols !== 'function') return null;

    const list = await adapter.listTradableSymbols(environment, marketType);
    const symbols = new Set((list || []).map(s => String(s).toUpperCase()));
    symbolCache.set(key, { symbols, expiresAt: Date.now() + CACHE_TTL_MS });
    return symbols;
};

/** Xác định SPOT vs FUTURES cho lệnh LIVE (khớp logic executeLiveEntry). */
export const resolveLiveMarketType = async (connectionDoc, direction) => {
    const isLong = direction === 'LONG' || direction === 'MUA';
    if (isLong) return { marketType: 'SPOT', blocked: false };

    const flag = await Setting.findOne({ key: 'autoFuturesShortEnabled' });
    const enabled = flag && (flag.value === true || flag.value === 'true' || flag.value === 1);
    if (!enabled) {
        return { marketType: 'SPOT', blocked: true, reason: 'SHORT auto đang TẮT (autoFuturesShortEnabled=false)' };
    }
    if (String(connectionDoc.exchangeName).toUpperCase() !== 'BINANCE') {
        return { marketType: 'SPOT', blocked: true, reason: 'SHORT auto chỉ hỗ trợ Binance Futures' };
    }
    return { marketType: 'FUTURES', blocked: false };
};

/**
 * Kiểm tra 1 symbol có giao dịch được trên kết nối TESTNET hay không.
 * LIVE prod → luôn supported (gate không áp dụng).
 */
export const isSymbolTradableOnConnection = async (connectionDoc, symbol, direction) => {
    if (!connectionDoc || connectionDoc.environment !== 'TESTNET') {
        return { supported: true, environment: connectionDoc?.environment || 'LIVE' };
    }

    const normSymbol = normalizeCryptoSymbol(symbol);
    const market = await resolveLiveMarketType(connectionDoc, direction);
    if (market.blocked) {
        return {
            supported: false,
            environment: 'TESTNET',
            reason: market.reason,
            marketType: market.marketType,
        };
    }

    const set = await fetchTradableSymbolsSet({
        exchangeName: connectionDoc.exchangeName,
        environment: connectionDoc.environment,
        marketType: market.marketType,
    });

    if (set) {
        const supported = set.has(normSymbol);
        return {
            supported,
            environment: 'TESTNET',
            marketType: market.marketType,
            normSymbol,
            tradableCount: set.size,
            reason: supported
                ? null
                : `${normSymbol} không có trên ${connectionDoc.exchangeName} TESTNET (${market.marketType}, ${set.size} cặp USDT)`,
        };
    }

    const adapter = getAdapter(connectionDoc.exchangeName, market.marketType);
    const info = await adapter.getSymbolInfo(normSymbol, connectionDoc.environment);
    const supported = Boolean(info?.exists);
    return {
        supported,
        environment: 'TESTNET',
        marketType: market.marketType,
        normSymbol,
        reason: supported
            ? null
            : `${normSymbol} không giao dịch được trên ${connectionDoc.exchangeName} TESTNET`,
    };
};

/**
 * Tải ngữ cảnh gate cho vòng quét CRYPTO: gói LIVE chờ + kết nối TESTNET + union symbol.
 */
export const buildTestnetGateContext = async (asset = 'CRYPTO') => {
    const liveOrders = await UserOrder.find({
        status: { $in: ['PENDING', 'ACTIVE'] },
        executionMode: 'LIVE',
        exchangeConnectionId: { $ne: null },
        $or: [{ assetType: 'ALL' }, { assetType: asset }],
    }).lean();

    if (!liveOrders.length) {
        return { hasTestnetOrders: false, liveOrders: [], connectionsById: {}, tradableUnion: new Set() };
    }

    const connectionIds = [...new Set(liveOrders.map(o => String(o.exchangeConnectionId)))];
    const connections = await ExchangeConnection.find({
        _id: { $in: connectionIds },
        isActive: true,
    });

    const connectionsById = Object.fromEntries(connections.map(c => [String(c._id), c]));
    const testnetConnections = connections.filter(c => c.environment === 'TESTNET');

    if (!testnetConnections.length) {
        return { hasTestnetOrders: false, liveOrders, connectionsById, tradableUnion: new Set() };
    }

    const tradableUnion = new Set();
    const marketTypes = ['SPOT', 'FUTURES'];
    const seenKeys = new Set();

    for (const conn of testnetConnections) {
        for (const marketType of marketTypes) {
            const k = cacheKey(conn.exchangeName, conn.environment, marketType);
            if (seenKeys.has(k)) continue;
            seenKeys.add(k);
            try {
                const set = await fetchTradableSymbolsSet({
                    exchangeName: conn.exchangeName,
                    environment: conn.environment,
                    marketType,
                });
                if (set) set.forEach(s => tradableUnion.add(s));
            } catch (err) {
                console.log(chalk.yellow(`  [TESTNET GATE] Không tải symbol ${conn.exchangeName} ${marketType}: ${err.message}`));
            }
        }
    }

    return {
        hasTestnetOrders: true,
        liveOrders,
        connectionsById,
        testnetConnections,
        tradableUnion,
    };
};

/**
 * Gate pipeline: bỏ qua sớm nếu LIVE-only / toàn TESTNET mà symbol không hỗ trợ.
 */
export const checkTestnetSymbolForPipeline = async ({
    gateContext,
    symbol,
    direction,
    requiresLiveQuality,
    liveOnlyMode,
}) => {
    if (!requiresLiveQuality || !gateContext?.hasTestnetOrders) {
        return { allow: true };
    }

    const testnetOrders = gateContext.liveOrders.filter(o => {
        const conn = gateContext.connectionsById[String(o.exchangeConnectionId)];
        return conn?.environment === 'TESTNET';
    });
    if (!testnetOrders.length) return { allow: true };

    const checks = await Promise.all(
        testnetOrders.map(async (order) => {
            const conn = gateContext.connectionsById[String(order.exchangeConnectionId)];
            return isSymbolTradableOnConnection(conn, symbol, direction);
        })
    );

    const anySupported = checks.some(c => c.supported);
    const allLiveAreTestnet = gateContext.liveOrders.every(o => {
        const conn = gateContext.connectionsById[String(o.exchangeConnectionId)];
        return conn?.environment === 'TESTNET';
    });

    if ((liveOnlyMode || allLiveAreTestnet) && !anySupported) {
        const reason = checks.find(c => !c.supported)?.reason
            || `${normalizeCryptoSymbol(symbol)} không hỗ trợ trên testnet đang chờ`;
        return { allow: false, reason, anySupported: false };
    }

    return { allow: true, anySupported };
};

/** Lọc universe quét CRYPTO theo union symbol testnet (giảm tín hiệu vô ích). */
export const filterSymbolsForTestnetUniverse = (symbols, tradableUnion) => {
    if (!tradableUnion?.size) return symbols;
    const filtered = symbols.filter(s => tradableUnion.has(normalizeCryptoSymbol(s)));
    return filtered.length ? filtered : symbols;
};
