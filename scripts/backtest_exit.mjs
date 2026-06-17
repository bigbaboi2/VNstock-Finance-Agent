// READ-ONLY BACKTEST — giữ NGUYÊN tập entry đã vào (crypto), fetch klines 15m THẬT
// từ Binance quanh thời điểm vào lệnh, tính lại ATR thật, rồi mô phỏng nhiều CHÍNH SÁCH
// THOÁT khác nhau (TP/SL/trailing/maxHold) để tìm bộ tối ưu hóa expectancy.
//
// Mục tiêu trả lời: "với cùng các entry này, exit policy nào cho expectancy cao nhất?"
// Vì data cho thấy entry LIVE đã tốt (WR 62%), vấn đề nằm ở EXIT cắt cụt winner.
//
// Dùng:
//   node scripts/backtest_exit.mjs                 → 150 lệnh crypto gần nhất
//   node scripts/backtest_exit.mjs --since 2026-06-12
//   node scripts/backtest_exit.mjs --limit 250 --minscore 80
import 'dotenv/config';
import mongoose from 'mongoose';
import axios from 'axios';
import AutoTrade from '../models/AutoTrade.js';

const argv = process.argv.slice(2);
const getArg = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const sinceArg = getArg('--since');
const LIMIT = Number(getArg('--limit', 150));
const MINSCORE = Number(getArg('--minscore', 0));
const FEE = 0.2; // round-trip taker fee %  (crypto)
const f = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : 'N/A');

// ── Fetch klines 15m: [startMs, endMs] ──
const fetchKlines = async (symbol, startMs, endMs) => {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&startTime=${startMs}&endTime=${endMs}&limit=1000`;
    const res = await axios.get(url, { timeout: 12000 });
    return res.data.map(k => ({
        t: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4],
    }));
};

const calcATR = (candles, idx, period = 14) => {
    if (idx < period) return NaN;
    let sum = 0;
    for (let i = idx - period + 1; i <= idx; i++) {
        const c = candles[i], p = candles[i - 1];
        sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    }
    return sum / period;
};

// ── Mô phỏng 1 lệnh theo 1 policy. Trả về pnl% ròng (đã trừ phí). ──
// candles: từ entryIdx trở đi. entry: giá vào thật. atr: ATR tại entry.
// policy: { tpMult, slMult, maxHoldH, trail, k, beAtR, beLockR, partial }
const simulate = (candles, entryIdx, entry, atr, isLong, policy) => {
    const dir = isLong ? 1 : -1;
    const tp = entry + dir * policy.tpMult * atr;
    let sl = entry - dir * policy.slMult * atr;
    let peak = entry; // giá thuận lợi nhất đạt được
    const maxBars = Math.round(policy.maxHoldH * 4); // 4 nến 15m / giờ
    const R = policy.slMult * atr; // 1R theo khoảng cách SL

    // partial scale-out: chốt `frac` ở tp1, phần còn lại (1-frac) theo trailing/tp2
    const frac = policy.partial?.frac ?? 0.5;
    const tp1 = policy.partial ? entry + dir * policy.partial.tp1Mult * atr : null;
    let part1Done = false, lockedPnl = 0;
    const remWeight = policy.partial ? 1 - frac : 1;
    // PnL ròng khi đóng phần còn lại tại giá p (mỗi phần gánh round-trip FEE đầy đủ theo tỷ trọng):
    const exitRemAt = (p) => lockedPnl + remWeight * (dir * (p - entry) / entry * 100 - FEE);

    const recomputeTrail = () => {
        if (policy.trail === 'chandelier') {
            const cand = peak - dir * policy.k * atr;
            if (isLong ? cand > sl : cand < sl) sl = cand;
        } else if (policy.trail === 'be') {
            const trig = entry + dir * policy.beAtR * R;
            if (isLong ? peak >= trig : peak <= trig) {
                const be = entry + dir * policy.beLockR * R;
                if (isLong ? be > sl : be < sl) sl = be;
            }
        } else if (policy.trail === 'be_then_chandelier') {
            const trig = entry + dir * policy.beAtR * R;
            if (isLong ? peak >= trig : peak <= trig) {
                const be = entry + dir * policy.beLockR * R;
                if (isLong ? be > sl : be < sl) sl = be;
                const cand = peak - dir * policy.k * atr;
                if (isLong ? cand > sl : cand < sl) sl = cand;
            }
        } else if (policy.trail === 'pctreward') {
            const reward = Math.abs(tp - entry);
            const progress = Math.abs(peak - entry) / reward;
            if (progress >= policy.activation) {
                const lock = Math.max(0, progress - policy.lockGap);
                const cand = entry + dir * reward * lock;
                if (isLong ? cand > sl : cand < sl) sl = cand;
            }
        }
    };

    const end = Math.min(candles.length - 1, entryIdx + maxBars);
    for (let i = entryIdx + 1; i <= end; i++) {
        const c = candles[i];
        // 1) check SL bằng giá bất lợi (pessimistic: SL trước TP nếu cùng nến)
        const adverse = isLong ? c.low : c.high;
        if (isLong ? adverse <= sl : adverse >= sl) return exitRemAt(sl);
        // 2) check TP1 (partial) rồi TP2/TP
        const favor = isLong ? c.high : c.low;
        if (policy.partial && !part1Done && (isLong ? favor >= tp1 : favor <= tp1)) {
            lockedPnl = frac * (dir * (tp1 - entry) / entry * 100 - FEE); // chốt `frac` vị thế
            part1Done = true;
            const be = entry; // sau TP1: dời SL phần còn lại về breakeven
            if (isLong ? be > sl : be < sl) sl = be;
        }
        if (isLong ? favor >= tp : favor <= tp) return exitRemAt(tp);
        // 3) cập nhật peak + trailing cho nến kế (không lookahead)
        if (isLong) peak = Math.max(peak, c.high); else peak = Math.min(peak, c.low);
        recomputeTrail();
    }
    return exitRemAt(candles[end].close); // hết hold → đóng tại close cuối
};

const summarize = (label, pnls) => {
    const valid = pnls.filter(Number.isFinite);
    if (!valid.length) { console.log(`   ${label.padEnd(34)} | (no data)`); return null; }
    const wins = valid.filter(p => p > 0);
    const losses = valid.filter(p => p <= 0);
    const wr = wins.length / valid.length;
    const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
    const exp = valid.reduce((a, b) => a + b, 0) / valid.length;
    const total = valid.reduce((a, b) => a + b, 0);
    console.log(`   ${label.padEnd(34)} | WR ${f(wr * 100, 1).padStart(5)}% | aW +${f(avgWin)} aL ${f(avgLoss)} | Exp ${f(exp).padStart(6)}%/lệnh | Σ ${f(total, 1).padStart(7)}%`);
    return { label, wr, avgWin, avgLoss, exp, total, n: valid.length };
};

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ DB =', mongoose.connection.name);

    const q = { status: 'CLOSED', assetType: 'CRYPTO' };
    if (sinceArg) q.openedAt = { $gte: new Date(sinceArg) };
    if (MINSCORE) q.aiScore = { $gte: MINSCORE };
    const trades = await AutoTrade.find(q).sort({ openedAt: -1 }).limit(LIMIT).lean();
    console.log(`\nBacktest ${trades.length} lệnh crypto${sinceArg ? ` (từ ${sinceArg})` : ''}${MINSCORE ? ` score≥${MINSCORE}` : ''} | fee round-trip ${FEE}%\n`);

    // Định nghĩa các policy so sánh
    const policies = {
        'P0 baseline TP4/SL2 %reward h18':       { tpMult: 4, slMult: 2, maxHoldH: 18, trail: 'pctreward', activation: 0.40, lockGap: 0.35 },
        'A partial f.5 1.5/3 chand3 SL1.5 h24':  { tpMult: 3, slMult: 1.5, maxHoldH: 24, trail: 'chandelier', k: 3, partial: { tp1Mult: 1.5, frac: 0.5 } },
        'B partial f.5 1.2/3 chand2.5 SL1.5 h24':{ tpMult: 3, slMult: 1.5, maxHoldH: 24, trail: 'chandelier', k: 2.5, partial: { tp1Mult: 1.2, frac: 0.5 } },
        'C partial f.6 1.2/3 chand3 SL1.5 h24':  { tpMult: 3, slMult: 1.5, maxHoldH: 24, trail: 'chandelier', k: 3, partial: { tp1Mult: 1.2, frac: 0.6 } },
        'D partial f.5 1.5/4 chand3.5 SL1.5 h36':{ tpMult: 4, slMult: 1.5, maxHoldH: 36, trail: 'chandelier', k: 3.5, partial: { tp1Mult: 1.5, frac: 0.5 } },
        'E partial f.6 1.5/3 chand3 SL2 h24':    { tpMult: 3, slMult: 2, maxHoldH: 24, trail: 'chandelier', k: 3, partial: { tp1Mult: 1.5, frac: 0.6 } },
        'F partial f.5 1.0/2.5 chand2.5 SL1.5 h24':{ tpMult: 2.5, slMult: 1.5, maxHoldH: 24, trail: 'chandelier', k: 2.5, partial: { tp1Mult: 1.0, frac: 0.5 } },
        'G partial f.4 1.5/3.5 chand3 SL1.5 h36':{ tpMult: 3.5, slMult: 1.5, maxHoldH: 36, trail: 'chandelier', k: 3, partial: { tp1Mult: 1.5, frac: 0.4 } },
        'H partial f.5 1.2/3.5 chand3 SL1.5 h36':{ tpMult: 3.5, slMult: 1.5, maxHoldH: 36, trail: 'chandelier', k: 3, partial: { tp1Mult: 1.2, frac: 0.5 } },
        'I partial f.6 1.0/3 chand2.5 SL1.5 h24':{ tpMult: 3, slMult: 1.5, maxHoldH: 24, trail: 'chandelier', k: 2.5, partial: { tp1Mult: 1.0, frac: 0.6 } },
    };
    const results = {};
    for (const k of Object.keys(policies)) results[k] = [];
    let processed = 0, skipped = 0;

    for (const t of trades) {
        const isLong = t.direction === 'LONG' || t.direction === 'MUA';
        const openMs = new Date(t.openedAt).getTime();
        const startMs = openMs - 40 * 15 * 60_000;       // 40 nến warmup để tính ATR
        const endMs = openMs + 50 * 3600_000;            // +50h forward (đủ cho maxHold 48h)
        let candles;
        try {
            candles = await fetchKlines(t.symbol, startMs, endMs);
        } catch (e) {
            skipped++; continue;
        }
        if (!candles || candles.length < 50) { skipped++; continue; }

        // tìm nến entry: nến đầu có t >= openMs
        let entryIdx = candles.findIndex(c => c.t >= openMs);
        if (entryIdx < 20) entryIdx = 20; // cần đủ warmup
        if (entryIdx >= candles.length - 5) { skipped++; continue; }

        const atr = calcATR(candles, entryIdx, 14);
        if (!Number.isFinite(atr) || atr <= 0) { skipped++; continue; }

        const entry = t.entryPrice; // giá vào THẬT từ DB

        for (const [name, pol] of Object.entries(policies)) {
            results[name].push(simulate(candles, entryIdx, entry, atr, isLong, pol));
        }
        processed++;
        if (processed % 25 === 0) console.log(`   ...đã xử lý ${processed} lệnh`);
    }

    console.log(`\n✓ Xử lý ${processed} lệnh (skip ${skipped} do thiếu klines)\n`);
    console.log('════════════════ KẾT QUẢ SO SÁNH CHÍNH SÁCH THOÁT ════════════════');
    const summary = [];
    for (const [name] of Object.entries(policies)) {
        const s = summarize(name, results[name]);
        if (s) summary.push(s);
    }
    summary.sort((a, b) => b.exp - a.exp);
    console.log('\n──────── XẾP HẠNG THEO EXPECTANCY ────────');
    summary.forEach((s, i) => console.log(`   #${i + 1}  ${s.label.padEnd(34)} Exp ${f(s.exp).padStart(6)}%/lệnh | WR ${f(s.wr * 100, 1)}% | Σ ${f(s.total, 1)}%`));
    const best = summary[0], base = summary.find(s => s.label.startsWith('P0'));
    if (best && base) {
        console.log(`\n   🏆 ${best.label}`);
        console.log(`   Cải thiện vs baseline P0: Exp ${f(base.exp)}% → ${f(best.exp)}%/lệnh (Δ ${f(best.exp - base.exp, 2)}%), tổng ${f(base.total, 1)}% → ${f(best.total, 1)}%`);
    }

    await mongoose.disconnect();
    console.log('\n✓ Done (read-only).');
};
run().catch(e => { console.error('ERR:', e.message); process.exit(1); });
