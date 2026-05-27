import inquirer from 'inquirer';
import chalk from 'chalk';
import clear from 'clear';

import apiClient from './apiClient.js';
import { renderMarketRadar } from './views/marketView.js';
import { renderStockDetail, renderAiReport } from './views/stockView.js';
import { renderDerivativesMatrix } from './views/derivView.js';
import { renderCryptoMarket } from './views/cryptoView.js';

//=======================================================================
//UTILITY FUNCTION
//=======================================================================
const showHeader = () => {
    clear();
    console.log(chalk.bgGreen.black.bold(' 🦆 OMNI DUCK QUANTITATIVE TERMINAL V1.0 '));
    console.log(chalk.gray('Hệ thống Phân tích Định lượng & AI Tốc độ cao\n'));
};

const pause = async () => {
    await inquirer.prompt([{ 
        type: 'input', 
        name: 'continue', 
        message: chalk.cyan('Nhấn [Enter] để quay lại Menu Chính...') 
    }]);
};

//=======================================================================
//MODULE 1: BASE MARKET RADAR
//=======================================================================
const handleMarketRadar = async () => {
    showHeader();
    console.log(chalk.yellow('Đang quét ma trận dòng tiền toàn thị trường...'));
    try {
        const res = await apiClient.get('/market-radar');
        renderMarketRadar(res.data.data);
    } catch (error) {
        console.log(chalk.red(`[LỖI API] Không thể tải Radar: ${error.message}`));
    }
    await pause();
};

//=======================================================================
//MODULE 2: CODE VIEWING & AI ANALYSIS (STOCK)
//=======================================================================
const handleStockAnalysis = async () => {
    showHeader();
    const { symbol } = await inquirer.prompt([
        {
            type: 'input',
            name: 'symbol',
            message: 'Nhập mã cổ phiếu (VD: MBB, SSI, FPT):',
            filter: (val) => val.toUpperCase().trim(),
        }
    ]);

    if (!symbol) return;

    try {
        console.log(chalk.cyan(`\nĐang đồng bộ dữ liệu đa chiều cho [${symbol}]...`));
        
        const [historyRes, infoRes] = await Promise.all([
            apiClient.get(`/history/${symbol}`),
            apiClient.get(`/info/${symbol}`)
        ]);

        const chartData = historyRes.data?.data || [];
        const marketData = infoRes.data?.data;

        if (!marketData || !marketData.stockInfo) {
            console.log(chalk.red(`[!] Mã ${symbol} không tồn tại hoặc mất kết nối dữ liệu.`));
            await pause();
            return;
        }

        renderStockDetail(marketData, chartData);

        const { useAi } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'useAi',
                message: `Bạn có muốn kích hoạt AI Gemini phân tích mã ${symbol} không?`,
                default: false
            }
        ]);

        if (useAi) {
            console.log(chalk.magenta('\n[AI CORE] Đang khởi chạy thuật toán, bóc tách báo cáo tài chính...'));
            const payload = {
                stockInfo: marketData.stockInfo,
                companyProfile: marketData.companyProfile,
                technicalData: chartData.slice(-30),
            };
            
            const aiRes = await apiClient.post(`/analyze/${symbol}`, payload);
            renderAiReport(aiRes.data?.aiReport);
        }

    } catch (error) {
        console.log(chalk.red(`\n[LỖI HỆ THỐNG] ${error.message}`));
    }
    
    await pause();
};

//=======================================================================
//MODULE 3: DERIVATIVES VN30F1M
//=======================================================================
const handleDerivatives = async () => {
    showHeader();
    console.log(chalk.yellow('Đang tải dữ liệu Phái sinh VN30F1M Realtime...'));
    try {
        const [radarRes, chartRes] = await Promise.all([
            apiClient.get('/deriv-radar'),
            apiClient.get('/history/VN30F1M?interval=5 phút')
        ]);
        
        const derivRadar = radarRes.data?.data;
        const mockAnalysis = {
            score: 75,
            mechAction: 'QUAN SÁT',
            mechTrend: 'TÍCH LŨY',
            pocDistance: '0.00%',
            sl: (derivRadar?.vn30f1m - 3.5).toFixed(1),
            tp1: (derivRadar?.vn30f1m + 2.5).toFixed(1),
            tp2: (derivRadar?.vn30f1m + 5.0).toFixed(1),
            rrRatio: 1.5,
            mechReason: 'Biến động Basis và Khối lượng mở (OI) đang ở mức trung tính. Hệ thống mô phỏng.'
        };

        renderDerivativesMatrix(derivRadar, mockAnalysis, null);
    } catch (error) {
        console.log(chalk.red(`[LỖI API] Không thể tải dữ liệu Phái sinh: ${error.message}`));
    }
    await pause();
};

//=======================================================================
//MODULE 4: CRYPTO POWER PANEL
//=======================================================================
const handleCryptoRadar = async () => {
    showHeader();
    console.log(chalk.yellow('Đang quét top 100 Cryptocurrencies...'));
    try {
        const res = await apiClient.get('/crypto-symbols');
        const coins = res.data;
        renderCryptoMarket(coins);
    } catch (error) {
        console.log(chalk.red(`[LỖI API] Kết nối đến Binance/CoinGecko thất bại: ${error.message}`));
    }
    await pause();
};

//=======================================================================
//SYSTEM MAIN MENU LOOP
//=======================================================================
const startOmniTerminal = async () => {
    let running = true;
    while (running) {
        showHeader();
        
        const { action } = await inquirer.prompt([
            {
                type: 'select',  
                name: 'action',
                message: chalk.white.bold('CHỌN MODULE TÁC CHIẾN:'),
                pageSize: 8,
                choices: [
                    { name: chalk.cyan('📊 1. Ma trận Radar Toàn Cảnh (VN-Index)'), value: 'RADAR' },
                    { name: chalk.green('🔍 2. Tra cứu Cơ sở & AI Report'), value: 'STOCK' },
                    { name: chalk.magenta('⚡ 3. Giao dịch Phái Sinh (VN30F1M)'), value: 'DERIVATIVES' },
                    { name: chalk.yellow('🪙 4. Bảng điện Crypto Global'), value: 'CRYPTO' },
                    new inquirer.Separator(chalk.gray('──────────────────────────────')),
                    { name: chalk.red('❌ 0. Thoát hệ thống'), value: 'EXIT' }
                ]
            }
        ]);

        switch (action) {
            //... (The switch case part remains unchanged)
            case 'RADAR':
                await handleMarketRadar();
                break;
            case 'STOCK':
                await handleStockAnalysis();
                break;
            case 'DERIVATIVES':
                await handleDerivatives();
                break;
            case 'CRYPTO':
                await handleCryptoRadar();
                break;
            case 'EXIT':
                clear();
                console.log(chalk.green.bold('\nĐã ngắt kết nối hệ thống OMNI DUCK. Chào bạn!\n'));
                running = false;
                process.exit(0);
                break;
        }
    }
};

//Start the system
startOmniTerminal();