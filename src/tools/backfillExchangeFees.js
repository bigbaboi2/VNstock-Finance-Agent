/**
 * Backfill ExchangeOrder.feeUSDT + recompute CLOSED LIVE PnL.
 * Usage: node src/tools/backfillExchangeFees.js [--apply] [--fees-only]
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import chalk from 'chalk';
import ExchangeOrder from '../../models/ExchangeOrder.js';
import AutoTrade from '../../models/AutoTrade.js';
import { extractFeeFromOrderResult } from '../services/brokerFeeService.js';
import { computeLivePnlFromExchangeOrders } from '../services/livePnlService.js';
import { getUsdVndRate } from '../services/autoTradeEngine.js';

const APPLY = process.argv.includes('--apply');
const FEES_ONLY = process.argv.includes('--fees-only');
const paleYellow = chalk.hex('#E8D48B');

const resolveNotional = (o) => {
    const fromFill = (Number(o.filledPrice) || 0) * (Number(o.filledQuantity) || 0);
    if (fromFill > 0) return fromFill;
    if (Number(o.notionalUSDT) > 0) return Number(o.notionalUSDT);
    const qty = Number(o.quantity) || 0;
    const px = Number(o.price) || Number(o.filledPrice) || 0;
    return qty > 0 && px > 0 ? qty * px : 0;
};

const main = async () => {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/omniduck';
    await mongoose.connect(uri);
    console.log(paleYellow(`[backfillFee] apply=${APPLY} feesOnly=${FEES_ONLY}`));

    const missing = await ExchangeOrder.find({
        status: { $in: ['FILLED', 'PARTIAL'] },
        $or: [
            { feeUSDT: { $exists: false } },
            { feeUSDT: null },
            { feeUSDT: { $lte: 0 } },
        ],
    });

    let updated = 0;
    let skipped = 0;

    for (const o of missing) {
        const notional = resolveNotional(o);
        const fee = extractFeeFromOrderResult({
            exchangeName: o.exchangeName,
            marketType: o.marketType || 'SPOT',
            rawResponse: o.rawResponse,
            filledPrice: o.filledPrice,
            filledQuantity: o.filledQuantity,
            symbol: o.symbol,
            notionalUSDT: notional,
        });

        if (!(Number(fee?.feeUSDT) > 0)) {
            skipped += 1;
            if (!APPLY) {
                console.log(`  SKIP ${o.symbol} ${o.externalOrderId || o._id}: notional=${notional}`);
            }
            continue;
        }

        console.log(
            `  FEE ${o.symbol} ${o.purpose} ${o.externalOrderId || o._id}: `
            + `0 → ${fee.feeUSDT} USDT (${fee.feeSource})`
        );
        if (APPLY) {
            o.feeUSDT = fee.feeUSDT;
            o.feeAsset = fee.feeAsset || 'USDT';
            o.feeSource = fee.feeSource || 'SCHEDULE_FALLBACK';
            if (!(Number(o.notionalUSDT) > 0) && notional > 0) {
                o.notionalUSDT = Math.round(notional * 1e8) / 1e8;
            }
            await o.save();
        }
        updated += 1;
    }

    console.log(paleYellow(`[backfillFee] orders: wouldUpdate/updated=${updated} skipped=${skipped} totalMissing=${missing.length}`));

    if (FEES_ONLY) {
        await mongoose.disconnect();
        return;
    }

    const rate = await getUsdVndRate().catch(() => 25400);
    const liveClosed = await AutoTrade.find({ status: 'CLOSED', executionMode: 'LIVE' });
    let toNet = 0;
    let unchanged = 0;

    for (const t of liveClosed) {
        const fill = await computeLivePnlFromExchangeOrders(t, rate, { quietFeeWarn: true });
        if (!fill.eligible) {
            unchanged += 1;
            continue;
        }
        const nextSource = fill.source;
        const changed =
            Number(t.pnl) !== Number(fill.pnlVND)
            || Number(t.pnlPercent) !== Number(fill.pnlPercent)
            || t.pnlSource !== nextSource;

        if (!changed) {
            unchanged += 1;
            continue;
        }

        console.log(
            `  PnL ${t.symbol} ${t._id}: ${t.pnlSource || '?'} ${t.pnlPercent}% `
            + `→ ${nextSource} ${fill.pnlPercent}% (fee=${fill.feeUSDT})`
        );
        if (APPLY) {
            t.pnl = fill.pnlVND;
            t.pnlPercent = fill.pnlPercent;
            t.pnlSource = nextSource;
            await t.save();
        }
        if (nextSource === 'LIVE_FILLS_NET_FEE') toNet += 1;
    }

    console.log(paleYellow(
        `[backfillFee] trades: netFeeUpdates=${toNet} unchangedOrIneligible=${unchanged} apply=${APPLY}`
    ));
    await mongoose.disconnect();
};

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
