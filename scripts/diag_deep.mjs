// READ-ONLY — chẩn đoán SÂU: tách SIM/LIVE, cross-tab score×setup×exit,
// định lượng mức "cắt cụt winner" (capturedFrac) và tốc độ đi ngược của loser.
// Dùng: node scripts/diag_deep.mjs [--since 2026-06-12]
import 'dotenv/config';
import mongoose from 'mongoose';
import AutoTrade from '../models/AutoTrade.js';

const argv = process.argv.slice(2);
const getArg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const sinceArg = getArg('--since');
const f = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : 'N/A');

const isLong = (t) => t.direction === 'LONG' || t.direction === 'MUA';
const capturedFrac = (t) => {
    const reward = isLong(t) ? (t.takeProfitPrice - t.entryPrice) : (t.entryPrice - t.takeProfitPrice);
    if (!(reward > 0) || !Number.isFinite(t.exitPrice)) return NaN;
    const move = isLong(t) ? (t.exitPrice - t.entryPrice) : (t.entryPrice - t.exitPrice);
    return move / reward;
};
// ATR suy ra từ TP gốc: crypto TP = entry ± 4*ATR  →  ATR = |TP-entry|/4
const inferAtrPct = (t) => {
    const dist = Math.abs(t.takeProfitPrice - t.entryPrice);
    if (!(dist > 0) || !(t.entryPrice > 0)) return NaN;
    return (dist / 4) / t.entryPrice * 100; // chỉ đúng cho crypto (mult TP=4)
};

const stat = (label, trades) => {
    if (!trades.length) { console.log(`\n[${label}] 0 lệnh.`); return; }
    const wins = trades.filter(t => t.pnlPercent > 0);
    const losses = trades.filter(t => t.pnlPercent <= 0);
    const wr = wins.length / trades.length;
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnlPercent, 0) / losses.length : 0;
    const exp = wr * avgWin + (1 - wr) * avgLoss;
    const pnlVnd = trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    console.log(`\n══ [${label}] ${trades.length} lệnh ══`);
    console.log(`   WR ${f(wr * 100, 1)}% (${wins.length}W/${losses.length}L) | avgW +${f(avgWin)}% avgL ${f(avgLoss)}% | W/L ${f(avgLoss ? avgWin / -avgLoss : NaN)} | Exp ${f(exp)}%/lệnh ${exp >= 0 ? '✓' : '✗'} | PnL ${pnlVnd.toLocaleString('vi-VN')}đ`);
};

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 15000,
        family: 4,
    });
    console.log('✓ DB =', mongoose.connection.name);

    const q = { status: 'CLOSED' };
    if (sinceArg) q.openedAt = { $gte: new Date(sinceArg) };
    const trades = await AutoTrade.find(q).lean();
    console.log(`\nTổng ${trades.length} lệnh CLOSED${sinceArg ? ` (mở từ ${sinceArg})` : ' (ALL-TIME)'}`);

    // 1) SIM vs LIVE
    console.log('\n━━━━━━ 1) SIM vs LIVE ━━━━━━');
    const live = trades.filter(t => t.executionMode === 'LIVE');
    const sim = trades.filter(t => t.executionMode !== 'LIVE');
    stat('LIVE (tiền thật)', live);
    stat('SIM (training nền)', sim);

    // 2) Cross-tab: setup × score-bucket (chỉ SIM+LIVE gộp, crypto)
    console.log('\n━━━━━━ 2) Cross-tab SETUP × SCORE ━━━━━━');
    const setups = [...new Set(trades.map(t => t.signalBreakdown?.entrySetup || '(cũ)'))];
    for (const su of setups) {
        const list = trades.filter(t => (t.signalBreakdown?.entrySetup || '(cũ)') === su);
        const lo = list.filter(t => (t.aiScore || 0) < 80);
        const hi = list.filter(t => (t.aiScore || 0) >= 80);
        const wr = (a) => a.length ? `${f(a.filter(t => t.pnlPercent > 0).length / a.length * 100, 0)}%` : '—';
        const ex = (a) => {
            if (!a.length) return '—';
            const w = a.filter(t => t.pnlPercent > 0); const l = a.filter(t => t.pnlPercent <= 0);
            const aw = w.length ? w.reduce((s, t) => s + t.pnlPercent, 0) / w.length : 0;
            const al = l.length ? l.reduce((s, t) => s + t.pnlPercent, 0) / l.length : 0;
            const r = w.length / a.length; return `${f(r * aw + (1 - r) * al)}%`;
        };
        console.log(`   ${su.padEnd(16)} | n=${String(list.length).padStart(3)} | <80: n=${String(lo.length).padStart(3)} WR ${wr(lo).padStart(4)} Exp ${ex(lo).padStart(7)} | ≥80: n=${String(hi.length).padStart(3)} WR ${wr(hi).padStart(4)} Exp ${ex(hi).padStart(7)}`);
    }

    // 3) Định lượng cắt cụt winner: phân phối capturedFrac của lệnh THẮNG
    console.log('\n━━━━━━ 3) WINNER bị cắt cụt (capturedFrac = % quãng tới TP đã ăn) ━━━━━━');
    const wins = trades.filter(t => t.pnlPercent > 0).map(capturedFrac).filter(Number.isFinite);
    const bins = { '<25%': 0, '25-50%': 0, '50-75%': 0, '75-100%': 0, '≥100% (TP)': 0 };
    for (const c of wins) {
        if (c < 0.25) bins['<25%']++; else if (c < 0.5) bins['25-50%']++;
        else if (c < 0.75) bins['50-75%']++; else if (c < 1.0) bins['75-100%']++; else bins['≥100% (TP)']++;
    }
    const medianCap = wins.length ? wins.slice().sort((a, b) => a - b)[Math.floor(wins.length / 2)] : NaN;
    console.log(`   ${wins.length} lệnh thắng | median capturedFrac = ${f(medianCap * 100, 0)}% tới TP`);
    for (const [k, v] of Object.entries(bins)) console.log(`     ${k.padEnd(12)}: ${v} lệnh (${f(v / wins.length * 100, 0)}%)`);

    // 4) Loser: đi ngược nhanh? (capturedFrac âm — ăn ngược về phía SL)
    console.log('\n━━━━━━ 4) LOSER (capturedFrac âm = đã đi ngược bao xa về SL) ━━━━━━');
    const losers = trades.filter(t => t.pnlPercent <= 0).map(capturedFrac).filter(Number.isFinite);
    const lb = { 'gần hòa (>-25%)': 0, '-25..-50%': 0, '-50..-75%': 0, '≤-75% (SL)': 0 };
    for (const c of losers) {
        if (c > -0.25) lb['gần hòa (>-25%)']++; else if (c > -0.5) lb['-25..-50%']++;
        else if (c > -0.75) lb['-50..-75%']++; else lb['≤-75% (SL)']++;
    }
    for (const [k, v] of Object.entries(lb)) console.log(`     ${k.padEnd(16)}: ${v} lệnh (${f(v / losers.length * 100, 0)}%)`);

    // 5) ATR% (volatility) suy ra — TP/SL có hợp lý với biến động không
    console.log('\n━━━━━━ 5) ATR% suy ra (crypto) & R:R thực ━━━━━━');
    const crypto = trades.filter(t => t.assetType === 'CRYPTO');
    const atrs = crypto.map(inferAtrPct).filter(Number.isFinite).sort((a, b) => a - b);
    if (atrs.length) {
        const med = atrs[Math.floor(atrs.length / 2)];
        console.log(`   ATR% median ≈ ${f(med)}% → TP cũ = 4×ATR ≈ ${f(med * 4)}% xa | SL = 2×ATR ≈ ${f(med * 2)}% | R:R 2:1`);
        console.log(`   (đối chiếu: avgWin thực chỉ ~1.3% → winner ăn chưa tới 1×ATR rồi quay đầu)`);
    }

    console.log('\n━━━━━━ 6) qualityScore (signalBreakdown) ━━━━━━');
    const withQ = trades.filter(t => Number(t.signalBreakdown?.qualityScore) > 0);
    if (withQ.length) {
        const buckets = { '<72': [], '72-81': [], '>=82': [] };
        for (const t of withQ) {
            const q = t.signalBreakdown.qualityScore;
            if (q < 72) buckets['<72'].push(t);
            else if (q < 82) buckets['72-81'].push(t);
            else buckets['>=82'].push(t);
        }
        for (const [k, list] of Object.entries(buckets)) {
            if (!list.length) { console.log(`   ${k}: 0`); continue; }
            const w = list.filter(t => t.pnlPercent > 0).length;
            console.log(`   ${k}: ${list.length} lệnh | WR ${f(w / list.length * 100, 0)}% | PnL ${f(list.reduce((s, t) => s + t.pnlPercent, 0))}%`);
        }
    } else {
        console.log('   Chưa có lệnh với qualityScore (chờ engine mới chạy thêm).');
    }

    await mongoose.disconnect();
    console.log('\n✓ Done (read-only).');
};
run().catch(e => { console.error('ERR:', e.message); process.exit(1); });
