/** Wallet equity (MTM) from balanceSnapshot — separate from AutoDuck trade PnL. */
import axios from 'axios';

const STABLE_ASSETS = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'DAI', 'TUSD', 'USDD']);
const FIAT_VND = new Set(['VND', 'VNĐ']);

let _priceMapCache = null;
let _priceMapAt = 0;
const PRICE_CACHE_MS = 60_000;

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const resolveUsdVndRate = async () => {
    try {
        const { getUsdVndRate } = await import('./autoTradeEngine.js');
        return await getUsdVndRate();
    } catch {
        return 25400;
    }
};

/**
 * Map symbol → lastPrice từ Binance mainnet (đủ cho MTM testnet/live).
 * @returns {Promise<Map<string, number>>} key = 'BTCUSDT' uppercase
 */
export const fetchUsdtPriceMap = async () => {
    const now = Date.now();
    if (_priceMapCache && now - _priceMapAt < PRICE_CACHE_MS) return _priceMapCache;

    const bases = ['https://data-api.binance.vision', 'https://api.binance.com'];
    for (const base of bases) {
        try {
            const res = await axios.get(`${base}/api/v3/ticker/price`, { timeout: 8000 });
            const map = new Map();
            for (const row of res.data || []) {
                if (row?.symbol && row?.price != null) {
                    map.set(String(row.symbol).toUpperCase(), Number(row.price));
                }
            }
            if (map.size > 0) {
                _priceMapCache = map;
                _priceMapAt = now;
                return map;
            }
        } catch {
            /* thử base tiếp */
        }
    }
    return _priceMapCache || new Map();
};

/**
 * Quy một balanceSnapshot → equity USDT.
 * @param {Record<string, number>} snapshot
 * @param {Map<string, number>} priceMap
 * @param {number} usdVndRate
 */
export const computeSnapshotEquity = (snapshot = {}, priceMap = new Map(), usdVndRate = 25400) => {
    let stableUSDT = 0;
    let altsUSDT = 0;
    const pricedAssets = [];
    const unpricedAssets = [];
    const assetUsd = {};

    for (const [rawAsset, rawAmt] of Object.entries(snapshot || {})) {
        const asset = String(rawAsset).toUpperCase().replace('VNĐ', 'VND');
        const amount = Number(rawAmt) || 0;
        if (amount === 0 && !STABLE_ASSETS.has(asset) && !FIAT_VND.has(asset)) continue;

        if (STABLE_ASSETS.has(asset)) {
            stableUSDT += amount;
            assetUsd[asset] = amount;
            pricedAssets.push({ asset, amount, usdt: r2(amount), source: 'stable' });
            continue;
        }

        if (FIAT_VND.has(asset)) {
            const usdt = usdVndRate > 0 ? amount / usdVndRate : 0;
            stableUSDT += usdt; // coi VND như cash quy USDT
            assetUsd[asset] = usdt;
            pricedAssets.push({ asset: 'VND', amount, usdt: r2(usdt), source: 'vnd_vcb' });
            continue;
        }

        const pair = `${asset}USDT`;
        const px = priceMap.get(pair);
        if (px != null && Number.isFinite(px) && px > 0) {
            const usdt = amount * px;
            altsUSDT += usdt;
            assetUsd[asset] = usdt;
            pricedAssets.push({ asset, amount, price: px, usdt: r2(usdt), source: 'ticker' });
        } else {
            unpricedAssets.push({ asset, amount });
        }
    }

    const equityUSDT = r2(stableUSDT + altsUSDT);
    return {
        equityUSDT,
        stableUSDT: r2(stableUSDT),
        altsUSDT: r2(altsUSDT),
        pricedAssets,
        unpricedAssets,
        assetUsd,
        usdVndRate,
    };
};

/**
 * Tính equity cho 1 connection doc (có thể chưa save baseline).
 */
export const computeConnectionEquity = async (connectionDoc) => {
    const [priceMap, usdVndRate] = await Promise.all([
        fetchUsdtPriceMap(),
        resolveUsdVndRate(),
    ]);
    return computeSnapshotEquity(connectionDoc.balanceSnapshot || {}, priceMap, usdVndRate);
};

/**
 * Nếu chưa có baseline và equity > 0 → ghi mốc (caller save doc).
 * @returns {boolean} đã set
 */
export const maybeSetEquityBaseline = async (connectionDoc) => {
    if (connectionDoc.equityBaselineUSDT != null && Number.isFinite(Number(connectionDoc.equityBaselineUSDT))) {
        return false;
    }
    const { equityUSDT } = await computeConnectionEquity(connectionDoc);
    if (!(equityUSDT > 0)) return false;
    connectionDoc.equityBaselineUSDT = equityUSDT;
    connectionDoc.equityBaselineAt = new Date();
    return true;
};

/**
 * Đặt lại baseline = equity hiện tại (caller đã refresh balance nếu cần).
 */
export const resetEquityBaseline = async (connectionDoc) => {
    const equity = await computeConnectionEquity(connectionDoc);
    connectionDoc.equityBaselineUSDT = equity.equityUSDT;
    connectionDoc.equityBaselineAt = new Date();
    return equity;
};

/**
 * Enrich danh sách connection + aggregate ví active.
 */
export const enrichConnectionsWithEquity = async (docs) => {
    const [priceMap, usdVndRate] = await Promise.all([
        fetchUsdtPriceMap(),
        resolveUsdVndRate(),
    ]);

    let equityUSDT = 0;
    let stableUSDT = 0;
    let altsUSDT = 0;
    let baselineUSDT = 0;
    let baselineCount = 0;
    const allUnpriced = [];

    const data = [];
    for (const doc of docs) {
        const eq = computeSnapshotEquity(doc.balanceSnapshot || {}, priceMap, usdVndRate);
        const baseline = doc.equityBaselineUSDT != null ? Number(doc.equityBaselineUSDT) : null;
        const pnlVsBaselineUSDT = baseline != null ? r2(eq.equityUSDT - baseline) : null;

        if (doc.isActive) {
            equityUSDT += eq.equityUSDT;
            stableUSDT += eq.stableUSDT;
            altsUSDT += eq.altsUSDT;
            if (baseline != null) {
                baselineUSDT += baseline;
                baselineCount += 1;
            }
            for (const u of eq.unpricedAssets) {
                allUnpriced.push({ ...u, connectionId: String(doc._id), label: doc.label });
            }
        }

        const safe = typeof doc.toSafeJSON === 'function' ? doc.toSafeJSON() : doc;
        data.push({
            ...safe,
            walletEquity: {
                equityUSDT: eq.equityUSDT,
                stableUSDT: eq.stableUSDT,
                altsUSDT: eq.altsUSDT,
                pnlVsBaselineUSDT,
                unpricedAssets: eq.unpricedAssets,
                assetUsd: eq.assetUsd,
            },
        });
    }

    return {
        data,
        walletSummary: {
            equityUSDT: r2(equityUSDT),
            stableUSDT: r2(stableUSDT),
            altsUSDT: r2(altsUSDT),
            baselineUSDT: baselineCount > 0 ? r2(baselineUSDT) : null,
            pnlVsBaselineUSDT: baselineCount > 0 ? r2(equityUSDT - baselineUSDT) : null,
            unpricedCount: allUnpriced.length,
            unpricedAssets: allUnpriced.slice(0, 20),
            usdVndRate,
            pricedAt: new Date().toISOString(),
        },
    };
};
