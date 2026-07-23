import AutoTrade from '../../models/AutoTrade.js';
import UserOrder from '../../models/UserOrder.js';
import AiBehavior from '../../models/AiBehavior.js';
import Setting from '../../models/Setting.js';
import { runAutoTradePipeline, verifyOrderFeasibility, getUsdVndRate } from '../services/autoTradeEngine.js';
import { getUnifiedTradeAnalytics, computeExpectancyStats } from '../services/tradeAnalyticsService.js';
import { getPipelineLogs } from '../services/pipelineLogService.js';
import { getFunnelLogs } from '../services/tradeFunnelService.js';
import { getAuditStatus, getAuditTail, readAuditFileTail } from '../services/auditLogService.js';
import { getEffectiveAutoDuckConfig, updateAutoDuckConfig } from '../services/autoDuckConfigService.js';
import { exportLiveTradeStats, DEFAULT_EXPORT_DIR } from '../services/liveTradeExportService.js';
import { sumLiveRealizedPnl } from '../services/livePnlService.js';
import {
    countOpenTradesOfOrder,
    healStaleAllocations,
    listTrulyOpenAllocations,
} from '../services/portfolioManager.js';

//Get the entire automatic transaction history of the system with advanced quantitative statistics
export const getSystemTradeLogs = async (req, res) => {
    try {
        // Open: mọi mode. Closed: ưu tiên SIM (training UI) — tránh 100 LIVE gần đây che hết lệnh mô phỏng.
        const [openLogs, closedSimLogs, closedLiveLogs] = await Promise.all([
            AutoTrade.find({ status: { $in: ['OPEN', 'PENDING'] } }).sort({ openedAt: -1 }),
            AutoTrade.find({
                status: { $nin: ['OPEN', 'PENDING'] },
                executionMode: { $ne: 'LIVE' },
            }).sort({ openedAt: -1 }).limit(100),
            AutoTrade.find({
                status: { $nin: ['OPEN', 'PENDING'] },
                executionMode: 'LIVE',
            }).sort({ openedAt: -1 }).limit(50),
        ]);

        const logs = [...openLogs, ...closedSimLogs, ...closedLiveLogs];

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

        const statsLive = await AutoTrade.aggregate([
            {
                $match: {
                    status: 'CLOSED',
                    executionMode: 'LIVE',
                    pnlSource: { $in: ['LIVE_FILLS', 'LIVE_FILLS_NET_FEE'] },
                },
            },
            {
                $group: {
                    _id: null,
                    totalTrades: { $sum: 1 },
                    winningTrades: { $sum: { $cond: [{ $gt: ['$pnlPercent', 0] }, 1, 0] } },
                    losingTrades: { $sum: { $cond: [{ $lt: ['$pnlPercent', 0] }, 1, 0] } },
                    totalPnlAmount: { $sum: '$pnl' },
                    totalPnlPct: { $sum: '$pnlPercent' },
                    avgWinPct: { $avg: { $cond: [{ $gt: ['$pnlPercent', 0] }, '$pnlPercent', null] } },
                    avgLossPct: { $avg: { $cond: [{ $lt: ['$pnlPercent', 0] }, '$pnlPercent', null] } },
                },
            },
        ]);

        // Nguồn chuẩn: recomputed từ fills (bỏ MARK_SIM / sim fallback cũ)
        const liveOfficial = await sumLiveRealizedPnl({}).catch(() => null);

        let totalTrades = 0, winningTrades = 0, losingTrades = 0, totalPnlAmount = 0, totalPnlPct = 0;
        if (stats.length > 0) {
            ({ totalTrades, winningTrades, losingTrades, totalPnlAmount, totalPnlPct } = stats[0]);
        }
        
        const winRate = totalTrades > 0 ? Math.round((winningTrades / totalTrades) * 100) : 0;
        const avgPnl = totalTrades > 0 ? (totalPnlPct / totalTrades).toFixed(2) : "0.00";

        let metricsLive = {
            winRate: 0, avgPnl: '0.00', totalTrades: 0,
            totalPnlAmount: 0, totalPnlUSDT: 0, winningTrades: 0, losingTrades: 0,
            avgWinPct: 0, avgLossPct: 0, expectancyPct: 0,
            pnlSource: 'LIVE_FILLS',
        };
        if (liveOfficial && liveOfficial.eligibleCount > 0) {
            const liveTotal = liveOfficial.eligibleCount;
            const wins = liveOfficial.winCount || 0;
            const losses = liveTotal - wins;
            const pcts = (liveOfficial.byTrade || []).map(t => Number(t.pnlPercent) || 0);
            const winPcts = pcts.filter(p => p > 0);
            const lossPcts = pcts.filter(p => p < 0);
            const liveAvgWin = winPcts.length ? winPcts.reduce((a, b) => a + b, 0) / winPcts.length : 0;
            const liveAvgLoss = lossPcts.length ? lossPcts.reduce((a, b) => a + b, 0) / lossPcts.length : 0;
            const liveExpectancy = liveTotal > 0
                ? Math.round(((wins / liveTotal) * liveAvgWin + (losses / liveTotal) * liveAvgLoss) * 100) / 100
                : 0;
            const avgPct = pcts.length ? (pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
            metricsLive = {
                winRate: liveOfficial.winRate,
                avgPnl: avgPct.toFixed(2),
                totalTrades: liveTotal,
                totalPnlAmount: liveOfficial.totalPnlVND,
                totalPnlUSDT: liveOfficial.totalPnlUSDT,
                winningTrades: wins,
                losingTrades: losses,
                avgWinPct: Math.round(liveAvgWin * 100) / 100,
                avgLossPct: Math.round(liveAvgLoss * 100) / 100,
                expectancyPct: liveExpectancy,
                pnlSource: 'LIVE_FILLS',
                usdVndRate: liveOfficial.usdVndRate,
            };
        } else if (statsLive.length > 0) {
            const s = statsLive[0];
            const liveTotal = s.totalTrades || 0;
            const liveWinRate = liveTotal > 0 ? Math.round((s.winningTrades / liveTotal) * 100) : 0;
            const liveAvgWin = Number(s.avgWinPct) || 0;
            const liveAvgLoss = Number(s.avgLossPct) || 0;
            const liveExpectancy = liveTotal > 0
                ? Math.round(((s.winningTrades / liveTotal) * liveAvgWin + (s.losingTrades / liveTotal) * liveAvgLoss) * 100) / 100
                : 0;
            metricsLive = {
                winRate: liveWinRate,
                avgPnl: liveTotal > 0 ? (s.totalPnlPct / liveTotal).toFixed(2) : '0.00',
                totalTrades: liveTotal,
                totalPnlAmount: s.totalPnlAmount || 0,
                totalPnlUSDT: 0,
                winningTrades: s.winningTrades || 0,
                losingTrades: s.losingTrades || 0,
                avgWinPct: Math.round(liveAvgWin * 100) / 100,
                avgLossPct: Math.round(liveAvgLoss * 100) / 100,
                expectancyPct: liveExpectancy,
                pnlSource: 'LIVE_FILLS_DB',
            };
        }

        const unified30d = await getUnifiedTradeAnalytics({ days: 30 }).catch(() => null);
        
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
                totalPnlAmount, winningTrades, losingTrades,
            },
            metricsLive,
            analytics30d: unified30d,
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
                { upsert: true, returnDocument: 'after' }
            ));
        }
        if (maxConcurrent && !isNaN(Number(maxConcurrent))) {
            updates.push(Setting.findOneAndUpdate(
                { key: 'autoTradeMaxConcurrent' },
                { value: Number(maxConcurrent) },
                { upsert: true, returnDocument: 'after' }
            ));
        }
        if (riskLevel && !isNaN(Number(riskLevel))) {
            updates.push(Setting.findOneAndUpdate(
                { key: 'autoTradeRiskLevel' },
                { value: Number(riskLevel) },
                { upsert: true, returnDocument: 'after' }
            ));
        }
        if (isEnabled !== undefined) {
            // Ép Boolean tường minh để tránh MongoDB lưu string "false" / number 0
            const enabledBool = isEnabled === true || isEnabled === 'true' || isEnabled === 1;
            updates.push(Setting.findOneAndUpdate(
                { key: 'autoTradeEnabled' },
                { value: enabledBool },
                { upsert: true, returnDocument: 'after' }
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

const assertAdminGate = (username, adminCode) => {
    if (username === 'admin') return null;
    const validAdminCode = process.env.ADMIN_CODE;
    if (!validAdminCode) {
        return { status: 403, message: 'Hệ thống chưa cấu hình mã Admin (ADMIN_CODE trong .env).' };
    }
    if (!adminCode || adminCode !== validAdminCode) {
        return { status: 403, message: 'Sai mã Admin, bạn không có quyền thực hiện!' };
    }
    return null;
};

export const getAutoTradeEnvConfig = async (req, res) => {
    try {
        const data = await getEffectiveAutoDuckConfig();
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateAutoTradeEnvConfig = async (req, res) => {
    try {
        const { values, username, adminCode } = req.body || {};
        const gate = assertAdminGate(username, adminCode);
        if (gate) return res.status(gate.status).json({ success: false, message: gate.message });
        if (!values || typeof values !== 'object') {
            return res.status(400).json({ success: false, message: 'Thiếu object values để cập nhật.' });
        }
        const result = await updateAutoDuckConfig(values);
        if (!result.applied || Object.keys(result.applied).length === 0) {
            return res.status(400).json({ success: false, message: result.message || 'Không có dữ liệu hợp lệ.' });
        }
        const savedAt = new Date();
        const who = username || 'admin';
        const changeList = Array.isArray(result.changes) ? result.changes : [];
        console.log(
            `[AutoTradeConfig] ${savedAt.toISOString()} (${savedAt.toLocaleString('vi-VN')}) — `
            + `user=${who} đã lưu ${changeList.length || Object.keys(result.applied).length} mục:`
        );
        for (const row of changeList) {
            const fromText = row.from === undefined ? '(chưa có)' : JSON.stringify(row.from);
            const toText = JSON.stringify(row.to);
            console.log(`  - ${row.key}`);
            console.log(`      ${fromText}  →  ${toText}`);
        }
        const data = await getEffectiveAutoDuckConfig();
        return res.json({ success: true, message: result.message, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const exportLiveTradeStatsHandler = async (req, res) => {
    try {
        const { username, adminCode, outputDir, fileNamePattern, dateFrom, dateTo } = req.body || {};
        const gate = assertAdminGate(username, adminCode);
        if (gate) return res.status(gate.status).json({ success: false, message: gate.message });

        const savedAt = new Date();
        const who = username || 'admin';
        const result = await exportLiveTradeStats({
            outputDir: outputDir || DEFAULT_EXPORT_DIR,
            fileNamePattern,
            dateFrom,
            dateTo,
        });

        console.log(
            `[LiveExport] ${savedAt.toISOString()} (${savedAt.toLocaleString('vi-VN')}) — `
            + `user=${who} → ${result.outputDir}`
        );
        console.log(`  pattern: ${result.fileNamePattern}`);
        console.log(`  range: ${result.dateRange?.label || 'all-time'}`);
        console.log(`  baseName: ${result.baseName}`);
        console.log(`  LIVE trades: ${result.summary.autoTradeLive} | win%: ${result.summary.winRatePct} | PnL: ${result.summary.totalPnlVnd} VND`);
        for (const f of result.files) {
            console.log(`  - ${f.name} (${f.sizeBytes} bytes)`);
        }

        return res.json({
            success: true,
            message: `Đã xuất ${result.files.length} file vào ${result.outputDir}`,
            data: result,
        });
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
        const openCount = await countOpenTradesOfOrder(order);
        order.result = order.result || {};
        order.result.message = `Gói đã DỪNG theo yêu cầu. ${openCount > 0 ? `${openCount} lệnh đang mở vẫn được giám sát đến khi đóng (vốn + PnL sẽ tự hoàn về quỹ).` : 'Không còn lệnh nào đang mở.'}`;
        await order.save();
        return res.json({ success: true, data: order, message: order.result.message });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Xóa hẳn một gói lệnh khỏi danh sách (chỉ cho gói đã kết thúc, không còn lệnh OPEN thật).
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

        // Đồng bộ allocation “treo”: UI đếm MATCHED+!closedAt, nhưng DB có thể còn
        // UNMATCHED/không closedAt dù AutoTrade đã CLOSED → chặn xóa oan.
        const healed = await healStaleAllocations(order);
        if (healed > 0) {
            if (order.status === 'STOPPED') {
                const stillOpen = await countOpenTradesOfOrder(order);
                order.result = order.result || {};
                order.result.message = stillOpen > 0
                    ? `Gói đã DỪNG theo yêu cầu. ${stillOpen} lệnh đang mở vẫn được giám sát đến khi đóng (vốn + PnL sẽ tự hoàn về quỹ).`
                    : 'Gói đã DỪNG. Không còn lệnh nào đang mở.';
            }
            await order.save();
        }

        const trulyOpen = await listTrulyOpenAllocations(order);
        if (trulyOpen.length > 0) {
            const syms = trulyOpen.map(a => a.symbol || '?').slice(0, 8).join(', ');
            return res.status(400).json({
                success: false,
                message: `Gói còn ${trulyOpen.length} lệnh LIVE đang OPEN/PENDING (${syms}) — chờ đóng hết trên sàn rồi mới xóa được.`,
            });
        }

        const deleted = await UserOrder.findByIdAndDelete(order._id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy gói lệnh (có thể đã bị xóa).' });
        }
        return res.json({
            success: true,
            message: healed > 0
                ? `Đã dọn ${healed} allocation treo và xóa gói khỏi danh sách.`
                : 'Đã xóa gói lệnh khỏi danh sách.',
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
        // Heal allocation treo + làm mới thông báo STOPPED (không làm fail cả list nếu 1 gói lỗi)
        for (const order of data) {
            try {
                const healed = await healStaleAllocations(order, { includeClosedTrades: false });
                let dirty = healed > 0;
                if (order.status === 'STOPPED') {
                    const stillOpen = await countOpenTradesOfOrder(order);
                    const nextMsg = stillOpen > 0
                        ? `Gói đã DỪNG theo yêu cầu. ${stillOpen} lệnh đang mở vẫn được giám sát đến khi đóng (vốn + PnL sẽ tự hoàn về quỹ).`
                        : 'Gói đã DỪNG. Không còn lệnh nào đang mở.';
                    order.result = order.result || {};
                    if (order.result.message !== nextMsg) {
                        order.result.message = nextMsg;
                        dirty = true;
                    }
                }
                if (dirty) await order.save();
            } catch (healErr) {
                console.warn(`[getUserOrders] heal skip ${order._id}:`, healErr.message);
            }
        }
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

export const getPipelineLogsHandler = async (req, res) => {
    try {
        const sinceId = Number(req.query.sinceId) || 0;
        return res.json({ success: true, ...getPipelineLogs(sinceId) });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getFunnelLogsHandler = async (req, res) => {
    try {
        const sinceId = Number(req.query.sinceId) || 0;
        const asset = req.query.asset || null;
        return res.json({ success: true, ...getFunnelLogs(sinceId, asset) });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getAuditStatusHandler = async (req, res) => {
    try {
        return res.json({ success: true, data: getAuditStatus() });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getAuditTailHandler = async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 50;
        const channel = req.query.channel || null;
        return res.json({ success: true, data: getAuditTail(limit, channel) });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getAuditFileTailHandler = async (req, res) => {
    try {
        const { username, adminCode } = req.query;
        if (username !== 'admin') {
            const validAdminCode = process.env.ADMIN_CODE;
            if (!validAdminCode || !adminCode || adminCode !== validAdminCode) {
                return res.status(403).json({ success: false, message: 'Sai mã Admin, bạn không có quyền truy cập audit file.' });
            }
        }
        const channel = req.query.channel || 'funnel';
        const date = req.query.date || null;
        const limit = Number(req.query.limit) || 100;
        const data = await readAuditFileTail({ channel, date, limit });
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getTradeAnalyticsHandler = async (req, res) => {
    try {
        const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
        const data = await getUnifiedTradeAnalytics({ days });
        return res.json({ success: true, data });
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