import express from 'express';
import { processExternalSignal } from '../controllers/externalSignal.controller.js';
import { getSystemTradeLogs, updateAutoTradeSettings, getAutoTradeSettings, createUserExpectationOrder, getUserOrders, getAiLessons, forceTriggerPipeline } from '../controllers/autoTrade.controller.js';

const router = express.Router();

// Route mới để nhận tín hiệu từ gateway Python
router.post('/signals/external', processExternalSignal);

// Các routes khác cho AutoTrade  
router.get('/autotrade/logs', getSystemTradeLogs);
router.get('/autotrade/settings', getAutoTradeSettings);
router.post('/autotrade/settings', updateAutoTradeSettings);

export default router;