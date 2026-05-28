import Table from 'cli-table3';
import chalk from 'chalk';

const BOX_WIDTH = 82;

// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUT HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function pad(str, width) {
    const clean = str.replace(/\x1B\[[0-9;]*m/g, '');
    const diff = width - clean.length;
    return str + (diff > 0 ? ' '.repeat(diff) : '');
}

function boxTop(title, color = chalk.cyan, w = BOX_WIDTH) {
    const bar = title
        ? `┌─ ${title} ${'─'.repeat(Math.max(0, w - 4 - title.replace(/\x1B\[[0-9;]*m/g, '').length))}┐`
        : `┌${'─'.repeat(w - 2)}┐`;
    return color(bar);
}
function boxBot(color = chalk.cyan, w = BOX_WIDTH) {
    return color(`└${'─'.repeat(w - 2)}┘`);
}
function boxRow(content, color = chalk.cyan, w = BOX_WIDTH) {
    return color('│') + ' ' + pad(content, w - 4) + ' ' + color('│');
}
function boxBlank(color = chalk.cyan) {
    return boxRow('', color);
}

function bigHeader(icon, symbol, name, exchange, industry) {
    const top   = chalk.blue('╔' + '═'.repeat(BOX_WIDTH - 2) + '╗');
    const bot   = chalk.blue('╚' + '═'.repeat(BOX_WIDTH - 2) + '╝');
    const exTag = exchange ? chalk.bgBlue.white.bold(` ${exchange} `) : '';
    const inTag = industry ? chalk.bgCyan.black(` ${industry} `) : '';
    const tags  = [exTag, inTag].filter(Boolean).join('  ');
    const title = `${icon}  ${chalk.bold.white(symbol)} — ${chalk.italic.gray(name || 'N/A')}`;
    return [
        top,
        chalk.blue('║') + ' ' + pad(title, BOX_WIDTH - 4) + ' ' + chalk.blue('║'),
        chalk.blue('║') + ' ' + pad(tags,  BOX_WIDTH - 4) + ' ' + chalk.blue('║'),
        bot,
    ].join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TECHNICAL INDICATOR CALCULATORS
// ═══════════════════════════════════════════════════════════════════════════════

function calcEMA(prices, period) {
    if (!prices || prices.length < period) return null;
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((s, v) => s + v, 0) / period;
    for (let i = period; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
}

function calcSMA(prices, period) {
    if (!prices || prices.length < period) return null;
    const slice = prices.slice(-period);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function calcRSI(prices, period = 14) {
    if (!prices || prices.length < period + 1) return null;
    const slice = prices.slice(-(period + 1));
    let gains = 0, losses = 0;
    for (let i = 1; i < slice.length; i++) {
        const diff = slice[i] - slice[i - 1];
        if (diff >= 0) gains += diff; else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
}

function calcBollinger(prices, period = 20) {
    const sma = calcSMA(prices, period);
    if (!sma || prices.length < period) return null;
    const slice = prices.slice(-period);
    const variance = slice.reduce((s, v) => s + Math.pow(v - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    return { mid: sma, upper: sma + 2 * std, lower: sma - 2 * std, std };
}

function calcMACD(prices) {
    const ema12 = calcEMA(prices, 12);
    const ema26 = calcEMA(prices, 26);
    if (!ema12 || !ema26) return null;
    const macd = ema12 - ema26;
    // Signal line: EMA(9) of MACD values (simplified: use last 9 diffs)
    const macdValues = [];
    for (let i = prices.length - 9; i <= prices.length - 1; i++) {
        const e12 = calcEMA(prices.slice(0, i + 1), 12);
        const e26 = calcEMA(prices.slice(0, i + 1), 26);
        if (e12 && e26) macdValues.push(e12 - e26);
    }
    const signal = macdValues.length >= 9 ? calcEMA(macdValues, 9) : null;
    return { macd, signal, histogram: signal !== null ? macd - signal : null };
}

function calcATR(candles, period = 14) {
    if (!candles || candles.length < 2) return null;
    const trs = candles.slice(1).map((c, i) =>
        Math.max(
            c.high - c.low,
            Math.abs(c.high - candles[i].close),
            Math.abs(c.low  - candles[i].close)
        )
    );
    return calcSMA(trs.slice(-period), period);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPARKLINE + VOLUME CHART
// ═══════════════════════════════════════════════════════════════════════════════

function renderSparklineChart(chartData, displayWidth = 50) {
    if (!chartData || chartData.length === 0) return;

    const candles = chartData.slice(-displayWidth);
    const prices  = candles.map(c => parseFloat(c.close));
    const volumes = candles.map(c => parseInt(c.volume || 0));
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const rangeP = maxP - minP || 1;
    const maxV = Math.max(...volumes) || 1;

    const sparkBlocks = ['▁','▂','▃','▄','▅','▆','▇','█'];
    const volBlocks   = ['▁','▂','▃','▄','▅','▆','▇','█'];

    // 5-row price chart
    const ROWS = 5;
    const grid = Array.from({ length: ROWS }, () => Array(candles.length).fill(' '));

    candles.forEach((c, i) => {
        const isUp = parseFloat(c.close) >= parseFloat(c.open);
        const level = Math.round(((parseFloat(c.close) - minP) / rangeP) * (ROWS - 1));
        for (let r = 0; r < ROWS; r++) {
            if (r === level) grid[ROWS - 1 - r][i] = isUp ? chalk.green('█') : chalk.red('█');
        }
    });

    // Price axis labels (right side)
    const priceLabels = [
        (maxP * 1000).toLocaleString('vi-VN') + ' đ',
        '',
        ((minP + rangeP / 2) * 1000).toLocaleString('vi-VN') + ' đ',
        '',
        (minP * 1000).toLocaleString('vi-VN') + ' đ',
    ];

    console.log(chalk.bold.white('  ══ BIỂU ĐỒ GIÁ & KHỐI LƯỢNG ══'));
    console.log('');

    // Price chart
    grid.forEach((row, r) => {
        const line = row.map((cell, i) => {
            if (cell !== ' ') return cell;
            const isUp = parseFloat(candles[i].close) >= parseFloat(candles[i].open);
            const level = Math.round(((parseFloat(candles[i].close) - minP) / rangeP) * (ROWS - 1));
            const thisRow = ROWS - 1 - r;
            if (thisRow < level) return isUp ? chalk.green('│') : chalk.red('│');
            return chalk.gray('·');
        });
        const label = chalk.dim(priceLabels[r] || '');
        console.log('  ' + line.join('') + '  ' + label);
    });

    // Volume bars
    const volBar = candles.map((c, i) => {
        const level = Math.round((volumes[i] / maxV) * 7);
        const isUp = parseFloat(c.close) >= parseFloat(c.open);
        return isUp ? chalk.green(volBlocks[level]) : chalk.red(volBlocks[level]);
    });
    console.log('  ' + chalk.dim('─'.repeat(candles.length)));
    console.log('  ' + volBar.join('') + '  ' + chalk.dim('← Khối lượng'));
    console.log('');

    // Last 5 sessions (mini OHLCV)
    console.log(chalk.dim('  ┄ 5 phiên cuối (O / H / L / C / Vol):'));
    chartData.slice(-5).forEach(c => {
        const isUp  = parseFloat(c.close) >= parseFloat(c.open);
        const clr   = isUp ? chalk.green : chalk.red;
        const arrow = isUp ? '▲' : '▼';
        const fmtDate = c.date
            ? chalk.dim(new Date(c.date * 1000 || c.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }))
            : chalk.dim('--/--');
        const fmt = v => (parseFloat(v) * 1000).toLocaleString('vi-VN');

        console.log(
            `  ${clr(arrow)} ${fmtDate}` +
            `  ${chalk.dim('M:')}${clr(fmt(c.open))}` +
            `  ${chalk.dim('C:')}${chalk.white(fmt(c.high))}` +
            `  ${chalk.dim('T:')}${chalk.white(fmt(c.low))}` +
            `  ${chalk.dim('Đóng:')}${clr.bold(fmt(c.close))}` +
            `  ${chalk.dim('KL:')}${chalk.white(parseInt(c.volume || 0).toLocaleString('vi-VN'))}`
        );
    });
    console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRICE PANEL WITH REF / CEILING / FLOOR
// ═══════════════════════════════════════════════════════════════════════════════

function renderPricePanel(info, chartData) {
    const current   = parseFloat((info.currentPrice || '0').toString().replace(/\./g, '').replace(',', '.'));
    const changePct = parseFloat(info.changePercent || 0);
    const changeAmt = parseFloat(info.change || 0);

    // Derive reference price from chart
    let refPrice = 0;
    if (chartData && chartData.length >= 2) {
        refPrice = parseFloat(chartData[chartData.length - 2].close) * 1000;
    }
    if (!refPrice && current) refPrice = current;

    const exchange  = (info.exchange || 'HOSE').toUpperCase();
    const limitPct  = exchange.includes('HNX') ? 0.10 : exchange.includes('UPCOM') ? 0.15 : 0.07;
    const ceiling   = refPrice * (1 + limitPct);
    const floor     = refPrice * (1 - limitPct);

    // Color current price
    let priceColor = chalk.yellow.bold;
    if (current >= ceiling * 0.998) priceColor = chalk.magenta.bold; // near ceiling
    else if (current >= refPrice)    priceColor = chalk.green.bold;
    else if (current <= floor * 1.002) priceColor = chalk.blue.bold; // near floor
    else                              priceColor = chalk.red.bold;

    const changeColor = changePct >= 0 ? chalk.green.bold : chalk.red.bold;
    const changeSign  = changePct >= 0 ? '+' : '';
    const arrow       = changePct > 0 ? '▲' : changePct < 0 ? '▼' : '─';

    // Progress bar: where is current price between floor and ceiling?
    const positionPct  = ceiling > floor ? (current - floor) / (ceiling - floor) : 0.5;
    const barWidth     = 30;
    const filled       = Math.round(Math.max(0, Math.min(1, positionPct)) * barWidth);
    const progressBar  =
        chalk.red('[') +
        chalk.dim('░').repeat(Math.max(0, filled - 1)) +
        (filled > 0 ? chalk.yellow('◆') : '') +
        chalk.dim('░').repeat(Math.max(0, barWidth - filled)) +
        chalk.magenta(']');

    const fmt = v => v ? Math.round(v).toLocaleString('vi-VN') + ' đ' : '---';

    console.log(boxTop(chalk.white.bold('GIÁ THỜI GIAN THỰC'), chalk.cyan));

    // Row 1: labels
    console.log(boxRow(
        chalk.cyan.bold(pad('Hiện Tại', 18)) +
        chalk.magenta.bold(pad('  Trần (' + (limitPct * 100) + '%)', 18)) +
        chalk.yellow.bold(pad('  TC (Tham chiếu)', 18)) +
        chalk.blue.bold(pad('  Sàn (' + (limitPct * 100) + '%)', 16))
    ));

    // Row 2: values
    console.log(boxRow(
        priceColor(pad(fmt(current), 18)) +
        chalk.magenta(pad('  ' + fmt(ceiling), 18)) +
        chalk.yellow(pad('  ' + fmt(refPrice), 18)) +
        chalk.blue(pad('  ' + fmt(floor), 16))
    ));

    console.log(boxBlank());

    // Row 3: change + volume
    console.log(boxRow(
        changeColor(`  ${arrow} ${changeSign}${changePct.toFixed(2)}%`) + '  ' +
        changeColor(`(${changeSign}${Math.round(changeAmt).toLocaleString('vi-VN')} đ)`) +
        '    ' + chalk.dim('KL: ') + chalk.white.bold(info.totalVolume || '---')
    ));

    // Row 4: progress bar
    console.log(boxRow(
        chalk.blue('Sàn') + '  ' + progressBar + '  ' + chalk.magenta('Trần') +
        chalk.dim('  ' + (positionPct * 100).toFixed(0) + '% từ sàn')
    ));

    // Row 5: session high/low if available
    if (info.high52w || info.low52w) {
        console.log(boxBlank());
        console.log(boxRow(
            chalk.dim('52W High: ') + chalk.green.bold(fmt(info.high52w)) +
            '    ' + chalk.dim('52W Low: ') + chalk.red.bold(fmt(info.low52w))
        ));
    }

    console.log(boxBot());
    console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TECHNICAL INDICATORS PANEL
// ═══════════════════════════════════════════════════════════════════════════════

function renderTechnicalPanel(chartData) {
    if (!chartData || chartData.length < 20) return;

    const closes  = chartData.map(c => parseFloat(c.close));
    const highs   = chartData.map(c => parseFloat(c.high));
    const lows    = chartData.map(c => parseFloat(c.low));

    const rsi     = calcRSI(closes, 14);
    const ma5     = calcSMA(closes, 5);
    const ma20    = calcSMA(closes, 20);
    const ma50    = calcSMA(closes, 50);
    const macd    = calcMACD(closes);
    const bb      = calcBollinger(closes, 20);
    const atr     = calcATR(chartData.map((c, i) => ({
        high: parseFloat(c.high), low: parseFloat(c.low),
        close: i > 0 ? parseFloat(chartData[i-1].close) : parseFloat(c.close)
    })));

    const current = closes[closes.length - 1];

    // RSI bar
    function rsiBar(v) {
        const BAR = 20;
        const filled = Math.round((v / 100) * BAR);
        let color = chalk.yellow;
        if (v >= 70) color = chalk.red;
        else if (v <= 30) color = chalk.cyan;
        else if (v >= 55) color = chalk.green;
        return color('█'.repeat(filled) + '░'.repeat(BAR - filled));
    }
    function rsiLabel(v) {
        if (v >= 70) return chalk.red.bold('QUÁ MUA ⚠');
        if (v <= 30) return chalk.cyan.bold('QUÁ BÁN ⚡');
        if (v >= 60) return chalk.green('TĂNG ĐỘNG LƯỢNG');
        if (v <= 40) return chalk.red('GIẢM ĐỘNG LƯỢNG');
        return chalk.yellow('TRUNG TÍNH');
    }

    const fmt2 = v => v !== null ? (v * 1000).toFixed(0) : 'N/A';

    console.log(boxTop(chalk.white.bold('PHÂN TÍCH KỸ THUẬT'), chalk.yellow));

    // RSI
    if (rsi !== null) {
        console.log(boxRow(
            chalk.dim('RSI(14):') + ' ' + chalk.bold(rsi.toFixed(1)) +
            '  ' + rsiBar(rsi) + '  ' + rsiLabel(rsi),
            chalk.yellow
        ));
    }

    // MACD
    if (macd) {
        const macdClr = macd.histogram > 0 ? chalk.green : chalk.red;
        const macdSign = macd.macd >= 0 ? '+' : '';
        const histSign = macd.histogram !== null && macd.histogram >= 0 ? '+' : '';
        const crossLabel = macd.histogram > 0
            ? chalk.green('▲ BULLISH')
            : chalk.red('▼ BEARISH');

        console.log(boxRow(
            chalk.dim('MACD:') + ' ' + macdClr(`${macdSign}${(macd.macd * 1000).toFixed(2)}`) +
            '  ' + chalk.dim('Signal:') + ' ' + macdClr(`${(macd.signal * 1000).toFixed(2)}`) +
            '  ' + chalk.dim('Hist:') + ' ' + macdClr(`${histSign}${(macd.histogram * 1000).toFixed(2)}`) +
            '  ' + crossLabel,
            chalk.yellow
        ));
    }

    // Moving Averages
    const maLine = [
        ma5  !== null ? (chalk.dim('MA5:')  + ' ' + (current >= ma5  ? chalk.green : chalk.red)(fmt2(ma5)))  : '',
        ma20 !== null ? (chalk.dim('MA20:') + ' ' + (current >= ma20 ? chalk.green : chalk.red)(fmt2(ma20))) : '',
        ma50 !== null ? (chalk.dim('MA50:') + ' ' + (current >= ma50 ? chalk.green : chalk.red)(fmt2(ma50))) : '',
    ].filter(Boolean).join('   ');

    // Trend direction from MAs
    let trendLabel = '';
    if (ma5 && ma20 && ma50) {
        if (ma5 > ma20 && ma20 > ma50) trendLabel = chalk.green.bold('↑ XU HƯỚNG TĂNG (MA5>MA20>MA50)');
        else if (ma5 < ma20 && ma20 < ma50) trendLabel = chalk.red.bold('↓ XU HƯỚNG GIẢM (MA5<MA20<MA50)');
        else if (ma5 > ma20) trendLabel = chalk.yellow('→ ĐẢO CHIỀU TIỀM NĂNG');
        else trendLabel = chalk.dim('◈ SIDEWAY / TÍCH LŨY');
    }

    console.log(boxRow(maLine, chalk.yellow));
    if (trendLabel) console.log(boxRow('  ' + trendLabel, chalk.yellow));

    // Bollinger Bands
    if (bb) {
        const pos = (current - bb.lower) / (bb.upper - bb.lower);
        let bbLabel = '';
        if (pos >= 0.9) bbLabel = chalk.red('Gần dải TRÊN ⚠ tiệm cận kháng cự');
        else if (pos <= 0.1) bbLabel = chalk.cyan('Gần dải DƯỚI ⚡ tiệm cận hỗ trợ');
        else if (pos >= 0.6) bbLabel = chalk.green('Trong vùng TĂNG (trên midline)');
        else bbLabel = chalk.yellow('Trong vùng GIẢM (dưới midline)');

        console.log(boxRow(
            chalk.dim('Bollinger:') + '  ' +
            chalk.cyan('Dưới: ' + fmt2(bb.lower)) +
            '  ' + chalk.white('Mid: ' + fmt2(bb.mid)) +
            '  ' + chalk.magenta('Trên: ' + fmt2(bb.upper)) +
            '  ' + chalk.dim(`Độ rộng: ${(bb.std * 1000 * 2).toFixed(0)}`),
            chalk.yellow
        ));
        console.log(boxRow('  ' + bbLabel, chalk.yellow));
    }

    // ATR
    if (atr) {
        const atrVal = (atr * 1000).toFixed(0);
        console.log(boxRow(
            chalk.dim('ATR(14):') + ' ' + chalk.white(parseInt(atrVal).toLocaleString('vi-VN') + ' đ') +
            '  ' + chalk.dim('→ biến động trung bình/phiên'),
            chalk.yellow
        ));
    }

    console.log(boxBot(chalk.yellow));
    console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALUATION & FOREIGN FLOW
// ═══════════════════════════════════════════════════════════════════════════════

function renderValuationPanel(info, profile) {
    const pe   = info.pe   || profile?.peRatio  || '---';
    const pb   = info.pb   || '---';
    const eps  = info.eps  || '---';
    const bvps = info.bvps || '---';
    const mkt  = info.marketCap || profile?.marketCap || '---';
    const exch = info.exchange  || profile?.exchange  || '---';

    console.log(boxTop(chalk.white.bold('ĐỊNH GIÁ & TÀI CHÍNH'), chalk.green));

    const tbl = new Table({
        head: [
            chalk.green('P/E'), chalk.green('P/B'),
            chalk.green('EPS (đ)'), chalk.green('BVPS (đ)'),
            chalk.green('Vốn hóa'), chalk.green('Sàn'),
        ],
        colWidths: [10, 10, 14, 14, 16, 10],
        style: { border: ['dim'], head: [], 'padding-left': 1, 'padding-right': 1 },
    });

    // Color PE/PB
    const peNum = parseFloat(pe);
    const peColor = isNaN(peNum) ? chalk.gray : peNum > 25 ? chalk.red : peNum < 10 ? chalk.green : chalk.yellow;

    tbl.push([
        peColor(pe.toString()), chalk.white(pb.toString()),
        chalk.white(eps.toString()), chalk.white(bvps.toString()),
        chalk.white(typeof mkt === 'number' ? (mkt / 1e9).toFixed(1) + ' tỷ' : mkt.toString()),
        chalk.cyan(exch),
    ]);

    console.log(tbl.toString());

    // Volume breakdown
    if (info.buyVolume || info.sellVolume) {
        const buyV  = parseInt((info.buyVolume  || '0').toString().replace(/\D/g, '')) || 0;
        const sellV = parseInt((info.sellVolume || '0').toString().replace(/\D/g, '')) || 0;
        const totalV = buyV + sellV || 1;
        const buyPct  = ((buyV / totalV) * 100).toFixed(0);
        const sellPct = ((sellV / totalV) * 100).toFixed(0);
        const buyBar  = '█'.repeat(Math.round(buyPct / 5));
        const sellBar = '█'.repeat(Math.round(sellPct / 5));

        console.log(boxRow(
            chalk.dim('Mua (ước):') + ' ' + chalk.green.bold(info.buyVolume  || '---') + ' ' +
            chalk.green(buyBar) + ' ' + chalk.dim(buyPct + '%') +
            '   ' +
            chalk.dim('Bán (ước):') + ' ' + chalk.red.bold(info.sellVolume || '---') + ' ' +
            chalk.red(sellBar) + ' ' + chalk.dim(sellPct + '%'),
            chalk.green
        ));
    }

    console.log(boxBot(chalk.green));
    console.log('');
}

function renderForeignPanel(info) {
    const fBuy  = info.foreignBuy  || info.foreignBuyVol  || null;
    const fSell = info.foreignSell || info.foreignSellVol || null;
    const fNet  = info.foreignNet  || info.foreignNetVal  || null;

    if (!fBuy && !fSell && !fNet) return;

    const fBuyN  = parseFloat((fBuy  || '0').toString().replace(/[^0-9.-]/g, ''));
    const fSellN = parseFloat((fSell || '0').toString().replace(/[^0-9.-]/g, ''));
    const netN   = fNet
        ? parseFloat((fNet || '0').toString().replace(/[^0-9.-]/g, ''))
        : fBuyN - fSellN;

    const netColor = netN >= 0 ? chalk.green : chalk.red;
    const netArrow = netN >= 0 ? '↑ MUA RÒNG' : '↓ BÁN RÒNG';

    console.log(boxTop(chalk.white.bold('KHỐI NGOẠI (FOREIGN FLOW)'), chalk.magenta));

    console.log(boxRow(
        chalk.green.bold('  KL Mua NN: ') + chalk.green((fBuy || '---').toString()) +
        '    ' + chalk.red.bold('KL Bán NN: ') + chalk.red((fSell || '---').toString()) +
        '    ' + chalk.dim('Ròng: ') + netColor.bold((netN >= 0 ? '+' : '') + netN.toLocaleString('vi-VN') + '  ' + netArrow),
        chalk.magenta
    ));

    console.log(boxBot(chalk.magenta));
    console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPANY PROFILE
// ═══════════════════════════════════════════════════════════════════════════════

function renderCompanyPanel(profile) {
    const rows = [
        ['Ngày niêm yết', profile.listing_date],
        ['Vốn điều lệ',   profile.charter_capital],
        ['CP lưu hành',   profile.shares_listed],
        ['Ngành',         profile.industry],
        ['Địa chỉ',       profile.address ? profile.address.slice(0, 55) : null],
        ['Website',       profile.website],
        ['Email',         profile.email],
    ].filter(r => r[1]);

    if (rows.length === 0) return;

    console.log(boxTop(chalk.white.bold('HỒ SƠ DOANH NGHIỆP'), chalk.cyan));

    // Overview text
    const ov = (profile.overview || profile.description || '').slice(0, 200);
    if (ov) {
        // Word-wrap at ~75 chars
        const words = ov.split(' ');
        let line = ''; const lines = [];
        words.forEach(w => {
            if ((line + ' ' + w).length > 74) { lines.push(line); line = w; }
            else line = line ? line + ' ' + w : w;
        });
        if (line) lines.push(line);
        lines.forEach(l => console.log(boxRow(chalk.italic.gray(l), chalk.cyan)));
        console.log(boxBlank());
    }

    rows.forEach(([label, val]) => {
        console.log(boxRow(
            chalk.dim(pad(label, 16)) + chalk.white(val),
            chalk.cyan
        ));
    });

    console.log(boxBot(chalk.cyan));
    console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEWS PANEL
// ═══════════════════════════════════════════════════════════════════════════════

export function renderNewsPanel(newsData, symbol = '', maxItems = 7) {
    if (!newsData || newsData.length === 0) return;

    const sentimentIcon = (s) => {
        if (!s) return chalk.gray('◈');
        const sl = s.toLowerCase();
        if (sl.includes('pos') || sl === 'tích cực') return chalk.green('▲');
        if (sl.includes('neg') || sl === 'tiêu cực') return chalk.red('▼');
        return chalk.yellow('◈');
    };
    const sentimentColor = (s) => {
        if (!s) return chalk.gray;
        const sl = s.toLowerCase();
        if (sl.includes('pos') || sl === 'tích cực') return chalk.green;
        if (sl.includes('neg') || sl === 'tiêu cực') return chalk.red;
        return chalk.yellow;
    };

    console.log(boxTop(chalk.white.bold(`TIN TỨC GẦN ĐÂY${symbol ? ' — ' + symbol : ''}`), chalk.blue));

    newsData.slice(0, maxItems).forEach((n, i) => {
        const icon  = sentimentIcon(n.sentiment);
        const clr   = sentimentColor(n.sentiment);
        const title = (n.title || 'Không có tiêu đề').slice(0, 68);
        const src   = n.source ? chalk.dim(` [${n.source}]`) : '';
        const date  = n.date   ? chalk.dim(` ${n.date}`)     : '';
        const aiTag = n.isAiGenerated ? chalk.cyan(' [AI]') : '';

        console.log(boxRow(
            `${icon} ${clr(title)}${src}${date}${aiTag}`,
            chalk.blue
        ));

        // Content snippet if available
        if (n.content && n.content.length > 60 && n.content !== n.title) {
            const snippet = n.content.slice(0, 100) + (n.content.length > 100 ? '...' : '');
            console.log(boxRow(chalk.dim('   ' + snippet), chalk.blue));
        }

        if (i < Math.min(maxItems, newsData.length) - 1) {
            console.log(boxRow(chalk.dim('  ' + '·'.repeat(72)), chalk.blue));
        }
    });

    if (newsData.length > maxItems) {
        console.log(boxBlank(chalk.blue));
        console.log(boxRow(chalk.dim(`  ... và ${newsData.length - maxItems} tin tức khác`), chalk.blue));
    }

    console.log(boxBot(chalk.blue));
    console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION PANEL
// ═══════════════════════════════════════════════════════════════════════════════

export function renderActionPanel(actionData, symbol = '') {
    if (!actionData) return;

    const action   = actionData.action   || actionData.signal     || 'QUAN SÁT';
    const trend    = actionData.trend    || actionData.mechTrend   || '---';
    const sl       = actionData.sl       || actionData.stopLoss    || '---';
    const tp1      = actionData.tp1      || actionData.takeProfit1 || '---';
    const tp2      = actionData.tp2      || actionData.takeProfit2 || '---';
    const rr       = actionData.rrRatio  || '---';
    const score    = actionData.score    || actionData.confidence  || null;
    const reason   = actionData.reason   || actionData.mechReason  || '';
    const entry    = actionData.entry    || actionData.entryZone   || '---';

    // Color by action
    let actionColor = chalk.yellow.bgBlack;
    let actionBg    = chalk.bgYellow.black;
    if (/LONG|MUA|BUY/i.test(action)) { actionColor = chalk.green; actionBg = chalk.bgGreen.black; }
    else if (/SHORT|BÁN|SELL/i.test(action)) { actionColor = chalk.red; actionBg = chalk.bgRed.white; }
    else if (/QUAN SÁT|WATCH/i.test(action)) { actionColor = chalk.yellow; actionBg = chalk.bgYellow.black; }

    // Score bar
    const scoreBar = score !== null ? (() => {
        const pct  = Math.max(0, Math.min(100, parseFloat(score)));
        const fill = Math.round(pct / 5);
        const clr  = pct >= 65 ? chalk.green : pct <= 35 ? chalk.red : chalk.yellow;
        return clr('█'.repeat(fill) + '░'.repeat(20 - fill)) + ' ' + chalk.bold(pct.toFixed(0) + '/100');
    })() : '';

    console.log(boxTop(chalk.white.bold(`⚡ ACTION PANEL${symbol ? ' — ' + symbol : ''}`), chalk.red));
    console.log(boxBlank(chalk.red));

    // Main action badge
    console.log(boxRow(
        '  ' + actionBg.bold(` ${action} `) +
        (trend !== '---' ? '   ' + chalk.dim('Xu hướng:') + ' ' + actionColor.bold(trend) : '') +
        (scoreBar ? '   ' + chalk.dim('Score: ') + scoreBar : ''),
        chalk.red
    ));

    console.log(boxBlank(chalk.red));

    // SL / TP grid
    if (sl !== '---' || tp1 !== '---') {
        const fmtPrice = v => {
            if (v === '---' || !v) return chalk.gray('---');
            const n = parseFloat(v.toString().replace(/[^0-9.]/g, ''));
            return isNaN(n) ? chalk.gray(v) : chalk.white.bold(n.toLocaleString('vi-VN'));
        };

        console.log(boxRow(
            chalk.dim('  Entry Zone:') + ' ' + chalk.cyan.bold(entry.toString()) +
            '   ' + chalk.dim('Stop Loss:') + ' ' + chalk.red.bold(fmtPrice(sl)) +
            '   ' + chalk.dim('R:R =') + ' ' + chalk.yellow.bold(rr),
            chalk.red
        ));
        console.log(boxRow(
            chalk.dim('  TP1:') + ' ' + chalk.green.bold(fmtPrice(tp1)) +
            '   ' + chalk.dim('TP2:') + ' ' + chalk.green.bold(fmtPrice(tp2)),
            chalk.red
        ));
    }

    // Reason
    if (reason) {
        console.log(boxBlank(chalk.red));
        const words = reason.split(' '); let line = ''; const lines = [];
        words.forEach(w => {
            if ((line + ' ' + w).length > 70) { lines.push(line); line = w; }
            else line = line ? line + ' ' + w : w;
        });
        if (line) lines.push(line);
        lines.forEach(l => console.log(boxRow(chalk.italic.gray('  ' + l), chalk.red)));
    }

    console.log(boxBlank(chalk.red));
    console.log(boxBot(chalk.red));
    console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT: renderStockDetail
// ═══════════════════════════════════════════════════════════════════════════════

export function renderStockDetail(marketData, chartData, actionData = null, newsData = null) {
    if (!marketData) return;

    const info    = marketData.stockInfo    || {};
    const profile = marketData.companyProfile || {};
    const news    = newsData || marketData.deepNewsData || [];

    // ── 1. Big header ──────────────────────────────────────────────────────────
    console.log('');
    console.log(bigHeader(
        '🏢',
        info.symbol || '???',
        profile.companyName || info.companyName || 'N/A',
        info.exchange || profile.exchange || 'VNX',
        profile.industry || ''
    ));

    // Live tag
    const now = new Date().toLocaleTimeString('vi-VN');
    console.log(`\n  ${chalk.bgGreen.black.bold(' ● LIVE ')}  ${chalk.dim('Cập nhật: ' + now)}\n`);

    // ── 2. Price panel ─────────────────────────────────────────────────────────
    renderPricePanel(info, chartData);

    // ── 3. Technical indicators ────────────────────────────────────────────────
    if (chartData && chartData.length >= 14) {
        renderTechnicalPanel(chartData);
    }

    // ── 4. Chart ───────────────────────────────────────────────────────────────
    if (chartData && chartData.length > 0) {
        renderSparklineChart(chartData, 50);
    }

    // ── 5. Action panel ────────────────────────────────────────────────────────
    if (actionData) {
        renderActionPanel(actionData, info.symbol);
    }

    // ── 6. Valuation ───────────────────────────────────────────────────────────
    renderValuationPanel(info, profile);

    // ── 7. Foreign flow ────────────────────────────────────────────────────────
    renderForeignPanel(info);

    // ── 8. Company profile ─────────────────────────────────────────────────────
    renderCompanyPanel(profile);

    // ── 9. News ────────────────────────────────────────────────────────────────
    if (news.length > 0) {
        renderNewsPanel(news, info.symbol);
    }

    // ── 10. PDF link ───────────────────────────────────────────────────────────
    if (marketData.reportPdf) {
        console.log(chalk.dim('  📎 Báo cáo TCBS: ') + chalk.blue.underline(marketData.reportPdf));
        console.log('');
    }

    console.log(chalk.dim('─'.repeat(BOX_WIDTH)));
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI REPORT RENDERER   
// ═══════════════════════════════════════════════════════════════════════════════

export function renderAiReport(aiReport, symbol = '') {
    if (!aiReport) {
        console.log('\n' + chalk.yellow('⚠  AI Engine không trả về báo cáo. Thử lại sau.'));
        return;
    }

    const header = `  🦆 OMNI DUCK · AI STRATEGIC REPORT${symbol ? ' — ' + symbol : ''}`;
    console.log('\n' + chalk.bgMagenta.black('═'.repeat(BOX_WIDTH)));
    console.log(chalk.bgMagenta.black.bold(pad(header, BOX_WIDTH)));
    console.log(chalk.bgMagenta.black('═'.repeat(BOX_WIDTH)) + '\n');

    // Strip / translate JSX/HTML tags to chalk
    let clean = aiReport
        .replace(/<span\s+className="[^"]*text-emerald[^"]*"[^>]*>([\s\S]*?)<\/span>/g, (_, t) => chalk.green.bold(t))
        .replace(/<span\s+className="[^"]*text-green[^"]*"[^>]*>([\s\S]*?)<\/span>/g,   (_, t) => chalk.green.bold(t))
        .replace(/<span\s+className="[^"]*text-red[^"]*"[^>]*>([\s\S]*?)<\/span>/g,     (_, t) => chalk.red.bold(t))
        .replace(/<span\s+className="[^"]*text-yellow[^"]*"[^>]*>([\s\S]*?)<\/span>/g,  (_, t) => chalk.yellow.bold(t))
        .replace(/<span\s+className="[^"]*text-blue[^"]*"[^>]*>([\s\S]*?)<\/span>/g,    (_, t) => chalk.blue.bold(t))
        .replace(/<span\s+className="[^"]*text-cyan[^"]*"[^>]*>([\s\S]*?)<\/span>/g,    (_, t) => chalk.cyan.bold(t))
        .replace(/<span\s+className="[^"]*text-white[^"]*"[^>]*>([\s\S]*?)<\/span>/g,   (_, t) => chalk.white(t))
        .replace(/<span\s+className="[^"]*font-black[^"]*"[^>]*>([\s\S]*?)<\/span>/g,   (_, t) => chalk.bold(t))
        .replace(/<\/?span[^>]*>/g, '')
        // Markdown
        .replace(/\*\*(.*?)\*\*/g, (_, t) => chalk.bold(t))
        .replace(/^#{1,3}\s+(.+)$/gm, (_, t) => '\n' + chalk.cyan.bold('  ▶  ' + t.toUpperCase()))
        .replace(/^---+$/gm, chalk.dim('─'.repeat(BOX_WIDTH)))
        .replace(/^[\-•]\s+/gm, '  · ')
        .replace(/^\d+\.\s+/gm, (m) => chalk.dim(m));

    clean.split('\n').forEach(line => {
        if (!line.trim()) { console.log(); return; }

         if (line.includes('▶')) {
            console.log(line);
        } else if (line.startsWith('  ·')) {
            console.log('  ' + chalk.dim('·') + line.slice(3));
        } else {
            console.log('  ' + line);
        }
    });

    console.log('\n' + chalk.magenta('═'.repeat(BOX_WIDTH)));
    console.log(chalk.dim('  ⚠  Báo cáo AI chỉ mang tính tham khảo. Không phải khuyến nghị đầu tư.'));
    console.log(chalk.magenta('═'.repeat(BOX_WIDTH)));
}