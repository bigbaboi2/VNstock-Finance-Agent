import AutoTrade from '../../models/AutoTrade.js';

export const isAllocationMatched = (userOrder, allocation) => {
    if (!allocation || allocation.matchStatus === 'UNMATCHED') return false;
    if (userOrder?.executionMode === 'LIVE') return allocation.executionMode === 'LIVE';
    return true;
};

export const getMatchedAllocations = (userOrder) =>
    (userOrder?.tradeAllocations || []).filter(a => isAllocationMatched(userOrder, a));

export const getMatchedRealizedPnl = (userOrder) =>
    getMatchedAllocations(userOrder)
        .filter(a => a.closedAt)
        .reduce((sum, a) => sum + (Number(a.pnl) || 0), 0);

export const getEffectivePortfolioCapital = (userOrder) => {
    const total = Number(userOrder?.totalCapital) || 0;
    const recordedPnl = Number(userOrder?.realizedPnl) || 0;
    return Math.max(0, total - recordedPnl + getMatchedRealizedPnl(userOrder));
};

/**
 * PORTFOLIO MANAGER — Bot tự quản lý & chia vốn thông minh.
 *
 * 2 chế độ ủy thác:
 *  - FIXED:     user quy định số tiền cố định cho MỖI lệnh (hành vi cũ)
 *  - PORTFOLIO: user ủy thác TỔNG QUỸ, bot tự tính position size cho từng lệnh
 *               dựa trên: % phân bổ cấu hình, độ mạnh tín hiệu (AI score),
 *               khoảng cách stop-loss (risk-based sizing), và quỹ còn trống.
 */

const MIN_POSITION_VND = 500_000; // Dưới ngưỡng này → bỏ qua, không đáng vào lệnh

/**
 * Đếm số lệnh đang mở thuộc 1 gói portfolio.
 */
export const countOpenTradesOfOrder = async (userOrder) => {
    const openAllocations = getMatchedAllocations(userOrder).filter(a => !a.closedAt);
    if (openAllocations.length === 0) return 0;
    return AutoTrade.countDocuments({
        _id: { $in: openAllocations.map(a => a.trade) },
        status: { $in: ['OPEN', 'PENDING'] },
    });
};

/**
 * Đóng allocation treo: UNMATCHED, hoặc (tuỳ chọn) AutoTrade đã CLOSED/mất document
 * nhưng allocation còn !closedAt — tránh UI/backend lệch nhau khi xóa gói.
 * @param {{ includeClosedTrades?: boolean }} opts
 * @returns {number} số allocation đã heal
 */
export const healStaleAllocations = async (userOrder, opts = {}) => {
    const { includeClosedTrades = true } = opts;
    const allocs = userOrder?.tradeAllocations || [];
    if (allocs.length === 0) return 0;

    let statusById = null;
    if (includeClosedTrades) {
        const openish = allocs.filter(a => !a.closedAt && a.trade);
        const trades = openish.length
            ? await AutoTrade.find({ _id: { $in: openish.map(a => a.trade) } }).select('status').lean()
            : [];
        statusById = new Map(trades.map(t => [String(t._id), t.status]));
    }

    let healed = 0;
    for (const a of allocs) {
        if (a.closedAt) continue;
        if (a.matchStatus === 'UNMATCHED') {
            a.closedAt = new Date();
            if (a.pnl == null) a.pnl = 0;
            healed += 1;
            continue;
        }
        if (!includeClosedTrades || !statusById) continue;
        const st = a.trade ? statusById.get(String(a.trade)) : null;
        if (!st || !['OPEN', 'PENDING'].includes(st)) {
            a.closedAt = new Date();
            if (a.pnl == null) a.pnl = 0;
            healed += 1;
        }
    }
    if (healed > 0) userOrder.markModified?.('tradeAllocations');
    return healed;
};

/** Lệnh LIVE/MATCHED thật sự còn OPEN/PENDING (sau khi đã heal nếu cần). */
export const listTrulyOpenAllocations = async (userOrder) => {
    const allocs = userOrder?.tradeAllocations || [];
    const candidates = allocs.filter(a => !a.closedAt && a.matchStatus !== 'UNMATCHED' && a.trade);
    if (candidates.length === 0) return [];
    const trades = await AutoTrade.find({
        _id: { $in: candidates.map(a => a.trade) },
        status: { $in: ['OPEN', 'PENDING'] },
    }).select('_id').lean();
    const openIds = new Set(trades.map(t => String(t._id)));
    return candidates.filter((a) => {
        if (userOrder.executionMode === 'LIVE' && a.executionMode !== 'LIVE') return false;
        return openIds.has(String(a.trade));
    });
};

/**
 * Gói portfolio có còn slot để nhận lệnh mới không?
 */
export const canAcceptNewTrade = async (userOrder) => {
    if (userOrder.allocationMode !== 'PORTFOLIO') return true;
    if (userOrder.status !== 'ACTIVE' && userOrder.status !== 'PENDING') return false;
    const openCount = await countOpenTradesOfOrder(userOrder);
    return openCount < (userOrder.maxConcurrentOrders || 5);
};

/**
 * Tính position size (VNĐ) cho 1 tín hiệu.
 *
 * @param {Object}  userOrder   - UserOrder doc
 * @param {Object}  tradePlan   - { entryPrice, stopLossPrice, direction }
 * @param {Number}  aiScore     - Điểm tín hiệu 0-100
 * @returns {{ size: Number, reason: String }}
 */
export const calculatePositionSize = (userOrder, tradePlan, aiScore = 70) => {
    // ── FIXED: trả nguyên số vốn user quy định ──
    if (userOrder.allocationMode !== 'PORTFOLIO') {
        return { size: Number(userOrder.capital) || 0, reason: 'FIXED per-order' };
    }

    // ── PORTFOLIO: bot tự tính ──
    const total = getEffectivePortfolioCapital(userOrder);
    const used = getMatchedAllocations(userOrder)
        .filter(a => !a.closedAt)
        .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
    const free = Math.max(0, total - used);

    if (free < MIN_POSITION_VND) {
        return { size: 0, reason: `Quỹ trống còn ${Math.round(free).toLocaleString('vi-VN')}đ < ngưỡng tối thiểu` };
    }

    // 1. Base allocation: % quỹ cấu hình
    const allocationPct = Math.min(50, Math.max(1, Number(userOrder.allocationPercent) || 10));
    let size = total * (allocationPct / 100);

    if (userOrder.dynamicSizing) {
        // 2. Score multiplier: tín hiệu càng mạnh → vào càng lớn (trong giới hạn)
        let scoreMult = 1.0;
        if (aiScore >= 85) scoreMult = 1.3;
        else if (aiScore >= 78) scoreMult = 1.15;
        else if (aiScore < 70) scoreMult = 0.75;
        size *= scoreMult;

        // 3. Risk-based sizing: giới hạn để nếu lệnh hit SL,
        //    thiệt hại ≈ 1% tổng quỹ (1.5% nếu tín hiệu rất mạnh).
        const entry = Number(tradePlan?.entryPrice) || 0;
        const sl = Number(tradePlan?.stopLossPrice) || 0;
        if (entry > 0 && sl > 0 && entry !== sl) {
            const slPct = Math.abs(entry - sl) / entry; // vd: 0.02 = 2%
            const riskBudget = total * (aiScore >= 85 ? 0.015 : 0.01);
            const sizeByRisk = riskBudget / slPct;
            size = Math.min(size, sizeByRisk);
        }
    }

    // 4. Không vượt quỹ trống, không vượt 50% tổng quỹ trên 1 lệnh
    size = Math.min(size, free, total * 0.5);
    size = Math.round(size);

    if (size < MIN_POSITION_VND) {
        return { size: 0, reason: `Position tính ra ${size.toLocaleString('vi-VN')}đ — quá nhỏ, bỏ qua` };
    }

    return {
        size,
        reason: `PORTFOLIO: ${allocationPct}% quỹ${userOrder.dynamicSizing ? ' + dynamic sizing' : ''} | Free: ${Math.round(free / 1e6)}Tr`,
    };
};

/**
 * Ghi nhận phân bổ vốn khi gói portfolio khớp 1 lệnh mới.
 * (Caller tự save userOrder)
 */
export const recordAllocation = (userOrder, trade, amount, options = {}) => {
    userOrder.tradeAllocations = userOrder.tradeAllocations || [];
    const matchStatus = options.matchStatus || 'MATCHED';
    const allocation = {
        trade: trade._id || trade,
        symbol: trade.symbol || '',
        direction: trade.direction || '',
        entryPrice: Number(trade.entryPrice) || 0,
        executionMode: trade.executionMode || 'SIMULATED',
        matchStatus,
        matchMessage: options.matchMessage || '',
        amount,
        openedAt: new Date(),
    };
    userOrder.tradeAllocations.push({
        ...allocation,
    });
    if (isAllocationMatched(userOrder, allocation)) {
        userOrder.usedCapital = (Number(userOrder.usedCapital) || 0) + amount;
    }
    if (userOrder.status === 'PENDING') userOrder.status = 'ACTIVE';
};

export const recordUnmatchedAllocation = (userOrder, trade, amount, reason = '') => {
    recordAllocation(userOrder, trade, amount, {
        matchStatus: 'UNMATCHED',
        matchMessage: reason,
    });
};

/**
 * Giải phóng vốn + tích lũy PnL khi 1 lệnh thuộc gói portfolio đóng.
 * (Caller tự save userOrder)
 * @returns {{ amount: Number, pnl: Number }|null}
 */
export const releaseAllocation = (userOrder, tradeId, pnlPercent) => {
    const alloc = (userOrder.tradeAllocations || []).find(
        a => String(a.trade) === String(tradeId) && !a.closedAt
    );
    if (!alloc) return null;

    const pnl = Math.round(alloc.amount * (Number(pnlPercent) || 0) / 100);
    alloc.closedAt = new Date();
    alloc.pnl = pnl;
    alloc.pnlPercent = Number(pnlPercent) || 0;
    if (!isAllocationMatched(userOrder, alloc)) {
        return { amount: alloc.amount, pnl, counted: false };
    }
    userOrder.usedCapital = Math.max(0, (Number(userOrder.usedCapital) || 0) - alloc.amount);
    userOrder.realizedPnl = (Number(userOrder.realizedPnl) || 0) + pnl;
    // Quỹ tự tăng/giảm theo PnL thực hiện → compound
    userOrder.totalCapital = Math.max(0, (Number(userOrder.totalCapital) || 0) + pnl);
    return { amount: alloc.amount, pnl, counted: true };
};
