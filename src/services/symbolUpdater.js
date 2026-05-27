import chalk from 'chalk';
import axios from 'axios';
import Stock from '../../models/Stock.js';
const FALLBACK_STOCKS = [
    { symbol: 'MBB', companyName: 'Ngân hàng TMCP Quân đội', exchange: 'HOSE' },
    { symbol: 'SSI', companyName: 'CTCP Chứng khoán SSI', exchange: 'HOSE' },
    { symbol: 'FPT', companyName: 'CTCP FPT', exchange: 'HOSE' },
    { symbol: 'HPG', companyName: 'CTCP Tập đoàn Hòa Phát', exchange: 'HOSE' },
    { symbol: 'VIC', companyName: 'Tập đoàn Vingroup', exchange: 'HOSE' }
];

export async function updateSymbolsDatabase() {
    console.log(chalk.whiteBright('\n[HỆ THỐNG] Đang đồng bộ danh sách mã chứng khoán lên Cloud MongoDB...'));

    try {
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
            
            if (allStocks.length > 100) {
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
                return allStocks;
            }
        }
        throw new Error("Dữ liệu CafeF trả về không hợp lệ hoặc quá ít.");

    } catch (error) {
        console.log(chalk.red(`[LỖI] Quá trình đồng bộ thất bại: ${error.message}`));

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
