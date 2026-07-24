import express from 'express';
import {
    getMarkets,
    getQuotes,
    getQuote,
    getHistory,
    getNews,
    getProposal,
    searchSymbols,
} from '../controllers/international.controller.js';

const router = express.Router();

/** Decode path segment that may contain dots / carets (7203.T, ^GSPC). */
const bindSymbol = (handler) => (req, res, next) => {
    const raw = req.params.symbol || req.params[0] || '';
    try {
        req.params.symbol = decodeURIComponent(String(raw));
    } catch (_) {
        req.params.symbol = String(raw);
    }
    return handler(req, res, next);
};

router.get('/markets', getMarkets);
router.get('/quotes', getQuotes);
router.get('/search', searchSymbols);
// Express 5 wildcard — keep dots in ticker
router.get('/quote/*symbol', bindSymbol(getQuote));
router.get('/history/*symbol', bindSymbol(getHistory));
router.get('/news/*symbol', bindSymbol(getNews));
router.get('/proposal/*symbol', bindSymbol(getProposal));

export default router;
