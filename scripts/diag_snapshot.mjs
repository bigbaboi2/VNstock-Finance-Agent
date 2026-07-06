// READ-ONLY — snapshot nhanh sau deploy gate / fix stoch
import 'dotenv/config';
import mongoose from 'mongoose';
import AutoTrade from '../models/AutoTrade.js';
import UserOrder from '../models/UserOrder.js';
import ExchangeOrder from '../models/ExchangeOrder.js';

const f = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : 'N/A');
const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
const since6h = new Date(Date.now() - 6 * 60 * 60 * 1000);

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, family: 4 });
    console.log('✓ DB =', mongoose.connection.name, '\n');

    const [totalClosed, closed24h, openTrades, pendingLive, exchangeFailed] = await Promise.all([
        AutoTrade.countDocuments({ status: 'CLOSED' }),
        AutoTrade.find({ status: 'CLOSED', closedAt: { $gte: since24h } }).lean(),
        AutoTrade.find({ status: { $in: ['OPEN', 'PENDING'] } }).lean(),
        UserOrder.find({
            executionMode: 'LIVE',
            status: { $in: ['PENDING', 'ACTIVE'] },
        }).lean(),
        ExchangeOrder.find({ status: 'FAILED', createdAt: { $gte: since24h } }).sort({ createdAt: -1 }).limit(20).lean(),
    ]);

    console.log('━━ TỔNG QUAN ━━');
    console.log(`CLOSED all-time: ${totalClosed}`);
    console.log(`CLOSED 24h: ${closed24h.length}`);
    console.log(`OPEN/PENDING: ${openTrades.length}`);

    const unmatchedMsgs = await UserOrder.find({
        'result.message': { $regex: /UNMATCHED|TESTNET SKIP|TESTNET GATE/i },
        updatedAt: { $gte: since24h },
    }).select('username status result.message updatedAt executionMode').lean();

    console.log(`\n━━ UserOrder UNMATCHED/TESTNET (24h): ${unmatchedMsgs.length} ━━`);
    for (const o of unmatchedMsgs.slice(0, 15)) {
        const msg = (o.result?.message || '').slice(0, 120);
        console.log(`  ${o.username} | ${o.status} | ${msg}`);
    }

    console.log(`\n━━ Gói LIVE đang chờ: ${pendingLive.length} ━━`);
    for (const o of pendingLive) {
        console.log(`  ${o.username} | ${o.status} | ${o.assetType} | conn=${o.exchangeConnectionId || 'N/A'}`);
    }

    const recentOpen = await AutoTrade.find({ openedAt: { $gte: since6h } })
        .sort({ openedAt: -1 }).limit(15).lean();
    console.log(`\n━━ Lệnh mở 6h gần nhất: ${recentOpen.length} ━━`);
    for (const t of recentOpen) {
        const q = t.signalBreakdown?.qualityScore ?? '—';
        console.log(`  ${t.symbol} ${t.direction} ${t.executionMode || 'SIM'} score=${t.aiScore} q=${q} ${t.status} ${t.openedAt?.toISOString?.()?.slice(0, 16) || ''}`);
    }

    const withQuality = await AutoTrade.countDocuments({ 'signalBreakdown.qualityScore': { $gt: 0 } });
    console.log(`\n━━ qualityScore trên AutoTrade: ${withQuality} lệnh ━━`);

    const invalidSymbol = exchangeFailed.filter(e => /INVALID_SYMBOL|TESTNET/i.test(e.errorMessage || ''));
    console.log(`\n━━ ExchangeOrder FAILED 24h: ${exchangeFailed.length} (symbol/testnet: ${invalidSymbol.length}) ━━`);
    for (const e of invalidSymbol.slice(0, 8)) {
        console.log(`  ${e.symbol} | ${(e.errorMessage || '').slice(0, 100)}`);
    }

    if (closed24h.length) {
        const wins = closed24h.filter(t => t.pnlPercent > 0);
        console.log(`\n━━ CLOSED 24h WR: ${f(wins.length / closed24h.length * 100, 1)}% (${wins.length}W/${closed24h.length - wins.length}L) ━━`);
    }

    await mongoose.disconnect();
    console.log('\n✓ Done.');
};
run().catch(e => { console.error('ERR:', e.message); process.exit(1); });
