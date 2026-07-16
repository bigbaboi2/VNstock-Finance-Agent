import axios from 'axios';
import chalk from 'chalk';

const getTelegramConfig = () => ({
    botToken: process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID || '',
});

const getTradeCloseIcon = (pnlValue) => {
    const n = Number(pnlValue);
    if (!Number.isFinite(n)) return '⚪';
    if (n > 0) return '🟢';
    if (n < 0) return '🔴';
    return '⚪';
};

const PLAIN_DIVIDER = '━━━━━━━━━━━━━━━━━━━━';

/** Frontend (Vercel) — deep link tra cứu mã trên web. */
const getWebAppBaseUrl = () => {
    const raw = process.env.FRONTEND_URL
        || process.env.WEB_APP_URL
        || process.env.VITE_APP_URL
        || 'https://your-frontend.example.com';
    return String(raw).replace(/\/+$/, '');
};

const buildWebAppLink = ({ symbol, mode } = {}) => {
    const base = getWebAppBaseUrl();
    const params = new URLSearchParams();
    if (mode && String(mode).toUpperCase() !== 'VN_STOCKS') {
        params.set('mode', String(mode).toUpperCase());
    }
    if (symbol) params.set('symbol', String(symbol).toUpperCase());
    const qs = params.toString();
    return qs ? `${base}/?${qs}` : `${base}/`;
};

const moreInfoLine = ({ symbol, mode, label } = {}) => {
    const url = buildWebAppLink({ symbol, mode });
    return `🔗 <b>${escapeHtml(label || 'Xem thêm trên web')}</b>: ${escapeHtml(url)}`;
};

const htmlSection = (title) => `<b>${escapeHtml(title)}</b>`;
const htmlItalic = (text) => `<i>${escapeHtml(text)}</i>`;
const htmlBold = (text) => `<b>${escapeHtml(text)}</b>`;

const formatVnDateTime = (value) => {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};

const escapeMarkdownV2 = (text = '') =>
    String(text)
        .replace(/\\/g, '\\\\')
        .replace(/_/g, '\\_')
        .replace(/\*/g, '\\*')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/~/g, '\\~')
        .replace(/`/g, '\\`')
        .replace(/>/g, '\\>')
        .replace(/#/g, '\\#')
        .replace(/\+/g, '\\+')
        .replace(/-/g, '\\-')
        .replace(/=/g, '\\=')
        .replace(/\|/g, '\\|')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
        .replace(/\./g, '\\.')
        .replace(/!/g, '\\!');

const escapeHtml = (text = '') =>
    String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

const formatTelegramPlainSection = (title, lines = []) => {
    const body = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
    if (!body.length) return '';
    return `${title}\n${PLAIN_DIVIDER}\n${body.join('\n')}`;
};

const packPlainLines = (lines, maxLen = 3900) => {
    const packed = [];
    let total = 0;
    for (const line of lines) {
        if (total + line.length + 1 > maxLen) {
            packed.push(`... (còn ${lines.length - packed.length} dòng bị cắt)`);
            break;
        }
        packed.push(line);
        total += line.length + 1;
    }
    return packed.join('\n');
};

const formatStatsSummary = (stats = {}, label = '') => {
    if (!stats || stats.error || !stats.totalTrades) {
        return `${label ? label + ': ' : ''}Chưa có lệnh đóng`;
    }
    const pnlSign = (stats.totalPnlPct || 0) >= 0 ? '+' : '';
    const amountPart = stats.currency === 'USDT'
        ? ` | $${Number(stats.totalPnlAmount || 0).toFixed(2)}`
        : '';
    return `${label ? label + ' — ' : ''}${stats.totalTrades} lệnh | Win ${stats.winRate} | PnL ${pnlSign}${stats.totalPnlPct}%${amountPart}`;
};

const formatCombinedStatsLine = (stats = {}) => {
    if (!stats || stats.error || !stats.totalTrades) return 'Chưa có lệnh đóng';
    let line = `${stats.totalTrades} lệnh | Win ${stats.winRate}`;
    if (stats.manualTrades > 0) {
        line += ` (🤖 ${stats.autoTrades} auto ${stats.autoWinRate} | 🙋 ${stats.manualTrades} manual ${stats.manualWinRate})`;
    }
    return line;
};

const appendUnifiedStatsSection = (lines, {
    title,
    combined,
    auto,
    autoLive,
    autoSim,
    manual,
    hasManualEver,
}) => {
    lines.push(title);
    lines.push(`  📈 Tổng: ${formatCombinedStatsLine(combined)}`);
    if (hasManualEver) {
        lines.push(`  🤖 Auto: ${formatStatsSummary(auto, '')}`);
        lines.push(`     🔴 LIVE: ${formatStatsSummary(autoLive, '')}`);
        lines.push(`     🧪 SIM:  ${formatStatsSummary(autoSim, '')}`);
        if (manual?.totalTrades) {
            lines.push(`  🙋 Manual: ${formatStatsSummary(manual, '')}`);
        } else {
            lines.push(`  🙋 Manual: chưa có lệnh đóng trong kỳ`);
        }
    } else {
        lines.push(`  🔴 LIVE: ${formatStatsSummary(autoLive, '')}`);
        lines.push(`  🧪 SIM:  ${formatStatsSummary(autoSim, '')}`);
    }
};

const calcUnrealizedPct = (trade) => {
    if (!Number.isFinite(trade.currentPrice) || trade.currentPrice <= 0 || !trade.entryPrice) return null;
    const isLong = trade.direction === 'LONG' || trade.direction === 'MUA';
    return isLong
        ? ((trade.currentPrice - trade.entryPrice) / trade.entryPrice * 100)
        : ((trade.entryPrice - trade.currentPrice) / trade.entryPrice * 100);
};



const formatNumber = (value, digits = 2) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '--';
    return n.toLocaleString('vi-VN', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
};

const formatSignedPct = (value, digits = 2) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '--';
    return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
};

const formatPct = (value, digits = 2) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '--';
    return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
};


const formatPrice = (value, assetType = '') => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '--';
    if (assetType === 'VN_STOCK') {
        return `${n.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} k\u20ab`;
    }
    if (assetType === 'CRYPTO') {
        const digits = n >= 1000 ? 2 : n >= 1 ? 4 : 6;
        return `$${n.toLocaleString('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
    }
    if (assetType === 'DERIVATIVES') {
        return `${n.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} \u0111/c`;
    }
    return n.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};


const formatVND = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '--';
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
    if (abs >= 1_000_000)     return `${sign}${(abs / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} triệu`;
    return `${sign}${abs.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}`;
};


const truncate = (text, maxLen = 300) => {
    const s = String(text || '').trim();
    return s.length > maxLen ? s.slice(0, maxLen) + '...' : s;
};


const formatHoldDuration = (openedAt) => {
    if (!openedAt) return null;
    const ms = Date.now() - new Date(openedAt).getTime();
    if (ms < 0 || !Number.isFinite(ms)) return null;
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    if (h >= 24) return `${Math.floor(h / 24)}n${h % 24}h`;
    if (h > 0)   return `${h}h${m}m`;
    return `${m}m`;
};



const isTelegramConfigured = (chatIdOverride = null) => {
    const { botToken, chatId } = getTelegramConfig();
    return Boolean(botToken && (chatIdOverride || chatId));
};


const sendTelegramMessage = async (message, { chatId: chatIdOverride, parseMode = 'MarkdownV2', _isRetry = false } = {}) => {
    const { botToken, chatId: defaultChatId } = getTelegramConfig();
    const targetChatId = chatIdOverride || defaultChatId;

    if (!isTelegramConfigured(targetChatId)) {
        return { ok: false, skipped: true, reason: 'Telegram chưa được cấu hình' };
    }

    try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const payload = {
            chat_id: targetChatId,
            text: message,
            disable_web_page_preview: true,
        };
        if (parseMode && parseMode !== 'none') {
            payload.parse_mode = parseMode;
        }

        const res = await axios.post(url, payload, { timeout: 10000 });
        return { ok: true, data: res.data };
    } catch (error) {
        const status = error?.response?.status;
        const apiDesc = error?.response?.data?.description;

        if (status === 400 && parseMode && parseMode !== 'none' && !_isRetry) {
            console.log(chalk.yellow(`[TELEGRAM] Parse lỗi (400)${apiDesc ? `: ${apiDesc}` : ''}, thử lại plain text...`));
            const plain = message
                .replace(/\\/g, '')
                .replace(/[*_~`]/g, '')
                .replace(/<[^>]+>/g, '');
            return sendTelegramMessage(plain, { chatId: targetChatId, parseMode: 'none', _isRetry: true });
        }

        if (!_isRetry && !status) {
            console.log(chalk.yellow(`[TELEGRAM] Lỗi mạng, thử lại sau 2s: ${error.message}`));
            await new Promise(r => setTimeout(r, 2000));
            return sendTelegramMessage(message, { chatId: targetChatId, parseMode, _isRetry: true });
        }

        console.log(chalk.yellow(`[TELEGRAM] Gửi tin nhắn thất bại (${status || 'network'}): ${apiDesc || error.message}`));
        return { ok: false, error: apiDesc || error.message };
    }
};




const buildAutoTradeOpenMessage = (trade, aiConfirm, quote, executionContext = {}, plan = null) => {
    const assetType = trade.assetType || '';
    const isLong = trade.direction === 'LONG' || trade.direction === 'MUA';
    const dirIcon = isLong ? '📈' : '📉';
    const assetIcon = assetType === 'CRYPTO' ? '🪙' : assetType === 'DERIVATIVES' ? '📊' : '🏢';
    const statusLabel = trade.status === 'PENDING' ? ' ⏳ CHỜ MỞ CỬA' : '';

    const direction  = escapeMarkdownV2(trade.direction);
    const symbol     = escapeMarkdownV2(trade.symbol);
    const score      = escapeMarkdownV2(`${trade.aiScore}/100`);
    const reason     = escapeMarkdownV2(truncate(aiConfirm?.reason || trade.reason || '', 300));

    const entryFmt = escapeMarkdownV2(formatPrice(trade.entryPrice, assetType));
    const tpFmt    = escapeMarkdownV2(formatPrice(trade.takeProfitPrice, assetType));
    const slFmt    = escapeMarkdownV2(formatPrice(trade.stopLossPrice, assetType));

    const rewardPct = plan?.rewardPct ?? null;
    const riskPct   = plan?.riskPct ?? null;
    const rrRatio   = (rewardPct != null && riskPct != null && riskPct > 0)
        ? `${(rewardPct / riskPct).toFixed(2)}:1`
        : '--';

    
    const investedVND  = Number(trade.investedAmount) || 0;
    const capitalLine  = investedVND > 0
        ? `💼 *Vốn:* ${escapeMarkdownV2(formatVND(investedVND))} VNĐ`
        : null;
    const volumeLabel  = assetType === 'CRYPTO' ? `${trade.volume} coin`
                       : assetType === 'DERIVATIVES' ? `${trade.volume} hợp đồng`
                       : `${formatNumber(trade.volume, 0)} cổ phiếu`;
    const volumeLine   = trade.volume ? `📦 *KL:* ${escapeMarkdownV2(volumeLabel)}` : null;

    const lines = [
        `${assetIcon} *LỆNH MỚI${statusLabel}*`,
        `\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`,
        `🎯 *Mã:* ${symbol} \\| ${dirIcon} *${direction}*`,
        `📍 *Entry:* ${entryFmt}`,
        `✅ *TP:* ${tpFmt} \\(${escapeMarkdownV2(rewardPct != null ? `+${rewardPct.toFixed(2)}%` : '--')}\\)`,
        `❌ *SL:* ${slFmt} \\(${escapeMarkdownV2(riskPct != null ? `-${riskPct.toFixed(2)}%` : '--')}\\)`,
        `⚖️ *R:R:* ${escapeMarkdownV2(rrRatio)}`,
        `🤖 *AI Score:* ${score}`,
        capitalLine,
        volumeLine,
        `\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`,
        `📝 *Lý do:* ${reason}`,
    ].filter(Boolean).join('\n');

    return lines;
};

const buildMarketRadarMessage = (radar = {}, meta = {}) => {
    const assetLabels = {
        CRYPTO:      'Crypto 🪙',
        VN_STOCK:    'Chứng khoán VN 🏢',
        DERIVATIVES: 'Phái sinh VN30 📊',
    };
    const lines = [
        `📡 *AUTO TRADE RADAR*`,
        `🕒 *Thời điểm:* ${escapeMarkdownV2(new Date(meta.generatedAt || Date.now()).toLocaleString('vi-VN'))}`,
        meta.marketStatus ? `🌐 *Thị trường:* ${escapeMarkdownV2(meta.marketStatus)}` : null,
    ].filter(Boolean);

    for (const asset of ['CRYPTO', 'VN_STOCK', 'DERIVATIVES']) {
        const items = Array.isArray(radar[asset]) ? radar[asset].slice(0, 3) : [];
        if (items.length === 0) continue;

        lines.push(``);
        lines.push(`🔥 *${escapeMarkdownV2(assetLabels[asset] || asset)}*`);
        lines.push(`\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`);

        items.forEach((item, index) => {
            const isLong   = item.direction === 'LONG' || item.direction === 'MUA';
            const dirIcon  = isLong ? '📈' : item.direction === 'SHORT' || item.direction === 'BÁN' ? '📉' : '⏳';
            const direction = escapeMarkdownV2(item.direction || 'WAIT');
            const symbol   = escapeMarkdownV2(item.symbol || 'N/A');
            const score    = escapeMarkdownV2(`${item.score ?? '--'}/100`);

            
            const entry  = escapeMarkdownV2(formatPrice(item.entryPrice, asset));
            const tp     = escapeMarkdownV2(formatPrice(item.takeProfitPrice, asset));
            const sl     = escapeMarkdownV2(formatPrice(item.stopLossPrice, asset));
            const reward = escapeMarkdownV2(formatPct(item.rewardPct, 2));
            const risk   = escapeMarkdownV2(formatPct(-Math.abs(Number(item.riskPct) || 0), 2));
            const ai     = item.aiConfirmed === true ? '✅ AI duyệt' : item.aiConfirmed === false ? '❌ AI hủy' : '⏳ Chờ AI';

            
            const rawReason = item.reason || item.news?.topTitle || '';
            const reason    = escapeMarkdownV2(truncate(rawReason, 120));

            lines.push(`*${index + 1}\\. ${symbol}* \\| ${dirIcon} *${direction}* \\| 🤖 *${score}*`);
            lines.push(`📍 *E:* ${entry} \\| ✅ *TP:* ${tp} \\| ❌ *SL:* ${sl}`);
            lines.push(`⚖️ *R:R:* ${reward} / ${risk} \\| ${escapeMarkdownV2(ai)}`);
            if (reason) lines.push(`📝 ${reason}`);
            lines.push(`\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`);
        });
    }

    const packed = [];
    let length = 0;
    for (const line of lines) {
        if (length + line.length + 1 > 3900) break;
        packed.push(line);
        length += line.length + 1;
    }

    return packed.join('\n');
};


const buildAutoTradeCloseMessage = (trade, exitReason) => {
    const assetType = trade.assetType || '';
    const assetIcon = assetType === 'CRYPTO' ? '🪙' : assetType === 'DERIVATIVES' ? '📊' : '🏢';
    const isLong    = trade.direction === 'LONG' || trade.direction === 'MUA';
    const isWin     = trade.pnlPercent >= 0;

    const symbol    = escapeMarkdownV2(trade.symbol);
    const direction = escapeMarkdownV2(trade.direction);
    const dirIcon   = isLong ? '📈' : '📉';
    const statusIcon = getTradeCloseIcon(trade.pnlPercent);

    const entry    = escapeMarkdownV2(formatPrice(trade.entryPrice, assetType));
    const exit     = escapeMarkdownV2(formatPrice(trade.exitPrice, assetType));
    const pnlPct   = escapeMarkdownV2(formatSignedPct(trade.pnlPercent, 2));
    const pnlVND   = escapeMarkdownV2(formatVND(trade.pnl));
    const reason   = escapeMarkdownV2(truncate(exitReason || '', 300));

    
    const holdDur  = formatHoldDuration(trade.openedAt);
    const holdLine = holdDur ? `⏱ *Giữ:* ${escapeMarkdownV2(holdDur)}` : null;

    const pnlSign  = isWin ? '\\+' : '';

    const lines = [
        `${statusIcon} *LỆNH ĐÃ ĐÓNG ${assetIcon}*`,
        `\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`,
        `🎯 *Mã:* ${symbol} \\| ${dirIcon} *${direction}*`,
        `📍 *Entry:* ${entry} \\| 🏁 *Exit:* ${exit}`,
        `💰 *PnL:* ${pnlPct} \\(${pnlSign}${pnlVND} VNĐ\\)`,
        holdLine,
        `\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`,
        `📝 *Lý do:* ${reason}`,
    ].filter(Boolean).join('\n');

    return lines;
};

const buildCryptoSignalMessage = (symbol, aiDecision, currentPrice) => {
    const cleanSymbol = escapeMarkdownV2(symbol);
    const signal      = escapeMarkdownV2(String(aiDecision?.signal || 'WAIT'));
    const confidence  = escapeMarkdownV2(String(aiDecision?.confidence || '--'));
    const entry       = escapeMarkdownV2(String(aiDecision?.entry || '--'));
    const sl          = escapeMarkdownV2(String(aiDecision?.sl || '--'));
    const tp          = escapeMarkdownV2(String(aiDecision?.tp || '--'));
    const horizon     = escapeMarkdownV2(String(aiDecision?.horizon || '--'));
    const rr          = escapeMarkdownV2(String(aiDecision?.risk_reward || '--'));
    const advice      = escapeMarkdownV2(truncate(aiDecision?.advice || '', 300));
    const livePrice   = escapeMarkdownV2(formatPrice(currentPrice, 'CRYPTO'));

    const isLong  = String(aiDecision?.signal).includes('LONG');
    const isShort = String(aiDecision?.signal).includes('SHORT');
    const dirIcon = isLong ? '📈' : isShort ? '📉' : '⏳';

    return [
        `🪙 *CRYPTO AI SIGNAL*`,
        `\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`,
        `🎯 *Mã:* ${cleanSymbol} \\| ${dirIcon} *${signal}*`,
        `📍 *Live Price:* ${livePrice}`,
        `✅ *Entry:* ${entry}`,
        `🎯 *TP:* ${tp} \\| ❌ *SL:* ${sl}`,
        `🤖 *Confidence:* ${confidence} \\| ⚖️ *R:R:* ${rr}`,
        `⏱ *Horizon:* ${horizon}`,
        `\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`,
        `💡 *Advice:* ${advice}`,
    ].join('\n');
};

const buildVolatilityAlertMessage = (asset, symbol, currentPrice, changePct, timeFrame, note) => {
    const cleanSymbol = escapeMarkdownV2(symbol);
    const price       = escapeMarkdownV2(formatPrice(currentPrice, asset));
    const change      = escapeMarkdownV2(formatSignedPct(changePct, 2));
    const frame       = escapeMarkdownV2(timeFrame);
    const cleanNote   = escapeMarkdownV2(truncate(note || '', 200));
    const isUp        = changePct >= 0;
    const alertIcon   = isUp ? '🟢' : '🔴';

    return [
        `${alertIcon} *CẢNH BÁO BIẾN ĐỘNG*`,
        `\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`,
        `🎯 *Mã:* ${cleanSymbol} \\(${escapeMarkdownV2(asset)}\\)`,
        `📍 *Giá hiện tại:* ${price}`,
        `📊 *Biến động:* ${change} trong ${frame}`,
        `\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`,
        `📝 *Ghi chú:* ${cleanNote}`,
    ].join('\n');
};

/** Gộp nhiều cảnh báo biến động thành 1 tin (tránh spam khi quét hàng loạt). */
const buildVolatilityDigestMessage = (alerts = []) => {
    const items = Array.isArray(alerts) ? alerts : [];
    if (!items.length) return '';

    const sortByAbs = (list) =>
        [...list].sort((a, b) => Math.abs(Number(b.changePct)) - Math.abs(Number(a.changePct)));

    const vnItems = sortByAbs(items.filter((a) => a.asset === 'VN_STOCK' || a.asset === 'DERIVATIVES'));
    const cryptoItems = sortByAbs(items.filter((a) => a.asset === 'CRYPTO'));

    const countUD = (list) => ({
        up: list.filter((a) => Number(a.changePct) >= 0).length,
        down: list.filter((a) => Number(a.changePct) < 0).length,
    });

    const appendRows = (lines, list) => {
        for (const a of list) {
            const pct = Number(a.changePct);
            const icon = pct >= 0 ? '🟢' : '🔴';
            const tag = a.asset === 'DERIVATIVES' ? 'PS' : a.asset === 'CRYPTO' ? 'CRYPTO' : 'CP';
            lines.push(
                `${icon} <b>${escapeHtml(a.symbol)}</b> [${escapeHtml(tag)}] ${escapeHtml(formatSignedPct(pct, 2))} · ${escapeHtml(formatPrice(a.price, a.asset))}`
            );
            if (a.note) lines.push(`   <i>${escapeHtml(truncate(a.note, 80))}</i>`);
        }
    };

    const totalUp = items.filter((a) => Number(a.changePct) >= 0).length;
    const totalDown = items.length - totalUp;

    const lines = [
        `⚡ <b>CẢNH BÁO BIẾN ĐỘNG</b> — ${items.length} mã`,
        `<i>${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} · khung ~1H</i>`,
        PLAIN_DIVIDER,
        `🟢 Tăng: <b>${totalUp}</b> · 🔴 Giảm: <b>${totalDown}</b>`,
    ];

    if (vnItems.length) {
        const { up, down } = countUD(vnItems);
        lines.push(
            '',
            `<b>🏢 THỊ TRƯỜNG VN</b> <i>(cổ phiếu + phái sinh · ${vnItems.length})</i>`,
            `🟢 ${up} · 🔴 ${down}`,
        );
        appendRows(lines, vnItems);
    }

    if (cryptoItems.length) {
        const { up, down } = countUD(cryptoItems);
        lines.push(
            '',
            `<b>🪙 CRYPTO</b> <i>(${cryptoItems.length})</i>`,
            `🟢 ${up} · 🔴 ${down}`,
        );
        appendRows(lines, cryptoItems);
    }

    if (items.length >= 12) {
        lines.push('', `<i>Chỉ hiện top biến động mạnh nhất trong chu kỳ quét.</i>`);
    }
    lines.push('', `💡 Gõ /info &lt;mã&gt; để xem chi tiết`);

    return packPlainLines(lines);
};

const buildSystemAlertMessage = (moduleName, issue, details) => {
    return [
        `🚨 *HỆ THỐNG CẢNH BÁO*`,
        `\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`,
        `⚙️ *Module:* ${escapeMarkdownV2(moduleName)}`,
        `⚠️ *Vấn đề:* ${escapeMarkdownV2(issue)}`,
        `\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`,
        `📝 *Chi tiết:* ${escapeMarkdownV2(truncate(String(details), 300))}`,
    ].join('\n');
};


const buildDailyPnLReportMessage = (trades, date = new Date()) => {
    const totalTrades   = trades.length;
    const winningTrades = trades.filter(t => t.pnl > 0).length;
    const losingTrades  = trades.filter(t => t.pnl < 0).length;
    const breakEvenTrades = trades.filter(t => t.pnl === 0).length;
    const winRate       = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    const totalPnL      = trades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
    const totalInvested = trades.reduce((sum, t) => sum + (Number(t.investedAmount) || 0), 0);
    const pnlPct        = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

    const formattedDate     = escapeMarkdownV2(date.toLocaleDateString('vi-VN'));
    const formattedTotalPnL = escapeMarkdownV2((totalPnL >= 0 ? '+' : '') + formatVND(totalPnL) + ' VNĐ');
    const formattedPnlPct   = escapeMarkdownV2(formatSignedPct(pnlPct, 2));
    const formattedWinRate  = escapeMarkdownV2(`${winRate.toFixed(1)}%`);
    const overallIcon       = totalPnL >= 0 ? '🟢' : '🔴';

    const lines = [
        `📋 *TỔNG KẾT NGÀY ${formattedDate}*`,
        `\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`,
        `📊 *Tổng lệnh:* ${totalTrades} \\(✅ ${winningTrades} thắng \\| ❌ ${losingTrades} thua \\| ➖ ${breakEvenTrades} hoà\\)`,
        `🏆 *Win Rate:* ${formattedWinRate}`,
        `${overallIcon} *Tổng PnL:* ${formattedTotalPnL} \\(${formattedPnlPct}\\)`,
    ];

    if (totalTrades > 0) {
        lines.push(`\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`);
        lines.push(`📝 *CHI TIẾT LỆNH ĐÃ ĐÓNG:*`);
        trades.slice(0, 15).forEach(t => {
            const sym    = escapeMarkdownV2(t.symbol);
            const dir    = escapeMarkdownV2(t.direction);
            const pctStr = escapeMarkdownV2(formatSignedPct(t.pnlPercent, 2));
            const vndStr = escapeMarkdownV2(formatVND(t.pnl));
            const icon   = getTradeCloseIcon(t.pnlPercent);
            lines.push(`${icon} *${sym}* \\(${dir}\\): ${pctStr} \\| ${vndStr}`);
        });
        if (totalTrades > 15) {
            lines.push(escapeMarkdownV2(`... và ${totalTrades - 15} lệnh khác`));
        }
    }

    return lines.join('\n');
};


const buildStatusMessage = (data = {}) => {
    const now = escapeMarkdownV2(new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));

    
    const lines = [
        `🦆 *OMNI DUCK — DASHBOARD*`,
        `🕒 ${now}`,
        `\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`,
    ];

    
    const totalCap    = Number(data.totalCapital   || 0);
    const allocCap    = Number(data.allocatedCapital || 0);
    const freeCap     = totalCap - allocCap;
    const utilPct     = totalCap > 0 ? (allocCap / totalCap * 100) : 0;
    const utilBar     = buildProgressBar(utilPct, 10);

    lines.push(`💰 *VỐN*`);
    lines.push(`  Tổng:     ${escapeMarkdownV2(formatVND(totalCap))} VNĐ`);
    lines.push(`  Đang dùng: ${escapeMarkdownV2(formatVND(allocCap))} VNĐ \\(${escapeMarkdownV2(utilPct.toFixed(1))}%\\)`);
    lines.push(`  Còn lại:  ${escapeMarkdownV2(formatVND(freeCap))} VNĐ`);
    lines.push(`  ${escapeMarkdownV2(utilBar)}`);
    lines.push(`\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`);

    
    const stats = data.stats30d || {};
    if (stats.totalTrades > 0) {
        const winRateNum = parseFloat(stats.winRate) || 0;
        const winBar     = buildProgressBar(winRateNum, 10);
        const pnlSign    = (stats.totalPnlPct || 0) >= 0 ? '\\+' : '';

        lines.push(`📊 *THỐNG KÊ 30 NGÀY*`);
        lines.push(`  Tổng lệnh: ${stats.totalTrades} \\(✅ ${stats.wins} thắng \\| ❌ ${stats.losses} thua\\)`);
        lines.push(`  Win Rate:  ${escapeMarkdownV2(stats.winRate)} ${escapeMarkdownV2(winBar)}`);
        lines.push(`  Avg thắng: ${escapeMarkdownV2(`+${stats.avgWinPnl}%`)} \\| Avg thua: ${escapeMarkdownV2(`${stats.avgLossPnl}%`)}`);
        lines.push(`  Tổng PnL:  ${pnlSign}${escapeMarkdownV2(`${stats.totalPnlPct}%`)}`);
    } else {
        lines.push(`📊 *THỐNG KÊ 30 NGÀY*`);
        lines.push(`  Chưa có lệnh đóng trong 30 ngày`);
    }
    lines.push(`\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`);

    
    const openTrades = Array.isArray(data.openTrades) ? data.openTrades : [];
    const pendingCount = openTrades.filter(t => t.status === 'PENDING').length;
    const openCount    = openTrades.filter(t => t.status === 'OPEN').length;

    lines.push(`📋 *LỆNH ĐANG MỞ: ${openTrades.length}* \\(🟢 ${openCount} OPEN \\| ⏳ ${pendingCount} PENDING\\)`);

    if (openTrades.length === 0) {
        lines.push(`  Không có lệnh nào đang chạy`);
    } else {
        
        const byAsset = { CRYPTO: [], VN_STOCK: [], DERIVATIVES: [] };
        for (const t of openTrades) {
            (byAsset[t.assetType] || byAsset.CRYPTO).push(t);
        }

        const assetIcon = { CRYPTO: '🪙', VN_STOCK: '🏢', DERIVATIVES: '📊' };
        const assetLabel = { CRYPTO: 'Crypto', VN_STOCK: 'Cổ phiếu', DERIVATIVES: 'Phái sinh' };

        for (const [asset, trades] of Object.entries(byAsset)) {
            if (trades.length === 0) continue;
            lines.push(``);
            lines.push(`${assetIcon[asset]} *${escapeMarkdownV2(assetLabel[asset])}* \\(${trades.length}\\)`);

            for (const t of trades) {
                const isLong      = t.direction === 'LONG' || t.direction === 'MUA';
                const dirIcon     = isLong ? '📈' : '📉';
                const sym         = escapeMarkdownV2(t.symbol);
                const dir         = escapeMarkdownV2(t.direction);
                const entry       = escapeMarkdownV2(formatPrice(t.entryPrice, asset));
                const tp          = escapeMarkdownV2(formatPrice(t.takeProfitPrice, asset));
                const sl          = escapeMarkdownV2(formatPrice(t.stopLossPrice, asset));
                const score       = escapeMarkdownV2(`${t.aiScore ?? '--'}/100`);
                const invested    = escapeMarkdownV2(formatVND(t.investedAmount));
                const statusEmoji = t.status === 'PENDING' ? '⏳' : '🟢';

                
                let unrealizedLine = null;
                if (Number.isFinite(t.currentPrice) && t.currentPrice > 0 && t.entryPrice > 0) {
                    const pct = isLong
                        ? ((t.currentPrice - t.entryPrice) / t.entryPrice * 100)
                        : ((t.entryPrice - t.currentPrice) / t.entryPrice * 100);
                    const pctStr  = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
                    const pnlIcon = pct >= 0 ? '🟢' : '🔴';
                    unrealizedLine = `  ${pnlIcon} PnL tạm: ${escapeMarkdownV2(pctStr)} \\| Giá: ${escapeMarkdownV2(formatPrice(t.currentPrice, asset))}`;
                }

                const holdDur = formatHoldDuration(t.openedAt);

                lines.push(`  ${statusEmoji} *${sym}* ${dirIcon} ${dir} \\| 🤖 ${score}`);
                lines.push(`  📍 E: ${entry} \\| ✅ TP: ${tp} \\| ❌ SL: ${sl}`);
                lines.push(`  💼 Vốn: ${invested} VNĐ${holdDur ? ` \\| ⏱ ${escapeMarkdownV2(holdDur)}` : ''}`);
                if (unrealizedLine) lines.push(unrealizedLine);
                lines.push(`  \\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`);
            }
        }
    }

    
    lines.push(``);
    lines.push(`💡 _Gõ /check để làm mới \\| /stop để tắt auto\\-trade_`);

    
    const packed = [];
    let total = 0;
    for (const line of lines) {
        if (total + line.length + 1 > 3900) {
            packed.push(escapeMarkdownV2(`... (còn ${lines.length - packed.length} dòng bị cắt)`));
            break;
        }
        packed.push(line);
        total += line.length + 1;
    }

    return packed.join('\n');
};


const buildProgressBar = (pct, width = 10) => {
    const filled = Math.round(Math.min(100, Math.max(0, pct)) / 100 * width);
    return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${pct.toFixed(1)}%`;
};

const formatOpenTradePlain = (trade, asset) => {
    const isLong = trade.direction === 'LONG' || trade.direction === 'MUA';
    const dirIcon = isLong ? '📈' : '📉';
    const modeBadge = trade.executionMode === 'LIVE' ? '🔴 LIVE' : '🧪 SIM';
    const statusEmoji = trade.status === 'PENDING' ? '⏳' : '🟢';
    const holdDur = formatHoldDuration(trade.openedAt);
    const pct = calcUnrealizedPct(trade);
    const lines = [
        `${statusEmoji} ${modeBadge} ${trade.symbol} ${dirIcon} ${trade.direction} | Score ${trade.aiScore ?? '--'}/100`,
        `  Entry: ${formatPrice(trade.entryPrice, asset)} | TP: ${formatPrice(trade.takeProfitPrice, asset)} | SL: ${formatPrice(trade.stopLossPrice, asset)}`,
        `  Vốn: ${formatVND(trade.investedAmount)} VNĐ${holdDur ? ` | Giữ: ${holdDur}` : ''}`,
    ];
    if (pct != null) {
        const pnlIcon = pct >= 0 ? '🟢' : '🔴';
        lines.push(`  ${pnlIcon} PnL tạm: ${formatSignedPct(pct, 2)} | Giá: ${formatPrice(trade.currentPrice, asset)}`);
    }
    return lines.join('\n');
};

const buildCheckDashboardMessage = (data = {}) => {
    const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const totalCap = Number(data.totalCapital || 0);
    const allocCap = Number(data.allocatedCapital || 0);
    const freeCap = totalCap - allocCap;
    const utilPct = totalCap > 0 ? (allocCap / totalCap * 100) : 0;
    const openTrades = Array.isArray(data.openTrades) ? data.openTrades : [];
    const liveOpen = openTrades.filter(t => t.executionMode === 'LIVE');
    const simOpen = openTrades.filter(t => t.executionMode !== 'LIVE');

    const lines = [
        `🦆 OMNI DUCK — DASHBOARD`,
        `🕒 ${now}`,
        PLAIN_DIVIDER,
        `💰 VỐN`,
        `  Tổng:      ${formatVND(totalCap)} VNĐ`,
        `  Đang dùng: ${formatVND(allocCap)} VNĐ (${utilPct.toFixed(1)}%)`,
        `  Còn lại:   ${formatVND(freeCap)} VNĐ`,
        `  ${buildProgressBar(utilPct, 10)}`,
        PLAIN_DIVIDER,
    ];
    appendUnifiedStatsSection(lines, {
        title: '📊 THỐNG KÊ 30 NGÀY',
        combined: data.stats30d,
        auto: data.stats30dAuto,
        autoLive: data.stats30dLive,
        autoSim: data.stats30dSim,
        manual: data.stats30dManual,
        hasManualEver: data.hasManualEver,
    });

    if (data.statsToday) {
        const t = data.statsToday;
        lines.push(PLAIN_DIVIDER);
        appendUnifiedStatsSection(lines, {
            title: '📅 HÔM NAY',
            combined: t.combined,
            auto: t.auto,
            autoLive: t.live,
            autoSim: t.sim,
            manual: t.manual,
            hasManualEver: t.hasManualEver,
        });
    }

    lines.push(
        PLAIN_DIVIDER,
        `📋 LỆNH ĐANG MỞ: ${openTrades.length} (🔴 LIVE ${liveOpen.length} | 🧪 SIM ${simOpen.length})`,
    );

    if (!openTrades.length) {
        lines.push(`  Không có lệnh nào đang chạy`);
    } else {
        const byAsset = { CRYPTO: [], VN_STOCK: [], DERIVATIVES: [] };
        for (const t of openTrades) (byAsset[t.assetType] || byAsset.CRYPTO).push(t);
        const assetIcon = { CRYPTO: '🪙', VN_STOCK: '🏢', DERIVATIVES: '📊' };
        const assetLabel = { CRYPTO: 'Crypto', VN_STOCK: 'Cổ phiếu', DERIVATIVES: 'Phái sinh' };
        for (const [asset, trades] of Object.entries(byAsset)) {
            if (!trades.length) continue;
            lines.push('', `${assetIcon[asset]} ${assetLabel[asset]} (${trades.length})`);
            for (const t of trades) {
                lines.push(formatOpenTradePlain(t, asset));
                lines.push(`  ${'─'.repeat(18)}`);
            }
        }
    }

    const ps = data.pipelineState || {};
    lines.push('', PLAIN_DIVIDER, `⚙️ Pipeline: ${ps.manuallyStopped ? '⏸ TẮT thủ công' : ps.autoTradeEnabled === false ? '⏸ Engine tắt' : '🟢 BẬT'} | Risk L${data.riskLevel || 2}`);
    lines.push(`💡 /check làm mới | /live /sim | /stats | /help`);

    return packPlainLines(lines);
};

const buildLiveDetailMessage = (data = {}) => {
    const trades = Array.isArray(data.liveTrades) ? data.liveTrades : [];
    const stats = data.stats30dLive || {};
    const lines = [`🔴 LIVE — VỊ THẾ ĐANG MỞ (${trades.length})`, PLAIN_DIVIDER];

    if (!trades.length) {
        lines.push(`(không có vị thế live nào)`);
    } else {
        for (const t of trades) {
            const isLong = t.direction === 'LONG' || t.direction === 'MUA';
            const dirIcon = isLong ? '📈' : '📉';
            const lev = Number(t.leverage) > 1 ? ` ${t.leverage}x` : '';
            const mkt = t.marketType === 'FUTURES' ? ` FUTURES${lev}` : ' SPOT';
            const holdDur = formatHoldDuration(t.openedAt);
            const pct = calcUnrealizedPct(t);
            const invested = Number(t.investedAmount) || 0;
            const notional = invested * (Number(t.leverage) || 1);
            lines.push(`${dirIcon} ${t.symbol} ${t.direction}${mkt}`);
            lines.push(`  Entry: ${formatPrice(t.entryPrice, t.assetType)}${pct != null ? ` | Giá: ${formatPrice(t.currentPrice, t.assetType)} (${formatSignedPct(pct, 2)})` : ''}`);
            lines.push(`  Vốn: ${formatVND(invested)} VNĐ${t.assetType === 'CRYPTO' ? ` (~$${(invested / (data.usdVndRate || 25000)).toFixed(0)})` : ''}${notional > invested ? ` | Notional: ${formatVND(notional)}` : ''}`);
            lines.push(`  TP: ${formatPrice(t.takeProfitPrice, t.assetType)} | SL: ${formatPrice(t.stopLossPrice, t.assetType)}${t.tp1Filled ? ' | TP1: ✅ đã chốt' : ''}`);
            lines.push(`  Score: ${t.aiScore ?? '--'}/100${holdDur ? ` | Giữ: ${holdDur}` : ''} | ${t.status}`);
            lines.push(`  ${'─'.repeat(18)}`);
        }
    }

    lines.push('', `📊 LIVE 30 ngày: ${formatStatsSummary(stats, '')}`);
    lines.push(PLAIN_DIVIDER, `📋 5 LỆNH SÀN GẦN NHẤT`);

    const orders = Array.isArray(data.recentOrders) ? data.recentOrders : [];
    if (!orders.length) {
        lines.push(`(chưa có lệnh nào gửi ra sàn)`);
    } else {
        for (const o of orders) {
            const icon = o.status === 'FILLED' ? '✅' : o.status === 'FAILED' ? '❌' : '⏳';
            const err = o.errorMessage ? ` — ${truncate(o.errorMessage, 50)}` : '';
            lines.push(`${icon} ${o.side} ${o.symbol} [${o.exchangeName}/${o.environment}] ${o.status}${err}`);
        }
    }

    return packPlainLines(lines);
};

const buildSimDetailMessage = (data = {}) => {
    const trades = Array.isArray(data.simTrades) ? data.simTrades : [];
    const stats = data.stats30dSim || {};
    const allocated = trades.reduce((s, t) => s + (Number(t.investedAmount) || 0), 0);
    const avgScore = trades.length
        ? Math.round(trades.reduce((s, t) => s + (Number(t.aiScore) || 0), 0) / trades.length)
        : 0;

    const lines = [
        `🧪 MÔ PHỎNG — TRAINING AI NỀN`,
        PLAIN_DIVIDER,
        `📊 TỔNG QUAN`,
        `  Lệnh đang mở: ${trades.length}`,
        `  Vốn mô phỏng đang dùng: ${formatVND(allocated)} VNĐ`,
        `  Avg AI Score: ${avgScore}/100`,
        `  SIM 30 ngày: ${formatStatsSummary(stats, '')}`,
        PLAIN_DIVIDER,
        `📋 CHI TIẾT LỆNH (${Math.min(trades.length, 15)})`,
    ];

    if (!trades.length) {
        lines.push(`(không có lệnh mô phỏng nào đang mở)`);
    } else {
        for (const t of trades.slice(0, 15)) {
            const isLong = t.direction === 'LONG' || t.direction === 'MUA';
            const holdH = Math.round((Date.now() - new Date(t.openedAt).getTime()) / 3600000);
            const pct = calcUnrealizedPct(t);
            lines.push(`${isLong ? '🟢' : '🔴'} ${t.symbol} [${t.assetType}] ${t.direction} @ ${formatPrice(t.entryPrice, t.assetType)}`);
            lines.push(`   TP ${formatPrice(t.takeProfitPrice, t.assetType)} | SL ${formatPrice(t.stopLossPrice, t.assetType)} | Score ${t.aiScore} | ${holdH}h${pct != null ? ` | PnL tạm ${formatSignedPct(pct, 2)}` : ''}`);
        }
        if (trades.length > 15) lines.push(`... và ${trades.length - 15} lệnh khác`);
    }

    return packPlainLines(lines);
};

const pickActionIcon = (action = '') => {
    const a = String(action).toUpperCase();
    if (a.includes('MUA')) return '🟢';
    if (a.includes('TRÁNH')) return '🔴';
    if (a.includes('THEO')) return '🟡';
    return '⚪';
};

const appendInsightPicksSection = (lines, insight) => {
    if (!insight) {
        lines.push(
            PLAIN_DIVIDER,
            htmlSection('🎯 KHUYẾN NGHỊ AI (Home VN)'),
            `  ${htmlItalic('Chưa có báo cáo AI trong DB.')}`,
            `  Gõ /insight sau 7:00 T2–T6 hoặc xem trên web.`,
        );
        return;
    }

    const picks = Array.isArray(insight.topPicks) ? insight.topPicks : [];
    const buy = picks.filter((p) => String(p.action).toUpperCase() === 'MUA');
    const watch = picks.filter((p) => String(p.action).toUpperCase().includes('THEO'));
    const avoid = picks.filter((p) => String(p.action).toUpperCase().includes('TRÁNH'));

    const staleNote = insight.isStale || insight.isWeekend
        ? ` (bản ${insight.date || 'gần nhất'})`
        : '';

    lines.push(
        PLAIN_DIVIDER,
        htmlSection(`🎯 KHUYẾN NGHỊ AI — ${insight.date || 'N/A'}${staleNote}`),
        `Sentiment: ${htmlBold(insight.marketSentiment || 'N/A')} | Model: ${escapeHtml(insight.model || 'N/A')}`,
    );
    if (insight.summary) {
        lines.push(`📝 ${escapeHtml(truncate(insight.summary, 280))}`);
    }

    const pushGroup = (title, list, limit = 4) => {
        lines.push('', htmlBold(title));
        if (!list.length) {
            lines.push(`  ${htmlItalic('(không có)')}`);
            return;
        }
        for (const p of list.slice(0, limit)) {
            lines.push(
                `  ${pickActionIcon(p.action)} ${htmlBold(p.symbol || '?')} [${escapeHtml(p.horizon || '—')}] score ${escapeHtml(String(p.score ?? '--'))}`
            );
            if (p.reason) lines.push(`     ${escapeHtml(truncate(p.reason, 90))}`);
        }
        if (list.length > limit) lines.push(`  … +${list.length - limit} mã nữa`);
    };

    pushGroup(`🟢 MUA (${buy.length})`, buy, 5);
    pushGroup(`🟡 THEO DÕI (${watch.length})`, watch, 3);
    pushGroup(`🔴 TRÁNH (${avoid.length})`, avoid, 3);

    lines.push(
        '',
        moreInfoLine({ label: 'Chi tiết báo cáo trên web' }),
        `💡 Gõ /info &lt;mã&gt; để xem giá + kỹ thuật + tin (VD: /info ${escapeHtml(buy[0]?.symbol || watch[0]?.symbol || 'TCB')})`,
    );
};

const buildMarketOverviewMessage = (data = {}) => {
    const vn = data.vn || {};
    const intel = vn.intelligence || {};
    const crypto = data.crypto || {};
    const insight = data.insight || null;

    const lines = [
        `🌐 ${htmlBold('TỔNG QUAN THỊ TRƯỜNG')}`,
        `🕒 ${escapeHtml(new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }))}`,
        PLAIN_DIVIDER,
        htmlSection('🏢 CHỨNG KHOÁN VN'),
        `  Trạng thái: ${htmlBold(intel.marketStatus || 'N/A')}`,
        `  Breadth: ${escapeHtml(String(intel.breadthRatio ?? 'N/A'))}% | Loại: ${escapeHtml(intel.statusType || 'N/A')}`,
        `  Phiên: ${data.vnMarketOpen ? '🟢 ĐANG MỞ' : '⚪ ĐÓNG / ngoài giờ'}`,
    ];
    if (data.vnIndex) lines.push(`  VNINDEX: ${htmlBold(String(data.vnIndex))}`);
    if (intel.diagnosticDesc) lines.push(`  ${escapeHtml(truncate(intel.diagnosticDesc, 220))}`);

    if (Array.isArray(intel.strongSectors) && intel.strongSectors.length) {
        lines.push(`  Ngành mạnh: ${escapeHtml(intel.strongSectors.slice(0, 3).map((s) => s.name || s).join(', '))}`);
    }
    if (Array.isArray(intel.weakSectors) && intel.weakSectors.length) {
        lines.push(`  Ngành yếu: ${escapeHtml(intel.weakSectors.slice(0, 3).map((s) => s.name || s).join(', '))}`);
    }

    appendInsightPicksSection(lines, insight);

    lines.push(PLAIN_DIVIDER, htmlSection('🪙 CRYPTO MACRO'));
    lines.push(`  Trạng thái: ${htmlBold(crypto.marketStatus || 'N/A')}`);
    lines.push(`  Breadth: ${escapeHtml(String(crypto.breadthRatio ?? 'N/A'))}%`);
    if (crypto.fearGreed != null) {
        lines.push(`  Fear&Greed: ${htmlBold(String(crypto.fearGreed))} (${escapeHtml(crypto.fearGreedLabel || '—')})`);
    }
    if (crypto.diagnosticDesc) lines.push(`  ${escapeHtml(truncate(crypto.diagnosticDesc, 200))}`);

    lines.push(PLAIN_DIVIDER, htmlSection('💹 GIÁ NỔI BẬT'));
    lines.push(`  BTC: ${escapeHtml(String(data.btc || 'N/A'))}`);
    lines.push(`  ETH: ${escapeHtml(String(data.eth || 'N/A'))}`);

    if (data.derivStatus) {
        lines.push(PLAIN_DIVIDER, htmlSection('📊 PHÁI SINH VN30'));
        lines.push(`  ${escapeHtml(String(data.derivStatus))}`);
    }

    lines.push('', moreInfoLine({ label: 'Mở terminal web' }));

    return packPlainLines(lines);
};

const buildStatsMessage = (data = {}) => {
    const days = data.days || 30;
    const hasManualEver = data.hasManualEver === true;
    const combined = data.combined || {};
    const auto = data.auto || {};
    const autoLive = data.autoLive || {};
    const autoSim = data.autoSim || {};
    const manual = data.manual || {};

    const lines = [`📊 THỐNG KÊ ${days} NGÀY`, PLAIN_DIVIDER];

    appendUnifiedStatsSection(lines, {
        title: '📈 TỔNG QUAN',
        combined,
        auto,
        autoLive,
        autoSim,
        manual,
        hasManualEver,
    });

    if (hasManualEver) {
        lines.push('');
        const fmtDetail = (stats, label) => {
            if (stats.error || !stats.totalTrades) return [`${label}: Chưa có lệnh đóng`];
            const pnlSign = (stats.totalPnlPct || 0) >= 0 ? '+' : '';
            const amt = stats.currency === 'USDT'
                ? ` | $${Number(stats.totalPnlAmount || 0).toFixed(2)}`
                : ` | ${formatVND(stats.totalPnlAmount || 0)} VNĐ`;
            return [
                `${label}:`,
                `  ${stats.totalTrades} lệnh (✅ ${stats.wins} | ❌ ${stats.losses}${stats.breakEven ? ` | ➖ ${stats.breakEven} hoà` : ''})`,
                `  Win: ${stats.winRate} | Avg thắng +${stats.avgWinPnl}% | Avg thua ${stats.avgLossPnl}%`,
                `  PnL: ${pnlSign}${stats.totalPnlPct}%${amt}`,
            ];
        };
        lines.push(PLAIN_DIVIDER, ...fmtDetail(auto, '🤖 AUTO'), '', ...fmtDetail(manual, '🙋 MANUAL'));
    }

    const tags = combined.byExitTag || auto.byExitTag || [];
    if (tags.length) {
        lines.push(PLAIN_DIVIDER, `🏷 THEO EXIT TAG (tổng)`);
        for (const t of tags.slice(0, 6)) {
            lines.push(`  ${t.tag}: ${t.count} lệnh | Win ${t.winRate} | Avg ${t.avgPnl}%`);
        }
    }

    const buckets = combined.byScoreBucket || auto.byScoreBucket || [];
    if (buckets.length) {
        lines.push(PLAIN_DIVIDER, `🎯 THEO SCORE BUCKET (auto)`);
        for (const b of buckets) {
            if (!b.count) continue;
            lines.push(`  ${b.bucket}: ${b.count} lệnh | Win ${b.winRate}`);
        }
    }

    const byAsset = combined.byAsset || auto.byAsset || [];
    if (byAsset.some(a => a.count > 0)) {
        lines.push(PLAIN_DIVIDER, `📂 THEO LOẠI TÀI SẢN (auto)`);
        const icon = { CRYPTO: '🪙', VN_STOCK: '🏢', DERIVATIVES: '📊' };
        for (const a of byAsset) {
            if (!a.count) continue;
            lines.push(`  ${icon[a.asset] || '•'} ${a.asset}: ${a.count} lệnh | Win ${a.winRate} | PnL ${a.totalPnlPct >= 0 ? '+' : ''}${a.totalPnlPct}%`);
        }
    }

    return packPlainLines(lines);
};

const buildFunnelMessage = (funnel, assetLabel = 'CRYPTO') => {
    if (!funnel) {
        return `🔍 FUNNEL ${assetLabel}\n${PLAIN_DIVIDER}\nChưa có dữ liệu chu kỳ quét gần nhất.`;
    }
    const c = funnel;
    const lines = [
        `🔍 FUNNEL — ${assetLabel}`,
        `🕒 ${c.ts ? new Date(c.ts).toLocaleString('vi-VN') : 'N/A'}`,
        PLAIN_DIVIDER,
        `Quét: ${c.scanned} mã`,
        `  ↳ Yếu tín hiệu: ${c.weak}`,
        `  ↳ Vol không đạt: ${c.vol}`,
        `  ↳ Setup fail: ${c.setup}`,
        `  ↳ SIM ok: ${c.simOk}`,
        `  ↳ LIVE gate chặn: ${c.liveGate}`,
        `  ↳ AI veto: ${c.aiVeto}`,
        `  ↳ Testnet chặn: ${c.testnet}`,
        `  ↳ Risk/limit: ${(c.risk || 0) + (c.limit || 0)}`,
        PLAIN_DIVIDER,
        `✅ Khớp SIM: ${c.matchedSim} | 🔴 Khớp LIVE: ${c.matchedLive}`,
    ];
    if (c.topCandidates?.length) {
        lines.push(PLAIN_DIVIDER, `🏆 TOP ỨNG VIÊN`);
        for (const [i, row] of c.topCandidates.slice(0, 5).entries()) {
            lines.push(`  ${i + 1}. ${row.symbol} score ${row.score} ${row.direction || ''}${row.aiConfirmed === true ? ' ✅AI' : row.aiConfirmed === false ? ' ❌AI' : ''}`);
        }
    }
    return packPlainLines(lines);
};

const buildInsightMessage = (insight) => {
    if (!insight) {
        return packPlainLines([
            `📰 ${htmlBold('BÁO CÁO AI THỊ TRƯỜNG')}`,
            PLAIN_DIVIDER,
            htmlItalic('Chưa có báo cáo. Hệ thống quét lúc 7:00 sáng T2–T6.'),
            '',
            moreInfoLine({ label: 'Xem trên web' }),
        ]);
    }
    const lines = [
        `📰 ${htmlBold(`BÁO CÁO AI — ${insight.date || 'N/A'}`)}${insight.isWeekend ? htmlItalic(' (cuối tuần — bản gần nhất)') : ''}${insight.isStale ? htmlItalic(' (chưa có bản hôm nay)') : ''}`,
        `Sentiment: ${htmlBold(insight.marketSentiment || 'N/A')} | Model: ${escapeHtml(insight.model || 'N/A')}`,
        PLAIN_DIVIDER,
    ];
    if (insight.summary) lines.push(escapeHtml(truncate(insight.summary, 800)));
    const picks = Array.isArray(insight.topPicks) ? insight.topPicks : [];
    if (picks.length) {
        lines.push(PLAIN_DIVIDER, htmlSection('🎯 TOP PICKS'));
        for (const p of picks.slice(0, 8)) {
            lines.push(`  ${pickActionIcon(p.action)} ${htmlBold(p.action || '?')} ${htmlBold(p.symbol || '?')} [${escapeHtml(p.horizon || '')}] score ${escapeHtml(String(p.score ?? '--'))}`);
            if (p.reason) lines.push(`    ${escapeHtml(truncate(p.reason, 100))}`);
        }
    }
    lines.push('', moreInfoLine({ label: 'Xem đầy đủ trên web' }));
    return packPlainLines(lines);
};

const buildHealthMessage = (health = {}) => {
    const ps = health.pipelineState || {};
    const lines = [
        `⚙️ HỆ THỐNG`,
        `🕒 ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
        PLAIN_DIVIDER,
        `Pipeline: ${ps.manuallyStopped ? '⏸ TẮT (/stop)' : ps.autoTradeEnabled === false ? '⏸ Engine tắt' : '🟢 BẬT'}`,
        `Chu kỳ quét: ${ps.pipelineRunning ? '🔄 đang chạy' : '💤 rảnh'}`,
        `Risk: L${health.riskLevel || 2} — ${health.riskName || 'N/A'}`,
        `Max concurrent: ${health.maxConcurrent || 10}`,
    ];

    const fmtGuards = (label, guards) => {
        if (!guards) return;
        const parts = Object.entries(guards).map(([a, g]) => `${a}: floor${g.scoreFloor}/×${g.sizeMult}(n=${g.sample})`);
        lines.push(`${label}: ${parts.join(' | ')}`);
    };
    fmtGuards('Adaptive SIM', health.adaptiveSim);
    fmtGuards('Adaptive LIVE', health.adaptiveLive);

    const providers = health.providers || {};
    const provParts = Object.entries(providers).map(([k, v]) => {
        const icon = v.blocked ? `🔴 ${Math.ceil((v.remainingMs || 0) / 1000)}s` : '🟢';
        return `${k} ${icon}`;
    });
    if (provParts.length) {
        lines.push(PLAIN_DIVIDER, `🤖 AI Providers: ${provParts.join(' | ')}`);
    }

    const audit = health.audit || {};
    lines.push(PLAIN_DIVIDER, `📝 Audit: ${audit.enabled ? 'BẬT' : 'TẮT'} | ${audit.tailSize || 0} events | Mã hóa: ${audit.encrypted ? 'có' : 'không'}`);

    const logs = health.recentPipelineLogs || [];
    if (logs.length) {
        lines.push(PLAIN_DIVIDER, `📋 Pipeline log gần nhất:`);
        for (const l of logs.slice(-3)) {
            lines.push(`  • ${truncate(l.message || JSON.stringify(l), 80)}`);
        }
    }

    return packPlainLines(lines);
};

const buildSettingsMessage = (settings = {}) => {
    const lines = [
        `⚙️ CẤU HÌNH AUTO-TRADE`,
        PLAIN_DIVIDER,
        `Vốn tổng:     ${formatVND(settings.autoTradeTotalCapital || 0)} VNĐ`,
        `Max lệnh:     ${settings.autoTradeMaxConcurrent || 10}`,
        `Risk level:   L${settings.autoTradeRiskLevel || 2} — ${settings.riskName || ''}`,
        `Engine:       ${settings.autoTradeEnabled === false ? 'TẮT' : 'BẬT'}`,
        `Tỷ giá USD:   ${Number(settings.usdVndRate || 0).toLocaleString('vi-VN')} VNĐ`,
        PLAIN_DIVIDER,
        `💡 Thay đổi cấu hình qua web dashboard hoặc API /auto-trade/settings`,
    ];
    return lines.join('\n');
};

const buildAiLessonsMessage = (data = {}) => {
    const lessons = Array.isArray(data.lessons) ? data.lessons : [];
    const learning = data.aiLearning || {};
    const lines = [
        `🤖 AI LEARNING`,
        PLAIN_DIVIDER,
        `30 ngày: ${learning.totalLogs || 0} logs | WIN signal ${learning.wins || 0} | LOSS signal ${learning.losses || 0}`,
        PLAIN_DIVIDER,
        `📚 BÀI HỌC GẦN NHẤT (${Math.min(lessons.length, 5)})`,
    ];
    if (!lessons.length) {
        lines.push(`(chưa có bài học nào)`);
    } else {
        for (const l of lessons.slice(0, 5)) {
            const sym = l.symbol || 'N/A';
            const tags = Array.isArray(l.tags) ? l.tags.join(', ') : '';
            lines.push(`• ${sym} [${l.assetType || ''}] ${tags}`);
            if (l.lesson) lines.push(`  ${truncate(l.lesson, 120)}`);
        }
    }
    return packPlainLines(lines);
};

const buildBrokerStatusMessage = (connections = []) => {
    const lines = [`🔗 KẾT NỐI SÀN (${connections.length})`, PLAIN_DIVIDER];
    if (!connections.length) {
        lines.push(`(chưa có kết nối nào)`);
        return lines.join('\n');
    }
    for (const c of connections.slice(0, 10)) {
        const status = c.isActive ? '🟢' : '⏸';
        const bal = c.balanceSnapshot?.USDT != null ? `USDT ${Number(c.balanceSnapshot.USDT).toFixed(2)}` : 'N/A';
        lines.push(`${status} ${c.exchangeName} [${c.environment}] — ${c.username || c.label || ''}`);
        lines.push(`  Balance: ${bal} | Quyền: ${(c.permissions || []).join(',') || 'N/A'}`);
        if (c.lastTestError) lines.push(`  Lỗi test: ${truncate(c.lastTestError, 60)}`);
        lines.push(`  ${'─'.repeat(18)}`);
    }
    return packPlainLines(lines);
};

const buildTodayPnLMessage = (data = {}) => {
    const dateStr = data.date || new Date().toLocaleDateString('vi-VN');
    const hasManualEver = data.hasManualEver === true;
    const lines = [
        `📋 PnL HÔM NAY — ${dateStr}`,
        PLAIN_DIVIDER,
    ];

    const fmtBlock = (stats, label) => {
        if (!stats?.totalTrades) return [`${label}: Không có lệnh đóng`];
        const sign = (stats.totalPnlPct || 0) >= 0 ? '+' : '';
        const amountLine = stats.currency === 'USDT'
            ? `  PnL: ${sign}$${Number(stats.totalPnlAmount || 0).toFixed(2)} (${sign}${stats.totalPnlPct}%)`
            : `  PnL: ${sign}${formatVND(stats.totalPnlAmount || 0)} VNĐ (${sign}${stats.totalPnlPct}%)`;
        return [
            `${label}:`,
            `  ${stats.totalTrades} lệnh (✅ ${stats.wins} | ❌ ${stats.losses}) | Win ${stats.winRate}`,
            amountLine,
        ];
    };

    if (hasManualEver) {
        if (data.combined?.totalTrades) lines.push(...fmtBlock(data.combined, '📈 TỔNG'), '');
        lines.push(...fmtBlock(data.auto, '🤖 AUTO'), '');
        if (data.manual?.totalTrades) lines.push(...fmtBlock(data.manual, '🙋 MANUAL'), '');
        else lines.push('🙋 MANUAL: Không có lệnh đóng', '');
        lines.push(...fmtBlock(data.live, '  🔴 LIVE auto'), '', ...fmtBlock(data.sim, '  🧪 SIM auto'));
    } else {
        lines.push(...fmtBlock(data.live, '🔴 LIVE'), '', ...fmtBlock(data.sim, '🧪 SIM'));
    }

    const autoTrades = Array.isArray(data.trades) ? data.trades : [];
    const manualTrades = Array.isArray(data.manualTrades) ? data.manualTrades : [];
    const allTrades = [
        ...autoTrades.map(t => ({ ...t, _kind: 'auto' })),
        ...manualTrades.map(t => ({ ...t, _kind: 'manual' })),
    ];
    if (allTrades.length) {
        lines.push(PLAIN_DIVIDER, `📝 CHI TIẾT (${Math.min(allTrades.length, 10)})`);
        for (const t of allTrades.slice(0, 10)) {
            if (t._kind === 'manual') {
                const icon = getTradeCloseIcon(t.realizedPnlUsdt);
                lines.push(`${icon} 🙋 ${t.symbol} (${t.direction}): ${formatSignedPct(t.pnlPercent, 2)} | $${Number(t.realizedPnlUsdt || 0).toFixed(2)}`);
            } else {
                const mode = t.executionMode === 'LIVE' ? '🔴' : '🧪';
                const icon = getTradeCloseIcon(t.pnlPercent);
                lines.push(`${icon} ${mode} ${t.symbol} (${t.direction}): ${formatSignedPct(t.pnlPercent, 2)} | ${formatVND(t.pnl)} VNĐ`);
            }
        }
        if (allTrades.length > 10) lines.push(`... và ${allTrades.length - 10} lệnh khác`);
    }

    return packPlainLines(lines);
};

const buildPortfolioMessage = (portfolios = []) => {
    const lines = [`💼 GÓI PORTFOLIO (${portfolios.length})`, PLAIN_DIVIDER];
    if (!portfolios.length) {
        lines.push(`(không có gói portfolio nào đang chạy)`);
        return lines.join('\n');
    }
    for (const p of portfolios) {
        const mode = p.executionMode === 'LIVE' ? '🔴 LIVE' : '🧪 SIM';
        const cap = p.effectiveCapital || 0;
        const used = p.usedCapital || 0;
        const utilPct = cap > 0 ? (used / cap * 100) : 0;
        const pnlPct = cap > 0 ? ((p.realizedPnl || 0) / cap * 100) : 0;
        const pnlSign = (p.realizedPnl || 0) >= 0 ? '+' : '';
        lines.push(`💼 ${p.username} [${mode}]`);
        lines.push(`  Quỹ: ${(cap / 1e6).toFixed(2)}Tr | Dùng: ${(used / 1e6).toFixed(2)}Tr (${utilPct.toFixed(0)}%) | ${p.openCount} lệnh mở`);
        lines.push(`  PnL: ${pnlSign}${Math.round((p.realizedPnl || 0) / 1000)}k (${pnlSign}${pnlPct.toFixed(2)}%) | Win ${p.winRate}% (${p.closedCount} đóng)`);
        if (p.closedCount > 0 && (p.avgWinVnd != null || p.expectancyVnd != null)) {
            const expSign = (p.expectancyVnd || 0) >= 0 ? '+' : '';
            lines.push(`  Avg thắng: +${Math.round((p.avgWinVnd || 0) / 1000)}k | Avg thua: ${Math.round((p.avgLossVnd || 0) / 1000)}k | Expectancy: ${expSign}${Math.round((p.expectancyVnd || 0) / 1000)}k/lệnh`);
        }
        lines.push(`  Cấu hình: ${p.allocationPercent}%/lệnh | Max ${p.maxConcurrentOrders} | Dynamic ${p.dynamicSizing ? 'BẬT' : 'TẮT'}`);
        lines.push('');
    }
    return packPlainLines(lines);
};

const sentimentTag = (s) => {
    if (s === 'positive') return '+';
    if (s === 'negative') return '-';
    return '=';
};

const formatInfoPrice = (value, asset) => {
    if (asset === 'VN_STOCK') {
        const n = Number(value);
        if (!Number.isFinite(n)) return '--';
        return `${n.toLocaleString('vi-VN')} ₫`;
    }
    return formatPrice(value, asset);
};

const buildSymbolInfoMessage = (data = {}) => {
    const asset = data.asset || 'VN_STOCK';
    const assetLabel = asset === 'CRYPTO' ? 'CRYPTO' : 'VN';
    const tech = data.technicals || {};
    const news = data.news || {};
    const sent = news.sentiment || {};
    const counts = sent.counts || {};
    const view = data.view || {};
    const levels = data.levels || {};
    const fund = data.fundamentals || {};
    const cachedAi = data.cachedAi;
    const insightPick = data.insightPick;

    const changeLine = Number.isFinite(Number(data.changePercent))
        ? `${formatSignedPct(data.changePercent, 2)}${
            data.change != null && asset === 'VN_STOCK'
                ? ` / ${Number(data.change) >= 0 ? '+' : ''}${Number(data.change).toLocaleString('vi-VN')} ₫`
                : ''
        }`
        : '--';

    const priceTime = formatVnDateTime(data.priceAt || data.fetchedAt);
    const fetchTime = formatVnDateTime(data.fetchedAt);

    const displayName = data.name && data.name !== data.symbol ? data.name : null;
    const titleCore = displayName
        ? `INFO — ${data.symbol || '???'} (${assetLabel}) — ${displayName}`
        : `INFO — ${data.symbol || '???'} (${assetLabel})`;

    const lines = [
        `🦆 ${htmlBold(titleCore)}`,
        PLAIN_DIVIDER,
        `💰 ${htmlBold('Giá')}: ${escapeHtml(formatInfoPrice(data.price, asset))}  (${escapeHtml(changeLine)})`,
    ];

    if (priceTime) {
        lines.push(`🕒 ${htmlItalic(`Giá lúc: ${priceTime}`)}${data.priceSource ? ` · ${escapeHtml(data.priceSource)}` : ''}`);
    }
    if (fetchTime && fetchTime !== priceTime) {
        lines.push(`📥 ${htmlItalic(`Lấy lúc: ${fetchTime}`)}`);
    }

    if (data.volume != null && Number(data.volume) > 0) {
        const volStr = asset === 'CRYPTO'
            ? formatNumber(data.volume, 0)
            : Number(data.volume).toLocaleString('vi-VN');
        lines.push(`📊 Volume: ${escapeHtml(volStr)}`);
    }

    const nameBits = [
        data.industry || null,
        fund.pe && fund.pe !== '---' ? `P/E ${fund.pe}` : null,
        fund.mktCap && fund.mktCap !== '---' ? `Cap ${fund.mktCap}` : null,
    ].filter(Boolean);
    if (nameBits.length) lines.push(`🏢 ${escapeHtml(nameBits.join(' · '))}`);
    if (fund.overview) lines.push(`📝 ${escapeHtml(truncate(fund.overview, 160))}`);

    lines.push(
        '',
        htmlSection('📈 KỸ THUẬT'),
        `RSI ${escapeHtml(String(tech.rsi ?? '--'))} · MACD ${escapeHtml(String(tech.macd ?? '--'))} · Score ${escapeHtml(String(tech.score ?? '--'))}`,
        `Trend ${escapeHtml(String(tech.trend || tech.direction || '--'))}${tech.adx != null ? ` · ADX ${Number(tech.adx).toFixed(0)}` : ''}`,
        `→ ${htmlBold(String(tech.direction || tech.action || 'NEUTRAL'))}`,
    );

    lines.push(
        '',
        htmlSection('📰 TIN & SENTIMENT'),
        `Score: +${counts.positive || 0}/-${counts.negative || 0}/=${counts.neutral || 0} → ${htmlBold(sent.bias || 'neutral')}`,
    );
    const micro = Array.isArray(news.micro) ? news.micro.slice(0, 5) : [];
    if (micro.length) {
        for (const n of micro) {
            lines.push(`  [${sentimentTag(n.sentiment)}] ${escapeHtml(truncate(n.title, 90))}`);
        }
    } else {
        lines.push(`  ${htmlItalic('(Chưa có tin mới)')}`);
    }
    if (news.macroHint) lines.push(`Vĩ mô: ${escapeHtml(truncate(news.macroHint, 160))}`);

    if (insightPick) {
        lines.push(
            '',
            htmlSection('🏠 INSIGHT HOME (AI thị trường)'),
            `${pickActionIcon(insightPick.action)} ${htmlBold(insightPick.action || '?')} · score ${escapeHtml(String(insightPick.score ?? '--'))} · ${escapeHtml(insightPick.horizon || '—')}`,
        );
        if (insightPick.reason) lines.push(escapeHtml(truncate(insightPick.reason, 140)));
        if (data.insightDate) lines.push(htmlItalic(`Báo cáo ngày ${data.insightDate}`));
    }

    if (cachedAi) {
        lines.push('', htmlSection('📦 AI ĐÃ LƯU (cache DB)'));
        const ts = cachedAi.timestamp
            ? new Date(cachedAi.timestamp).toLocaleString('vi-VN')
            : 'không rõ thời điểm';
        lines.push(`Action: ${htmlBold(String(cachedAi.action || '--'))} · lúc: ${escapeHtml(ts)}`);
        const ad = cachedAi.actionData || {};
        const entry = ad.entry || ad.Entry;
        const sl = ad.stoploss || ad.sl || ad.SL;
        const tp = ad.target || ad.tp || ad.TP || ad.target1;
        if (entry || sl || tp) {
            lines.push(`Entry ${escapeHtml(String(entry || '--'))} | SL ${escapeHtml(String(sl || '--'))} | TP ${escapeHtml(String(tp || '--'))}`);
        }
        if (cachedAi.excerpt) lines.push(escapeHtml(truncate(cachedAi.excerpt, 180)));
    }

    // Nhận định tổng hợp — đặt cuối cùng
    lines.push(
        '',
        htmlSection('🎯 NHẬN ĐỊNH (kỹ thuật + tin + insight + AI DB)'),
        `Action: ${htmlBold(view.action || 'ĐỨNG NGOÀI')}`,
        `Entry: ${escapeHtml(formatInfoPrice(view.entry ?? levels.entry, asset))} | SL: ${escapeHtml(formatInfoPrice(view.sl ?? levels.sl, asset))}`,
        `TP1: ${escapeHtml(formatInfoPrice(view.tp1 ?? levels.tp1, asset))} | TP2: ${escapeHtml(formatInfoPrice(view.tp2 ?? levels.tp2, asset))}`,
        `Ngắn hạn: ${escapeHtml(view.shortHorizon || '--')}`,
        `Dài hạn: ${escapeHtml(view.longHorizon || '--')}`,
    );
    if (view.weightSummary) lines.push(htmlItalic(view.weightSummary));
    if (view.reason) lines.push(`Lý do: ${escapeHtml(truncate(view.reason, 280))}`);

    lines.push(
        '',
        moreInfoLine({
            symbol: data.symbol,
            mode: asset === 'CRYPTO' ? 'CRYPTO' : 'VN_STOCKS',
            label: `Chi tiết ${data.symbol || ''} trên web`,
        }),
        `⚠️ ${htmlItalic('Nhận định dựa trên kỹ thuật, tin tức, Insight Home & AI đã lưu — chưa phải phân tích AI mới nhất.')}`,
    );

    return packPlainLines(lines);
};

const buildHelpMessage = () => {
    const web = getWebAppBaseUrl();
    return [
        `🦆 ${htmlBold('OMNI DUCK — HƯỚNG DẪN LỆNH')}`,
        `🕒 ${escapeHtml(new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }))}`,
        PLAIN_DIVIDER,
        `🌐 Terminal web: ${escapeHtml(web)}`,
        ``,
        htmlSection('🔍 TRA CỨU NHANH'),
        `/market          Tổng quan VN + Crypto + khuyến nghị AI`,
        `/info &lt;mã&gt;       Giá, kỹ thuật, tin, nhận định`,
        `                 ${htmlItalic('VD: /info TCB   |  /info BTC')}`,
        `/insight         Báo cáo AI thị trường (Home VN Stock)`,
        ``,
        htmlSection('📊 GIÁM SÁT GIAO DỊCH'),
        `/check           Dashboard vốn + lệnh đang mở`,
        `/live            Chi tiết vị thế LIVE + log sàn`,
        `/sim             Lệnh mô phỏng + stats training`,
        `/pnl             PnL đã đóng hôm nay`,
        `/portfolio       Các gói quỹ AutoDuck`,
        `/stats [7]       Win rate / PnL (mặc định 30 ngày)`,
        `/funnel          Kết quả chu kỳ quét mã`,
        ``,
        htmlSection('🙋 LỆNH THỦ CÔNG'),
        `/trade ...       Đặt lệnh khớp sàn LIVE`,
        `/close &lt;mã&gt;      Đóng lệnh manual theo mã`,
        `/manual          Danh sách lệnh manual đang mở`,
        ``,
        htmlSection('⚙️ HỆ THỐNG'),
        `/health          Pipeline, AI providers, guards`,
        `/settings        Cấu hình auto-trade`,
        `/broker          Kết nối sàn`,
        `/ai              Bài học AI gần nhất`,
        `/stop  /start    Tắt / bật pipeline auto-trade`,
        ``,
        htmlSection('💡 MẸO'),
        `• Alias: /mkt = /market · /i = /info · /baocao = /insight`,
        `• Link web ở cuối lệnh tra cứu — bấm để mở terminal`,
        `• ${htmlItalic('/info không gọi AI live; dùng Insight Home + AI đã lưu nếu có')}`,
        PLAIN_DIVIDER,
        htmlItalic('Gõ /help bất cứ lúc nào để xem lại danh sách này.'),
    ].join('\n');
};

export {
    isTelegramConfigured,
    sendTelegramMessage,
    escapeHtml,
    formatTelegramPlainSection,
    buildAutoTradeOpenMessage,
    getTradeCloseIcon,
    buildAutoTradeCloseMessage,
    buildCryptoSignalMessage,
    buildMarketRadarMessage,
    buildVolatilityAlertMessage,
    buildVolatilityDigestMessage,
    buildSystemAlertMessage,
    buildDailyPnLReportMessage,
    buildStatusMessage,
    buildCheckDashboardMessage,
    buildLiveDetailMessage,
    buildSimDetailMessage,
    buildMarketOverviewMessage,
    buildStatsMessage,
    buildFunnelMessage,
    buildInsightMessage,
    buildHealthMessage,
    buildSettingsMessage,
    buildAiLessonsMessage,
    buildBrokerStatusMessage,
    buildTodayPnLMessage,
    buildPortfolioMessage,
    buildSymbolInfoMessage,
    buildHelpMessage,
};