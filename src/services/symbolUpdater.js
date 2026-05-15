import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import axios from 'axios';

const SYMBOLS_FILE = path.join(process.cwd(), 'data', 'symbols_database.json');

// Kế hoạch C (Dự phòng khẩn cấp)
const FALLBACK_STOCKS = [
    { symbol: 'MBB', name: 'Ngân hàng TMCP Quân đội', exchange: 'HOSE' },
    { symbol: 'SSI', name: 'CTCP Chứng khoán SSI', exchange: 'HOSE' },
    { symbol: 'FPT', name: 'CTCP FPT', exchange: 'HOSE' },
    { symbol: 'HPG', name: 'CTCP Tập đoàn Hòa Phát', exchange: 'HOSE' },
    { symbol: 'VIC', name: 'Tập đoàn Vingroup', exchange: 'HOSE' }
];

export async function updateSymbolsDatabase() {
    console.log(chalk.cyan('\n[OMNI DUCK QUANT] Đang khởi động trạm Radar quét mã chứng khoán...'));

    if (!fs.existsSync(path.join(process.cwd(), 'data'))) {
        fs.mkdirSync(path.join(process.cwd(), 'data'));
    }

    try {
        // ==========================================
        // ƯU TIÊN 1: VỆ TINH CAFEF (Bắt chuẩn JSON mới)
        // ==========================================
        console.log(chalk.yellow('Đang kết nối vệ tinh CafeF...'));
        const cafefRes = await axios.get('https://cafefnew.mediacdn.vn/Search/company.json', { timeout: 8000 });
        
        if (cafefRes.data && Array.isArray(cafefRes.data)) {
            const allStocks = cafefRes.data
                .map(item => {
                    // 1. Bắt mã và tên theo đúng cấu trúc Đại ca gửi
                    const symbol = item.Symbol || item.a || '';
                    const name = item.Title || item.Description || item.b || symbol;
                    
                    let exchange = 'VNX';
                    
                    // 2. TUYỆT CHIÊU: Bóc tách sàn giao dịch thẳng từ RedirectUrl
                    if (item.RedirectUrl) {
                        const url = item.RedirectUrl.toLowerCase();
                        if (url.includes('/hose/')) exchange = 'HOSE';
                        else if (url.includes('/hnx/')) exchange = 'HNX';
                        else if (url.includes('/upcom/')) exchange = 'UPCOM';
                    } 
                    
                    // 3. Fallback bằng CenterId (phòng trường hợp link bị lỗi)
                    if (exchange === 'VNX') {
                        if (item.CenterId === 1) exchange = 'HOSE';
                        else if (item.CenterId === 2) exchange = 'HNX';
                        else if (item.CenterId === 8 || item.CenterId === 9) exchange = 'UPCOM';
                    }

                    return { symbol: symbol.toUpperCase(), name, exchange };
                })
                .filter(s => s.symbol && s.symbol.length === 3 && /^[A-Z0-9]{3}$/.test(s.symbol)); // Chỉ lấy mã 3 ký tự (chữ + số)
            
            if (allStocks.length > 100) {
                fs.writeFileSync(SYMBOLS_FILE, JSON.stringify(allStocks, null, 2));
                console.log(chalk.green(`✔ VỆ TINH CAFEF: Đã nạp thành công ${allStocks.length} mã chứng khoán.`));
                return allStocks;
            }
        }
        throw new Error("Dữ liệu CafeF trả về không hợp lệ hoặc quá ít.");

    } catch (errorCafef) {
        console.log(chalk.red(`✘ LỖI CAFEF: ${errorCafef.message}`));
        
        try {
            // ==========================================
            // ƯU TIÊN 2: VỆ TINH TRADINGVIEW (Dự phòng)
            // ==========================================
            console.log(chalk.yellow('Kích hoạt vệ tinh dự phòng TradingView...'));
            const tvRes = await axios.post('https://scanner.tradingview.com/vietnam/scan', {
                "columns": ["name", "description", "exchange"], 
                "range": [0, 2000], 
                "sort": { "sortBy": "name", "sortOrder": "asc" }
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 8000 
            });

            if (tvRes.data && tvRes.data.data) {
                const allStocks = tvRes.data.data
                    .map(item => ({
                        symbol: item.d[0], 
                        name: item.d[1],   
                        exchange: item.d[2] 
                    }))
                    .filter(s => s.symbol && s.symbol.length === 3);

                fs.writeFileSync(SYMBOLS_FILE, JSON.stringify(allStocks, null, 2));
                console.log(chalk.green(`✔ VỆ TINH TRADINGVIEW: Đã nạp thành công ${allStocks.length} mã chứng khoán.`));
                return allStocks;
            } else {
                throw new Error("TradingView không trả về dữ liệu.");
            }

        } catch (errorTv) {
            console.log(chalk.bgRed.white.bold(`\n ✘ LỖI VỆ TINH TRADINGVIEW: ${errorTv.message} `));
            console.log(chalk.yellow(`⚠ Cảnh báo: Mất kết nối diện rộng. Kích hoạt Database ngoại tuyến (Offline)...`));
            
            // ==========================================
            // ƯU TIÊN 3: KHÔI PHỤC TỪ DATABASE OFFLINE
            // ==========================================
            if (fs.existsSync(SYMBOLS_FILE)) {
                console.log(chalk.green(`✔ Đã khôi phục dữ liệu từ file symbols_database.json cũ.`));
                return JSON.parse(fs.readFileSync(SYMBOLS_FILE));
            } else {
                console.log(chalk.green(`✔ Sử dụng mảng dữ liệu dự phòng khẩn cấp.`));
                fs.writeFileSync(SYMBOLS_FILE, JSON.stringify(FALLBACK_STOCKS, null, 2));
                return FALLBACK_STOCKS;
            }
        }
    }
}