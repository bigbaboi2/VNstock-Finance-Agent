import AutoTrade from '../../models/AutoTrade.js';
import UserOrder from '../../models/UserOrder.js';
import AiBehavior from '../../models/AiBehavior.js';
import Setting from '../../models/Setting.js';
import { runAutoTradePipeline, verifyOrderFeasibility, getUsdVndRate } from '../services/autoTradeEngine.js';

//Get the entire automatic transaction history of the system with advanced quantitative statistics
export const getSystemTradeLogs = async (req, res) => {
    try {
        const openLogs = await AutoTrade.find({ status: { $in: ['OPEN', 'PENDING'] } }).sort({ openedAt: -1 });
        const closedLogs = await AutoTrade.find({ status: { $nin: ['OPEN', 'PENDING'] } }).sort({ openedAt: -1 }).limit(100);

        const logs = [...openLogs, ...closedLogs];

        // Calculate performance statistics using MongoDB Aggregation for all CLOSED trades
        const stats = await AutoTrade.aggregate([
            { $match: { status: 'CLOSED' } },
            { 
                $group: { 
                    _id: null, 
                    totalTrades: { $sum: 1 },
                    winningTrades: { 
                        $sum: { $cond: [{ $gt: ["$pnlPercent", 0] }, 1, 0] } 
                    },
                    losingTrades: { 
                        $sum: { $cond: [{ $lt: ["$pnlPercent", 0] }, 1, 0] } 
                    },
                    totalPnlAmount: { $sum: "$pnl" },
                    totalPnlPct: { $sum: "$pnlPercent" }
                } 
            }
        ]);

        let totalTrades = 0, winningTrades = 0, losingTrades = 0, totalPnlAmount = 0, totalPnlPct = 0;
        if (stats.length > 0) {
            ({ totalTrades, winningTrades, losingTrades, totalPnlAmount, totalPnlPct } = stats[0]);
        }
        
        const winRate = totalTrades > 0 ? Math.round((winningTrades / totalTrades) * 100) : 0;
        const avgPnl = totalTrades > 0 ? (totalPnlPct / totalTrades).toFixed(2) : "0.00";
        
        const allClosedTrades = await AutoTrade.find({ status: 'CLOSED' }).sort({ closedAt: 1 }).select('pnlPercent').lean();
        let currentStreak = 0;
        let maxWinStreak = 0;

        allClosedTrades.forEach(trade => {
            if (trade.pnlPercent > 0) {
                currentStreak++;
            } else {
                if (currentStreak > maxWinStreak) {
                    maxWinStreak = currentStreak;
                }
                currentStreak = 0;
            }
        });
        if (currentStreak > maxWinStreak) maxWinStreak = currentStreak;

        return res.json({
            success: true,
            metrics: { 
                winRate, avgPnl, totalTrades, maxWinStreak,
                totalPnlAmount, winningTrades, losingTrades
            },
            data: logs
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getAutoTradeSettings = async (req, res) => {
    try {
        const settings = await Setting.find({ key: { $in: ['autoTradeTotalCapital', 'autoTradeMaxConcurrent', 'autoTradeRiskLevel', 'autoTradeEnabled'] } });
        const data = settings.reduce((acc, s) => {
            acc[s.key] = s.value;
            return acc;
        }, {});

        if (!data.autoTradeTotalCapital) data.autoTradeTotalCapital = 5_000_000_000;
        if (!data.autoTradeMaxConcurrent) data.autoTradeMaxConcurrent = 10;
        if (!data.autoTradeRiskLevel) data.autoTradeRiskLevel = 2;
        if (data.autoTradeEnabled === undefined) data.autoTradeEnabled = true;

        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateAutoTradeSettings = async (req, res) => {
    try {
        const { totalCapital, maxConcurrent, riskLevel, isEnabled, username, adminCode } = req.body;
        
        if (username !== 'admin') {
            const validAdminCode = process.env.ADMIN_CODE;
            if (!validAdminCode) {
                return res.status(403).json({ success: false, message: 'Hệ thống chưa cấu hình mã Admin (ADMIN_CODE trong .env).' });
            }
            if (!adminCode || adminCode !== validAdminCode) {
                return res.status(403).json({ success: false, message: 'Sai mã Admin, bạn không có quyền thực hiện!' });
            }
        }

        const updates = [];

        if (totalCapital && !isNaN(Number(totalCapital))) {
            updates.push(Setting.findOneAndUpdate(
                { key: 'autoTradeTotalCapital' },
                { value: Number(totalCapital) },
                { upsert: true, new: true }
            ));
        }
        if (maxConcurrent && !isNaN(Number(maxConcurrent))) {
            updates.push(Setting.findOneAndUpdate(
                { key: 'autoTradeMaxConcurrent' },
                { value: Number(maxConcurrent) },
                { upsert: true, new: true }
            ));
        }
        if (riskLevel && !isNaN(Number(riskLevel))) {
            updates.push(Setting.findOneAndUpdate(
                { key: 'autoTradeRiskLevel' },
                { value: Number(riskLevel) },
                { upsert: true, new: true }
            ));
        }
        if (isEnabled !== undefined) {
            // Ép Boolean tường minh để tránh MongoDB lưu string "false" / number 0
            const enabledBool = isEnabled === true || isEnabled === 'true' || isEnabled === 1;
            updates.push(Setting.findOneAndUpdate(
                { key: 'autoTradeEnabled' },
                { value: enabledBool },
                { upsert: true, new: true }
            ));
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'Không có dữ liệu hợp lệ để cập nhật.' });
        }

        await Promise.all(updates);
        return res.json({ success: true, message: 'Cấu hình đã được cập nhật.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

//User sends capital package with expected risk rate to the system
export const createUserExpectationOrder = async (req, res) => {
    const {
        username, capital, targetPct, stopLossPct, assetType,
        executionMode, exchangeConnectionId,
        allocationMode, totalCapital, allocationPercent, maxConcurrentOrders, dynamicSizing,
    } = req.body;

    const isPortfolio = allocationMode === 'PORTFOLIO';

    if (!username || !targetPct || (!isPortfolio && !capital) || (isPortfolio && !totalCapital)) {
        return res.status(400).json({ success: false, message: 'Thiếu tham số cấu hình gói lệnh rủi ro!' });
    }

    try {
        //Check for command infeasibility right at the API gatekeeper
        const check = verifyOrderFeasibility(assetType, parseFloat(targetPct));
        if (!check.feasible) {
            return res.json({ 
                success: false, 
                isFeasible: false, 
                message: check.reason 
            });
        }

        // ── VALIDATE PORTFOLIO MODE ──
        let portfolioFields = {};
        if (isPortfolio) {
            const total = parseFloat(totalCapital);
            const pct = Math.min(50, Math.max(1, parseFloat(allocationPercent) || 10));
            const maxOrders = Math.min(20, Math.max(1, parseInt(maxConcurrentOrders) || 5));
            if (!Number.isFinite(total) || total < 2_000_000) {
                return res.json({ success: false, isFeasible: false, message: 'Gói PORTFOLIO yêu cầu tổng quỹ tối thiểu 2,000,000 VNĐ.' });
            }
            if (total * (pct / 100) < 500_000) {
                return res.json({ success: false, isFeasible: false, message: `Với quỹ ${ (total/1e6).toFixed(1)}Tr và phân bổ ${pct}%/lệnh, mỗi lệnh chỉ ~${Math.round(total * pct / 100 / 1000)}k — quá nhỏ. Hãy tăng quỹ hoặc % phân bổ.` });
            }
            portfolioFields = {
                allocationMode: 'PORTFOLIO',
                totalCapital: total,
                allocationPercent: pct,
                maxConcurrentOrders: maxOrders,
                dynamicSizing: dynamicSizing !== false,
                usedCapital: 0,
                realizedPnl: 0,
            };
        }

        // ── VALIDATE LIVE MODE ──
        let finalExecutionMode = 'SIMULATED';
        let finalConnectionId = null;
        let liveWarning = null;

        if (executionMode === 'LIVE') {
            if (assetType !== 'CRYPTO') {
                return res.json({ success: false, isFeasible: false, message: 'Chế độ LIVE hiện chỉ hỗ trợ thị trường CRYPTO. Chứng khoán VN sẽ cập nhật sau.' });
            }
            if (!exchangeConnectionId) {
                return res.json({ success: false, isFeasible: false, message: 'Chế độ LIVE yêu cầu chọn một kết nối sàn (exchangeConnectionId).' });
            }
            const { default: ExchangeConnection } = await import('../../models/ExchangeConnection.js');
            const conn = await ExchangeConnection.findById(exchangeConnectionId);
            if (!conn) {
                return res.json({ success: false, isFeasible: false, message: 'Không tìm thấy kết nối sàn đã chọn.' });
            }
            if (conn.username !== username) {
                return res.status(403).json({ success: false, message: 'Kết nối sàn này không thuộc về bạn.' });
            }
            if (!conn.isActive) {
                return res.json({ success: false, isFeasible: false, message: 'Kết nối sàn đang bị TẮT. Hãy bật lại trong tab Kết nối sàn.' });
            }
            if (!conn.permissions?.includes('TRADE')) {
                return res.json({ success: false, isFeasible: false, message: 'API key của kết nối này không có quyền TRADE. Hãy test lại kết nối.' });
            }

            // ── CHỐT CHẶN VỐN: tránh vượt số dư & tránh tạo gói LIVE trùng vượt quỹ ──
            const STABLE = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'DAI'];
            const balanceUSDT = Object.entries(conn.balanceSnapshot || {})
                .filter(([a]) => STABLE.includes(a))
                .reduce((s, [, v]) => s + (Number(v) || 0), 0);

            if (balanceUSDT <= 0) {
                return res.json({ success: false, isFeasible: false, message: 'Kết nối này chưa có số dư USDT (hoặc chưa cập nhật). Hãy bấm "Test"/"Balance" ở tab Broker để làm mới số dư trước khi tạo gói LIVE.' });
            }

            const rate = await getUsdVndRate().catch(() => 25400);
            const newCommitVND = isPortfolio ? parseFloat(totalCapital) : parseFloat(capital);
            const newCommitUSDT = newCommitVND / rate;

            // Vốn đã bị "claim" bởi các gói LIVE đang hoạt động khác TRÊN CÙNG kết nối
            const otherLive = await UserOrder.find({
                username,
                executionMode: 'LIVE',
                exchangeConnectionId: conn._id,
                status: { $in: ['PENDING', 'ACTIVE', 'MATCHED'] },
            }).lean();
            const committedVND = otherLive.reduce(
                (s, o) => s + (o.allocationMode === 'PORTFOLIO' ? (o.totalCapital || 0) : (o.capital || 0)),
                0
            );
            const committedUSDT = committedVND / rate;
            const freeUSDT = balanceUSDT - committedUSDT;

            if (newCommitUSDT > freeUSDT * 1.001) {
                const fmt = (v) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
                return res.json({
                    success: false,
                    isFeasible: false,
                    message: `Vượt số dư khả dụng trên ${conn.exchangeName}. ` +
                        `Số dư: ${fmt(balanceUSDT)} USDT` +
                        (committedUSDT > 0 ? ` · Đã cam kết bởi ${otherLive.length} gói LIVE khác: ${fmt(committedUSDT)} USDT · Còn trống: ${fmt(freeUSDT)} USDT.` : '.') +
                        ` Gói này cần ~${fmt(newCommitUSDT)} USDT (${(newCommitVND / 1e6).toFixed(1)}Tr VNĐ @ ${rate.toLocaleString('vi-VN')}). ` +
                        `Hãy giảm vốn, hoặc dừng/xóa gói LIVE cũ trước.`,
                });
            }

            finalExecutionMode = 'LIVE';
            finalConnectionId = conn._id;
            if (conn.environment === 'LIVE') {
                liveWarning = '⚠️ CẢNH BÁO: Kết nối đang ở môi trường LIVE — lệnh sẽ dùng TIỀN THẬT trên sàn!';
            }
        }

        const newOrder = new UserOrder({
            username,
            // FIXED: capital = vốn/lệnh. PORTFOLIO: capital chỉ là tham chiếu (= phân bổ cơ sở)
            capital: isPortfolio
                ? Math.round(parseFloat(totalCapital) * ((portfolioFields.allocationPercent || 10) / 100))
                : parseFloat(capital),
            targetPct: parseFloat(targetPct),
            stopLossPct: parseFloat(stopLossPct || 7),
            assetType,
            executionMode: finalExecutionMode,
            exchangeConnectionId: finalConnectionId,
            ...portfolioFields,
            status: isPortfolio ? 'ACTIVE' : 'PENDING'
        });

        await newOrder.save();

        const successMessage = isPortfolio
            ? `Đã kích hoạt gói PORTFOLIO ${(parseFloat(totalCapital)/1e6).toFixed(1)}Tr VNĐ! Bot sẽ tự chia vốn (~${portfolioFields.allocationPercent}%/lệnh, tối đa ${portfolioFields.maxConcurrentOrders} lệnh đồng thời${portfolioFields.dynamicSizing ? ', dynamic sizing BẬT' : ''}) và liên tục khớp tín hiệu tốt nhất. ${finalExecutionMode === 'LIVE' ? (liveWarning || '🔴 LIVE Testnet — lệnh sẽ gửi thực ra sàn.') : ''}`
            : (finalExecutionMode === 'LIVE'
                ? `Đăng ký gói lệnh LIVE thành công! Khi AutoDuck tìm được tín hiệu phù hợp, lệnh sẽ được gửi THỰC ra sàn. ${liveWarning || '(Đang ở Testnet — an toàn)'}`
                : 'Đăng ký mục tiêu kỳ vọng thành công! Hệ thống AutoDuck đang quét luồng lệnh thích hợp để khớp tự động.');

        return res.json({ 
            success: true, 
            isFeasible: true, 
            data: newOrder, 
            warning: liveWarning,
            message: successMessage,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Dừng gói portfolio: không nhận lệnh mới, lệnh đang mở vẫn được giám sát đến khi đóng
export const stopUserOrder = async (req, res) => {
    try {
        const { username } = req.body;
        const order = await UserOrder.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy gói lệnh.' });
        if (order.username !== username) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền thao tác gói lệnh này.' });
        }
        if (!['ACTIVE', 'PENDING'].includes(order.status)) {
            return res.json({ success: false, message: `Gói đang ở trạng thái ${order.status}, không thể dừng.` });
        }
        order.status = 'STOPPED';
        const openCount = (order.tradeAllocations || []).filter(a => !a.closedAt).length;
        order.result.message = `Gói đã DỪNG theo yêu cầu. ${openCount > 0 ? `${openCount} lệnh đang mở vẫn được giám sát đến khi đóng (vốn + PnL sẽ tự hoàn về quỹ).` : 'Không còn lệnh nào đang mở.'}`;
        await order.save();
        return res.json({ success: true, data: order, message: order.result.message });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Xóa hẳn một gói lệnh khỏi danh sách (chỉ cho gói đã kết thúc, không còn lệnh mở).
export const deleteUserOrder = async (req, res) => {
    try {
        const username = req.body?.username || req.query?.username;
        const order = await UserOrder.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy gói lệnh.' });
        if (order.username !== username) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa gói lệnh này.' });
        }
        // Không cho xóa gói đang chạy — phải DỪNG trước để các lệnh mở được giám sát đóng an toàn.
        if (['ACTIVE', 'PENDING'].includes(order.status)) {
            return res.status(400).json({ success: false, message: `Gói đang ${order.status} — hãy DỪNG gói trước khi xóa.` });
        }
        const hasOpenAlloc = (order.tradeAllocations || []).some(a => !a.closedAt);
        if (hasOpenAlloc) {
            return res.status(400).json({ success: false, message: 'Gói vẫn còn lệnh đang mở — chờ đóng hết rồi mới xóa được.' });
        }
        await order.deleteOne();
        return res.json({ success: true, message: 'Đã xóa gói lệnh khỏi danh sách.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

//Get a list of commands according to a specific individual's expectations
export const getUserOrders = async (req, res) => {
    try {
        const data = await UserOrder.find({ username: req.params.username })
                                    .populate('assignedTrade')
                                    .sort({ createdAt: -1 });
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

//Get AI's treasure trove of self-study lessons
export const getAiLessons = async (req, res) => {
    try {
        const lessons = await AiBehavior.find({}).sort({ date: -1 }).limit(30);
        return res.json({ success: true, data: lessons });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

//API to forcefully activate the scanning system immediately (Serves manual debugging on the frontend)
export const forceTriggerPipeline = async (req, res) => {
    try {
        const targetAsset = req.body.assetType === 'ALL' ? null : req.body.assetType;
        const { username, adminCode } = req.body;
        
        if (username !== 'admin') {
            const validAdminCode = process.env.ADMIN_CODE;
            if (!validAdminCode) {
                return res.status(403).json({ success: false, message: 'Hệ thống chưa cấu hình mã Admin (ADMIN_CODE trong .env).' });
            }
            if (!adminCode || adminCode !== validAdminCode) {
                return res.status(403).json({ success: false, message: 'Sai mã Admin, bạn không có quyền thực hiện!' });
            }
        }
        
        await runAutoTradePipeline(targetAsset);
        
        return res.json({ 
            success: true, 
            message: 'Đã phát tín hiệu AutoDuck Engine quét và chấm điểm toàn sàn thành công!' 
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
// GET /api/auto-trade/usd-rate — tỷ giá USD→VND realtime (cache 1h, nguồn Vietcombank)
export const getUsdRate = async (req, res) => {
    try {
        const rate = await getUsdVndRate();
        return res.json({ success: true, rate, source: 'Vietcombank', cachedAt: new Date() });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message, rate: 25400 });
    }
};