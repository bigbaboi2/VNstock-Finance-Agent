import express from 'express';
import { getSymbols, getStockInfo, getMarketRadar, getMarketHeatmap } from '../controllers/market.controller.js';

const router = express.Router();

router.get('/symbols', getSymbols);
router.get('/info/:ticker', getStockInfo);
router.get('/radar', getMarketRadar);
router.get('/heatmap', getMarketHeatmap);

export default router;