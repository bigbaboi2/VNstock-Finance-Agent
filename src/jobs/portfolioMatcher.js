import axios from 'axios';
import Portfolio from '../../models/Portfolio.js';

export const startPortfolioMatcher = () => {
    console.log('[HỆ THỐNG] Trình khớp lệnh ảo đang chạy ngầm...');
    
    setInterval(async () => {
        try {
            const now = new Date();
            const day = now.getDay();
            const hours = now.getHours();
            const minutes = now.getMinutes();
            const totalMinutes = hours * 60 + minutes;

            const isVnMarketOpen = day >= 1 && day <= 5 && totalMinutes >= 540 && totalMinutes <= 900;

            const portfolios = await Portfolio.find({ "pendingOrders": { $exists: true, $not: {$size: 0} } });
            if (portfolios.length === 0) return;

            const uniqueSymbols = new Set();
            portfolios.forEach(p => {
                p.pendingOrders.forEach(order => {
                    if (order.status === 'PENDING') uniqueSymbols.add(order.symbol);
                });
            });

            if (uniqueSymbols.size === 0) return;

            const livePrices = {};
            const to = Math.floor(Date.now() / 1000);
            const from = to - (24 * 60 * 60);

            await Promise.all(Array.from(uniqueSymbols).map(async (symbol) => {
                try {
                    const res = await axios.get(`https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${from}&to=${to}&symbol=${symbol}&resolution=1`);
                    const c = res.data?.c || [];
                    if (c.length > 0) {
                        livePrices[symbol] = c[c.length - 1] * 1000; 
                    }
                } catch (e) {}
            }));

            for (let portfolio of portfolios) {
                let isUpdated = false;
                for (let i = portfolio.pendingOrders.length - 1; i >= 0; i--) {
                    const order = portfolio.pendingOrders[i];
                    if (order.status !== 'PENDING') continue;

                    if (order.assetType === 'VN_STOCKS' || order.assetType === 'VN_DERIVATIVES') {
                        if (!isVnMarketOpen) continue; 
                    }

                    const currentPrice = livePrices[order.symbol];
                    if (!currentPrice) continue;

                    let isMatched = false;
                    if (order.type === 'BUY' && currentPrice <= order.targetPrice) isMatched = true; 
                    else if (order.type === 'SELL' && currentPrice >= order.targetPrice) isMatched = true; 

                    if (isMatched) {
                        const totalValue = order.volume * currentPrice;
                        let holdingIndex = portfolio.holdings.findIndex(h => h.symbol === order.symbol);
                        
                        if (order.type === 'BUY') {
                            if (holdingIndex >= 0) {
                                const oldVol = portfolio.holdings[holdingIndex].volume;
                                const oldAvg = portfolio.holdings[holdingIndex].avgPrice;
                                const newVol = oldVol + order.volume;
                                portfolio.holdings[holdingIndex].avgPrice = ((oldVol * oldAvg) + totalValue) / newVol;
                                portfolio.holdings[holdingIndex].volume = newVol;
                            } else {
                                portfolio.holdings.push({ assetType: order.assetType, symbol: order.symbol, volume: order.volume, avgPrice: currentPrice });
                            }
                        } else if (order.type === 'SELL') {
                            portfolio.balance += totalValue;
                            let realizedPnL = 0;
                            if (holdingIndex >= 0) {
                                const avgPrice = portfolio.holdings[holdingIndex].avgPrice;
                                realizedPnL = (currentPrice - avgPrice) * order.volume;
                                portfolio.holdings[holdingIndex].volume -= order.volume;
                                if (portfolio.holdings[holdingIndex].volume === 0) portfolio.holdings.splice(holdingIndex, 1);
                            }
                            portfolio.history.push({ assetType: order.assetType, symbol: order.symbol, type: 'SELL', volume: order.volume, price: currentPrice, totalValue, realizedPnL });
                        }

                        if (order.type === 'BUY') {
                            portfolio.history.push({ assetType: order.assetType, symbol: order.symbol, type: 'BUY', volume: order.volume, price: currentPrice, totalValue, realizedPnL: 0 });
                        }

                        portfolio.pendingOrders.splice(i, 1);
                        isUpdated = true;
                    }
                }
                if (isUpdated) await portfolio.save();
            }
        } catch (error) {
            console.error('[CẢNH BÁO]Lỗi khi khớp lệnh ngầm:', error.message);
        }
    }, 10000);
};