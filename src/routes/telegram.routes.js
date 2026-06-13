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