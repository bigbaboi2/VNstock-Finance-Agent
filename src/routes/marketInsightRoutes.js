/**
 * ============================================================
 * OMNI DUCK — MARKET INSIGHT API ROUTES
 * ============================================================
 * Mount vào Express app:
 *   import marketInsightRouter from './routes/marketInsightRoutes.js';
 *   app.use('/api/market-insight', marketInsightRouter);
 *
 * Endpoints:
 *   GET  /api/market-insight/today          — Lấy report hôm nay (hoặc gần nhất)
 *   GET  /api/market-insight/today?force=true — Ép quét lại ngay
 *   GET  /api/market-insight/history        — 7 report gần đây
 *   POST /api/market-insight/scan           — Trigger quét thủ công (admin)
 * ============================================================
 */

import express from 'express';
import chalk from 'chalk';
import {
    getTodayInsight,
    runDailyMarketInsight,
    getInsightHistory,
} from '../services/marketInsightService.js';

const router = express.Router();

// ── Middleware: Basic rate-limit per IP ───────────────────────────────────────
const scanCooldowns = new Map(); // ip → lastScanTime
const SCAN_COOLDOWN_MS = 10 * 1000; // 10 giây giữa các lần force scan (test)

function scanRateLimit(req, res, next) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const lastScan = scanCooldowns.get(ip);
    if (lastScan && Date.now() - lastScan < SCAN_COOLDOWN_MS) {
        const remainSec = Math.ceil((SCAN_COOLDOWN_MS - (Date.now() - lastScan)) / 1000);
        return res.status(429).json({
            error: `Đang trong thời gian cooldown. Vui lòng thử lại sau ${remainSec} giây.`,
            remainSec,
        });
    }
    next();
}

// ── GET /api/market-insight/today ────────────────────────────────────────────
/**
 * Lấy report thị trường hôm nay.
 * Query params:
 *   ?force=true   — Ép quét lại, bỏ qua cache (có rate-limit 5 phút/IP)
 */
router.get('/today', async (req, res) => {
    const isForce = req.query.force === 'true';
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';

    // Rate-limit CHỈ áp dụng khi force=true (re-scan thủ công)
    // Fetch bình thường (cache/DB) KHÔNG bị chặn dù re-mount bao nhiêu lần
    if (isForce) {
        const lastScan = scanCooldowns.get(ip);
        if (lastScan && Date.now() - lastScan < SCAN_COOLDOWN_MS) {
            const remainSec = Math.ceil((SCAN_COOLDOWN_MS - (Date.now() - lastScan)) / 1000);
            return res.status(429).json({
                error: `Vui lòng đợi ${remainSec} giây trước khi quét lại.`,
                remainSec,
                isCooldown: true,  // flag để frontend phân biệt với lỗi thật
            });
        }
    }

    try {
        let insight;

        if (isForce) {
            console.error(`[INSIGHT ROUTE DEBUG] Force scan triggered by ${ip}, cooldown: ${Date.now() - (scanCooldowns.get(ip) || 0)}`);
            scanCooldowns.set(ip, Date.now());
            console.error(`[INSIGHT ROUTE DEBUG] Calling runDailyMarketInsight...`);
            insight = await runDailyMarketInsight({ force: true });
            console.error(`[INSIGHT ROUTE DEBUG] runDailyMarketInsight returned:`, { picks: insight?.topPicks?.length });
        } else {
            console.error(`[INSIGHT ROUTE DEBUG] Cache fetch for today`);
            insight = await getTodayInsight();
        }

        if (!insight) {
            return res.status(404).json({
                error: 'Chưa có báo cáo hôm nay. Báo cáo tự động chạy lúc 7:00 SA ngày làm việc.',
            });
        }

        return res.json(insight);

    } catch (err) {
        console.log(chalk.red(`[INSIGHT API] Lỗi GET /today: ${err.message}`));
        return res.status(500).json({
            error: err.message || 'Lỗi không xác định khi tải báo cáo thị trường',
        });
    }
});

// ── GET /api/market-insight/history ─────────────────────────────────────────
/**
 * Lấy lịch sử báo cáo gần đây.
 * Query params:
 *   ?days=7  — Số ngày lịch sử (mặc định 7, tối đa 30)
 */
router.get('/history', async (req, res) => {
    try {
        const days = Math.min(30, Math.max(1, parseInt(req.query.days) || 7));
        const history = await getInsightHistory(days);
        return res.json({ history, total: history.length });
    } catch (err) {
        console.log(chalk.red(`[INSIGHT API] Lỗi GET /history: ${err.message}`));
        return res.status(500).json({ error: err.message });
    }
});

// ── POST /api/market-insight/scan ───────────────────────────────────────────
/**
 * Trigger quét thủ công (dành cho admin hoặc cron job bên ngoài).
 * Body: { force: true }
 */
router.post('/scan', async (req, res) => {
    try {
        const force = req.body?.force === true;
        console.log(chalk.cyan(`[INSIGHT API] Manual scan triggered (force=${force})`));

        const insight = await runDailyMarketInsight({ force });

        if (!insight) {
            return res.json({
                message: 'Không cần quét (cuối tuần hoặc đã có report hôm nay)',
                skipped: true,
            });
        }

        return res.json({
            message: 'Quét thành công',
            date: insight.date,
            sentiment: insight.marketSentiment,
            topPicksCount: insight.topPicks?.length || 0,
        });

    } catch (err) {
        console.log(chalk.red(`[INSIGHT API] Lỗi POST /scan: ${err.message}`));
        return res.status(500).json({ error: err.message });
    }
});

export default router;