import axios from 'axios';
import chalk from 'chalk';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA };

//=======================================================================
//CORE STOCK BASKET — used as fallback when the API dies
//=======================================================================
const CORE_STOCKS = [
    { symbol: 'MBB', sector: 'NGÂN HÀNG' }, { symbol: 'TCB', sector: 'NGÂN HÀNG' },
    { symbol: 'CTG', sector: 'NGÂN HÀNG' }, { symbol: 'STB', sector: 'NGÂN HÀNG' },
    { symbol: 'VCB', sector: 'NGÂN HÀNG' }, { symbol: 'VPB', sector: 'NGÂN HÀNG' },
    { symbol: 'SHB', sector: 'NGÂN HÀNG' }, { symbol: 'BID', sector: 'NGÂN HÀNG' },
    { symbol: 'SSI', sector: 'CHỨNG KHOÁN' }, { symbol: 'VND', sector: 'CHỨNG KHOÁN' },
    { symbol: 'VCI', sector: 'CHỨNG KHOÁN' }, { symbol: 'SHS', sector: 'CHỨNG KHOÁN' },
    { symbol: 'HPG', sector: 'THÉP' }, { symbol: 'HSG', sector: 'THÉP' }, { symbol: 'NKG', sector: 'THÉP' },
    { symbol: 'DIG', sector: 'BẤT ĐỘNG SẢN' }, { symbol: 'NVL', sector: 'BẤT ĐỘNG SẢN' },
    { symbol: 'PDR', sector: 'BẤT ĐỘNG SẢN' }, { symbol: 'VHM', sector: 'BẤT ĐỘNG SẢN' },
    { symbol: 'VIC', sector: 'BẤT ĐỘNG SẢN' },
    { symbol: 'MWG', sector: 'BÁN LẺ' }, { symbol: 'FRT', sector: 'BÁN LẺ' }, { symbol: 'DGW', sector: 'BÁN LẺ' },
    { symbol: 'FPT', sector: 'CÔNG NGHỆ' }, { symbol: 'CMG', sector: 'CÔNG NGHỆ' },
    { symbol: 'PVD', sector: 'DẦU KHÍ' }, { symbol: 'PVS', sector: 'DẦU KHÍ' }, { symbol: 'BSR', sector: 'DẦU KHÍ' },
    { symbol: 'DGC', sector: 'HÓA CHẤT' }, { symbol: 'DCM', sector: 'HÓA CHẤT' },
    { symbol: 'GMD', sector: 'VẬN TẢI BIỂN' }, { symbol: 'HAH', sector: 'VẬN TẢI BIỂN' },
    { symbol: 'BVH', sector: 'BẢO HIỂM' }, { symbol: 'MIG', sector: 'BẢO HIỂM' },
    { symbol: 'REE', sector: 'ĐIỆN' }, { symbol: 'PC1', sector: 'ĐIỆN' }, { symbol: 'POW', sector: 'ĐIỆN' },
    { symbol: 'MSN', sector: 'THỰC PHẨM' }, { symbol: 'VNM', sector: 'THỰC PHẨM' }, { symbol: 'SAB', sector: 'THỰC PHẨM' },
    { symbol: 'HVN', sector: 'HÀNG KHÔNG' }, { symbol: 'VJC', sector: 'HÀNG KHÔNG' },
    { symbol: 'CTD', sector: 'XÂY DỰNG' }, { symbol: 'HBC', sector: 'XÂY DỰNG' },
];

const SECTOR_MAP = Object.fromEntries(CORE_STOCKS.map(s => [s.symbol, s.sector]));

//=========================================================
//SOURCE 1: entrade (primary)
//SOURCE 2: TCBS public API (fallback)
//=========================================================

//---Market Breadth ---
const fetchBreadthEntrade = async () => {
    const res = await axios.get(
        'https://services.entrade.com.vn/chart-api/v2/market-breadth?exchange=HOSE',
        { headers: HEADERS, timeout: 6000 }
    );
    const d = res.data;
    if (!d || (!d.advance && !d.advances)) throw new Error('Thiếu field advance');
    return {
        up:        Number(d.advance  || d.advances || d.up   || 0),
        down:      Number(d.decline  || d.declines || d.down || 0),
        unchanged: Number(d.noChange || d.unchanged || d.same || 0),
        _source: 'entrade', _isReal: true,
    };
};

//TCBS breadth: gọi market-stats
const fetchBreadthTcbs = async () => {
    const res = await axios.get(
        'https://apipubaws.tcbs.com.vn/stock-insight/v1/market/market-stats',
        { headers: { ...HEADERS, Referer: 'https://tcinvest.tcbs.com.vn/' }, timeout: 6000 }
    );
    const d = res.data?.data || res.data;
    if (!d) throw new Error('No data');
    const up   = Number(d.advance   || d.totalAdvance  || d.up   || 0);
    const down = Number(d.decline   || d.totalDecline  || d.down || 0);
    if (up === 0 && down === 0) throw new Error('Breadth zero');
    return { up, down, unchanged: Number(d.noChange || 0), _source: 'tcbs', _isReal: true };
};

const fetchRealMarketBreadth = async () => {
    for (const fn of [fetchBreadthEntrade, fetchBreadthTcbs]) {
        try {
            const result = await fn();
            console.log(chalk.green(`[SCRAPER] Breadth thực (${result._source}): ↑${result.up} ↓${result.down}`));
            return result;
        } catch (err) {
            console.log(chalk.yellow(`[SCRAPER] Breadth source lỗi: ${err.message}`));
        }
    }
    return null;
};

//---Foreign Flow ---
const fetchForeignEntrade = async (from, to) => {
    const res = await axios.get(
        `https://services.entrade.com.vn/chart-api/v2/foreign-trading?exchange=HOSE&from=${from}&to=${to}`,
        { headers: HEADERS, timeout: 8000 }
    );
    const d = res.data;
    if (!d) throw new Error('No data');
    const topBuy  = (d.buyList  || d.top_buy  || []).slice(0, 15).map(i => ({ symbol: i.symbol || i.code, value: Number(i.buyValue  || i.buy_value  || 0) }));
    const topSell = (d.sellList || d.top_sell || []).slice(0, 15).map(i => ({ symbol: i.symbol || i.code, value: Number(i.sellValue || i.sell_value || 0) }));
    return { netValue: Number(d.netValue || d.net_value || 0), topBuy, topSell, _source: 'entrade' };
};

const fetchForeignTcbs = async () => {
    const res = await axios.get(
        'https://apipubaws.tcbs.com.vn/stock-insight/v1/market/foreign-room',
        { headers: { ...HEADERS, Referer: 'https://tcinvest.tcbs.com.vn/' }, timeout: 8000 }
    );
    const items = res.data?.data || res.data || [];
    if (!Array.isArray(items) || items.length === 0) throw new Error('No items');
    const sorted = [...items].sort((a, b) => (b.netVal || 0) - (a.netVal || 0));
    const topBuy  = sorted.filter(i => (i.netVal || 0) > 0).slice(0, 15)
        .map(i => ({ symbol: i.ticker || i.symbol, value: Math.abs(i.netVal || 0) }));
    const topSell = sorted.filter(i => (i.netVal || 0) < 0).slice(0, 15)
        .map(i => ({ symbol: i.ticker || i.symbol, value: Math.abs(i.netVal || 0) }));
    const netValue = items.reduce((s, i) => s + (i.netVal || 0), 0);
    return { netValue, topBuy, topSell, _source: 'tcbs' };
};

const fetchForeignFlow = async (from, to) => {
    for (const fn of [() => fetchForeignEntrade(from, to), fetchForeignTcbs]) {
        try {
            const result = await fn();
            console.log(chalk.green(`[SCRAPER] ForeignFlow (${result._source}): net=${(result.netValue/1e9).toFixed(1)}B, buy=${result.topBuy.length}, sell=${result.topSell.length}`));
            return result;
        } catch (err) {
            console.log(chalk.yellow(`[SCRAPER] ForeignFlow source lỗi: ${err.message}`));
        }
    }
    console.log(chalk.yellow('[SCRAPER] Tất cả ForeignFlow API fail → trả về rỗng'));
    return { netValue: 0, topBuy: [], topSell: [], _source: 'none' };
};

//---Heatmap /Top Liquidity ---
const fetchHeatmapEntrade = async (from, to) => {
    const res = await axios.get(
        `https://services.entrade.com.vn/chart-api/v2/heatmap?exchange=HOSE&from=${from}&to=${to}`,
        { headers: HEADERS, timeout: 8000 }
    );
    const symbols = res.data?.symbols || [];
    if (!symbols.length) throw new Error('Empty heatmap');
    return symbols;
};

const fetchTopLiquidityStocks = async (from, to) => {
    try {
        const symbols = await fetchHeatmapEntrade(from, to);
        const coreSet = new Set(CORE_STOCKS.map(s => s.symbol));
        const extras = symbols
            .sort((a, b) => (b.value || 0) - (a.value || 0))
            .slice(0, 20)
            .filter(s => !coreSet.has(s.symbol))
            .slice(0, 10)
            .map(s => ({ symbol: s.symbol, sector: s.icbName2 || s.sector || 'KHÁC', _fromLiquidity: true }));
        console.log(chalk.magenta(`[SCRAPER] Top liquidity: ${extras.map(s => s.symbol).join(', ')}`));
        return extras;
    } catch (err) {
        console.log(chalk.yellow(`[SCRAPER] Heatmap fail (${err.message}) → bỏ qua extra stocks`));
        return [];
    }
};

//---OHLC per stock (multi-source) ---
const fetchOhlcEntrade = async (symbol, from, to) => {
    const res = await axios.get(
        `https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${from}&to=${to}&symbol=${symbol}&resolution=1D`,
        { headers: HEADERS, timeout: 8000 }
    );
    if (!res.data?.t?.length) throw new Error('Empty');
    return res.data;
};

const fetchOhlcTcbs = async (symbol, from, to) => {
    const res = await axios.get(
        `https://apipubaws.tcbs.com.vn/stock-insight/v1/stock/bars-long-term?ticker=${symbol}&type=stock&resolution=D&from=${from}&to=${to}`,
        { headers: { ...HEADERS, Referer: 'https://tcinvest.tcbs.com.vn/' }, timeout: 8000 }
    );
//TCBS trả về { data: [{open,high,low,close,volume,tradingDate}] }
    const bars = res.data?.data || [];
    if (!bars.length) throw new Error('Empty');
//Normalize to entrance format {t,o,h,l,c,v}
    return {
        t: bars.map(b => new Date(b.tradingDate).getTime() / 1000),
        o: bars.map(b => b.open),
        h: bars.map(b => b.high),
        l: bars.map(b => b.low),
        c: bars.map(b => b.close),
        v: bars.map(b => b.volume),
    };
};

const fetchOhlcSafe = async (symbol, from, to) => {
    for (const fn of [() => fetchOhlcEntrade(symbol, from, to), () => fetchOhlcTcbs(symbol, from, to)]) {
        try { return await fn(); } catch { /*try next */ }
    }
    return null;
};

//=========================================================
//MAIN EXPORT
//=========================================================
export const scrapeCafefMarketOverview = async () => {
    try {
        const to   = Math.floor(Date.now() / 1000);
        const from = to - (10 * 24 * 60 * 60);

        const [foreignFlow, realBreadth, liquidityExtras] = await Promise.all([
            fetchForeignFlow(from, to),
            fetchRealMarketBreadth(),
            fetchTopLiquidityStocks(from, to),
        ]);

        //Merge basket
        const coreSet  = new Set(CORE_STOCKS.map(s => s.symbol));
        const allStocks = [
            ...CORE_STOCKS,
            ...liquidityExtras.filter(s => !coreSet.has(s.symbol)),
        ];
        console.log(chalk.cyan(`[SCRAPER] Tổng mã fetch: ${allStocks.length} (${CORE_STOCKS.length} core + ${liquidityExtras.length} liquid)`));

        //Fetch OHLC song song — chunk 5
        let breadthFromCore = { up: 0, down: 0, unchanged: 0 };
        let activeVolumeStocks = [];
        const CHUNK = 5;

        for (let i = 0; i < allStocks.length; i += CHUNK) {
            const chunk = allStocks.slice(i, i + CHUNK);
            const results = await Promise.all(
                chunk.map(stock =>
                    fetchOhlcSafe(stock.symbol, from, to)
                        .then(data => ({ ...stock, data }))
                )
            );

            results.forEach(res => {
                if (!res.data?.t?.length) return;
                const d   = res.data;
                const len = d.c.length;

                const currentPrice = Number(d.c[len - 1]);
                const prevClose    = len > 1 ? Number(d.c[len - 2]) : 0;
                const openToday    = Number(d.o?.[len - 1]) || 0;
                const refPrice     = prevClose > 0 ? prevClose : openToday;
                const volume       = Number(d.v[len - 1]) || 0;
                const changePct    = refPrice > 0 ? ((currentPrice - refPrice) / refPrice) * 100 : 0;

                //FIX: momentum3d — find sessions ≥3 real days ago, do not use hard index
                //len-1 = today, len-4 = 3 sessions ago (flexible index)
                let momentum3d = changePct; //default fallback
                if (len >= 4) {
                    const base = Number(d.c[len - 4]);
                    if (base > 0) momentum3d = ((currentPrice - base) / base) * 100;
                } else if (len >= 2) {
                    //There are only 2-3 candles → use the available time, mark to quant weight loss
                    const base = Number(d.c[0]);
                    if (base > 0) momentum3d = ((currentPrice - base) / base) * 100;
                }
                //If there is only 1 candlestick → momentum3d = changePct (unreliable, quant will detect via _shortData)

                const marketCapProxy = volume * currentPrice;

                if (!res._fromLiquidity) {
                    if      (changePct >  0.05) breadthFromCore.up        += 1;
                    else if (changePct < -0.05) breadthFromCore.down      += 1;
                    else                         breadthFromCore.unchanged += 1;
                }

                activeVolumeStocks.push({
                    symbol:       res.symbol,
                    sector:       res.sector || SECTOR_MAP[res.symbol] || null,
                    volume,
                    changePct,
                    momentum3d,
                    _hasFullMomentum: len >= 4,  //flag to determine if the data is enough
                    marketCapProxy,
                    currentPrice,
                });
            });
        }

        console.log(chalk.cyan(`[SCRAPER] activeVolumeStocks: ${activeVolumeStocks.length} mã hợp lệ`));

        //=== FIX foreign flow for external code CORE_STOCKS ===
        //Assign sectors to topBuy/topSell using SECTOR_MAP or activeVolumeStocks
        const sectorFromActive = Object.fromEntries(
            activeVolumeStocks.map(s => [s.symbol, s.sector])
        );
        const resolveSector = (symbol) =>
            sectorFromActive[symbol] || SECTOR_MAP[symbol] || null;

        const enrichedForeignFlow = {
            ...foreignFlow,
            topBuy:  foreignFlow.topBuy.map(i => ({ ...i, sector: resolveSector(i.symbol) })),
            topSell: foreignFlow.topSell.map(i => ({ ...i, sector: resolveSector(i.symbol) })),
        };

        //Breadth: Real API > fallback scale from CORE_STOCKS
        let marketBreadth;
        if (realBreadth && realBreadth.up > 0) {
            marketBreadth = realBreadth;
        } else {
            const total = breadthFromCore.up + breadthFromCore.down + breadthFromCore.unchanged || 1;
            const scale = 400 / total;
            marketBreadth = {
                up:        Math.round(breadthFromCore.up        * scale),
                down:      Math.round(breadthFromCore.down      * scale),
                unchanged: Math.round(breadthFromCore.unchanged * scale),
                _isFallback: true,
                _source: 'core_stocks',
            };
            console.log(chalk.yellow(`[SCRAPER] Dùng breadth ước tính (scaled ${allStocks.length} mã): ↑${marketBreadth.up} ↓${marketBreadth.down}`));
        }

        return {
            success: true,
            timestamp: new Date().toISOString(),
            marketBreadth,
            foreignFlow: enrichedForeignFlow,
            activeVolumeStocks,
        };

    } catch (error) {
        console.error(chalk.red(`[SCRAPER ERROR] ${error.message}`));
        return { success: false, error: error.message };
    }
};