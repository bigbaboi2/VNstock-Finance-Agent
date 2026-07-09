import chalk from 'chalk';
import Stock from '../../models/Stock.js';
import { searchVnNewsDirectly } from '../scrapers/vnNewsSearch.js';
import {
    isVNMarketOpen,
    isPreMarket,
    isATOPeriod,
    isATCPeriod,
} from './autoTradeEngine.js';

export const MAX_NEWS_DB = 80;
const MIN_VALID_NEWS = 3;

export const isVnTradingSession = () =>
    isPreMarket() || isVNMarketOpen() || isATOPeriod() || isATCPeriod();

export const getVnNewsCacheTtlMs = () => (
    isVnTradingSession()
        ? Number(process.env.VN_NEWS_CACHE_TTL_SESSION_MS) || 3_600_000
        : Number(process.env.VN_NEWS_CACHE_TTL_OFF_MS) || 21_600_000
);

export const isBadNewsRecord = (n) => {
    if (!n) return true;
    if (!n.link || n.link === 'null' || n.link.trim() === '') return true;
    if (!n.title || n.title === 'null' || n.title.trim() === '') return true;
    if (n.link.includes('google.com')) return true;
    return false;
};

export const filterValidNews = (items = []) => items.filter(n => !isBadNewsRecord(n));

/** Tin đã cào body đủ dùng cho tab phân tích / AI (khác prefetch chỉ headline). */
export const hasRichNewsContent = (n) => {
    const content = String(n?.content || '').trim();
    const title = String(n?.title || '').trim();
    return content.length > 80 && content !== title;
};

export const mergeDeepNews = (existing = [], incoming = []) => {
    const combined = [...incoming, ...existing];
    const seen = new Set();
    return combined
        .filter(n => {
            if (isBadNewsRecord(n)) return false;
            if (seen.has(n.link)) return false;
            seen.add(n.link);
            return true;
        })
        .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
        .slice(0, MAX_NEWS_DB);
};

/** Prefetch cron: headline-only, dùng deepNewsPrefetchedAt. */
export const isPrefetchNewsFresh = (record) => {
    const ts = record?.deepNewsPrefetchedAt || record?.deepNewsFetchedAt;
    if (!ts) return false;
    const validCount = filterValidNews(record.deepNewsData || []).length;
    if (validCount < MIN_VALID_NEWS) return false;
    const ageMs = Date.now() - new Date(ts).getTime();
    return ageMs < getVnNewsCacheTtlMs();
};

/** Tab VN / user search: cần body đầy đủ + deepNewsFetchedAt. */
export const isUserNewsCacheFresh = (record) => {
    if (!record?.deepNewsFetchedAt) return false;
    const valid = filterValidNews(record.deepNewsData || []);
    const richCount = valid.filter(hasRichNewsContent).length;
    if (richCount < MIN_VALID_NEWS) return false;
    const ageMs = Date.now() - new Date(record.deepNewsFetchedAt).getTime();
    return ageMs < getVnNewsCacheTtlMs();
};

/** @deprecated — dùng isPrefetchNewsFresh hoặc isUserNewsCacheFresh */
export const isDeepNewsFresh = isUserNewsCacheFresh;

const normalizeHeadlineItem = (item, mode = 'balanced') => ({
    title: item.title,
    link: item.link,
    source: item.source || item.link,
    sentiment: item.sentiment || 'neutral',
    content: item.content && item.content.length > 80 ? item.content : item.title,
    date: item.date || new Date().toLocaleDateString('vi-VN'),
    publishedAt: item.publishedAt || new Date(),
    mode: item.mode || mode,
    relevanceScore: item.relevanceScore || 0,
});

export const saveDeepNewsForSymbol = async (symbol, incoming = [], options = {}) => {
    const ticker = String(symbol).toUpperCase();
    const {
        touchFetchedAt = false,
        touchPrefetchedAt = false,
        mode = 'balanced',
    } = options;

    let masterRecord = await Stock.findOne({ symbol: ticker });
    if (!masterRecord) masterRecord = new Stock({ symbol: ticker, deepNewsData: [] });

    const normalized = incoming.map(item => normalizeHeadlineItem(item, mode));
    masterRecord.deepNewsData = mergeDeepNews(masterRecord.deepNewsData || [], normalized);
    if (touchPrefetchedAt) {
        masterRecord.deepNewsPrefetchedAt = new Date();
    }
    if (touchFetchedAt) {
        masterRecord.deepNewsFetchedAt = new Date();
    }
    await masterRecord.save();
    return masterRecord;
};

export const prefetchVnStockNews = async (symbol, options = {}) => {
    const ticker = String(symbol).toUpperCase();
    const mode = options.mode || 'balanced';
    const newsMode = options.newsMode || 'fast';
    const limit = options.limit ?? 12;

    try {
        const rawItems = await searchVnNewsDirectly(ticker, mode, limit, 0, newsMode);
        const existing = await Stock.findOne({ symbol: ticker }, { deepNewsData: 1 }).lean();
        const seenLinks = new Set((existing?.deepNewsData || []).map(n => n.link));
        const newItems = rawItems
            .filter(item => item?.link && !seenLinks.has(item.link))
            .map(item => normalizeHeadlineItem(item, mode));

        await saveDeepNewsForSymbol(ticker, newItems, {
            mode,
            touchPrefetchedAt: true,
            touchFetchedAt: false,
        });
        return { symbol: ticker, added: newItems.length, ok: true };
    } catch (err) {
        console.log(chalk.yellow(`[VN NEWS PREFETCH] ${ticker}: ${err.message}`));
        return { symbol: ticker, added: 0, ok: false, error: err.message };
    }
};
