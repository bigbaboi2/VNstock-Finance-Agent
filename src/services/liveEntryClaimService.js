/** LIVE entry claims — anti double-open per userOrder+symbol. */
import chalk from 'chalk';
import LiveEntryClaim from '../../models/LiveEntryClaim.js';
import AutoTrade from '../../models/AutoTrade.js';

const CLAIM_TTL_MS = 10 * 60 * 1000;

export const releaseStaleClaims = async ({ userOrderId = null, symbol = null } = {}) => {
    const filter = {
        status: 'CLAIMED',
        expiresAt: { $lte: new Date() },
    };
    if (userOrderId) filter.userOrderId = userOrderId;
    if (symbol) filter.symbol = String(symbol).toUpperCase();
    const res = await LiveEntryClaim.updateMany(filter, {
        $set: { status: 'RELEASED' },
    });
    return res.modifiedCount || 0;
};

export const hasOpenLiveSymbol = async (userOrder, symbol) => {
    const sym = String(symbol || '').toUpperCase();
    if (!userOrder?._id || !sym) return false;

    await releaseStaleClaims({ userOrderId: userOrder._id, symbol: sym });

    const activeClaim = await LiveEntryClaim.findOne({
        userOrderId: userOrder._id,
        symbol: sym,
        status: { $in: ['CLAIMED', 'OPEN'] },
    }).lean();
    if (activeClaim) return true;

    const allocs = (userOrder.tradeAllocations || []).filter(
        (a) => !a.closedAt
            && a.matchStatus !== 'UNMATCHED'
            && a.executionMode === 'LIVE'
            && a.trade
    );
    if (allocs.length === 0) return false;

    const trades = await AutoTrade.find({
        _id: { $in: allocs.map((a) => a.trade) },
        status: { $in: ['OPEN', 'PENDING'] },
        executionMode: 'LIVE',
        symbol: sym,
    }).select('_id').lean();

    return trades.length > 0;
};

export const claimLiveEntrySlot = async ({
    userOrderId,
    symbol,
    direction,
    autoTradeId,
    exchangeConnectionId,
    maxOpen = null,
}) => {
    const sym = String(symbol || '').toUpperCase();
    if (!userOrderId || !sym) {
        return { ok: false, reason: 'MISSING_CLAIM_KEYS' };
    }

    await releaseStaleClaims({ userOrderId, symbol: sym });

    if (maxOpen != null && Number(maxOpen) > 0) {
        const openCount = await LiveEntryClaim.countDocuments({
            userOrderId,
            status: { $in: ['CLAIMED', 'OPEN'] },
        });
        if (openCount >= Number(maxOpen)) {
            return { ok: false, reason: `MAX_LIVE_ORDERS (${maxOpen})` };
        }
    }

    const now = Date.now();
    try {
        const claim = await LiveEntryClaim.create({
            userOrderId,
            symbol: sym,
            direction: direction || '',
            autoTradeId: autoTradeId || null,
            exchangeConnectionId: exchangeConnectionId || null,
            status: 'CLAIMED',
            claimedAt: new Date(now),
            expiresAt: new Date(now + CLAIM_TTL_MS),
        });
        return { ok: true, claim };
    } catch (err) {
        if (err?.code === 11000) {
            return { ok: false, reason: `DUPLICATE_SYMBOL_OPEN (${sym})` };
        }
        console.log(chalk.yellow(`[LIVE CLAIM] create lỗi: ${err.message}`));
        return { ok: false, reason: err.message };
    }
};

export const markLiveEntryClaimOpen = async (claimId, autoTradeId = null) => {
    if (!claimId) return;
    await LiveEntryClaim.updateOne(
        { _id: claimId, status: 'CLAIMED' },
        {
            $set: {
                status: 'OPEN',
                expiresAt: null,
                ...(autoTradeId ? { autoTradeId } : {}),
            },
        }
    );
};

export const releaseLiveEntryClaim = async ({
    claimId = null,
    userOrderId = null,
    symbol = null,
    autoTradeId = null,
} = {}) => {
    const filter = { status: { $in: ['CLAIMED', 'OPEN'] } };
    if (claimId) filter._id = claimId;
    else if (autoTradeId) filter.autoTradeId = autoTradeId;
    else if (userOrderId && symbol) {
        filter.userOrderId = userOrderId;
        filter.symbol = String(symbol).toUpperCase();
    } else {
        return 0;
    }
    const res = await LiveEntryClaim.updateMany(filter, { $set: { status: 'RELEASED' } });
    return res.modifiedCount || 0;
};

export const countActiveLiveClaims = async (userOrderId) => {
    if (!userOrderId) return 0;
    await releaseStaleClaims({ userOrderId });
    return LiveEntryClaim.countDocuments({
        userOrderId,
        status: { $in: ['CLAIMED', 'OPEN'] },
    });
};
