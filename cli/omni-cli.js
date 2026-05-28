import inquirer from 'inquirer';
import chalk from 'chalk';
import clear from 'clear';

import apiClient from './apiClient.js';
import { renderMarketRadar } from './views/marketView.js';
import { renderStockDetail, renderAiReport } from './views/stockView.js';
import { renderDerivativesMatrix } from './views/derivView.js';
import { renderCryptoMarket } from './views/cryptoView.js';

//=======================================================================
// SHARED UTILITIES
//=======================================================================

const BOX_WIDTH = 80;

export const ui = {
    separator: (char = '═', color = chalk.cyan) =>
        color(char.repeat(BOX_WIDTH)),

    sectionTitle: (icon, title, color = chalk.cyan) =>
        `\n${color('┌' + '─'.repeat(BOX_WIDTH - 2) + '┐')}\n${color('│')} ${icon}  ${chalk.bold.white(title)}${' '.repeat(BOX_WIDTH - 5 - title.length)} ${color('│')}\n${color('└' + '─'.repeat(BOX_WIDTH - 2) + '┘')}`,

    badge: (text, bgColor = chalk.bgCyan) => bgColor.black.bold(` ${text} `),

    statusDot: (type) => {
        const dots = { bullish: chalk.green('●'), bearish: chalk.red('●'), warning: chalk.yellow('●'), neutral: chalk.gray('●') };
        return dots[type] || dots.neutral;
    },

    spinner: async (msg, fn) => {
        const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
        let i = 0;
        const interval = setInterval(() => {
            process.stdout.write(`\r${chalk.cyan(frames[i++ % frames.length])}  ${chalk.gray(msg)}   `);
        }, 80);
        try {
            const result = await fn();
            clearInterval(interval);
            process.stdout.write('\r' + ' '.repeat(msg.length + 10) + '\r');
            return result;
        } catch(e) {
            clearInterval(interval);
            process.stdout.write('\r' + ' '.repeat(msg.length + 10) + '\r');
            throw e;
        }
    },

    numberColor: (val, decimals = 2) => {
        const num = parseFloat(val);
        if (isNaN(num)) return chalk.gray('N/A');
        const sign = num >= 0 ? '+' : '';
        const text = `${sign}${num.toFixed(decimals)}%`;
        return num > 0 ? chalk.green.bold(text) : num < 0 ? chalk.red.bold(text) : chalk.gray(text);
    },

    formatPrice: (val) => {
        if (!val || val === '---') return chalk.gray('---');
        return chalk.yellow.bold(val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','));
    },

    tag: (text, color = chalk.cyan) => color(`[${text}]`),
};

//=======================================================================
// HEADER
//=======================================================================

const showHeader = () => {
    clear();
    const line1 = chalk.bgGreen.black.bold('  🦆 OMNI DUCK QUANTITATIVE TERMINAL  ') + chalk.bgBlack.green.bold(' v2.0 ');
    const line2 = chalk.gray(' Hệ thống Phân tích Định lượng · AI Finance Intelligence · Real-time Data');
    const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const timeStr = chalk.dim(`⏱  ${now}  (ICT)`);
    const pad = ' '.repeat(Math.max(0, BOX_WIDTH - 3 - now.length - 7));

    console.log('\n' + chalk.green('╔' + '═'.repeat(BOX_WIDTH - 2) + '╗'));
    console.log(chalk.green('║') + '  ' + line1 + chalk.green('║'));
    console.log(chalk.green('║') + '  ' + line2 + ' '.repeat(Math.max(0, BOX_WIDTH - 4 - 70)) + chalk.green('║'));
    console.log(chalk.green('║') + '  ' + timeStr + pad + chalk.green('║'));
    console.log(chalk.green('╚' + '═'.repeat(BOX_WIDTH - 2) + '╝') + '\n');
};

const showBreadcrumb = (...parts) => {
    const crumbs = ['OMNI DUCK', ...parts].join(chalk.gray(' › '));
    console.log(chalk.dim('  ' + crumbs) + '\n');
};

//=======================================================================
// PAUSE
//=======================================================================

const pause = async () => {
    console.log('\n' + chalk.dim('─'.repeat(BOX_WIDTH)));
    await inquirer.prompt([{
        type: 'input',
        name: 'continue',
        message: chalk.cyan('↩  Nhấn [Enter] để quay lại Menu Chính...')
    }]);
};

//=======================================================================
// MODULE 1: MARKET RADAR
//=======================================================================

const handleMarketRadar = async () => {
    showHeader();
    showBreadcrumb('📡 Market Radar');

    try {
        const res = await ui.spinner('Đang quét ma trận dòng tiền toàn thị trường...', () =>
            apiClient.get('/market-radar')
        );
        renderMarketRadar(res.data);
    } catch (error) {
        console.log('\n' + chalk.bgRed.white(' LỖI KẾT NỐI ') + ' ' + chalk.red(error.message));
        console.log(chalk.dim('  → Kiểm tra backend đang chạy tại http://localhost:3001'));
    }
    await pause();
};

//=======================================================================
// MODULE 2: STOCK ANALYSIS
//=======================================================================

const handleStockAnalysis = async () => {
    showHeader();
    showBreadcrumb('🔍 Tra cứu Cổ phiếu & AI Report');

    const { symbol } = await inquirer.prompt([{
        type: 'input',
        name: 'symbol',
        message: chalk.white('Nhập mã cổ phiếu') + chalk.gray(' (VD: MBB, SSI, FPT, VIC):'),
        filter: (val) => val.toUpperCase().trim(),
        validate: (val) => val.trim().length > 0 ? true : 'Vui lòng nhập mã cổ phiếu',
    }]);

    if (!symbol) return;

    console.log();

    try {
        const [historyRes, infoRes] = await Promise.all([
            ui.spinner(`Đồng bộ lịch sử giá [${symbol}]...`, () =>
                apiClient.get(`/history/${symbol}`)
            ),
            ui.spinner(`Tải thông tin thị trường [${symbol}]...`, () =>
                apiClient.get(`/info/${symbol}`)
            ),
        ]);

        const chartData = historyRes.data?.data || [];
        const marketData = infoRes.data?.data;

        if (!marketData || !marketData.stockInfo) {
            console.log('\n' + chalk.bgRed.white(' KHÔNG TÌM THẤY ') + chalk.red(` Mã ${symbol} không tồn tại hoặc mất kết nối dữ liệu.`));
            await pause();
            return;
        }

        // Show system logs if any
        const logs = infoRes.data?.logs || [];
        if (logs.length > 0) {
            console.log(chalk.dim('\n  System Log:'));
            logs.forEach(l => console.log(chalk.dim('  · ' + l)));
        }

        renderStockDetail(marketData, chartData);

        const { useAi } = await inquirer.prompt([{
            type: 'confirm',
            name: 'useAi',
            message: `${chalk.magenta('🤖')} Kích hoạt ${chalk.bold.magenta('AI Gemini')} phân tích chuyên sâu mã ${chalk.yellow.bold(symbol)}?`,
            default: true
        }]);

        if (useAi) {
            const payload = {
                stockInfo: marketData.stockInfo,
                companyProfile: marketData.companyProfile,
                technicalData: chartData.slice(-30),
            };

            try {
                const aiRes = await ui.spinner('AI Engine đang xử lý báo cáo định lượng...', () =>
                    apiClient.post(`/analyze/${symbol}`, payload)
                );
                renderAiReport(aiRes.data?.aiReport, symbol);
            } catch(aiErr) {
                console.log('\n' + chalk.bgRed.white(' LỖI AI ') + ' ' + chalk.red(aiErr.message));
            }
        }

    } catch (error) {
        console.log('\n' + chalk.bgRed.white(' LỖI HỆ THỐNG ') + ' ' + chalk.red(error.message));
    }

    await pause();
};

//=======================================================================
// MODULE 3: DERIVATIVES VN30F1M
//=======================================================================

const handleDerivatives = async () => {
    showHeader();
    showBreadcrumb('⚡ Phái Sinh VN30F1M');

    try {
        const [radarRes] = await Promise.all([
            ui.spinner('Tải dữ liệu Phái sinh VN30F1M Realtime...', () =>
                apiClient.get('/deriv-radar')
            ),
        ]);

        const derivRadar = radarRes.data?.data;

        if (!derivRadar) {
            console.log('\n' + chalk.yellow('⚠  Không có dữ liệu phái sinh. Server có thể đang cập nhật.'));
            await pause();
            return;
        }

        // Build real analysis from actual data
        const basisNum = parseFloat(derivRadar.basis || 0);
        const basisSpeedNum = parseFloat(derivRadar.basisSpeed || 0);
        const foreignNetNum = parseFloat(derivRadar.foreignNet || 0);

        let mechAction = 'QUAN SÁT';
        let mechTrend = 'TÍCH LŨY';
        let score = 50;

        if (basisNum > 2 && foreignNetNum > 0) { mechAction = 'LONG TIẾP CẬN'; mechTrend = 'TĂNG'; score = 72; }
        else if (basisNum < -2 && foreignNetNum < 0) { mechAction = 'SHORT TIẾP CẬN'; mechTrend = 'GIẢM'; score = 28; }
        else if (basisNum > 0 && basisSpeedNum > 0) { mechAction = 'QUAN SÁT LONG'; mechTrend = 'PHÂN HÓA'; score = 60; }
        else if (basisNum < 0 && basisSpeedNum < 0) { mechAction = 'QUAN SÁT SHORT'; mechTrend = 'PHÂN HÓA'; score = 40; }

        const basePrice = parseFloat(derivRadar.vn30f1m) || 0;
        const derivAnalysis = {
            score,
            mechAction,
            mechTrend,
            pocDistance: Math.abs(basisNum).toFixed(2) + '%',
            sl: (basePrice - 3.5).toFixed(1),
            tp1: (basePrice + 2.5).toFixed(1),
            tp2: (basePrice + 5.0).toFixed(1),
            rrRatio: '1:1.5',
            mechReason: basisNum > 0
                ? `Basis dương ${basisNum.toFixed(2)} điểm → Kỳ vọng thị trường lạc quan. Theo dõi vùng hỗ trợ kỹ thuật.`
                : `Basis âm ${basisNum.toFixed(2)} điểm → Áp lực bán chiếm ưu thế. Thận trọng vùng kháng cự kỹ thuật.`,
        };

        renderDerivativesMatrix(derivRadar, derivAnalysis, null);
    } catch (error) {
        console.log('\n' + chalk.bgRed.white(' LỖI API ') + ' ' + chalk.red(`Không thể tải dữ liệu Phái sinh: ${error.message}`));
    }
    await pause();
};

//=======================================================================
// MODULE 4: CRYPTO POWER PANEL
//=======================================================================

const handleCryptoRadar = async () => {
    showHeader();
    showBreadcrumb('🪙 Crypto Global Market');

    try {
        const res = await ui.spinner('Đang quét top Cryptocurrencies toàn cầu...', () =>
            apiClient.get('/crypto-symbols')
        );
        const coins = res.data;
        if (!coins || coins.length === 0) {
            console.log('\n' + chalk.yellow('⚠  Không có dữ liệu Crypto. Kiểm tra kết nối Binance/CoinGecko.'));
        } else {
            renderCryptoMarket(coins);
        }
    } catch (error) {
        console.log('\n' + chalk.bgRed.white(' LỖI API ') + ' ' + chalk.red(`Kết nối Binance/CoinGecko thất bại: ${error.message}`));
    }
    await pause();
};

//=======================================================================
// MAIN MENU
//=======================================================================

const startOmniTerminal = async () => {
    let running = true;

    while (running) {
        showHeader();

        console.log(chalk.dim('  Chọn module bằng phím mũi tên ↑↓ rồi nhấn Enter\n'));

        const { action } = await inquirer.prompt([{
            type: 'select',
            name: 'action',
            message: chalk.white.bold('CHỌN MODULE TÁC CHIẾN:'),
            pageSize: 10,
            choices: [
                {
                    name: `${chalk.cyan('📡')}  ${chalk.bold('Market Radar')}          ${chalk.dim('Tổng quan VN-Index, dòng tiền, ngành mạnh/yếu')}`,
                    value: 'RADAR'
                },
                {
                    name: `${chalk.green('🔍')}  ${chalk.bold('Tra cứu Cổ phiếu')}     ${chalk.dim('Phân tích cơ bản, kỹ thuật + AI Report')}`,
                    value: 'STOCK'
                },
                {
                    name: `${chalk.magenta('⚡')}  ${chalk.bold('Phái Sinh VN30F1M')}   ${chalk.dim('Basis, OI, khối ngoại, kịch bản lệnh')}`,
                    value: 'DERIVATIVES'
                },
                {
                    name: `${chalk.yellow('🪙')}  ${chalk.bold('Crypto Global')}        ${chalk.dim('Top coins theo vốn hóa, biến động 24h')}`,
                    value: 'CRYPTO'
                },
                new inquirer.Separator(chalk.dim('  ' + '─'.repeat(60))),
                {
                    name: `${chalk.red('✕')}  ${chalk.bold('Thoát hệ thống')}`,
                    value: 'EXIT'
                }
            ]
        }]);

        switch (action) {
            case 'RADAR':       await handleMarketRadar();   break;
            case 'STOCK':       await handleStockAnalysis(); break;
            case 'DERIVATIVES': await handleDerivatives();   break;
            case 'CRYPTO':      await handleCryptoRadar();   break;
            case 'EXIT':
                clear();
                console.log('\n' + chalk.green('╔' + '═'.repeat(BOX_WIDTH - 2) + '╗'));
                console.log(chalk.green('║') + chalk.bold.green('  🦆 Đã ngắt kết nối OMNI DUCK TERMINAL. Hẹn gặp lại!') + ' '.repeat(22) + chalk.green('║'));
                console.log(chalk.green('╚' + '═'.repeat(BOX_WIDTH - 2) + '╝') + '\n');
                running = false;
                process.exit(0);
        }
    }
};

startOmniTerminal();
