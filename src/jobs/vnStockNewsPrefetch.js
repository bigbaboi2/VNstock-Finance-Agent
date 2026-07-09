/**
 * VN stock news prefetch — lightweight headlines for AutoDuck universe + tab cache.
 *
 * Env:
 *   VN_NEWS_PREFETCH_ENABLED=true
 *   VN_NEWS_CACHE_TTL_SESSION_MS=3600000   (1h in session)
 *   VN_NEWS_CACHE_TTL_OFF_MS=21600000      (6h off session)
 *   VN_NEWS_PREFETCH_MAX_PER_RUN=10
 *   VN_NEWS_PREFETCH_CONCURRENCY=2
 *   VN_NEWS_PREFETCH_DELAY_MS=4000
 *   VN_NEWS_PREFETCH_UNIVERSE_LIMIT=60
 */
import cron from 'node-cron';
import chalk from 'chalk';
import Stock from '../../models/Stock.js';
import {
    buildVnStockScanUniverse,
    getVnMarketContext,
} from '../services/tradeContextService.js';
import {
    isPrefetchNewsFresh,
    prefetchVnStockNews,
} from '../services/vnStockNewsService.js';

const ENABLED = process.env.VN_NEWS_PREFETCH_ENABLED !== 'false';
const MAX_PER_RUN = Number(process.env.VN_NEWS_PREFETCH_MAX_PER_RUN) || 10;
const CONCURRENCY = Number(process.env.VN_NEWS_PREFETCH_CONCURRENCY) || 2;
const DELAY_MS = Number(process.env.VN_NEWS_PREFETCH_DELAY_MS) || 4000;
const UNIVERSE_LIMIT = Number(process.env.VN_NEWS_PREFETCH_UNIVERSE_LIMIT) || 60;

let running = false;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const chunkArray = (arr, size) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
};

export const prefetchStaleSymbols = async () => {
    if (!ENABLED) return { skipped: true, reason: 'disabled' };
    if (running) return { skipped: true, reason: 'already_running' };

    running = true;
    const stats = { fetched: 0, skipped: 0, failed: 0, symbols: [] };

    try {
        const marketContext = await getVnMarketContext().catch(() => ({}));
        const universe = await buildVnStockScanUniverse(marketContext, UNIVERSE_LIMIT);

        const records = await Stock.find(
            { symbol: { $in: universe } },
            { symbol: 1, deepNewsData: 1, deepNewsPrefetchedAt: 1, deepNewsFetchedAt: 1 }
        ).lean();
        const recordBySymbol = new Map(records.map(r => [r.symbol, r]));

        const staleSymbols = universe.filter(sym => {
            const rec = recordBySymbol.get(sym);
            if (!rec) return true;
            return !isPrefetchNewsFresh(rec);
        });

        const toProcess = staleSymbols.slice(0, MAX_PER_RUN);
        const deferred = Math.max(0, staleSymbols.length - toProcess.length);
        stats.skipped = universe.length - staleSymbols.length;

        if (toProcess.length === 0) {
            console.log(chalk.gray(`[VN NEWS PREFETCH] Universe ${universe.length} mã — tất cả còn fresh.`));
            return stats;
        }

        console.log(chalk.gray(
            `[VN NEWS PREFETCH] ${toProcess.length}/${staleSymbols.length} mã stale (universe ${universe.length})...`
        ));

        for (const batch of chunkArray(toProcess, CONCURRENCY)) {
            const results = await Promise.all(batch.map(sym => prefetchVnStockNews(sym)));
            for (const r of results) {
                if (r.ok) {
                    stats.fetched++;
                    stats.symbols.push(r.symbol);
                } else {
                    stats.failed++;
                }
            }
            if (DELAY_MS > 0) await sleep(DELAY_MS);
        }

        console.log(chalk.green(
            `[VN NEWS PREFETCH] Xong: fetched=${stats.fetched} failed=${stats.failed} fresh=${stats.skipped} deferred=${deferred}`
        ));
        return stats;
    } catch (err) {
        console.error(chalk.red(`[VN NEWS PREFETCH] Lỗi: ${err.message}`));
        return { ...stats, error: err.message };
    } finally {
        running = false;
    }
};

export const startVnStockNewsPrefetch = () => {
    if (!ENABLED) {
        console.log(chalk.gray('[VN NEWS PREFETCH] Tắt (VN_NEWS_PREFETCH_ENABLED=false).'));
        return;
    }

    prefetchStaleSymbols().catch(err =>
        console.error(chalk.red('[VN NEWS PREFETCH] Lỗi boot:'), err.message)
    );

    // Weekdays: every 30 minutes
    cron.schedule('*/30 * * * 1-5', () => {
        prefetchStaleSymbols().catch(err =>
            console.error(chalk.red('[VN NEWS PREFETCH] Lỗi cron 30p:'), err.message)
        );
    });

    // Weekends: every 6 hours
    cron.schedule('0 */6 * * 0,6', () => {
        prefetchStaleSymbols().catch(err =>
            console.error(chalk.red('[VN NEWS PREFETCH] Lỗi cron 6h:'), err.message)
        );
    });

    console.log(chalk.gray('[VN NEWS PREFETCH] Cron: 30p (T2–T6) · 6h (CN/T7).'));
};
