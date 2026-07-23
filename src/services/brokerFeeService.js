/**
 * Broker fee extraction (API) + VIP0 schedule fallback for LIVE PnL.
 * Prefer official fill commissions; never assume BNB/OKB discount in fallback.
 */

/** Spot VIP0 taker per side (fraction). Market orders ≈ taker. */
export const SPOT_TAKER_FEE_BY_EXCHANGE = {
    BINANCE: 0.001, // 0.10%
    OKX: 0.001,     // 0.10% taker
    BYBIT: 0.001,   // 0.10%
};

/** Futures VIP0 taker per side (fraction) — approximate retail. */
export const FUTURES_TAKER_FEE_BY_EXCHANGE = {
    BINANCE: 0.0005, // ~0.05%
    OKX: 0.0005,
    BYBIT: 0.00055,
};

const r8 = (n) => Math.round((Number(n) || 0) * 1e8) / 1e8;

/**
 * Sum Binance spot fills commissions → USDT.
 * commissionAsset may be USDT, BNB, or base asset.
 */
export const extractBinanceSpotFeeUsdt = (rawResponse, { filledPrice, filledQuantity, symbol } = {}) => {
    const fills = rawResponse?.fills;
    if (!Array.isArray(fills) || fills.length === 0) return null;

    let feeUsdt = 0;
    let feeAsset = null;
    const avgPx = Number(filledPrice) || 0;
    const qty = Number(filledQuantity) || 0;
    const base = String(symbol || rawResponse.symbol || '').replace(/USDT$/i, '').toUpperCase();

    for (const f of fills) {
        const commission = parseFloat(f.commission);
        if (!Number.isFinite(commission) || commission === 0) continue;
        const asset = String(f.commissionAsset || '').toUpperCase();
        feeAsset = feeAsset || asset;
        const fillPx = parseFloat(f.price) || avgPx;

        if (asset === 'USDT' || asset === 'USD' || asset === 'BUSD' || asset === 'FDUSD') {
            feeUsdt += commission;
        } else if (asset === 'BNB') {
            // Không có giá BNB tại đây → không resolve → caller dùng SCHEDULE_FALLBACK
            return null;
        } else if (asset === base && fillPx > 0) {
            feeUsdt += commission * fillPx;
        } else if (fillPx > 0 && qty > 0) {
            // Unknown asset — skip this fill leg
            continue;
        }
    }

    if (feeUsdt <= 0) return null;
    return {
        feeUSDT: r8(feeUsdt),
        feeAsset: feeAsset || 'USDT',
        feeSource: 'API',
    };
};

/**
 * Try extract fee from any adapter result / rawResponse.
 */
export const extractFeeFromOrderResult = ({
    exchangeName,
    marketType = 'SPOT',
    rawResponse,
    filledPrice,
    filledQuantity,
    symbol,
    notionalUSDT,
}) => {
    const ex = String(exchangeName || '').toUpperCase();
    const mt = String(marketType || 'SPOT').toUpperCase();

    if (ex === 'BINANCE' && mt !== 'FUTURES') {
        const fromFills = extractBinanceSpotFeeUsdt(rawResponse, { filledPrice, filledQuantity, symbol });
        if (fromFills) return fromFills;
    }

    // Binance futures: commission often on userTrades, not order response — fall through.
    // OKX/Bybit place responses usually lack immediate fee — fall through.

    return estimateScheduleFeeUsdt({
        exchangeName: ex,
        marketType: mt,
        notionalUSDT: notionalUSDT || ((Number(filledPrice) || 0) * (Number(filledQuantity) || 0)),
    });
};

export const estimateScheduleFeeUsdt = ({ exchangeName, marketType = 'SPOT', notionalUSDT }) => {
    const ex = String(exchangeName || 'BINANCE').toUpperCase();
    const mt = String(marketType || 'SPOT').toUpperCase();
    const notion = Math.max(0, Number(notionalUSDT) || 0);
    const table = mt === 'FUTURES' ? FUTURES_TAKER_FEE_BY_EXCHANGE : SPOT_TAKER_FEE_BY_EXCHANGE;
    const rate = table[ex] ?? SPOT_TAKER_FEE_BY_EXCHANGE.BINANCE;
    return {
        feeUSDT: r8(notion * rate),
        feeAsset: 'USDT',
        feeSource: 'SCHEDULE_FALLBACK',
        feeRate: rate,
    };
};

/** Round-trip schedule fee % for analytics on historical trades without API fees. */
export const scheduleRoundTripFeePct = (exchangeName = 'BINANCE', marketType = 'SPOT') => {
    const ex = String(exchangeName || 'BINANCE').toUpperCase();
    const mt = String(marketType || 'SPOT').toUpperCase();
    const table = mt === 'FUTURES' ? FUTURES_TAKER_FEE_BY_EXCHANGE : SPOT_TAKER_FEE_BY_EXCHANGE;
    const rate = table[ex] ?? SPOT_TAKER_FEE_BY_EXCHANGE.BINANCE;
    return Math.round(rate * 2 * 10000) / 100; // e.g. 0.20
};
