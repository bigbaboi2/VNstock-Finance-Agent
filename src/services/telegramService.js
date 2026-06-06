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



const isTelegramConfigured = () => {
    const { botToken, chatId } = getTelegramConfig();
    return Boolean(botToken && chatId);
};


const sendTelegramMessage = async (message, { parseMode = 'MarkdownV2', _isRetry = false } = {}) => {
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
        const status = error?.response?.status;

        
        if (status === 400 && parseMode !== 'none' && !_isRetry) {
            console.log(chalk.yellow(`[TELEGRAM] Markdown lỗi (400), thử lại plain text...`));
            
            const plain = message
                .replace(/\\/g, '')
                .replace(/[*_~`]/g, '');
            return sendTelegramMessage(plain, { parseMode: 'none', _isRetry: true });
        }

        
        if (!_isRetry && !status) {
            console.log(chalk.yellow(`[TELEGRAM] Lỗi mạng, thử lại sau 2s: ${error.message}`));
            await new Promise(r => setTimeout(r, 2000));
            return sendTelegramMessage(message, { parseMode, _isRetry: true });
        }

        console.log(chalk.yellow(`[TELEGRAM] Gửi tin nhắn thất bại (${status || 'network'}): ${error.message}`));
        return { ok: false, error: error.message };
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
    const statusIcon = isWin ? '🤑' : '🩸';

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
    const alertIcon   = isUp ? '🚀' : '💥';

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
            const icon   = t.pnl > 0 ? '🤑' : t.pnl < 0 ? '🩸' : '⚪';
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

export {
    isTelegramConfigured,
    sendTelegramMessage,
    buildAutoTradeOpenMessage,
    buildAutoTradeCloseMessage,
    buildCryptoSignalMessage,
    buildMarketRadarMessage,
    buildVolatilityAlertMessage,
    buildSystemAlertMessage,
    buildDailyPnLReportMessage,
    buildStatusMessage,
};