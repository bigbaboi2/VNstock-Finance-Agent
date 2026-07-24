import {
    listMarketsMeta,
    getMarketById,
    searchUniverse,
    resolveUniverseEntry,
    toYahooSymbol,
} from '../data/internationalUniverse.js';
import {
    fetchQuotes,
    fetchHistory,
    fetchQuoteWithTechnicals,
} from '../services/yahooMarketService.js';
import { fetchInternationalNews } from '../services/internationalNewsService.js';
import { buildInternationalProposal } from '../services/internationalProposal.js';

export const getMarkets = async (_req, res) => {
    try {
        return res.json({ success: true, data: listMarketsMeta() });
    } catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
};

export const getQuotes = async (req, res) => {
    try {
        const country = String(req.query.country || '').toUpperCase();
        let symbols = [];
        if (req.query.symbols) {
            symbols = String(req.query.symbols)
                .split(',')
                .map((s) => toYahooSymbol(s))
                .filter(Boolean);
        } else if (country) {
            const market = getMarketById(country);
            if (!market) {
                return res.status(400).json({ success: false, message: `Unknown country: ${country}` });
            }
            symbols = market.symbols.map((s) => s.yahooSymbol);
        } else {
            return res.status(400).json({ success: false, message: 'Provide country= or symbols=' });
        }

        const quotes = await fetchQuotes(symbols);
        return res.json({ success: true, data: quotes, country: country || null });
    } catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
};

export const getQuote = async (req, res) => {
    try {
        const sym = toYahooSymbol(req.params.symbol);
        if (!sym) return res.status(400).json({ success: false, message: 'Missing symbol' });
        const interval = req.query.interval || '1d';
        const data = await fetchQuoteWithTechnicals(sym, interval);
        const entry = resolveUniverseEntry(sym);
        return res.json({
            success: true,
            data: {
                ...data,
                universe: entry
                    ? { country: entry.country, name: entry.name, symbol: entry.symbol }
                    : { country: null, name: data.quote?.name || sym, symbol: sym },
            },
        });
    } catch (e) {
        return res.status(200).json({ success: false, message: e.message, data: null });
    }
};

export const getHistory = async (req, res) => {
    try {
        const sym = toYahooSymbol(req.params.symbol);
        if (!sym) return res.status(400).json({ success: false, message: 'Missing symbol' });
        const interval = req.query.interval || '1d';
        const data = await fetchHistory(sym, interval);
        return res.json({ success: true, data });
    } catch (e) {
        return res.status(200).json({ success: false, message: e.message, data: null });
    }
};

export const getNews = async (req, res) => {
    try {
        const sym = toYahooSymbol(req.params.symbol);
        if (!sym) return res.status(400).json({ success: false, message: 'Missing symbol' });
        const entry = resolveUniverseEntry(sym);
        const data = await fetchInternationalNews({
            symbol: sym,
            name: entry?.name || req.query.name,
        });
        return res.json({ success: true, data });
    } catch (e) {
        return res.status(200).json({ success: false, message: e.message, data: { items: [], score: 0, bias: 'neutral' } });
    }
};

export const getProposal = async (req, res) => {
    try {
        const sym = toYahooSymbol(req.params.symbol);
        if (!sym) return res.status(400).json({ success: false, message: 'Missing symbol' });
        const interval = req.query.interval || '1d';
        const entry = resolveUniverseEntry(sym);

        const [techBundle, news] = await Promise.all([
            fetchQuoteWithTechnicals(sym, interval),
            fetchInternationalNews({ symbol: sym, name: entry?.name }).catch(() => ({
                items: [],
                score: 0,
                bias: 'neutral',
                counts: { positive: 0, negative: 0, neutral: 0 },
            })),
        ]);

        const proposal = buildInternationalProposal({
            technicals: techBundle.technicals,
            news: { score: news.score, bias: news.bias },
        });

        return res.json({
            success: true,
            data: {
                symbol: sym,
                quote: techBundle.quote,
                technicals: techBundle.technicals,
                news: {
                    score: news.score,
                    bias: news.bias,
                    counts: news.counts,
                    sources: news.sources,
                    items: (news.items || []).slice(0, 20),
                },
                proposal,
            },
        });
    } catch (e) {
        return res.status(200).json({ success: false, message: e.message, data: null });
    }
};

export const searchSymbols = async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        const local = searchUniverse(q, 20);
        // Allow free-form Yahoo ticker if it looks valid and not already in list
        const free = toYahooSymbol(q);
        const hasFree =
            free
            && q
            && !local.some((s) => s.yahooSymbol.toUpperCase() === free.toUpperCase())
            && /^[\^A-Z0-9][\w.^=-]{0,20}$/i.test(free);

        const data = hasFree
            ? [{ symbol: free, yahooSymbol: free, name: free, country: null, countryLabel: 'Yahoo' }, ...local]
            : local;

        return res.json({ success: true, data });
    } catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
};
