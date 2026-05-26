import axios from 'axios';
import chalk from 'chalk';

// =========================================================
//STOCK BASKET LEADS CORE STOCKS
// =========================================================
const CORE_STOCKS = [
    //BANK
    { symbol: 'MBB', sector: 'NGÂN HÀNG' }, { symbol: 'TCB', sector: 'NGÂN HÀNG' },
    { symbol: 'CTG', sector: 'NGÂN HÀNG' }, { symbol: 'STB', sector: 'NGÂN HÀNG' },
    { symbol: 'VCB', sector: 'NGÂN HÀNG' }, { symbol: 'VPB', sector: 'NGÂN HÀNG' },
    { symbol: 'SHB', sector: 'NGÂN HÀNG' },
    //STOCK
    { symbol: 'SSI', sector: 'CHỨNG KHOÁN' }, { symbol: 'VND', sector: 'CHỨNG KHOÁN' },
    { symbol: 'VCI', sector: 'CHỨNG KHOÁN' }, { symbol: 'SHS', sector: 'CHỨNG KHOÁN' },
    //STEEL
    { symbol: 'HPG', sector: 'THÉP' }, { symbol: 'HSG', sector: 'THÉP' },
    { symbol: 'NKG', sector: 'THÉP' },
    //REAL ESTATE
    { symbol: 'DIG', sector: 'BẤT ĐỘNG SẢN' }, { symbol: 'NVL', sector: 'BẤT ĐỘNG SẢN' },
    { symbol: 'PDR', sector: 'BẤT ĐỘNG SẢN' }, { symbol: 'VHM', sector: 'BẤT ĐỘNG SẢN' },
    //RETAIL
    { symbol: 'MWG', sector: 'BÁN LẺ' }, { symbol: 'FRT', sector: 'BÁN LẺ' },
    { symbol: 'DGW', sector: 'BÁN LẺ' },
    //TECHNOLOGY
    { symbol: 'FPT', sector: 'CÔNG NGHỆ' }, { symbol: 'CMG', sector: 'CÔNG NGHỆ' },
    //OIL AND GAS
    { symbol: 'PVD', sector: 'DẦU KHÍ' }, { symbol: 'PVS', sector: 'DẦU KHÍ' },
    { symbol: 'BSR', sector: 'DẦU KHÍ' },
    //CHEMICAL
    { symbol: 'DGC', sector: 'HÓA CHẤT' }, { symbol: 'DCM', sector: 'HÓA CHẤT' },
    //SEA TRANSPORTATION
    { symbol: 'GMD', sector: 'VẬN TẢI BIỂN' }, { symbol: 'HAH', sector: 'VẬN TẢI BIỂN' },
    //=== INSURANCE ===
    { symbol: 'BVH', sector: 'BẢO HIỂM' }, { symbol: 'MIG', sector: 'BẢO HIỂM' },
    //=== ELECTRICITY ===
    { symbol: 'REE', sector: 'ĐIỆN' }, { symbol: 'PC1', sector: 'ĐIỆN' },
    { symbol: 'POW', sector: 'ĐIỆN' },
    //===  FOOD ===
    { symbol: 'MSN', sector: 'THỰC PHẨM' }, { symbol: 'VNM', sector: 'THỰC PHẨM' },
    { symbol: 'SAB', sector: 'THỰC PHẨM' },
    //===  AIRLINE ===
    { symbol: 'HVN', sector: 'HÀNG KHÔNG' }, { symbol: 'VJC', sector: 'HÀNG KHÔNG' },
    //===  CONSTRUCTION ===
    { symbol: 'CTD', sector: 'XÂY DỰNG' }, { symbol: 'HBC', sector: 'XÂY DỰNG' },
];

// =========================================================
// FIX 1: Fetch top 10 mã thanh khoản nhất từ heatmap
// =========================================================
const fetchTopLiquidityStocks = async (from, to) => {
    try {
        const res = await axios.get(
            `https://services.entrade.com.vn/chart-api/v2/heatmap?exchange=HOSE&from=${from}&to=${to}`,
            { timeout: 8000 }
        );
        const data = res.data;
        if (!data || !data.symbols) return [];

        const coreSymbols = new Set(CORE_STOCKS.map(s => s.symbol));
        const topLiquid = (data.symbols || [])
            .sort((a, b) => (b.value || 0) - (a.value || 0))
            .slice(0, 15)
            .filter(s => !coreSymbols.has(s.symbol))
            .slice(0, 10)
            .map(s => ({
                symbol: s.symbol,
                sector: s.icbName2 || s.sector || 'KHÁC',
                _fromLiquidity: true
            }));

        console.log(chalk.magenta(`[SCRAPER] Top liquidity bổ sung: ${topLiquid.map(s => s.symbol).join(', ')}`));
        return topLiquid;
    } catch (err) {
        console.log(chalk.yellow(`[SCRAPER] Bỏ qua heatmap (${err.message})`));
        return [];
    }
};

// =========================================================
//FIX 2: Fetch actual foreign data from entrade
// =========================================================
const fetchForeignFlow = async (from, to) => {
    try {
        const res = await axios.get(
            `https://services.entrade.com.vn/chart-api/v2/foreign-trading?exchange=HOSE&from=${from}&to=${to}`,
            { timeout: 8000 }
        );
        const data = res.data;
        if (!data) return { netValue: 0, topBuy: [], topSell: [] };

        const topBuy = (data.buyList || data.top_buy || [])
            .slice(0, 10)
            .map(item => ({
                symbol: item.symbol || item.code,
                value: Number(item.buyValue || item.buy_value || 0)
            }));

        const topSell = (data.sellList || data.top_sell || [])
            .slice(0, 10)
            .map(item => ({
                symbol: item.symbol || item.code,
                value: Number(item.sellValue || item.sell_value || 0)
            }));

        const netValue = (data.netValue || data.net_value || 0);

        console.log(chalk.green(`[SCRAPER] ForeignFlow: netValue=${(netValue/1e9).toFixed(1)}B, topBuy=${topBuy.length} mã, topSell=${topSell.length} mã`));
        return { netValue, topBuy, topSell };
    } catch (err) {
        console.log(chalk.yellow(`[SCRAPER] Bỏ qua foreignFlow (${err.message})`));
        return { netValue: 0, topBuy: [], topSell: [] };
    }
};

// =========================================================
// FIX 3: Fetch real breadth from entrade
// =========================================================
const fetchRealMarketBreadth = async () => {
    try {
        const res = await axios.get(
            `https://services.entrade.com.vn/chart-api/v2/market-breadth?exchange=HOSE`,
            { timeout: 6000 }
        );
        const d = res.data;
        if (!d || (!d.advance && !d.advances)) {
            throw new Error('Response thiếu trường advance/decline');
        }

        const up = Number(d.advance || d.advances || d.up || 0);
        const down = Number(d.decline || d.declines || d.down || 0);
        const unchanged = Number(d.noChange || d.unchanged || d.same || 0);

        console.log(chalk.green(`[SCRAPER] MarketBreadth thực: tăng=${up}, giảm=${down}, đứng=${unchanged}`));
        return { up, down, unchanged, _isReal: true };
    } catch (err) {
        console.log(chalk.yellow(`[SCRAPER] Bỏ qua breadth API (${err.message}), dùng fallback từ CORE_STOCKS`));
        return null;
    }
};

export const scrapeCafefMarketOverview = async () => {
    try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - (10 * 24 * 60 * 60); 

        const [foreignFlow, realBreadth, liquidityExtras] = await Promise.all([
            fetchForeignFlow(from, to),
            fetchRealMarketBreadth(),
            fetchTopLiquidityStocks(from, to),
        ]);

        // Merge CORE_STOCKS + top liquidity
        const coreSymbols = new Set(CORE_STOCKS.map(s => s.symbol));
        const allStocks = [
            ...CORE_STOCKS,
            ...liquidityExtras.filter(s => !coreSymbols.has(s.symbol))
        ];

        console.log(chalk.cyan(`[SCRAPER] Tổng mã cần fetch: ${allStocks.length} (${CORE_STOCKS.length} core + ${liquidityExtras.length} liquid)`));

        let breadthFromCore = { up: 0, down: 0, unchanged: 0 };
        let activeVolumeStocks = [];

        const chunkSize = 5;
        for (let i = 0; i < allStocks.length; i += chunkSize) {
            const chunk = allStocks.slice(i, i + chunkSize);
            const promises = chunk.map(stock =>
                axios.get(
                    `https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${from}&to=${to}&symbol=${stock.symbol}&resolution=1D`,
                    { timeout: 8000 }
                )
                .then(res => ({ ...stock, data: res.data }))
                .catch(() => ({ ...stock, data: null }))
            );

            const results = await Promise.all(promises);

            results.forEach(res => {
                if (!res.data?.t?.length) return;

                const d = res.data;
                const len = d.c.length;
                const currentPrice = Number(d.c[len - 1]);
                const prevClose = len > 1 ? Number(d.c[len - 2]) : 0;
                const openToday = Number(d.o?.[len - 1]) || 0;
                const refPrice = prevClose > 0 ? prevClose : openToday;
                const volume = Number(d.v[len - 1]) || 0;
                const changePct = refPrice > 0 ? ((currentPrice - refPrice) / refPrice) * 100 : 0;

                const momentum3d = len >= 4
                    ? ((d.c[len - 1] - d.c[len - 4]) / d.c[len - 4]) * 100
                    : changePct;

                const marketCapProxy = volume * currentPrice;

                console.log(chalk.gray(`  [SCRAPER] ${res.symbol}: close=${currentPrice.toFixed(0)}, changePct=${changePct.toFixed(2)}%, m3d=${momentum3d.toFixed(2)}%, vol=${(volume/1e6).toFixed(1)}M`));

                if (!res._fromLiquidity) {
                    if (changePct > 0.05) breadthFromCore.up += 1;
                    else if (changePct < -0.05) breadthFromCore.down += 1;
                    else breadthFromCore.unchanged += 1;
                }

                activeVolumeStocks.push({
                    symbol: res.symbol,
                    sector: res.sector,
                    volume,
                    changePct,
                    momentum3d,       
                    marketCapProxy, 
                    currentPrice,
                });
            });
        }

        // === FIX 3: Ưu tiên breadth thực từ API, fallback mới dùng breadth từ CORE_STOCKS ===
        // Không còn nhân x15 vô lý nữa
        let marketBreadth;
        if (realBreadth && realBreadth.up > 0) {
            marketBreadth = realBreadth;
            console.log(chalk.green(`[SCRAPER] Dùng breadth thực từ API: ↑${marketBreadth.up} ↓${marketBreadth.down}`));
        } else {

            const total = breadthFromCore.up + breadthFromCore.down + breadthFromCore.unchanged || 1;
            const scale = 400 / total;
            marketBreadth = {
                up: Math.round(breadthFromCore.up * scale),
                down: Math.round(breadthFromCore.down * scale),
                unchanged: Math.round(breadthFromCore.unchanged * scale),
                _isFallback: true,
            };
            console.log(chalk.yellow(`[SCRAPER] Dùng breadth ước tính (scaled): ↑${marketBreadth.up} ↓${marketBreadth.down}`));
        }

        return {
            success: true,
            timestamp: new Date().toISOString(),
            marketBreadth,
            foreignFlow,
            activeVolumeStocks,
        };

    } catch (error) {
        console.error(chalk.red(`[SCRAPER ERROR] ${error.message}`));
        return { success: false, error: error.message };
    }
};