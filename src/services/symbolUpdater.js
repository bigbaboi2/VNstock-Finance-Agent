import chalk from 'chalk';
import axios from 'axios';
import Stock from '../../models/Stock.js';
import Setting from '../../models/Setting.js';

const FALLBACK_STOCKS = [
    { symbol: 'MBB', companyName: 'Ngân hàng TMCP Quân đội', exchange: 'HOSE' },
    { symbol: 'SSI', companyName: 'CTCP Chứng khoán SSI', exchange: 'HOSE' },
    { symbol: 'FPT', companyName: 'CTCP FPT', exchange: 'HOSE' },
    { symbol: 'HPG', companyName: 'CTCP Tập đoàn Hòa Phát', exchange: 'HOSE' },
    { symbol: 'VIC', companyName: 'Tập đoàn Vingroup', exchange: 'HOSE' }
];

const VCI_SYMBOLS_URL = 'https://trading.vietcap.com.vn/api/price/symbols/getAll';
const STOCK_CATALOG_SYNC_KEY = 'stockCatalogSync';
const MIN_STOCKS_FOR_CACHE = 100;
const DEFAULT_STOCK_CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

const getTtlMs = () => {
    const configured = Number(process.env.STOCK_CATALOG_CACHE_TTL_MS);
    return Number.isFinite(configured) && configured >= 0
        ? configured
        : DEFAULT_STOCK_CATALOG_TTL_MS;
};

const getFreshCatalogCache = async () => {
    const [syncState, stockCount] = await Promise.all([
        Setting.findOne({ key: STOCK_CATALOG_SYNC_KEY }).lean(),
        Stock.countDocuments({}),
    ]);
    const syncedAt = new Date(syncState?.value?.syncedAt || 0).getTime();
    const ageMs = Date.now() - syncedAt;
    const ttlMs = getTtlMs();

    return {
        isFresh: stockCount >= MIN_STOCKS_FOR_CACHE && syncedAt > 0 && ageMs >= 0 && ageMs < ttlMs,
        stockCount,
        ageMs,
        ttlMs,
    };
};

const saveCatalogSyncState = async ({ stockCount, vietcapCount = 0 }) => {
    await Setting.updateOne(
        { key: STOCK_CATALOG_SYNC_KEY },
        {
            $set: {
                value: {
                    syncedAt: new Date(),
                    stockCount,
                    vietcapCount,
                    source: 'cafef+vietcap',
                },
            },
        },
        { upsert: true }
    );
};

/**
 * Sync official English company names from Vietcap public listing API.
 * Source field: enOrganName (e.g. "Phu Nhuan Jewelry Joint Stock Company").
 */
export async function syncEnglishCompanyNamesFromVci() {
    console.log(chalk.yellow('[HỆ THỐNG] Đồng bộ tên tiếng Anh (Vietcap enOrganName)...'));
    try {
        const res = await axios.get(VCI_SYMBOLS_URL, {
            timeout: 25_000,
            headers: {
                Accept: 'application/json',
                'User-Agent': 'Mozilla/5.0 (compatible; OmniDuck/1.0)',
            },
        });
        const rows = Array.isArray(res.data) ? res.data : [];
        const ops = [];
        for (const row of rows) {
            const symbol = String(row.symbol || '').toUpperCase().trim();
            if (!symbol || !/^[A-Z0-9]{3}$/.test(symbol)) continue;
            if (String(row.type || '').toUpperCase() !== 'STOCK') continue;

            const companyNameEn = String(row.enOrganName || row.enOrganShortName || '').trim();
            const organNameVi = String(row.organName || '').trim();
            if (!companyNameEn && !organNameVi) continue;

            const $set = {};
            if (companyNameEn) $set.companyNameEn = companyNameEn;
            // Prefer Vietcap Vietnamese legal name when present (more consistent than CafeF Title)
            if (organNameVi && organNameVi.length > 3) $set.companyName = organNameVi;

            ops.push({
                updateOne: {
                    filter: { symbol },
                    update: { $set },
                    upsert: false,
                },
            });
        }

        if (ops.length === 0) {
            console.log(chalk.yellow('[HỆ THỐNG] Vietcap không trả tên EN hợp lệ.'));
            return 0;
        }

        // Chunk bulkWrite to avoid huge payloads
        const CHUNK = 500;
        let modified = 0;
        for (let i = 0; i < ops.length; i += CHUNK) {
            const result = await Stock.bulkWrite(ops.slice(i, i + CHUNK), { ordered: false });
            modified += (result.modifiedCount || 0) + (result.upsertedCount || 0);
        }
        console.log(chalk.green(`[HỆ THỐNG] Đã cập nhật tên EN cho ~${ops.length} mã (Vietcap).`));
        return ops.length;
    } catch (err) {
        console.log(chalk.red(`[HỆ THỐNG] Sync tên EN Vietcap thất bại: ${err.message}`));
        return 0;
    }
}

export async function updateSymbolsDatabase({ force = false } = {}) {
    console.log(chalk.whiteBright('\n[HỆ THỐNG] Đang đồng bộ danh sách mã chứng khoán lên Cloud MongoDB...'));

    try {
        const cache = await getFreshCatalogCache();
        if (!force && cache.isFresh) {
            const remainingMinutes = Math.max(0, Math.ceil((cache.ttlMs - cache.ageMs) / 60_000));
            console.log(chalk.cyan(
                `[HỆ THỐNG] Danh mục chứng khoán đang dùng cache MongoDB (${cache.stockCount} mã, refresh sau ~${remainingMinutes} phút).`
            ));
            return Stock.find({}, { symbol: 1, companyName: 1, companyNameEn: 1, exchange: 1, _id: 0 }).lean();
        }

        console.log(chalk.yellow('[HỆ THỐNG] Đang kết nối vệ tinh CafeF...'));
        const cafefRes = await axios.get('https://cafefnew.mediacdn.vn/Search/company.json', { timeout: 8000 });
        
        if (cafefRes.data && Array.isArray(cafefRes.data)) {
            const allStocks = cafefRes.data
                .map(item => {
                    const symbol = item.Symbol || item.a || '';
                    let companyName = item.Title || item.Description || item.b || '';
                    let exchange = 'VNX';
                    
                    if (item.RedirectUrl) {
                        const url = item.RedirectUrl.toLowerCase();
                        if (url.includes('/hose/')) exchange = 'HOSE';
                        else if (url.includes('/hnx/')) exchange = 'HNX';
                        else if (url.includes('/upcom/')) exchange = 'UPCOM';
                    } 
                    if (exchange === 'VNX') {
                        if (item.CenterId === 1) exchange = 'HOSE';
                        else if (item.CenterId === 2) exchange = 'HNX';
                        else if (item.CenterId === 8 || item.CenterId === 9) exchange = 'UPCOM';
                    }

                    return { symbol: symbol.toUpperCase(), companyName, exchange };
                })
                .filter(s => s.symbol && s.symbol.length === 3 && /^[A-Z0-9]{3}$/.test(s.symbol)); 
            
            if (allStocks.length > MIN_STOCKS_FOR_CACHE) {
                const finalBulkOps = allStocks.map(stock => {
                    let updateDoc = {
                        $set: { exchange: stock.exchange }
                    };
                    
                    if (stock.companyName && stock.companyName !== stock.symbol) {
                        updateDoc.$set.companyName = stock.companyName;
                    } else {
                        updateDoc.$setOnInsert = { companyName: stock.symbol };
                    }

                    return {
                        updateOne: {
                            filter: { symbol: stock.symbol },
                            update: updateDoc,
                            upsert: true 
                        }
                    };
                });

                await Stock.bulkWrite(finalBulkOps);
                console.log(chalk.green(`[HỆ THỐNG] Truy xuất CAFEF: Đã nạp & đồng bộ thành công ${allStocks.length} mã lên MongoDB.`));

                // Overlay official EN (+ cleaner VI) names from Vietcap
                const vietcapCount = await syncEnglishCompanyNamesFromVci();
                await saveCatalogSyncState({ stockCount: allStocks.length, vietcapCount });

                return allStocks;
            }
        }
        throw new Error("Dữ liệu CafeF trả về không hợp lệ hoặc quá ít.");

    } catch (error) {
        console.log(chalk.red(`[LỖI] Quá trình đồng bộ thất bại: ${error.message}`));

        // Still try EN sync if CafeF failed but DB already has symbols
        await syncEnglishCompanyNamesFromVci();

        const existingStocks = await Stock.find({});
        if (existingStocks.length > 0) {
            console.log(chalk.green(`[HỆ THỐNG] Đã khôi phục dữ liệu từ Cloud MongoDB cũ.`));
            return existingStocks;
        } else {
            console.log(chalk.yellow(`[CẢNH BÁO] Database trống, nạp mảng dự phòng khẩn cấp vào MongoDB...`));
            const fallbackOps = FALLBACK_STOCKS.map(s => ({
                updateOne: {
                    filter: { symbol: s.symbol },
                    update: { $set: { companyName: s.companyName, exchange: s.exchange } },
                    upsert: true
                }
            }));
            await Stock.bulkWrite(fallbackOps);
            return FALLBACK_STOCKS;
        }
    }
}
