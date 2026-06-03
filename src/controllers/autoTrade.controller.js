import AutoTrade from '../../models/AutoTrade.js';
import UserOrder from '../../models/UserOrder.js';
import AiBehavior from '../../models/AiBehavior.js';
import { runAutoTradePipeline, verifyOrderFeasibility } from '../services/autoTradeEngine.js';

//Get the entire automatic transaction history of the system with advanced quantitative statistics
export const getSystemTradeLogs = async (req, res) => {
    try {
        const logs = await AutoTrade.find({}).sort({ openedAt: -1 }).limit(100);
        
        //Calculate performance statistics (Metrics Engine)
        const closedTrades = logs.filter(t => t.status === 'CLOSED');
        const totalTrades = closedTrades.length;
        const winningTrades = closedTrades.filter(t => t.pnlPercent > 0).length;
        const winRate = totalTrades > 0 ? Math.round((winningTrades / totalTrades) * 100) : 0;
        
        let totalPnlPct = 0;
        let currentStreak = 0;
        let maxWinStreak = 0;

        closedTrades.reverse().forEach(t => {
            totalPnlPct += t.pnlPercent;
            if (t.pnlPercent > 0) {
                currentStreak++;
                if (currentStreak > maxWinStreak) maxWinStreak = currentStreak;
            } else if (t.pnlPercent < 0) {
                currentStreak = 0;
            }
        });

        const avgPnl = totalTrades > 0 ? (totalPnlPct / totalTrades).toFixed(2) : "0.00";

        return res.json({
            success: true,
            metrics: { winRate, avgPnl, totalTrades, maxWinStreak },
            data: logs
        });
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