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
    getUsdRate,
    getPipelineLogsHandler,
    getFunnelLogsHandler,
    getAuditStatusHandler,
    getAuditTailHandler,
    getAuditFileTailHandler,
    getTradeAnalyticsHandler,
} from '../controllers/autoTrade.controller.js';

const router = express.Router();

router.get('/logs', getSystemTradeLogs);
router.get('/analytics', getTradeAnalyticsHandler);
router.post('/user-order', createUserExpectationOrder);
router.get('/user-order/:username', getUserOrders);
router.post('/user-order/:id/stop', stopUserOrder);
router.delete('/user-order/:id', deleteUserOrder);
router.get('/ai-lessons', getAiLessons);
router.get('/pipeline-logs', getPipelineLogsHandler);
router.get('/funnel-logs', getFunnelLogsHandler);
router.get('/audit-status', getAuditStatusHandler);
router.get('/audit-tail', getAuditTailHandler);
router.get('/audit-file-tail', getAuditFileTailHandler);
router.post('/force-trigger', forceTriggerPipeline);
router.get('/settings', getAutoTradeSettings);
router.get('/usd-rate', getUsdRate);
router.post('/settings', updateAutoTradeSettings);

export default router;