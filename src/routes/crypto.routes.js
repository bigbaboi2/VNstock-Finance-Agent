import express from 'express';
import { 
    getCryptoNews, getCryptoDerivatives, getCryptoRadar, 
    getCryptoPrice, saveCryptoSignal, getTopMovers, 
    getCryptoFunding, getCryptoLiquidations 
} from '../controllers/crypto.controller.js';

const router = express.Router();

router.get('/news/:symbol', getCryptoNews);
router.get('/derivatives/:symbol', getCryptoDerivatives);
router.get('/radar', getCryptoRadar);
router.get('/price/:symbol', getCryptoPrice);
router.post('/signal', saveCryptoSignal);
router.get('/top-movers', getTopMovers);
router.get('/funding', getCryptoFunding);
router.get('/liquidations', getCryptoLiquidations);

export default router;