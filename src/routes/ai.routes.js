import express from 'express';
import { 
    getLiveNews, analyzeDerivatives, analyzeStock, 
    debugFeed, stockChat, getAiNews, 
    getActionPanel, getUserHistory,
    getLatestVnStockReport, analyzeStockStream 
    
} from '../controllers/ai.controller.js';

const router = express.Router();  
router.post('/analyze/:ticker/stream', analyzeStockStream);
router.get('/analyze/latest/:symbol', getLatestVnStockReport);
router.get('/news/:ticker', getLiveNews);
router.post('/analyze-derivatives', analyzeDerivatives);
router.post('/analyze/:ticker', analyzeStock);
router.post('/debug-feed/:ticker', debugFeed);
router.post('/stock-chat/:ticker', stockChat);
router.get('/ai-news/:ticker', getAiNews);
router.post('/action-panel/:ticker', getActionPanel);
router.get('/user-history/:user', getUserHistory);

export default router;