import express from 'express';
import { 
    getSystemTradeLogs, 
    createUserExpectationOrder, 
    getUserOrders, 
    getAiLessons,
    forceTriggerPipeline 
} from '../controllers/autoTrade.controller.js';

const router = express.Router();

router.get('/logs', getSystemTradeLogs);
router.post('/user-order', createUserExpectationOrder);
router.get('/user-order/:username', getUserOrders);
router.get('/ai-lessons', getAiLessons);
router.post('/force-trigger', forceTriggerPipeline);

export default router;