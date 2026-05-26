import express from 'express';
import { getPortfolio, cancelOrder, tradeOrder } from '../controllers/portfolio.controller.js';

const router = express.Router();

router.get('/:username', getPortfolio);

router.post('/cancel-order', cancelOrder);

router.post('/trade', tradeOrder);

export default router;