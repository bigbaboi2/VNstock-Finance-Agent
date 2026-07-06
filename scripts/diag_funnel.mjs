// READ-ONLY dry-run — quét CRYPTO 1 vòng, không tạo lệnh / không broker.
//
//   node scripts/diag_funnel.mjs
import 'dotenv/config';
import mongoose from 'mongoose';
import { runAutoTradePipeline } from '../src/services/autoTradeEngine.js';
import {
    getLatestFunnel,
    formatFunnelLogLines,
} from '../src/services/tradeFunnelService.js';

const run = async () => {
    if (!process.env.MONGODB_URI) {
        console.error('Thiếu MONGODB_URI');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 15000,
        family: 4,
    });
    console.log('✓ Connected — dry-run CRYPTO funnel (không tạo lệnh)\n');

    const result = await runAutoTradePipeline('CRYPTO', { dryRun: true });
    if (result?.skipped) {
        console.log(`Pipeline skipped: ${result.reason}`);
    }

    const funnel = getLatestFunnel('CRYPTO');
    if (!funnel) {
        console.log('Không có funnel summary (có thể engine tắt hoặc 0 mã quét).');
    } else {
        console.log('\n════ FUNNEL SUMMARY ════');
        for (const line of formatFunnelLogLines(funnel)) {
            console.log(line);
        }
        if (funnel.topCandidates?.length) {
            console.log('\n── Top candidates (gần khớp LIVE) ──');
            funnel.topCandidates.slice(0, 5).forEach((c, i) => {
                console.log(`  #${i + 1} ${c.symbol} score=${c.score} setup=${c.setup || '-'} | ${c.fail || 'pass'}`);
            });
        }
    }

    await mongoose.disconnect();
    console.log('\n✓ Done (read-only).');
};

run().catch((e) => {
    console.error('ERR:', e.message);
    process.exit(1);
});
