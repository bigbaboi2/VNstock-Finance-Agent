// UNIT TEST (không cần DB/network) — kiểm chứng logic Policy E: evaluateExitDecision
// + công thức PnL partial. Dùng: node scripts/test_exit_policy.mjs
import { evaluateExitDecision } from '../src/services/autoTradeEngine.js';

let pass = 0, fail = 0;
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
};

// base CRYPTO long: entry 100, ATR 1 → TP1 101.5, TP2 103, SL 98, frac 0.6, chandK 3
const baseLong = () => ({
    direction: 'LONG', assetType: 'CRYPTO',
    entryPrice: 100, entryAtr: 1,
    takeProfit1Price: 101.5, takeProfitPrice: 103, stopLossPrice: 98,
    tp1Fraction: 0.6, tp1Filled: false, peakPrice: 100,
});

console.log('A) Chạm TP1 → partial (không đóng hẳn)');
{
    const t = baseLong();
    const d = evaluateExitDecision(t, 101.6);
    check('partialFill = true', d.partialFill === true);
    check('shouldClose = false', d.shouldClose === false);
    check('reason chứa TP1 PARTIAL', /TP1 PARTIAL/.test(d.exitReason), d.exitReason);
}

console.log('B) Sau TP1, chạm TP2 → đóng hẳn (TP HIT)');
{
    const t = baseLong(); t.tp1Filled = true; t.stopLossPrice = 100; t.peakPrice = 102;
    const d = evaluateExitDecision(t, 103.2);
    check('shouldClose = true', d.shouldClose === true);
    check('reason chứa TP HIT', /TP HIT/.test(d.exitReason), d.exitReason);
}

console.log('C) Sau TP1: sàn breakeven giữ SL không dưới giá vào');
{
    const t = baseLong(); t.tp1Filled = true; t.stopLossPrice = 100; t.peakPrice = 101; // chand=101-3=98 < entry → floor 100
    const d = evaluateExitDecision(t, 99.9);
    check('SL được nâng/giữ = breakeven 100', approx(t.stopLossPrice, 100), `SL=${t.stopLossPrice}`);
    check('shouldClose = true (chạm BE)', d.shouldClose === true);
    check('reason chứa TRAIL/BE HIT', /TRAIL\/BE HIT/.test(d.exitReason), d.exitReason);
}

console.log('D) Runner: chandelier khoá lời, chỉ dời theo hướng lợi');
{
    const t = baseLong(); t.takeProfitPrice = 110; t.tp1Filled = true; t.stopLossPrice = 100; t.peakPrice = 106;
    const d1 = evaluateExitDecision(t, 105); // peak 106 → candSL 103 > 100 → SL=103, chưa đóng
    check('SL dời lên 103', approx(t.stopLossPrice, 103), `SL=${t.stopLossPrice}`);
    check('chưa đóng ở 105', d1.shouldClose === false);
    const d2 = evaluateExitDecision(t, 102.9); // < 103 → chạm trailing
    check('đóng khi rớt dưới SL trail', d2.shouldClose === true);
}

console.log('E) Pre-TP1 chạm SL gốc → SL HIT (không phải TRAIL)');
{
    const t = baseLong();
    const d = evaluateExitDecision(t, 97.9);
    check('shouldClose = true', d.shouldClose === true);
    check('reason chứa SL HIT (không TRAIL)', /SL HIT/.test(d.exitReason) && !/TRAIL/.test(d.exitReason), d.exitReason);
}

console.log('F) SHORT: chạm TP1 → partial');
{
    const t = { direction: 'SHORT', assetType: 'CRYPTO', entryPrice: 100, entryAtr: 1,
        takeProfit1Price: 98.5, takeProfitPrice: 97, stopLossPrice: 102, tp1Fraction: 0.6, tp1Filled: false, peakPrice: 100 };
    const d = evaluateExitDecision(t, 98.4);
    check('partialFill = true', d.partialFill === true);
    check('SL dời xuống (có lợi cho short) ≤ 102', t.stopLossPrice <= 102, `SL=${t.stopLossPrice}`);
}

console.log('G) Công thức PnL partial: 60% @ TP1(+1.5%) + 40% @ TP2(+3%), fee 0.2%');
{
    const fee = 0.2, frac = 0.6;
    const tp1PnlPct = 1.5 - fee;     // 1.3
    const leg2PnlPct = 3.0 - fee;    // 2.8
    const total = frac * tp1PnlPct + (1 - frac) * leg2PnlPct; // 0.78 + 1.12 = 1.9
    check('tổng pnl% = 1.90', approx(Math.round(total * 100) / 100, 1.90), `=${total}`);
    // So với all-in cũ giữ tới TP2 trừ phí: 3.0 - 0.2 = 2.8 nhưng WR thấp hơn nhiều.
    console.log(`     → partial khoá chắc ${total.toFixed(2)}% với xác suất đạt cao hơn (TP1 gần).`);
}

console.log(`\n${fail === 0 ? '✅ TẤT CẢ PASS' : '❌ CÓ TEST FAIL'} — ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
