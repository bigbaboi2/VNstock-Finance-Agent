import AutoTrade from '../../models/AutoTrade.js';
import UserOrder from '../../models/UserOrder.js';
import AiBehavior from '../../models/AiBehavior.js';
import Setting from '../../models/Setting.js';
import { runAutoTradePipeline, verifyOrderFeasibility } from '../services/autoTradeEngine.js';

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
        const { totalCapital, maxConcurrent, riskLevel, isEnabled } = req.body;
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
            updates.push(Setting.findOneAndUpdate(
                { key: 'autoTradeEnabled' },
                { value: isEnabled },
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