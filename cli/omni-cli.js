import inquirer from 'inquirer';
import chalk from 'chalk';
import clear from 'clear';

import apiClient from './apiClient.js';
import { buildMarketBuffer }     from './views/marketView.js';
import { buildStockBuffer, buildAiReportLines } from './views/stockView.js';
import { buildDerivBuffer }      from './views/derivView.js';
import { buildCryptoBuffer }     from './views/cryptoView.js';
import {
    screen, ScreenBuffer, pager, LiveDashboard, getTermSize, padVisible
} from './screenManager.js';

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
// HEADER  (vẫn dùng clear + console vì đây là màn hình menu)
//=======================================================================

const showHeader = () => {
    clear();
    const now    = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const line1  = chalk.bgGreen.black.bold('  🦆 OMNI DUCK QUANTITATIVE TERMINAL  ') + chalk.bgBlack.green.bold(' v2.0 ');
    const line2  = chalk.gray(' Hệ thống Phân tích Định lượng · AI Finance Intelligence · Real-time Data');
    const pad    = ' '.repeat(Math.max(0, BOX_WIDTH - 3 - now.length - 7));
    const timeStr = chalk.dim(`⏱  ${now}  (ICT)`);

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
// PAUSE (chờ Enter, rồi quay lại menu)
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
// MODULE 1: MARKET RADAR — Live Dashboard (auto-refresh 10s)
//=======================================================================

const handleMarketRadar = async () => {
    showHeader();
    showBreadcrumb('📡 Market Radar');

    const { mode } = await inquirer.prompt([{
        type: 'select',
        name: 'mode',
        message: chalk.white('Chọn chế độ xem:'),
        choices: [
            { name: `${chalk.green('●')}  Live Dashboard  ${chalk.dim('(tự động cập nhật 10s — nhấn q để thoát)')}`, value: 'live' },
            { name: `${chalk.cyan('○')}  Xem một lần     ${chalk.dim('(cuộn + Enter để thoát)')}`,                    value: 'once' },
        ],
    }]);

    const fetchAndBuild = async () => {
        const res  = await apiClient.get('/market-radar');
        const buf  = buildMarketBuffer(res.data);
        const { cols, rows } = getTermSize();

        // Prepend a status bar
        const now     = new Date().toLocaleTimeString('vi-VN');
        const statusBar = chalk.bgGreen.black.bold(' 📡 MARKET RADAR ') +
            chalk.dim(` Cập nhật: ${now}`) +
            chalk.dim('  q = thoát').padStart(cols - 35);
        buf.lines.unshift(statusBar, chalk.dim('─'.repeat(cols)));
        return buf;
    };

    if (mode === 'live') {
        const dash = new LiveDashboard(10_000);
        try {
            await dash.start(fetchAndBuild);
        } catch (err) {
            clear();
            console.log('\n' + chalk.bgRed.white(' LỖI ') + ' ' + chalk.red(err.message));
            await pause();
        }
    } else {
        try {
            const res = await ui.spinner('Đang quét ma trận dòng tiền toàn thị trường...', () =>
                apiClient.get('/market-radar')
            );
            const buf = buildMarketBuffer(res.data);
            await pager(buf.lines, '📡 MA TRẬN RADAR THỊ TRƯỜNG');
        } catch (error) {
            console.log('\n' + chalk.bgRed.white(' LỖI KẾT NỐI ') + ' ' + chalk.red(error.message));
            await pause();
        }
    }
};

//=======================================================================
// MODULE 2: STOCK ANALYSIS — pager cho AI report
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
        const [historyRes, infoRes, actionRes] = await Promise.all([
            ui.spinner(`Đồng bộ lịch sử giá [${symbol}]...`,      () => apiClient.get(`/history/${symbol}`)),
            ui.spinner(`Tải thông tin thị trường [${symbol}]...`, () => apiClient.get(`/info/${symbol}`)),
            apiClient.post(`/action-panel/${symbol}`, { currentPrice: 0, triggerReason: 'CLI Request' })
                     .catch(() => ({ data: { data: null } }))
        ]);

        const chartData  = historyRes.data?.data || [];
        const marketData = infoRes.data?.data;
        const actionData = actionRes.data?.data;

        if (!marketData || !marketData.stockInfo) {
            console.log('\n' + chalk.bgRed.white(' KHÔNG TÌM THẤY ') + chalk.red(` Mã ${symbol} không tồn tại hoặc mất kết nối.`));
            await pause();
            return;
        }

        const logs = infoRes.data?.logs || [];
        if (logs.length > 0) {
            console.log(chalk.dim('\n  System Log:'));
            logs.forEach(l => console.log(chalk.dim('  · ' + l)));
        }

        // Build stock buffer trực tiếp → pager
        const stockBuf = buildStockBuffer(marketData, chartData, actionData);
        await pager(stockBuf.lines, `🏢 ${symbol} — Chi tiết cổ phiếu`);

        // AI report
        const { useAi } = await inquirer.prompt([{
            type: 'confirm',
            name: 'useAi',
            message: `${chalk.magenta('🤖')} Kích hoạt ${chalk.bold.magenta('AI Gemini')} phân tích chuyên sâu mã ${chalk.yellow.bold(symbol)}?`,
            default: true
        }]);

        if (useAi) {
            const payload = {
                stockInfo:      marketData.stockInfo,
                companyProfile: marketData.companyProfile,
                technicalData:  chartData.slice(-30),
            };
            try {
                const aiRes = await ui.spinner('AI Engine đang xử lý báo cáo định lượng...', () =>
                    apiClient.post(`/analyze/${symbol}`, payload)
                );
                await pager(buildAiReportLines(aiRes.data?.aiReport, symbol), `🦆 AI REPORT — ${symbol}`);
            } catch(aiErr) {
                console.log('\n' + chalk.bgRed.white(' LỖI AI ') + ' ' + chalk.red(aiErr.message));
                await pause();
            }
        }

    } catch (error) {
        console.log('\n' + chalk.bgRed.white(' LỖI HỆ THỐNG ') + ' ' + chalk.red(error.message));
        await pause();
    }
};

//=======================================================================
// MODULE 3: DERIVATIVES — Live Dashboard hoặc pager
//=======================================================================

const handleDerivatives = async () => {
    showHeader();
    showBreadcrumb('⚡ Phái Sinh VN30F1M');

    const { mode } = await inquirer.prompt([{
        type: 'select',
        name: 'mode',
        message: chalk.white('Chọn chế độ xem:'),
        choices: [
            { name: `${chalk.green('●')}  Live Dashboard  ${chalk.dim('(tự động cập nhật 5s — nhấn q để thoát)')}`, value: 'live' },
            { name: `${chalk.cyan('○')}  Xem một lần     ${chalk.dim('(cuộn + Enter để thoát)')}`,                   value: 'once' },
        ],
    }]);

    const fetchAndBuild = async () => {
        const [radarRes, chartRes] = await Promise.all([
            apiClient.get('/deriv-radar'),
            apiClient.get('/history/VN30F1M?interval=5 phút').catch(() => ({ data: { data: [] } }))
        ]);

        const derivRadar = radarRes.data?.data;
        const derivChart = chartRes.data?.data || [];

        // Volume Profile
        let volumeProfile = null;
        if (derivChart.length > 0) {
            const binsCount = 12;
            let minP = Math.min(...derivChart.map(d => d.low));
            let maxP = Math.max(...derivChart.map(d => d.high));
            if (maxP === minP) { maxP += 1; minP -= 1; }
            const binSize = (maxP - minP) / binsCount;
            const bins    = Array.from({ length: binsCount }, (_, i) => ({
                priceCenter: (minP + (i + 0.5) * binSize).toFixed(1), volume: 0
            }));
            let maxVol = 0; let pocPrice = 0;
            derivChart.forEach(candle => {
                const tp  = (candle.high + candle.low + candle.close) / 3;
                const idx = Math.min(Math.floor((tp - minP) / binSize), binsCount - 1);
                if (idx >= 0 && idx < binsCount) {
                    bins[idx].volume += candle.volume;
                    if (bins[idx].volume > maxVol) { maxVol = bins[idx].volume; pocPrice = bins[idx].priceCenter; }
                }
            });
            volumeProfile = { bins: bins.reverse(), maxVol, pocPrice };
        }

        if (!derivRadar) {
            const buf = new ScreenBuffer();
            buf.line(chalk.yellow('⚠  Không có dữ liệu phái sinh.'));
            return buf;
        }

        const basisNum      = parseFloat(derivRadar.basis || 0);
        const basisSpeedNum = parseFloat(derivRadar.basisSpeed || 0);
        const foreignNetNum = parseFloat(derivRadar.foreignNet || 0);
        let mechAction = 'QUAN SÁT'; let mechTrend = 'TÍCH LŨY'; let score = 50;
        if      (basisNum > 2  && foreignNetNum > 0)  { mechAction = 'LONG TIẾP CẬN';  mechTrend = 'TĂNG';     score = 72; }
        else if (basisNum < -2 && foreignNetNum < 0)  { mechAction = 'SHORT TIẾP CẬN'; mechTrend = 'GIẢM';     score = 28; }
        else if (basisNum > 0  && basisSpeedNum > 0)  { mechAction = 'QUAN SÁT LONG';  mechTrend = 'PHÂN HÓA'; score = 60; }
        else if (basisNum < 0  && basisSpeedNum < 0)  { mechAction = 'QUAN SÁT SHORT'; mechTrend = 'PHÂN HÓA'; score = 40; }

        const basePrice    = parseFloat(derivRadar.vn30f1m) || 0;
        const derivAnalysis = {
            score, mechAction, mechTrend,
            pocDistance: Math.abs(basisNum).toFixed(2) + '%',
            sl: (basePrice - 3.5).toFixed(1), tp1: (basePrice + 2.5).toFixed(1),
            tp2: (basePrice + 5.0).toFixed(1), rrRatio: '1:1.5',
            mechReason: basisNum > 0
                ? `Basis dương ${basisNum.toFixed(2)} điểm → Kỳ vọng lạc quan. Theo dõi hỗ trợ kỹ thuật.`
                : `Basis âm ${basisNum.toFixed(2)} điểm → Áp lực bán. Thận trọng vùng kháng cự.`,
        };

        const buf = buildDerivBuffer(derivRadar, derivAnalysis, volumeProfile);
        const { cols } = getTermSize();
        const now = new Date().toLocaleTimeString('vi-VN');
        buf.lines.unshift(
            chalk.bgMagenta.black.bold(' ⚡ PHÁI SINH VN30F1M ') + chalk.dim(` Cập nhật: ${now}`) + chalk.dim('  q = thoát').padStart(cols - 35),
            chalk.dim('─'.repeat(cols))
        );
        return buf;
    };

    if (mode === 'live') {
        const dash = new LiveDashboard(5_000);
        try {
            await dash.start(fetchAndBuild);
        } catch (err) {
            clear();
            console.log('\n' + chalk.bgRed.white(' LỖI ') + ' ' + chalk.red(err.message));
            await pause();
        }
    } else {
        try {
            const buf = await ui.spinner('Tải dữ liệu Phái sinh VN30F1M Realtime...', fetchAndBuild);
            await pager(buf.lines, '⚡ PHÁI SINH VN30F1M');
        } catch (error) {
            console.log('\n' + chalk.bgRed.white(' LỖI API ') + ' ' + chalk.red(error.message));
            await pause();
        }
    }
};

//=======================================================================
// MODULE 4: CRYPTO — pager
//=======================================================================

const handleCryptoRadar = async () => {
    showHeader();
    showBreadcrumb('🪙 Crypto Global Market');

    try {
        const res   = await ui.spinner('Đang quét top Cryptocurrencies toàn cầu...', () =>
            apiClient.get('/crypto-symbols')
        );
        const coins = res.data;
        if (!coins || coins.length === 0) {
            console.log('\n' + chalk.yellow('⚠  Không có dữ liệu Crypto. Kiểm tra kết nối Binance/CoinGecko.'));
            await pause();
            return;
        }
        const buf = buildCryptoBuffer(coins);
        await pager(buf.lines, '🪙 CRYPTO GLOBAL MARKET');
    } catch (error) {
        console.log('\n' + chalk.bgRed.white(' LỖI API ') + ' ' + chalk.red(error.message));
        await pause();
    }
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
                { name: `${chalk.cyan('📡')}  ${chalk.bold('Market Radar')}          ${chalk.dim('Tổng quan VN-Index, dòng tiền, ngành mạnh/yếu')}`, value: 'RADAR' },
                { name: `${chalk.green('🔍')}  ${chalk.bold('Tra cứu Cổ phiếu')}     ${chalk.dim('Phân tích cơ bản, kỹ thuật + AI Report')}`,        value: 'STOCK' },
                { name: `${chalk.magenta('⚡')}  ${chalk.bold('Phái Sinh VN30F1M')}   ${chalk.dim('Basis, OI, khối ngoại, kịch bản lệnh')}`,          value: 'DERIVATIVES' },
                { name: `${chalk.yellow('🪙')}  ${chalk.bold('Crypto Global')}        ${chalk.dim('Top coins theo vốn hóa, biến động 24h')}`,          value: 'CRYPTO' },
                new inquirer.Separator(chalk.dim('  ' + '─'.repeat(60))),
                { name: `${chalk.red('✕')}  ${chalk.bold('Thoát hệ thống')}`, value: 'EXIT' }
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