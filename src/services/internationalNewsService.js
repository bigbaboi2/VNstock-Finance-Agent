/**
 * International news: Google News + Reddit + X (via Google site:x.com).
 * Sentiment via vader-sentiment. No LLM.
 */
import axios from 'axios';
import vader from 'vader-sentiment';

const NEWS_TTL = 5 * 60 * 1000;
const newsCache = new Map();

const POSITIVE_WORDS = [
    'surge', 'rally', 'gain', 'record', 'profit', 'beat', 'upgrade', 'bull',
    'growth', 'soar', 'jump', 'outperform', 'buy', 'inflow',
];
const NEGATIVE_WORDS = [
    'drop', 'fall', 'selloff', 'lawsuit', 'downgrade', 'bear', 'loss', 'miss',
    'crash', 'plunge', 'cut', 'outflow', 'probe', 'fraud', 'ban',
];

const stripHtml = (s = '') =>
    String(s)
        .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const classifyKeyword = (text = '') => {
    const lower = String(text).toLowerCase();
    const positive = POSITIVE_WORDS.some((w) => lower.includes(w));
    const negative = NEGATIVE_WORDS.some((w) => lower.includes(w));
    if (positive && !negative) return 'positive';
    if (negative && !positive) return 'negative';
    return 'neutral';
};

export const classifySentiment = (text = '') => {
    try {
        const intensity = vader.SentimentIntensityAnalyzer.polarity_scores(String(text));
        if (intensity.compound >= 0.05) return 'positive';
        if (intensity.compound <= -0.05) return 'negative';
    } catch (_) { /* fallback */ }
    return classifyKeyword(text);
};

const extractRssItems = (xml = '', limit = 12) => {
    const matches = [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit);
    return matches
        .map((m) => {
            const raw = m[1];
            const title = stripHtml(
                raw.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
                || raw.match(/<title>(.*?)<\/title>/)?.[1]
                || ''
            );
            const link = raw.match(/<link>(.*?)<\/link>/)?.[1] || '';
            const pubDate = raw.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
            const source =
                stripHtml(raw.match(/<source[^>]*>(.*?)<\/source>/)?.[1] || '') || 'Google News';
            return { title, link, pubDate, source };
        })
        .filter((n) => n.title && n.title.length > 8);
};

const withTimeout = (promise, ms, label) =>
    Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), ms)),
    ]);

async function fetchGoogleNews(query, channel = 'google') {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await axios.get(url, {
        timeout: 4500,
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/rss+xml, application/xml, text/xml' },
    });
    return extractRssItems(res.data, channel === 'x' ? 10 : 15).map((n) => ({
        title: n.title,
        link: n.link,
        source: channel === 'x' ? 'X' : (n.source || 'Google News'),
        channel,
        time: n.pubDate ? new Date(n.pubDate).toLocaleString('en-US') : '',
        publishedAt: n.pubDate || null,
        sentiment: classifySentiment(n.title),
    }));
}

async function fetchRedditNews(symbol, name) {
    const q = [symbol, name].filter(Boolean).join(' ');
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&limit=40&t=week`;
    try {
        const res = await axios.get(url, {
            timeout: 4500,
            headers: {
                'User-Agent': 'Mozilla/5.0 OmniDuck/1.0',
                Accept: 'application/json',
            },
        });
        const children = res.data?.data?.children || [];
        return children
            .map((c) => c.data)
            .filter((p) => p && !p.removed_by_category && !p.is_video && (p.score || 0) >= 3)
            .filter((p) => {
                const sub = String(p.subreddit || '').toLowerCase();
                return !sub.includes('cryptocurrency') && !sub.includes('bitcoin');
            })
            .slice(0, 12)
            .map((p) => ({
                title: p.title,
                link: `https://www.reddit.com${p.permalink}`,
                source: `Reddit (r/${p.subreddit})`,
                channel: 'reddit',
                time: p.created_utc
                    ? new Date(p.created_utc * 1000).toLocaleString('en-US')
                    : '',
                publishedAt: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
                sentiment: classifySentiment(p.title),
            }));
    } catch (err) {
        // PullPush fallback
        try {
            const fb = await axios.get(
                `https://api.pullpush.io/reddit/search/submission/?q=${encodeURIComponent(q)}&size=10`,
                { timeout: 4000 }
            );
            const posts = fb.data?.data || [];
            return posts.slice(0, 10).map((p) => ({
                title: p.title,
                link: p.full_link || `https://www.reddit.com${p.permalink || ''}`,
                source: `Reddit (r/${p.subreddit || 'unknown'})`,
                channel: 'reddit',
                time: p.created_utc
                    ? new Date(p.created_utc * 1000).toLocaleString('en-US')
                    : '',
                publishedAt: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
                sentiment: classifySentiment(p.title),
            }));
        } catch (_) {
            throw err;
        }
    }
}

export function summarizeNewsItems(items = []) {
    const seen = new Set();
    const cleanItems = items
        .filter((n) => n?.title)
        .filter((n) => {
            const key = String(n.title).trim().toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, 40)
        .map((n) => ({
            title: String(n.title).trim(),
            link: n.link || '',
            source: n.source || 'N/A',
            channel: n.channel || 'google',
            time: n.time || '',
            publishedAt: n.publishedAt || null,
            sentiment: n.sentiment || classifySentiment(n.title),
        }));

    const counts = cleanItems.reduce(
        (acc, n) => {
            acc[n.sentiment] = (acc[n.sentiment] || 0) + 1;
            return acc;
        },
        { positive: 0, negative: 0, neutral: 0 }
    );
    const score = Math.max(-3, Math.min(3, counts.positive - counts.negative));
    const bias = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
    return { items: cleanItems, counts, score, bias };
}

/**
 * @param {{ symbol: string, name?: string }} opts
 */
export async function fetchInternationalNews({ symbol, name }) {
    const sym = String(symbol || '').trim();
    if (!sym) throw new Error('Missing symbol');
    const cacheKey = sym.toUpperCase();
    const hit = newsCache.get(cacheKey);
    if (hit && Date.now() - hit.at < NEWS_TTL) return hit.data;

    const displayName = name || sym;
    const googleQ = `"${sym}" OR "${displayName}" stock`;
    const xQ = `("${sym}" OR "${displayName}") (site:x.com OR site:twitter.com)`;

    const [gRes, rRes, xRes] = await Promise.allSettled([
        withTimeout(fetchGoogleNews(googleQ, 'google'), 5000, 'google'),
        withTimeout(fetchRedditNews(sym.replace(/^\^/, ''), displayName), 5000, 'reddit'),
        withTimeout(fetchGoogleNews(xQ, 'x'), 5000, 'x'),
    ]);

    const merged = [];
    const errors = {};
    if (gRes.status === 'fulfilled') merged.push(...gRes.value);
    else errors.google = gRes.reason?.message || 'fail';
    if (rRes.status === 'fulfilled') merged.push(...rRes.value);
    else errors.reddit = rRes.reason?.message || 'fail';
    if (xRes.status === 'fulfilled') merged.push(...xRes.value);
    else errors.x = xRes.reason?.message || 'fail';

    const summary = summarizeNewsItems(merged);
    const data = {
        symbol: sym,
        ...summary,
        sources: {
            google: gRes.status === 'fulfilled' ? gRes.value.length : 0,
            reddit: rRes.status === 'fulfilled' ? rRes.value.length : 0,
            x: xRes.status === 'fulfilled' ? xRes.value.length : 0,
        },
        errors: Object.keys(errors).length ? errors : undefined,
        fetchedAt: new Date().toISOString(),
    };
    newsCache.set(cacheKey, { at: Date.now(), data });
    return data;
}
