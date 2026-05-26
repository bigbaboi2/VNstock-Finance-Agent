import express from 'express';
import { 
    getCryptoNews, getCryptoDerivatives, getCryptoRadar, 
    getCryptoPrice, saveCryptoSignal, getTopMovers, 
    getCryptoFunding, getCryptoLiquidations, getCryptoSymbols
} from '../controllers/crypto.controller.js';
import { fetchCryptoData } from '../services/cryptoService.js';

const router = express.Router();

router.get('/symbols',             getCryptoSymbols);
router.get('/news/:symbol',        getCryptoNews);
router.get('/derivatives/:symbol', getCryptoDerivatives);
router.get('/radar',               getCryptoRadar);
router.get('/price/:symbol',       getCryptoPrice);
router.post('/signal',             saveCryptoSignal);
router.get('/top-movers',          getTopMovers);
router.get('/funding',             getCryptoFunding);
router.get('/liquidations',        getCryptoLiquidations);

// /api/crypto/history/:symbol — tự xử lý, không import chéo controller
router.get('/history/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const interval = req.query.interval || '1 ngày';
    try {
        const data = await fetchCryptoData(symbol, interval);
        return res.json({ success: true, data });
    } catch (e) {
        return res.status(200).json({ success: false, data: null });
    }
});

export default router;
