// READ-ONLY — soi chi tiết lệnh đóng gần đây, suy ra KIỂU THOÁT để biết
// winner có bị cắt cụt (scratched) không. Dùng: node scripts/diag_trades_detail.mjs [hours]
import 'dotenv/config';
import mongoose from 'mongoose';
import AutoTrade from '../models/AutoTrade.js';

const hours = Number(process.argv[2]) || 30;
const f = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : 'N/A');

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const cutoff = new Date(Date.now() - hours * 3600_000);
    const trades = await AutoTrade.find({ status: 'CLOSED', openedAt: { $gte: cutoff } })
        .sort({ openedAt: 1 }).lean();
    console.log(`✓ DB=${mongoose.connection.name} | ${trades.length} lệnh đóng (vào lệnh trong ${hours}h qua)\n`);
    if (!trades.length) { await mongoose.disconnect(); return; }

    const inferExit = (t) => {
        const isLong = t.direction === 'LONG' || t.direction === 'MUA';
        const tp = t.takeProfitPrice, ex = t.exitPrice, entry = t.entryPrice;
        const origSL = t.signalBreakdown?.originalSL ?? t.stopLossPrice;
        if (!Number.isFinite(ex)) return 'NO_EXIT_PRICE';
        if (isLong) {
            if (ex >= tp * 0.999) return 'TP_HIT';
            if (ex <= origSL * 1.001) return 'SL_ORIG';
            if (ex <= t.stopLossPrice * 1.002) return 'TRAIL_SL';   // SL đã dời lên
            return 'REVERSAL/TIMEOUT';
        } else {
            if (ex <= tp * 1.001) return 'TP_HIT';
            if (ex >= origSL * 0.999) return 'SL_ORIG';
            if (ex >= t.stopLossPrice * 0.998) return 'TRAIL_SL';
            return 'REVERSAL/TIMEOUT';
        }
    };
    const capturedFrac = (t) => {
        const isLong = t.direction === 'LONG' || t.direction === 'MUA';
        const reward = isLong ? (t.takeProfitPrice - t.entryPrice) : (t.entryPrice - t.takeProfitPrice);
        if (reward <= 0) return NaN;
        const move = isLong ? (t.exitPrice - t.entryPrice) : (t.entryPrice - t.exitPrice);
        return move / reward;
    };

    // Bảng kê
    console.log('SYMBOL       SETUP            HOLD   PnL%     EXIT TYPE         %TP captured');
    for (const t of trades) {
        const holdH = (new Date(t.closedAt) - new Date(t.openedAt)) / 3600_000;
        const setup = t.signalBreakdown?.entrySetup || '(cũ)';
        console.log(
            `${(t.symbol || '').padEnd(12)} ${setup.padEnd(16)} ${f(holdH, 1).padStart(5)}h ${(t.pnlPercent >= 0 ? '+' : '') + f(t.pnlPercent)}%`.padEnd(52)
            + `${inferExit(t).padEnd(17)} ${f(capturedFrac(t) * 100, 0)}%`
        );
    }

    // Tổng hợp theo kiểu thoát
    const byExit = {};
    for (const t of trades) {
        const k = inferExit(t);
        (byExit[k] ||= []).push(t);
    }
    console.log('\n── Tổng hợp theo KIỂU THOÁT ──');
    for (const [k, list] of Object.entries(byExit)) {
        const w = list.filter(t => t.pnlPercent > 0).length;
        const avg = list.reduce((s, t) => s + t.pnlPercent, 0) / list.length;
        console.log(`  ${k.padEnd(18)}: ${list.length} lệnh | WR ${f(w / list.length * 100, 0)}% | avgPnL ${f(avg)}%`);
    }

    // Winner bị cắt cụt: lệnh THẮNG nhưng chỉ ăn < 40% quãng đường tới TP
    const wins = trades.filter(t => t.pnlPercent > 0);
    const scratched = wins.filter(t => capturedFrac(t) < 0.4);
    console.log(`\n── Winner bị cắt cụt (ăn <40% tới TP): ${scratched.length}/${wins.length} lệnh thắng`);
    console.log(`── Lệnh thoát kiểu REVERSAL/TIMEOUT mà ĐANG hoặc SẼ có lãi nếu giữ: xem cột %TP captured ở trên`);

    await mongoose.disconnect();
    console.log('\n✓ Done (read-only).');
};
run().catch(e => { console.error('ERR:', e.message); process.exit(1); });
