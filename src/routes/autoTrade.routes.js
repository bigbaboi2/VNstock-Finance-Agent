import express from 'express';
import { 
    getSystemTradeLogs, 
    createUserExpectationOrder, 
    getUserOrders, 
    getAiLessons,
    forceTriggerPipeline,
    getAutoTradeSettings,
    updateAutoTradeSettings,
    stopUserOrder,
    deleteUserOrder,
    getUsdRate
} from '../controllers/autoTrade.controller.js';

const router = express.Router();

router.get('/logs', getSystemTradeLogs);
router.post('/user-order', createUserExpectationOrder);
router.get('/user-order/:username', getUserOrders);
router.post('/user-order/:id/stop', stopUserOrder);
router.delete('/user-order/:id', deleteUserOrder);
router.get('/ai-lessons', getAiLessons);
router.post('/force-trigger', forceTriggerPipeline);
router.get('/settings', getAutoTradeSettings);
router.get('/usd-rate', getUsdRate);
router.post('/settings', updateAutoTradeSettings);

export default router;