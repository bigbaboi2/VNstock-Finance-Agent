import axios from 'axios';
import chalk from 'chalk';

// =========================================================
// RỔ CỔ PHIẾU DẪN DẮT CORE STOCKS
// =========================================================
const CORE_STOCKS = [
    { symbol: 'MBB', sector: 'NGÂN HÀNG' }, { symbol: 'TCB', sector: 'NGÂN HÀNG' }, { symbol: 'CTG', sector: 'NGÂN HÀNG' }, { symbol: 'STB', sector: 'NGÂN HÀNG' }, { symbol: 'VCB', sector: 'NGÂN HÀNG' },
    { symbol: 'SSI', sector: 'CHỨNG KHOÁN' }, { symbol: 'VND', sector: 'CHỨNG KHOÁN' }, { symbol: 'VCI', sector: 'CHỨNG KHOÁN' }, { symbol: 'SHS', sector: 'CHỨNG KHOÁN' },
    { symbol: 'HPG', sector: 'THÉP' }, { symbol: 'HSG', sector: 'THÉP' }, { symbol: 'NKG', sector: 'THÉP' },
    { symbol: 'DIG', sector: 'BẤT ĐỘNG SẢN' }, { symbol: 'NVL', sector: 'BẤT ĐỘNG SẢN' }, { symbol: 'PDR', sector: 'BẤT ĐỘNG SẢN' }, { symbol: 'VHM', sector: 'BẤT ĐỘNG SẢN' },
    { symbol: 'MWG', sector: 'BÁN LẺ' }, { symbol: 'FRT', sector: 'BÁN LẺ' }, { symbol: 'DGW', sector: 'BÁN LẺ' },
    { symbol: 'FPT', sector: 'CÔNG NGHỆ' }, { symbol: 'CMG', sector: 'CÔNG NGHỆ' },
    { symbol: 'PVD', sector: 'DẦU KHÍ' }, { symbol: 'PVS', sector: 'DẦU KHÍ' }, { symbol: 'BSR', sector: 'DẦU KHÍ' },
    { symbol: 'DGC', sector: 'HÓA CHẤT' }, { symbol: 'DCM', sector: 'HÓA CHẤT' },
    { symbol: 'GMD', sector: 'VẬN TẢI BIỂN' }, { symbol: 'HAH', sector: 'VẬN TẢI BIỂN' }
];

export const scrapeCafefMarketOverview = async () => {
    try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - (4 * 24 * 60 * 60); 
        
        let marketBreadth = { up: 0, down: 0, unchanged: 0 };
        let activeVolumeStocks = [];
        let foreignFlow = { netValue: 0, topBuy: [], topSell: [] }; 

        const chunkSize = 5;
        for (let i = 0; i < CORE_STOCKS.length; i += chunkSize) {
            const chunk = CORE_STOCKS.slice(i, i + chunkSize);
            const promises = chunk.map(stock => 
                axios.get(`https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${from}&to=${to}&symbol=${stock.symbol}&resolution=1D`, { timeout: 8000 })
                .then(res => ({ symbol: stock.symbol, sector: stock.sector, data: res.data }))
                .catch(() => ({ symbol: stock.symbol, sector: stock.sector, data: null }))
            );

            const results = await Promise.all(promises);

            results.forEach(res => {
                if (res.data && res.data.t && res.data.t.length > 0) {
                    const d = res.data;
                    const len = d.c.length;
                    const currentPrice = Number(d.c[len - 1]);
                    const prevPrice = len > 1 ? Number(d.c[len - 2]) : currentPrice;
                    const volume = Number(d.v[len - 1]) || 0;
                    const changePct = prevPrice ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;

                    if (changePct > 0) marketBreadth.up += 1;
                    else if (changePct < 0) marketBreadth.down += 1;
                    else marketBreadth.unchanged += 1;

                    activeVolumeStocks.push({
                        symbol: res.symbol,
                        sector: res.sector, 
                        volume: volume,
                        changePct: changePct
                    });
                }
            });
        }

        marketBreadth.up *= 15;
        marketBreadth.down *= 15;
        marketBreadth.unchanged *= 10;

        return { success: true, timestamp: new Date().toISOString(), marketBreadth, foreignFlow, activeVolumeStocks };

    } catch (error) {
        return { success: false, error: error.message };
    }
};