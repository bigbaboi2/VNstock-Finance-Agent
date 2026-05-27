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
//BREADTH SOURCES: entrade - TCBS - VNDirect (Tầng 3)
//=========================================================

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

const VNDIRECT_HEADERS = {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Origin':  'https://dboard.vndirect.com.vn',
    'Referer': 'https://dboard.vndirect.com.vn/',
};

//─── Tầng 3: VNDirect ─────────────────────
const fetchBreadthVndirect = async () => {
    const ENDPOINTS = [
        'https://finfo-api.vndirect.com.vn/v4/indices?q=code:VNINDEX&fields=code,advance,decline,noChange',
        'https://finfo-api.vndirect.com.vn/v4/index_components?q=indexCode:VNINDEX&size=1&page=1',
    ];
    for (const url of ENDPOINTS) {
        try {
            const res = await axios.get(url, { headers: VNDIRECT_HEADERS, timeout: 8000 });
            const d = res.data?.data?.[0] || res.data?.data || res.data;
            const up   = Number(d?.advance || d?.advances || d?.upCount   || 0);
            const down = Number(d?.decline || d?.declines || d?.downCount || 0);
            if (up > 0 || down > 0) {
                return { up, down, unchanged: Number(d?.noChange || d?.unchanged || 0), _source: 'vndirect', _isReal: true };
            }
        } catch {  }
    }
    throw new Error('VNDirect breadth: tất cả endpoint trả về zero');
};

//─── Tầng 4: SSI iBoard public API ───────────────────────────────────────────────────
const fetchBreadthSsi = async () => {
    const res = await axios.get(
        'https://iboard-query.ssi.com.vn/v2/market-watch/market-stat?exchange=HOSE',
        {
            headers: {
                'User-Agent': UA,
                'Origin':  'https://iboard.ssi.com.vn',
                'Referer': 'https://iboard.ssi.com.vn/',
                'Accept':  'application/json',
            },
            timeout: 8000,
        }
    );
    const d = res.data?.data || res.data;
    if (!d) throw new Error('SSI iBoard: no data');
    const up   = Number(d.advance   || d.noOfAdvance || d.advances || 0);
    const down = Number(d.decline   || d.noOfDecline || d.declines || 0);
    if (up === 0 && down === 0) throw new Error('SSI iBoard: breadth zero');
    return { up, down, unchanged: Number(d.noChange || d.noOfNoChange || 0), _source: 'ssi', _isReal: true };
};

const fetchRealMarketBreadth = async () => {
    for (const fn of [fetchBreadthEntrade, fetchBreadthTcbs, fetchBreadthVndirect, fetchBreadthSsi]) {
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

//=========================================================
//FOREIGN FLOW SOURCES: entrade → TCBS → VNDirect (Tầng 3 — header dboard)
//=========================================================

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

//─── Tầng 3: VNDirect foreign flow (header dboard) ──────────────────────────────────────
const fetchForeignVndirect = async () => {
    const todayStr  = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    for (const date of [todayStr, yesterday]) {
        try {
            const res = await axios.get(
                `https://finfo-api.vndirect.com.vn/v4/trading_statistics?q=date:${date}~type:STOCK~floor:HOSE&size=200`,
                { headers: VNDIRECT_HEADERS, timeout: 8000 }
            );
            const items = res.data?.data || [];
            if (!Array.isArray(items) || items.length === 0) continue;

            let netValue = 0;
            const stockMap = {};
            items.forEach(i => {
                const sym = i.code || i.symbol;
                const net = Number(
                    i.netForeignValue || i.foreignNetValue ||
                    i.foreignNet      || i.fNetVal         ||
                    i.netForeign      || 0
                );
                if (sym) stockMap[sym] = (stockMap[sym] || 0) + net;
                netValue += net;
            });

            const sorted = Object.entries(stockMap).sort((a, b) => b[1] - a[1]);
            const topBuy  = sorted.filter(([, v]) => v > 0).slice(0, 15)
                .map(([symbol, value]) => ({ symbol, value }));
            const topSell = sorted.filter(([, v]) => v < 0).slice(0, 15)
                .map(([symbol, value]) => ({ symbol, value: Math.abs(value) }));

            if (topBuy.length > 0 || topSell.length > 0) {
                console.log(chalk.green(`[SCRAPER] ForeignFlow VNDirect (${date}): net=${(netValue/1e9).toFixed(1)}B`));
                return { netValue, topBuy, topSell, _source: `vndirect_${date}` };
            }
        } catch (e) {
            console.log(chalk.yellow(`[SCRAPER] VNDirect foreign (${date}) lỗi: ${e.message}`));
        }
    }
    throw new Error('VNDirect: Không có dữ liệu foreign flow');
};

//─── Tầng 4: SSI iBoard foreign flow ─────────────────────────────────────────────────
const fetchForeignSsi = async () => {
    const res = await axios.get(
        'https://iboard-query.ssi.com.vn/v2/market-watch/foreign-trading?exchange=HOSE',
        {
            headers: {
                'User-Agent': UA,
                'Origin':  'https://iboard.ssi.com.vn',
                'Referer': 'https://iboard.ssi.com.vn/',
                'Accept':  'application/json',
            },
            timeout: 8000,
        }
    );
    const items = res.data?.data || res.data || [];
    if (!Array.isArray(items) || items.length === 0) throw new Error('SSI foreign: empty');
    const sorted = [...items].sort((a, b) => (b.netVal || b.netValue || 0) - (a.netVal || a.netValue || 0));
    const topBuy  = sorted.filter(i => (i.netVal || i.netValue || 0) > 0).slice(0, 15)
        .map(i => ({ symbol: i.symbol || i.ticker || i.code, value: Math.abs(i.netVal || i.netValue || 0) }));
    const topSell = sorted.filter(i => (i.netVal || i.netValue || 0) < 0).slice(0, 15)
        .map(i => ({ symbol: i.symbol || i.ticker || i.code, value: Math.abs(i.netVal || i.netValue || 0) }));
    const netValue = items.reduce((s, i) => s + (i.netVal || i.netValue || 0), 0);
    if (topBuy.length === 0 && topSell.length === 0) throw new Error('SSI foreign: no buy/sell data');
    return { netValue, topBuy, topSell, _source: 'ssi' };
};

const fetchForeignFlow = async (from, to) => {
    for (const fn of [
        () => fetchForeignEntrade(from, to),
        fetchForeignTcbs,
        fetchForeignVndirect,
        fetchForeignSsi,
    ]) {
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

const fetchHeatmapEntrade = async (from, to) => {
    const res = await axios.get(
        `https://services.entrade.com.vn/chart-api/v2/heatmap?exchange=HOSE&from=${from}&to=${to}`,
        { headers: HEADERS, timeout: 8000 }
    );
    const symbols = res.data?.symbols || [];
    if (!symbols.length) throw new Error('Empty heatmap');
    return symbols;
};

//─── FIX 4: Nếu heatmap entrade fail → dùng activeVolumeStocks (được tính sau)
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
        console.log(chalk.magenta(`[SCRAPER] Top liquidity entrade: ${extras.map(s => s.symbol).join(', ')}`));
        return { extras, _source: 'entrade' };
    } catch (err) {
        console.log(chalk.yellow(`[SCRAPER] Heatmap entrade fail (${err.message}) → sẽ dùng activeVolumeStocks`));
        return { extras: [], _source: 'fallback' };
    }
};

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
    const bars = res.data?.data || [];
    if (!bars.length) throw new Error('Empty');
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

        const [foreignFlow, realBreadth, liquidityResult] = await Promise.all([
            fetchForeignFlow(from, to),
            fetchRealMarketBreadth(),
            fetchTopLiquidityStocks(from, to),
        ]);

        const { extras: liquidityExtras, _source: liquiditySource } = liquidityResult;

        //Merge basket
        const coreSet   = new Set(CORE_STOCKS.map(s => s.symbol));
        const allStocks = [
            ...CORE_STOCKS,
            ...liquidityExtras.filter(s => !coreSet.has(s.symbol)),
        ];
        console.log(chalk.cyan(`[SCRAPER] Tổng mã fetch: ${allStocks.length} (${CORE_STOCKS.length} core + ${liquidityExtras.length} liquid từ ${liquiditySource})`));

        let breadthFromCore   = { up: 0, down: 0, unchanged: 0 };
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

                let momentum3d = changePct;
                if (len >= 4) {
                    const base = Number(d.c[len - 4]);
                    if (base > 0) momentum3d = ((currentPrice - base) / base) * 100;
                } else if (len >= 2) {
                    const base = Number(d.c[0]);
                    if (base > 0) momentum3d = ((currentPrice - base) / base) * 100;
                }

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
                    _hasFullMomentum: len >= 4,
                    marketCapProxy,
                    currentPrice,
                });
            });
        }

        console.log(chalk.cyan(`[SCRAPER] activeVolumeStocks: ${activeVolumeStocks.length} mã hợp lệ`));

        if (liquiditySource === 'fallback' && activeVolumeStocks.length > 0) {
            const topLiqFromActive = [...activeVolumeStocks]
                .sort((a, b) => (b.volume * b.currentPrice) - (a.volume * a.currentPrice))
                .slice(0, 5);
            console.log(chalk.yellow(
                `[SCRAPER] Heatmap fallback — top vol từ activeVolumeStocks: ` +
                topLiqFromActive.map(s => `${s.symbol}(${(s.volume * s.currentPrice / 1e9).toFixed(1)}B)`).join(', ')
            ));
        }

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