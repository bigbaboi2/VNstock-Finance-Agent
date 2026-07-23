/**
 * Dry-run / apply: tách PnL LIVE official (fills) vs MARK_SIM cho AutoTrade + UserOrder PORTFOLIO.
 *
 * Usage (từ repo root, backend có .env):
 *   node src/tools/backfillLivePnl.js           # dry-run
 *   node src/tools/backfillLivePnl.js --apply   # ghi DB
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import AutoTrade from '../../models/AutoTrade.js';
import UserOrder from '../../models/UserOrder.js';
import { computeLivePnlFromExchangeOrders } from '../services/livePnlService.js';
import { getUsdVndRate } from '../services/autoTradeEngine.js';

const APPLY = process.argv.includes('--apply');

const main = async () => {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/omniduck';
    await mongoose.connect(uri);
    const rate = await getUsdVndRate();
    console.log(`[backfill] rate=${rate} apply=${APPLY}`);

    const liveClosed = await AutoTrade.find({ status: 'CLOSED', executionMode: 'LIVE' });
    let eligible = 0;
    let markOnly = 0;
    let unchanged = 0;

    for (const t of liveClosed) {
        const fill = await computeLivePnlFromExchangeOrders(t, rate);
        if (fill.eligible) {
            eligible += 1;
            const next = {
                pnl: fill.pnlVND,
                pnlPercent: fill.pnlPercent,
                pnlSource: fill.source,
            };
            if (!APPLY) {
                console.log(`  FILL ${t.symbol} ${t._id}: pnl ${t.pnl} → ${next.pnl} (${next.pnlPercent}%)`);
            } else {
                Object.assign(t, next);
                if (t.markSimPnl == null && t.pnl !== fill.pnlVND) {
                    // giữ số cũ làm mark nếu khác
                }
                await t.save();
            }
        } else {
            markOnly += 1;
            if (t.pnlSource === 'LIVE_FILLS' || t.pnlSource === 'LIVE_FILLS_NET_FEE' || !t.pnlSource) {
                if (!APPLY) {
                    console.log(`  MARK ${t.symbol} ${t._id}: was pnl=${t.pnl} → markSim, official 0`);
                } else {
                    t.markSimPnl = t.pnl;
                    t.markSimPnlPercent = t.pnlPercent;
                    t.markSimExitPrice = t.exitPrice;
                    t.pnl = 0;
                    t.pnlPercent = 0;
                    t.pnlSource = 'MARK_SIM';
                    await t.save();
                }
            } else {
                unchanged += 1;
            }
        }
    }

    const portfolios = await UserOrder.find({
        executionMode: 'LIVE',
        allocationMode: 'PORTFOLIO',
    });

    for (const order of portfolios) {
        const oldRealized = Number(order.realizedPnl) || 0;
        let newRealized = 0;
        const allocs = order.tradeAllocations || [];
        for (const a of allocs) {
            if (!a.closedAt || a.executionMode !== 'LIVE') continue;
            if (a.matchStatus === 'UNMATCHED') continue;
            const trade = await AutoTrade.findById(a.trade);
            if (!trade) continue;
            const fill = await computeLivePnlFromExchangeOrders(trade, rate);
            if (fill.eligible) {
                const pnl = Math.round((Number(a.amount) || 0) * (fill.pnlPercent / 100));
                newRealized += pnl;
                if (APPLY) {
                    a.pnl = pnl;
                    a.pnlPercent = fill.pnlPercent;
                }
            } else if (APPLY) {
                a.pnl = 0;
                a.pnlPercent = 0;
                a.matchMessage = `${a.matchMessage || ''} | pnlSource=UNVERIFIED`.trim();
            }
        }
        const capitalBase = Math.max(0, (Number(order.totalCapital) || 0) - oldRealized);
        const newTotal = capitalBase + newRealized;
        console.log(
            `  PKG ${order.username} ${order._id}: realized ${oldRealized} → ${newRealized}; totalCapital ${order.totalCapital} → ${newTotal}`
        );
        if (APPLY) {
            order.realizedPnl = newRealized;
            order.totalCapital = newTotal;
            await order.save();
        }
    }

    console.log(`[backfill] done eligible=${eligible} markOnly=${markOnly} unchanged=${unchanged}`);
    await mongoose.disconnect();
};

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
