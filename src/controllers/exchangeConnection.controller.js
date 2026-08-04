import ExchangeConnection from '../../models/ExchangeConnection.js';
import ExchangeOrder from '../../models/ExchangeOrder.js';
import { encrypt, maskKey } from '../services/encryptionService.js';
import { SUPPORTED_EXCHANGES } from '../services/exchangeAdapters/index.js';
import * as brokerService from '../services/exchangeBrokerService.js';
import { getUsdVndRate } from '../services/autoTradeEngine.js';
import {
    enrichConnectionsWithEquity,
    resetEquityBaseline,
    maybeSetEquityBaseline,
} from '../services/walletEquityService.js';
import { mapLivePnlByTradeIds, sumLiveRealizedPnl, listCurrentPackageLiveTradeIds, filterLivePnlSummaryByTradeIds } from '../services/livePnlService.js';

const MAX_ACTIVE_CONNECTIONS_PER_USER = 5;

// ── Rate limiter in-memory đơn giản: 10 req/phút/user cho test & balance ──
const rateBuckets = new Map(); // key → [timestamps]
const checkRateLimit = (key, maxPerMinute = 10) => {
    const now = Date.now();
    const bucket = (rateBuckets.get(key) || []).filter(t => now - t < 60_000);
    if (bucket.length >= maxPerMinute) return false;
    bucket.push(now);
    rateBuckets.set(key, bucket);
    return true;
};

/** GET /api/exchange-connections/:username — danh sách kết nối + equity ví (MTM)
 *  ?lite=1 — bỏ equity Binance (hiện card nhanh), enrich chạy request full sau.
 */
export const getConnections = async (req, res) => {
    try {
        const lite = String(req.query.lite || '') === '1';
        const docs = await ExchangeConnection.find({ username: req.params.username }).sort({ createdAt: -1 });

        if (lite) {
            const data = docs.map((doc) => (typeof doc.toSafeJSON === 'function' ? doc.toSafeJSON() : doc));
            return res.json({ success: true, data, lite: true });
        }

        // Backfill baseline cho connection cũ chưa có mốc (không chặn response nếu fail)
        for (const doc of docs) {
            if (doc.equityBaselineUSDT == null && doc.balanceSnapshot && Object.keys(doc.balanceSnapshot).length) {
                const set = await maybeSetEquityBaseline(doc).catch(() => false);
                if (set) await doc.save().catch(() => {});
            }
        }

        const { data, walletSummary } = await enrichConnectionsWithEquity(docs);
        return res.json({ success: true, data, walletSummary });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/** POST /api/exchange-connections/:id/reset-equity-baseline — đặt mốc ví = equity hiện tại */
export const resetEquityBaselineEndpoint = async (req, res) => {
    try {
        const doc = await ExchangeConnection.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy kết nối.' });
        if (req.body?.username && doc.username !== req.body.username) {
            return res.status(403).json({ success: false, message: 'Không có quyền thao tác kết nối này.' });
        }
        if (!checkRateLimit(`baseline:${doc.username}`, 5)) {
            return res.status(429).json({ success: false, message: 'Quá nhiều yêu cầu đặt lại mốc — tối đa 5 lần/phút.' });
        }

        // Làm mới balance trước khi ghi mốc (best-effort)
        try {
            await brokerService.getBalance(doc);
        } catch {
            /* dùng snapshot cũ nếu sàn lỗi */
        }

        const equity = await resetEquityBaseline(doc);
        await doc.save();

        return res.json({
            success: true,
            message: `Đã đặt lại mốc ví = $${equity.equityUSDT.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
            data: doc.toSafeJSON(),
            equity,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/** POST /api/exchange-connections — tạo kết nối mới + test ngay */
export const createConnection = async (req, res) => {
    try {
        const { username, exchangeName, apiKey, secret, futuresApiKey, futuresSecret, passphrase, label, environment } = req.body;

        if (!username || !exchangeName || !apiKey || !secret) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc (username, exchangeName, apiKey, secret).' });
        }
        if ((futuresApiKey && !futuresSecret) || (!futuresApiKey && futuresSecret)) {
            return res.status(400).json({ success: false, message: 'Futures API Key và Futures Secret phải được nhập cùng nhau.' });
        }
        const exchange = String(exchangeName).toUpperCase();
        if (!SUPPORTED_EXCHANGES.includes(exchange)) {
            return res.status(400).json({ success: false, message: `Sàn '${exchangeName}' chưa được hỗ trợ. Hỗ trợ: ${SUPPORTED_EXCHANGES.join(', ')}` });
        }
        if (exchange === 'OKX' && !passphrase) {
            return res.status(400).json({ success: false, message: 'OKX bắt buộc phải có Passphrase.' });
        }

        const activeCount = await ExchangeConnection.countDocuments({ username, isActive: true });
        if (activeCount >= MAX_ACTIVE_CONNECTIONS_PER_USER) {
            return res.status(400).json({ success: false, message: `Mỗi user tối đa ${MAX_ACTIVE_CONNECTIONS_PER_USER} kết nối active. Hãy xóa hoặc tắt bớt.` });
        }

        const doc = new ExchangeConnection({
            username,
            exchangeName: exchange,
            label: label?.trim() || `${exchange} connection`,
            apiKeyEncrypted: encrypt(apiKey),
            secretEncrypted: encrypt(secret),
            passphraseEncrypted: passphrase ? encrypt(passphrase) : null,
            apiKeyMasked: maskKey(apiKey),
            futuresApiKeyEncrypted: futuresApiKey ? encrypt(futuresApiKey) : null,
            futuresSecretEncrypted: futuresSecret ? encrypt(futuresSecret) : null,
            futuresApiKeyMasked: futuresApiKey ? maskKey(futuresApiKey) : null,
            environment: environment === 'LIVE' ? 'LIVE' : 'TESTNET',
        });
        await doc.save();

        // Test connection ngay sau khi tạo
        const testResult = await brokerService.testConnection(doc);

        if (!testResult.success) {
            // Nếu test sai key, xóa luôn khỏi DB để user sửa lại key, không lưu rác
            await doc.deleteOne();
            return res.json({
                success: false,
                message: `Test kết nối thất bại: ${testResult.message}`
            });
        }

        // Cảnh báo nếu key có quyền WITHDRAW
        let warning = null;
        if (testResult.permissions?.includes('WITHDRAW')) {
            warning = '⚠️ API key này có quyền RÚT TIỀN. Khuyến nghị mạnh: tạo lại key trên sàn và TẮT quyền Withdraw!';
        }

        return res.json({
            success: true,
            data: doc.toSafeJSON(),
            testResult,
            warning,
            message: 'Tạo kết nối và xác thực với sàn thành công!',
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/** DELETE /api/exchange-connections/:id — xóa kết nối (chỉ owner) */
export const deleteConnection = async (req, res) => {
    try {
        const { username } = req.body;
        const doc = await ExchangeConnection.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy kết nối.' });
        if (doc.username !== username) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa kết nối của user khác.' });
        }
        await ExchangeConnection.deleteOne({ _id: doc._id });
        return res.json({ success: true, message: 'Đã xóa kết nối và toàn bộ key đã mã hóa.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/** POST /api/exchange-connections/:id/test — test + refresh balance snapshot */
export const testConnectionEndpoint = async (req, res) => {
    try {
        const doc = await ExchangeConnection.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy kết nối.' });
        if (req.body?.username && doc.username !== req.body.username) {
            return res.status(403).json({ success: false, message: 'Không có quyền thao tác kết nối này.' });
        }
        if (!checkRateLimit(`test:${doc.username}`)) {
            return res.status(429).json({ success: false, message: 'Quá nhiều yêu cầu test — tối đa 10 lần/phút.' });
        }
        const result = await brokerService.testConnection(doc);
        return res.json({
            success: result.success,
            spotOk: result.spotOk,
            futuresOk: result.futuresOk,
            futuresError: result.futuresError || '',
            permissions: result.permissions,
            balances: result.balances,
            latencyMs: result.latencyMs,
            message: result.message,
            data: doc.toSafeJSON(),
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/** PATCH /api/exchange-connections/:id/toggle — bật/tắt isActive */
export const toggleConnection = async (req, res) => {
    try {
        const { isActive, username } = req.body;
        const doc = await ExchangeConnection.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy kết nối.' });
        if (username && doc.username !== username) {
            return res.status(403).json({ success: false, message: 'Không có quyền thao tác kết nối này.' });
        }
        if (isActive === true) {
            const activeCount = await ExchangeConnection.countDocuments({ username: doc.username, isActive: true, _id: { $ne: doc._id } });
            if (activeCount >= MAX_ACTIVE_CONNECTIONS_PER_USER) {
                return res.status(400).json({ success: false, message: `Tối đa ${MAX_ACTIVE_CONNECTIONS_PER_USER} kết nối active.` });
            }
        }
        doc.isActive = isActive === true;
        await doc.save();
        return res.json({ success: true, data: doc.toSafeJSON(), message: `Kết nối đã ${doc.isActive ? 'BẬT' : 'TẮT'}.` });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/** GET /api/exchange-connections/:id/balance — balance realtime từ sàn */
export const getLiveBalance = async (req, res) => {
    try {
        const doc = await ExchangeConnection.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy kết nối.' });
        if (!checkRateLimit(`balance:${doc.username}`)) {
            return res.status(429).json({ success: false, message: 'Quá nhiều yêu cầu balance — tối đa 10 lần/phút.' });
        }
        const balances = await brokerService.getBalance(doc);
        return res.json({ success: true, balances, updatedAt: doc.balanceUpdatedAt });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/** GET /api/exchange-connections/orders/:username — log lệnh thực + thống kê
 *  ?lite=1 — chỉ list + đếm nhanh (bỏ map PnL / sumLiveRealizedPnl).
 */
export const getExchangeOrders = async (req, res) => {
    try {
        const { username } = req.params;
        const lite = String(req.query.lite || '') === '1';
        const orders = await ExchangeOrder.find({ username })
            .sort({ sentAt: -1 })
            .limit(200)
            .lean();

        const filled = orders.filter((o) => o.status === 'FILLED');
        const basicStats = {
            totalOrders: orders.length,
            filledOrders: filled.length,
            failedOrders: orders.filter((o) => o.status === 'FAILED').length,
            pendingOrders: orders.filter((o) => ['PENDING', 'PARTIAL'].includes(o.status)).length,
            totalNotionalUSDT: +filled.reduce((s, o) => s + (o.notionalUSDT || 0), 0).toFixed(2),
        };

        if (lite) {
            return res.json({
                success: true,
                lite: true,
                stats: {
                    ...basicStats,
                    liveRealizedPnlUSDT: null,
                    liveRealizedPnlVND: null,
                    liveEligibleTrades: null,
                    liveCurrentPackagePnlUSDT: null,
                    liveCurrentPackagePnlVND: null,
                    liveCurrentPackageTrades: null,
                    liveCurrentPackageCount: null,
                    usdVndRate: null,
                },
                data: orders,
            });
        }

        const autoTradeIds = [...new Set(orders.map((o) => o.autoTradeId).filter(Boolean))];
        const currentUsdVndRate = await getUsdVndRate();
        const pnlMap = await mapLivePnlByTradeIds(autoTradeIds, currentUsdVndRate);
        const AutoTrade = (await import('../../models/AutoTrade.js')).default;
        const markTrades = await AutoTrade.find(
            { _id: { $in: autoTradeIds } },
            'markSimPnl markSimPnlPercent pnlSource'
        ).lean();
        const markMap = {};
        markTrades.forEach((t) => { markMap[String(t._id)] = t; });

        for (const o of orders) {
            if (o.purpose !== 'EXIT' || !o.autoTradeId) continue;
            const tid = o.autoTradeId.toString();
            const fillPnl = pnlMap[tid];
            const mark = markMap[tid];

            if (['FILLED', 'PARTIAL'].includes(o.status) && fillPnl?.eligible) {
                o.livePnl = o.exchangeName === 'DNSE' ? fillPnl.livePnlVND : fillPnl.livePnlUSDT;
                o.livePnlPercent = fillPnl.livePnlPercent;
                o.livePnlSource = fillPnl.source;
            } else if (o.status === 'FAILED' && mark?.markSimPnl != null) {
                o.markSimPnl = o.exchangeName === 'DNSE'
                    ? mark.markSimPnl
                    : (Number(mark.markSimPnl) / currentUsdVndRate);
                o.markSimPnlPercent = mark.markSimPnlPercent;
                o.livePnl = null;
                o.livePnlPercent = null;
            } else {
                o.livePnl = null;
                o.livePnlPercent = null;
            }
        }

        const livePnlSummary = await sumLiveRealizedPnl({ username }).catch(() => null);
        const currentPkg = await listCurrentPackageLiveTradeIds(username).catch(() => ({ tradeIds: [], packageCount: 0 }));
        const currentPnl = livePnlSummary
            ? filterLivePnlSummaryByTradeIds(livePnlSummary, currentPkg.tradeIds)
            : null;
        const stats = {
            ...basicStats,
            liveRealizedPnlUSDT: livePnlSummary?.totalPnlUSDT ?? 0,
            liveRealizedPnlVND: livePnlSummary?.totalPnlVND ?? 0,
            liveEligibleTrades: livePnlSummary?.eligibleCount ?? 0,
            liveCurrentPackagePnlUSDT: currentPnl?.totalPnlUSDT ?? 0,
            liveCurrentPackagePnlVND: currentPnl?.totalPnlVND ?? 0,
            liveCurrentPackageTrades: currentPnl?.eligibleCount ?? 0,
            liveCurrentPackageCount: currentPkg.packageCount ?? 0,
            usdVndRate: currentUsdVndRate,
        };
        return res.json({ success: true, stats, data: orders });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/** POST /api/exchange-connections/:id/sell-to-usdt — Bán thủ công 1 đồng coin ra USDT */
export const sellBalanceToUSDT = async (req, res) => {
    try {
        const doc = await ExchangeConnection.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy kết nối.' });

        const { asset } = req.body;
        if (!asset) return res.status(400).json({ success: false, message: 'Thiếu tên tài sản (asset).' });

        const result = await brokerService.sellAssetToUSDT(doc, asset);
        
        // Trả về balance mới luôn (vì sellAssetToUSDT đã getBalance rồi)
        return res.json({ 
            success: result.success, 
            message: result.message,
            balances: doc.balanceSnapshot,
            updatedAt: doc.balanceUpdatedAt
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
