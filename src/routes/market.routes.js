import express from 'express';
import { getSymbols, getStockInfo, getMarketRadar, getMarketHeatmap, streamTcbsPdf } from '../controllers/market.controller.js';

const router = express.Router();

router.get('/symbols', getSymbols);
router.get('/info/:ticker', getStockInfo);
router.get('/tcbs-pdf/:ticker', streamTcbsPdf);
router.get('/radar', getMarketRadar);
router.get('/heatmap', getMarketHeatmap);

export default router;