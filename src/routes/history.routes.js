import express from 'express';
import { getChartHistory, getCryptoHistory } from '../controllers/history.controller.js';

const router = express.Router();

router.get('/:ticker', getChartHistory);
router.get('/crypto/:symbol', getCryptoHistory);

export default router; 