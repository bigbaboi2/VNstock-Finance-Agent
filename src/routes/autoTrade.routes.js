import express from 'express';
import { 
    getSystemTradeLogs, 
    createUserExpectationOrder, 
    getUserOrders, 
    getAiLessons,
    forceTriggerPipeline,
    getAutoTradeSettings,
    updateAutoTradeSettings
} from '../controllers/autoTrade.controller.js';

const router = express.Router();

router.get('/logs', getSystemTradeLogs);
router.post('/user-order', createUserExpectationOrder);
router.get('/user-order/:username', getUserOrders);
router.get('/ai-lessons', getAiLessons);
router.post('/force-trigger', forceTriggerPipeline);
router.get('/settings', getAutoTradeSettings);
router.post('/settings', updateAutoTradeSettings);

export default router;