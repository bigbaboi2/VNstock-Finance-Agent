// READ-ONLY diagnostic — không tạo/đóng lệnh, không gửi Telegram, không ra sàn.
//
// Cách dùng:
//   node scripts/diag_autotrade.mjs                  → xem ALL-TIME + 30 ngày
//   node scripts/diag_autotrade.mjs --since 2026-06-12  → CHỈ lệnh đóng sau mốc này (đo logic mới)
//   node scripts/diag_autotrade.mjs --hours 72       → CHỈ lệnh đóng trong 72h gần nhất
import 'dotenv/config';
import mongoose from 'mongoose';
import AutoTrade from '../models/AutoTrade.js';
import AiBehavior from '../models/AiBehavior.js';

const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : 'N/A');

// ── Parse args ──
const argv = process.argv.slice(2);
const getArg = (name) => {
    const i = argv.indexOf(name);
    if (i >= 0 && argv[i + 1]) return argv[i + 1];
    const eq = argv.find(a => a.startsWith(`${name}=`));
    return eq ? eq.split('=')[1] : null;
};
const sinceArg = getArg('--since');
const hoursArg = getArg('--hours');

const printStats = (label, trades) => {
    if (!trades.length) { console.log(`\n[${label}] không có lệnh đóng.`); return; }
    const wins = trades.filter(t => t.pnlPercent > 0);
    const losses = trades.filter(t => t.pnlPercent <= 0);
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnlPercent, 0) / losses.length : 0;
    const winRate = wins.length / trades.length;
    const totalPnlPct = trades.reduce((s, t) => s + t.pnlPercent, 0);
    const totalPnlVnd = trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    const expectancy = winRate * avgWin + (1 - winRate) * avgLoss;
    const beWinRate = (avgWin - avgLoss) !== 0 ? (-avgLoss) / (avgWin - avgLoss) : NaN;

    console.log(`\n════ [${label}] ${trades.length} lệnh ════`);
    console.log(`  Win rate     : ${fmt(winRate * 100, 1)}%  (${wins.length}W / ${losses.length}L)`);
    console.log(`  Avg WIN      : +${fmt(avgWin)}%   | Avg LOSS: ${fmt(avgLoss)}%`);
    console.log(`  Win/Loss size: ${fmt(avgLoss !== 0 ? avgWin / -avgLoss : NaN)}  (cần > ${fmt((1 - winRate) / winRate)} để hoà với WR hiện tại)`);
    console.log(`  Expectancy   : ${fmt(expectancy)}% / lệnh  → ${expectancy >= 0 ? 'DƯƠNG ✓' : 'ÂM ✗'}`);
    console.log(`  Breakeven WR : ${fmt(beWinRate * 100, 1)}%`);
    console.log(`  Tổng PnL     : ${fmt(totalPnlPct)}%  | ${totalPnlVnd.toLocaleString('vi-VN')}đ`);

    // Theo phân khúc
    const byAsset = {};
    for (const t of trades) (byAsset[t.assetType] ||= []).push(t);
    console.log('  ── Theo phân khúc:');
    for (const [a, list] of Object.entries(byAsset)) {
        const w = list.filter(t => t.pnlPercent > 0).length;
        console.log(`     ${a.padEnd(11)}: ${list.length} lệnh | WR ${fmt(w / list.length * 100, 0)}% | PnL ${fmt(list.reduce((s, t) => s + t.pnlPercent, 0))}%`);
    }

    // LIVE vs SIM (executionMode trên AutoTrade)
    const byMode = { LIVE: [], SIMULATED: [], OTHER: [] };
    for (const t of trades) {
        const mode = t.executionMode === 'LIVE' ? 'LIVE' : (t.executionMode === 'SIMULATED' || !t.executionMode ? 'SIMULATED' : 'OTHER');
        byMode[mode].push(t);
    }
    console.log('  ── Theo executionMode:');
    for (const [mode, list] of Object.entries(byMode)) {
        if (!list.length) { console.log(`     ${mode.padEnd(11)}: 0 lệnh`); continue; }
        const w = list.filter(t => t.pnlPercent > 0).length;
        console.log(`     ${mode.padEnd(11)}: ${list.length} lệnh | WR ${fmt(w / list.length * 100, 0)}% | PnL ${fmt(list.reduce((s, t) => s + t.pnlPercent, 0))}%`);
    }
    const cryptoLive = trades.filter(t => t.assetType === 'CRYPTO' && t.executionMode === 'LIVE');
    const cryptoSim = trades.filter(t => t.assetType === 'CRYPTO' && t.executionMode !== 'LIVE');
    if (cryptoLive.length || cryptoSim.length) {
        console.log('  ── CRYPTO LIVE vs SIM:');
        if (cryptoLive.length) {
            const w = cryptoLive.filter(t => t.pnlPercent > 0).length;
            console.log(`     LIVE       : ${cryptoLive.length} | WR ${fmt(w / cryptoLive.length * 100, 0)}% | PnL ${fmt(cryptoLive.reduce((s, t) => s + t.pnlPercent, 0))}%`);
        }
        if (cryptoSim.length) {
            const w = cryptoSim.filter(t => t.pnlPercent > 0).length;
            console.log(`     SIM        : ${cryptoSim.length} | WR ${fmt(w / cryptoSim.length * 100, 0)}% | PnL ${fmt(cryptoSim.reduce((s, t) => s + t.pnlPercent, 0))}%`);
        }
    }

    // Theo score bucket
    const buckets = { '<80': [], '>=80': [] };
    for (const t of trades) buckets[(t.aiScore || 0) < 80 ? '<80' : '>=80'].push(t);
    console.log('  ── Theo score bucket (ngưỡng mới = 80):');
    for (const [k, list] of Object.entries(buckets)) {
        if (!list.length) { console.log(`     ${k.padEnd(5)}: 0 lệnh`); continue; }
        const w = list.filter(t => t.pnlPercent > 0).length;
        console.log(`     ${k.padEnd(5)}: ${list.length} lệnh | WR ${fmt(w / list.length * 100, 0)}% | PnL ${fmt(list.reduce((s, t) => s + t.pnlPercent, 0))}%`);
    }

    // Theo entry setup (chỉ có ở lệnh tạo bởi logic mới)
    const withSetup = trades.filter(t => t.signalBreakdown?.entrySetup);
    if (withSetup.length) {
        const bySetup = {};
        for (const t of withSetup) (bySetup[t.signalBreakdown.entrySetup] ||= []).push(t);
        console.log('  ── Theo ENTRY SETUP (logic hybrid mới):');
        for (const [k, list] of Object.entries(bySetup)) {
            const w = list.filter(t => t.pnlPercent > 0).length;
            console.log(`     ${k.padEnd(16)}: ${list.length} lệnh | WR ${fmt(w / list.length * 100, 0)}% | PnL ${fmt(list.reduce((s, t) => s + t.pnlPercent, 0))}%`);
        }
    }
};

const run = async () => {
    if (!process.env.MONGODB_URI) { console.error('Thiếu MONGODB_URI'); process.exit(1); }
    await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 15000,
        family: 4, // tránh lỗi IPv6 trên Windows khi Atlas chỉ resolve AAAA
    });
    console.log('✓ Connected. DB =', mongoose.connection.name);

    const totalClosed = await AutoTrade.countDocuments({ status: 'CLOSED' });
    const openCount = await AutoTrade.countDocuments({ status: { $in: ['OPEN', 'PENDING'] } });
    console.log(`\nTỔNG QUAN: ${totalClosed} lệnh CLOSED | ${openCount} đang OPEN/PENDING`);

    const sel = 'assetType aiScore pnlPercent pnl direction openedAt closedAt executionMode signalBreakdown';

    // ── Nếu có --since / --hours: chỉ đo cửa sổ logic MỚI ──
    if (sinceArg || hoursArg) {
        const cutoff = hoursArg
            ? new Date(Date.now() - Number(hoursArg) * 3600_000)
            : new Date(sinceArg);
        // Lọc theo openedAt (thời điểm VÀO lệnh) → chỉ tính lệnh được MỞ bởi logic mới,
        // tránh 6 lệnh cũ đang mở (mở bằng logic cũ) đóng sau restart làm bẩn số liệu.
        const newTrades = await AutoTrade.find({ status: 'CLOSED', openedAt: { $gte: cutoff } }).select(sel).lean();
        printStats(`LOGIC MỚI (vào lệnh từ ${cutoff.toLocaleString('vi-VN')})`, newTrades);
        if (newTrades.length < 30) {
            console.log(`\n  ⚠️ Mới ${newTrades.length} lệnh — cần ≥30-50 lệnh mới đủ tin cậy thống kê. Cứ để engine chạy thêm.`);
        }
        await mongoose.disconnect();
        console.log('\n✓ Done (read-only).');
        return;
    }

    // ── Mặc định: ALL-TIME + 30 ngày ──
    const all = await AutoTrade.find({ status: 'CLOSED' }).select(sel).lean();
    printStats('ALL-TIME', all);
    const since30 = new Date(Date.now() - 30 * 24 * 3600_000);
    printStats('30 NGÀY', all.filter(t => new Date(t.closedAt) >= since30));

    const aiLogs = await AiBehavior.countDocuments({});
    console.log(`\nAiBehavior logs: ${aiLogs}`);
    console.log('\n💡 Sau khi engine chạy thêm: node scripts/diag_autotrade.mjs --hours 72  (đo riêng logic mới)');

    await mongoose.disconnect();
    console.log('\n✓ Done (read-only, không thay đổi gì).');
};

run().catch(e => { console.error('ERR:', e.message); process.exit(1); });
