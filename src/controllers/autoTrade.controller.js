import AutoTrade from '../../models/AutoTrade.js';
import UserOrder from '../../models/UserOrder.js';
import AiBehavior from '../../models/AiBehavior.js';
import Setting from '../../models/Setting.js';
import { runAutoTradePipeline, verifyOrderFeasibility } from '../services/autoTradeEngine.js';

//Get the entire automatic transaction history of the system with advanced quantitative statistics
export const getSystemTradeLogs = async (req, res) => {
    try {
        const logs = await AutoTrade.find({}).sort({ openedAt: -1 }).limit(100);
        
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
        const setting = await Setting.findOne({ key: 'autoTradeTotalCapital' });
        return res.json({ success: true, data: setting });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateAutoTradeSettings = async (req, res) => {
    try {
        const { totalCapital } = req.body;
        if (!totalCapital || isNaN(Number(totalCapital))) {
            return res.status(400).json({ success: false, message: 'Vốn không hợp lệ.' });
        }
        const updatedSetting = await Setting.findOneAndUpdate(
            { key: 'autoTradeTotalCapital' },
            { value: Number(totalCapital) },
            { upsert: true, new: true }
        );
        return res.json({ success: true, data: updatedSetting });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

//User sends capital package with expected risk rate to the system
export const createUserExpectationOrder = async (req, res) => {
    const { username, capital, targetPct, stopLossPct, assetType } = req.body;

    if (!username || !capital || !targetPct) {
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

        const newOrder = new UserOrder({
            username,
            capital: parseFloat(capital),
            targetPct: parseFloat(targetPct),
            stopLossPct: parseFloat(stopLossPct || 7),
            assetType,
            status: 'PENDING'
        });

        await newOrder.save();
        return res.json({ 
            success: true, 
            isFeasible: true, 
            data: newOrder, 
            message: 'Đăng ký mục tiêu kỳ vọng thành công! Hệ thống AutoDuck đang quét luồng lệnh thích hợp để khớp tự động.' 
        });
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
        
        await runAutoTradePipeline(targetAsset);
        
        return res.json({ 
            success: true, 
            message: 'Đã phát tín hiệu AutoDuck Engine quét và chấm điểm toàn sàn thành công!' 
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};