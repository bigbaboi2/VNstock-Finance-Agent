import express from 'express';
import { getDerivRadar, exportDerivData, getDerivNews, refreshDerivNews } from '../controllers/derivatives.controller.js';

const router = express.Router();

router.get('/radar', getDerivRadar);
router.post('/export', exportDerivData);
router.get('/news', getDerivNews);
router.post('/news/refresh', refreshDerivNews);

export default router;