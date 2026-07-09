import express from 'express';
import {
    getConnections,
    createConnection,
    deleteConnection,
    testConnectionEndpoint,
    toggleConnection,
    getLiveBalance,
    getExchangeOrders,
    sellBalanceToUSDT,
} from '../controllers/exchangeConnection.controller.js';

const router = express.Router();

// LƯU Ý: route tĩnh '/orders/:username' phải đặt TRƯỚC '/:username' để không bị nuốt param
router.get('/orders/:username', getExchangeOrders);

router.get('/:username', getConnections);
router.post('/', createConnection);
router.delete('/:id', deleteConnection);
router.post('/:id/test', testConnectionEndpoint);
router.patch('/:id/toggle', toggleConnection);
router.get('/:id/balance', getLiveBalance);
router.post('/:id/sell-to-usdt', sellBalanceToUSDT);

export default router;
