import axios from 'axios';
import chalk from 'chalk';

const getTelegramConfig = () => ({
    botToken: process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID || '',
});

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

const isTelegramConfigured = () => {
    const { botToken, chatId } = getTelegramConfig();
    return Boolean(botToken && chatId);
};

const sendTelegramMessage = async (message, { parseMode = 'MarkdownV2' } = {}) => {
    if (!isTelegramConfigured()) {
        return { ok: false, skipped: true, reason: 'Telegram chưa được cấu hình' };
    }

    try {
        const { botToken, chatId } = getTelegramConfig();
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const payload = {
            chat_id: chatId,
            text: message,
            parse_mode: parseMode,
            disable_web_page_preview: true,
        };

        const res = await axios.post(url, payload, { timeout: 10000 });
        return { ok: true, data: res.data };
    } catch (error) {
        console.log(chalk.yellow(`[TELEGRAM] Gửi tin nhắn thất bại: ${error.message}`));
        return { ok: false, error: error.message };
    }
};

const buildAutoTradeOpenMessage = (trade, aiConfirm, quote, executionContext = {}, plan = null) => {
    const direction = escapeMarkdownV2(trade.direction);
    const symbol = escapeMarkdownV2(trade.symbol);
    const entryPrice = escapeMarkdownV2(formatNumber(trade.entryPrice, 2));
    const takeProfitPrice = escapeMarkdownV2(formatNumber(trade.takeProfitPrice, 2));
    const stopLossPrice = escapeMarkdownV2(formatNumber(trade.stopLossPrice, 2));
    const score = escapeMarkdownV2(`${trade.aiScore}/100`);
    const reason = escapeMarkdownV2(String(aiConfirm?.reason || trade.reason || '').slice(0, 700));
    const priceSource = escapeMarkdownV2(String(quote?.source || 'N/A'));
    const contextSource = escapeMarkdownV2(String(executionContext?.source || 'N/A'));

    // Sử dụng giá trị từ plan nếu có để chính xác tuyệt đối với Engine
    const rewardPct = plan?.rewardPct ?? null;
    const riskPct = plan?.riskPct ?? null;

    return [
        `🟢 *AUTO TRADE MỚI*`,
        `Mã: *${symbol}*`,
        `Hướng: *${direction}*`,
        `Entry: *${entryPrice}*`,
        `TP: *${takeProfitPrice}*`,
        `SL: *${stopLossPrice}*`,
        `AI Score: *${score}*`,
        `Reward/Risk: *${escapeMarkdownV2(rewardPct != null ? `+${rewardPct.toFixed(2)}%` : '--')}* / *${escapeMarkdownV2(riskPct != null ? `-${riskPct.toFixed(2)}%` : '--')}*`,
        `Nguồn giá: *${priceSource}*`,
        `Context: *${contextSource}*`,
        `Lý do: ${reason}`,
    ].join('\n');
};

const buildMarketRadarMessage = (radar = {}, meta = {}) => {
    const assetLabels = {
        CRYPTO: 'Crypto',
        VN_STOCK: 'Chứng khoán VN',
        DERIVATIVES: 'Phái sinh VN30',
    };
    const lines = [
        `📡 *AUTO TRADE RADAR*`,
        `Thời điểm: *${escapeMarkdownV2(new Date(meta.generatedAt || Date.now()).toLocaleString('vi-VN'))}*`,
        meta.marketStatus ? `Thị trường: *${escapeMarkdownV2(meta.marketStatus)}*` : null,
    ].filter(Boolean);

    for (const asset of ['CRYPTO', 'VN_STOCK', 'DERIVATIVES']) {
        const items = Array.isArray(radar[asset]) ? radar[asset].slice(0, 3) : [];
        lines.push('');
        lines.push(`*${escapeMarkdownV2(assetLabels[asset] || asset)}*`);

        if (items.length === 0) {
            lines.push(escapeMarkdownV2('Chưa có mã đủ điều kiện vào lệnh hiện tại.'));
            continue;
        }

        items.forEach((item, index) => {
            const direction = escapeMarkdownV2(item.direction || 'WAIT');
            const symbol = escapeMarkdownV2(item.symbol || 'N/A');
            const score = escapeMarkdownV2(`${item.score ?? '--'}/100`);
            const entry = escapeMarkdownV2(formatNumber(item.entryPrice, asset === 'CRYPTO' ? 4 : 2));
            const tp = escapeMarkdownV2(formatNumber(item.takeProfitPrice, asset === 'CRYPTO' ? 4 : 2));
            const sl = escapeMarkdownV2(formatNumber(item.stopLossPrice, asset === 'CRYPTO' ? 4 : 2));
            const reward = escapeMarkdownV2(formatPct(item.rewardPct, 2));
            const risk = escapeMarkdownV2(formatPct(-Math.abs(Number(item.riskPct) || 0), 2));
            const ai = item.aiConfirmed === true ? 'AI xác nhận' : item.aiConfirmed === false ? 'AI chưa xác nhận' : 'Chờ AI';
            const news = item.news?.summary || 'Tin tức trung tính hoặc chưa có tin mới';
            const reason = item.reason || item.news?.topTitle || '';

            lines.push(`${index + 1}\\. *${symbol}* \\| *${direction}* \\| Score *${score}*`);
            lines.push(`Entry *${entry}* \\| TP *${tp}* \\| SL *${sl}*`);
            lines.push(`Kỳ vọng *${reward}* \\| Rủi ro *${risk}* \\| ${escapeMarkdownV2(ai)}`);
            lines.push(`News: ${escapeMarkdownV2(String(news).slice(0, 180))}`);
            if (reason) lines.push(`Lý do: ${escapeMarkdownV2(String(reason).slice(0, 220))}`);
        });
    }

    const packed = [];
    let length = 0;
    for (const line of lines) {
        const nextLength = length + line.length + 1;
        if (nextLength > 3900) break;
        packed.push(line);
        length = nextLength;
    }

    return packed.join('\n');
};

const buildAutoTradeCloseMessage = (trade, exitReason) => {
    const symbol = escapeMarkdownV2(trade.symbol);
    const direction = escapeMarkdownV2(trade.direction);
    const entry = escapeMarkdownV2(formatNumber(trade.entryPrice, 2));
    const exit = escapeMarkdownV2(formatNumber(trade.exitPrice, 2));
    const pnlPct = escapeMarkdownV2(formatSignedPct(trade.pnlPercent, 2));
    const pnl = escapeMarkdownV2(formatNumber(trade.pnl, 0));
    const reason = escapeMarkdownV2(String(exitReason || '').slice(0, 700));

    return [
        `🔔 *AUTO TRADE ĐÃ ĐÓNG*`,
        `Mã: *${symbol}*`,
        `Hướng: *${direction}*`,
        `Entry: *${entry}*`,
        `Exit: *${exit}*`,
        `PnL: *${pnlPct}*`,
        `PnL tiền: *${pnl}*`,
        `Lý do: ${reason}`,
    ].join('\n');
};

const buildCryptoSignalMessage = (symbol, aiDecision, currentPrice) => {
    const cleanSymbol = escapeMarkdownV2(symbol);
    const signal = escapeMarkdownV2(String(aiDecision?.signal || 'WAIT'));
    const confidence = escapeMarkdownV2(String(aiDecision?.confidence || '--'));
    const entry = escapeMarkdownV2(String(aiDecision?.entry || '--'));
    const sl = escapeMarkdownV2(String(aiDecision?.sl || '--'));
    const tp = escapeMarkdownV2(String(aiDecision?.tp || '--'));
    const horizon = escapeMarkdownV2(String(aiDecision?.horizon || '--'));
    const rr = escapeMarkdownV2(String(aiDecision?.risk_reward || '--'));
    const advice = escapeMarkdownV2(String(aiDecision?.advice || '').slice(0, 700));
    const livePrice = escapeMarkdownV2(formatNumber(currentPrice, 4));

    return [
        `🪙 *CRYPTO AI RECOMMENDATION*`,
        `Mã: *${cleanSymbol}*`,
        `Signal: *${signal}*`,
        `Confidence: *${confidence}*`,
        `Giá hiện tại: *${livePrice}*`,
        `Entry: *${entry}*`,
        `Stop loss: *${sl}*`,
        `Take profit: *${tp}*`,
        `Horizon: *${horizon}*`,
        `R:R: *${rr}*`,
        `Advice: ${advice}`,
    ].join('\n');
};

const buildVolatilityAlertMessage = (asset, symbol, currentPrice, changePct, timeFrame, note) => {
    const cleanSymbol = escapeMarkdownV2(symbol);
    const price = escapeMarkdownV2(formatNumber(currentPrice, asset === 'CRYPTO' ? 2 : 2));
    const change = escapeMarkdownV2(formatSignedPct(changePct, 2));
    const frame = escapeMarkdownV2(timeFrame);
    const cleanNote = escapeMarkdownV2(note || '');

    return [
        `⚠️ *CẢNH BÁO BIẾN ĐỘNG MẠNH* ⚠️`,
        `Tài sản: *${cleanSymbol}* \\(${escapeMarkdownV2(asset)}\\)`,
        `Giá hiện tại: *${price}*`,
        `Biến động: *${change}* trong *${frame}*`,
        `Ghi chú: ${cleanNote}`
    ].join('\n');
};

const buildDailyPnLReportMessage = (trades, date = new Date()) => {
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => t.pnl > 0).length;
    const losingTrades = trades.filter(t => t.pnl < 0).length;
    const breakEvenTrades = trades.filter(t => t.pnl === 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    const totalPnL = trades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
    const totalInvested = trades.reduce((sum, t) => sum + (Number(t.investedAmount) || 0), 0);
    const pnlPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

    const formattedDate = escapeMarkdownV2(date.toLocaleDateString('vi-VN'));
    const formattedTotalPnL = escapeMarkdownV2(formatNumber(totalPnL, 0));
    const formattedPnlPct = escapeMarkdownV2(formatSignedPct(pnlPct, 2));
    const formattedWinRate = escapeMarkdownV2(formatNumber(winRate, 1) + '%');

    const lines = [
        `📊 *BÁO CÁO PNL TỔNG KẾT NGÀY* 📊`,
        `Ngày: *${formattedDate}*`,
        ``,
        `📈 *KẾT QUẢ GIAO DỊCH:*`,
        `Tổng số lệnh đóng: *${totalTrades}*`,
        `Thắng: *${winningTrades}* \\| Thua: *${losingTrades}* \\| Hòa: *${breakEvenTrades}*`,
        `Tỉ lệ thắng \\(Win Rate\\): *${formattedWinRate}*`,
        ``,
        `💰 *HIỆU QUẢ LỢI NHUẬN:*`,
        `Tổng PnL: *${formattedTotalPnL}* VNĐ`,
        `Tỉ suất PnL/Vốn: *${formattedPnlPct}*`,
    ];

    if (totalTrades > 0) {
        lines.push(``);
        lines.push(`📝 *CHI TIẾT LỆNH ĐÓNG TRONG NGÀY:*`);
        trades.slice(0, 15).forEach(t => {
            const sym = escapeMarkdownV2(t.symbol);
            const dir = escapeMarkdownV2(t.direction);
            const pnl = escapeMarkdownV2(formatSignedPct(t.pnlPercent, 2));
            const icon = t.pnl > 0 ? '🟢' : t.pnl < 0 ? '🔴' : '⚪';
            lines.push(`${icon} *${sym}* \\(${dir}\\): ${pnl}`);
        });
        if (totalTrades > 15) {
            lines.push(escapeMarkdownV2(`... và ${totalTrades - 15} lệnh khác`));
        }
    }

    return lines.join('\n');
};

export {
    isTelegramConfigured,
    sendTelegramMessage,
    buildAutoTradeOpenMessage,
    buildAutoTradeCloseMessage,
    buildCryptoSignalMessage,
    buildMarketRadarMessage,
    buildVolatilityAlertMessage,
    buildDailyPnLReportMessage,
};
