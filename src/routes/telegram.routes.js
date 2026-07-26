import express from 'express';
import axios from 'axios';
import chalk from 'chalk';
import { handleTelegramCommand } from '../services/autoTradeEngine.js';

const router = express.Router();

// ─── SECURITY: chỉ cho phép chat_id trong whitelist ──────────────────────────
//Add TELEGRAM_ADMIN_CHAT_ID=123456789 to .env
 const isAllowedChatId = (chatId) => {
    const adminId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!adminId) {
        console.log(chalk.yellow('[TELEGRAM ROUTE] ⚠️  TELEGRAM_ADMIN_CHAT_ID chưa set trong .env — đang bỏ qua kiểm tra chat_id'));
        return true;
    }
    return String(chatId) === String(adminId);
};

// ─── POST /api/telegram/webhook ──────────────────────────────────────────────
 router.post('/webhook', async (req, res) => {
     res.sendStatus(200);

    try {
        const update = req.body;

         const message = update?.message;
        if (!message?.text) return;

        const chatId   = message.chat?.id;
        const text     = message.text || '';
        const username = message.from?.username || message.from?.first_name || 'unknown';

        console.log(chalk.cyan(`[TELEGRAM] 📩 Tin nhắn từ @${username} (${chatId}): ${text}`));

        // Kiểm tra whitelist
        if (!isAllowedChatId(chatId)) {
            console.log(chalk.yellow(`[TELEGRAM] 🚫 Từ chối chat_id không được phép: ${chatId}`));
            return;
        }

         await handleTelegramCommand(text, { username, chatId });

    } catch (err) {
         console.log(chalk.red(`[TELEGRAM ROUTE] Lỗi xử lý webhook: ${err.message}`));
    }
});

// ─── GET /api/telegram/set-webhook ───────────────────────────────────────────
 
router.get('/set-webhook', async (req, res) => {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN;
        if (!botToken) {
            return res.status(500).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN chưa được set trong .env' });
        }

        const baseUrl    = req.query.url || process.env.WEBHOOK_BASE_URL;
        if (!baseUrl) {
            return res.status(400).json({
                ok: false,
                error: 'Thiếu URL. Truyền ?url=https://your-server.com hoặc set WEBHOOK_BASE_URL trong .env',
            });
        }

        const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/telegram/webhook`;
        const apiUrl     = `https://api.telegram.org/bot${botToken}/setWebhook`;

        const result = await axios.post(apiUrl, {
            url: webhookUrl,
            allowed_updates: ['message'],    
            drop_pending_updates: true,    
        });

        console.log(chalk.green(`[TELEGRAM] ✅ Webhook đã đăng ký: ${webhookUrl}`));
        return res.json({
            ok: true,
            webhookUrl,
            telegramResponse: result.data,
        });

    } catch (err) {
        console.log(chalk.red(`[TELEGRAM] ❌ Set webhook thất bại: ${err.message}`));
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// ─── GET /api/telegram/webhook-info ──────────────────────────────────────────
 router.get('/webhook-info', async (req, res) => {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN;
        if (!botToken) {
            return res.status(500).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN chưa set' });
        }

        const result = await axios.get(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
        return res.json({ ok: true, info: result.data.result });

    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// ─── GET /api/telegram/set-commands ──────────────────────────────────────────
// Đăng ký menu lệnh hiển thị khi user gõ "/" trong Telegram.
// Gọi một lần sau khi set-webhook. Không cần gọi lại trừ khi thêm/đổi lệnh.
//
// Lý do xoá scope trước khi set: Telegram ưu tiên scope cụ thể hơn default.
// Nếu all_private_chats scope từng được set riêng (vd chỉ có /help), nó sẽ
// override default scope → chat chỉ hiện 1 lệnh. Fix: delete rồi re-set.
router.get('/set-commands', async (req, res) => {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN;
        if (!botToken) {
            return res.status(500).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN chưa được set trong .env' });
        }

        const commands = [
            { command: 'start',     description: '▶ Bật auto-trade pipeline' },
            { command: 'stop',      description: '⏸ Tắt auto-trade pipeline' },
            { command: 'status',    description: '📊 Dashboard tổng quan hệ thống' },
            { command: 'live',      description: '🔴 Xem lệnh LIVE đang mở + thống kê 30 ngày' },
            { command: 'sim',       description: '🧪 Xem lệnh SIM đang chạy + thống kê 30 ngày' },
            { command: 'pnl',       description: '💰 PnL hôm nay (LIVE + SIM + Manual)' },
            { command: 'portfolio', description: '💼 Danh sách gói portfolio đang chạy' },
            { command: 'market',    description: '🌐 Tổng quan thị trường VN + Crypto' },
            { command: 'stats',     description: '📈 Thống kê giao dịch (mặc định 30 ngày)' },
            { command: 'info',      description: '🔍 Giá + kỹ thuật một mã. VD: /info MBB' },
            { command: 'insight',   description: '🧠 Báo cáo AI thị trường hôm nay' },
            { command: 'funnel',    description: '🔬 Funnel scan cuối. VD: /funnel crypto' },
            { command: 'health',    description: '⚙ Trạng thái hệ thống & tài nguyên' },
            { command: 'broker',    description: '🏦 Kết nối sàn giao dịch' },
            { command: 'manual',    description: '🙋 Danh sách lệnh manual đang mở' },
            { command: 'ai',        description: '🤖 Bài học AI + thống kê hành vi gần đây' },
            { command: 'settings',  description: '🔧 Xem cấu hình auto-trade hiện tại' },
            { command: 'help',      description: '❓ Xem tất cả lệnh và hướng dẫn' },
        ];

        const base = `https://api.telegram.org/bot${botToken}`;

        // Bước 1: Xoá sạch tất cả scope cụ thể có thể đang override default
        const scopesToClear = [
            { type: 'all_private_chats' },
            { type: 'all_group_chats' },
            { type: 'all_chat_administrators' },
        ];
        const clearResults = [];
        for (const scope of scopesToClear) {
            try {
                const r = await axios.post(`${base}/deleteMyCommands`, { scope });
                clearResults.push({ scope: scope.type, ok: r.data.ok });
            } catch (e) {
                clearResults.push({ scope: scope.type, ok: false, err: e.message });
            }
        }

        // Bước 2: Set commands cho default scope (áp dụng cho mọi nơi)
        const defaultResult = await axios.post(`${base}/setMyCommands`, { commands });

        // Bước 3: Set lại explicitly cho all_private_chats (private chat với bot)
        const privateResult = await axios.post(`${base}/setMyCommands`, {
            commands,
            scope: { type: 'all_private_chats' },
        });

        console.log(chalk.green(`[TELEGRAM] ✅ Đã đăng ký ${commands.length} lệnh vào bot menu (default + private)`));
        return res.json({
            ok: true,
            commandCount: commands.length,
            clearResults,
            defaultScope: defaultResult.data,
            privateScope: privateResult.data,
        });

    } catch (err) {
        console.log(chalk.red(`[TELEGRAM] ❌ Set commands thất bại: ${err.message}`));
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// ─── DELETE /api/telegram/webhook ────────────────────────────────────────────
// option for local testing
router.delete('/webhook', async (req, res) => {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN;
        if (!botToken) {
            return res.status(500).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN chưa set' });
        }

        const result = await axios.post(`https://api.telegram.org/bot${botToken}/deleteWebhook`, {
            drop_pending_updates: true,
        });

        console.log(chalk.yellow(`[TELEGRAM] 🗑️  Webhook đã bị xoá`));
        return res.json({ ok: true, telegramResponse: result.data });

    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

export default router;