import Table from 'cli-table3';
import chalk from 'chalk';
import { ScreenBuffer, getTermSize } from './screenManager.js';

function formatVolume(val) {
    const num = parseFloat(val) || 0;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
}

function miniTrend(change24h) {
    const n = parseFloat(change24h);
    if (n > 5)  return chalk.green('▲▲▲');
    if (n > 2)  return chalk.green('▲▲ ');
    if (n > 0)  return chalk.green('▲  ');
    if (n < -5) return chalk.red('▼▼▼');
    if (n < -2) return chalk.red('▼▼ ');
    if (n < 0)  return chalk.red('▼  ');
    return chalk.gray('━  ');
}

function rankBadge(i) {
    if (i === 0) return chalk.yellow.bold(' #1 ');
    if (i === 1) return chalk.gray.bold(' #2 ');
    if (i === 2) return chalk.white.bold(' #3 ');
    return chalk.dim(`#${i + 1} `);
}

export function buildCryptoBuffer(coins) {
    const buf      = new ScreenBuffer();
    const { cols } = getTermSize();
    const W        = Math.min(cols - 2, 100);

    if (!coins || coins.length === 0) {
        buf.blank().line(chalk.yellow('⚠  Đang kết nối mạng lưới Crypto hoặc không có dữ liệu.'));
        return buf;
    }

    // ── Header ────────────────────────────────────────────────────────────────
    buf.sectionHeader('🪙', 'CRYPTO GLOBAL MARKET — TOP 20 BY MARKET CAP', chalk.yellow, W);

    // ── Market Summary ────────────────────────────────────────────────────────
    const top20       = coins.slice(0, 20);
    const gainers     = top20.filter(c => parseFloat(c.change24h) > 0).length;
    const losers      = top20.filter(c => parseFloat(c.change24h) < 0).length;
    const avgChange   = (top20.reduce((s, c) => s + parseFloat(c.change24h || 0), 0) / top20.length).toFixed(2);
    const totalMktCap = top20.reduce((s, c) => s + parseFloat(c.marketCap || 0), 0);

    const sentimentColor = parseFloat(avgChange) >= 0 ? chalk.green : chalk.red;
    const sentimentText  = parseFloat(avgChange) >= 0 ? '📈 TĂNG' : '📉 GIẢM';

    buf.blank()
       .line(`  ${chalk.dim('Xu hướng:')} ${sentimentColor.bold(sentimentText + ` (avg ${avgChange}%)`)}   ${chalk.green(`▲ ${gainers} mã`)}  ${chalk.red(`▼ ${losers} mã`)}   ${chalk.dim('Tổng vốn hóa top 20:')} ${chalk.cyan(formatVolume(totalMktCap))}`)
       .blank();

    // ── Main Table ────────────────────────────────────────────────────────────
    const table = new Table({
        head: [
            chalk.cyan.bold('#'), chalk.cyan.bold('Tên / Symbol'),
            chalk.cyan.bold('Giá (USD)'), chalk.cyan.bold('24h %'),
            chalk.cyan.bold('Trend'), chalk.cyan.bold('Vốn hóa'), chalk.cyan.bold('Vol 24h'),
        ],
        colWidths: [6, 22, 16, 12, 8, 14, 14],
        style: { border: ['yellow'], head: [] },
    });

    top20.forEach((c, i) => {
        const changeNum   = parseFloat(c.change24h || 0);
        const changeColor = changeNum >= 0 ? chalk.green.bold : chalk.red.bold;
        const changeSign  = changeNum >= 0 ? '+' : '';
        const price       = parseFloat(c.currentPrice || 0);
        const priceStr    = price >= 1000
            ? `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
            : price >= 1
            ? `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
            : `$${price.toFixed(6)}`;

        table.push([
            rankBadge(i),
            chalk.white.bold((c.name || 'N/A').slice(0, 10)) + '\n' + chalk.yellow(c.symbol || ''),
            chalk.yellow.bold(priceStr),
            changeColor(`${changeSign}${changeNum.toFixed(2)}%`),
            miniTrend(c.change24h),
            chalk.white(formatVolume(c.marketCap)),
            chalk.dim(formatVolume(c.volume24h || c.volume || 0)),
        ]);
    });

    table.toString().split('\n').forEach(l => buf.line(l));

    // ── Top Movers ────────────────────────────────────────────────────────────
    const sorted  = [...top20].sort((a, b) => parseFloat(b.change24h) - parseFloat(a.change24h));
    const topGain = sorted.slice(0, 3);
    const topLoss = sorted.slice(-3).reverse();

    buf.blank().line(chalk.bold.white('  ══ TOP MOVERS 24H ══')).blank();

    const moverTable = new Table({
        head: [chalk.green.bold('🚀 Tăng Mạnh Nhất'), chalk.red.bold('💥 Giảm Mạnh Nhất')],
        colWidths: [36, 36],
        style: { border: ['dim'], head: [] },
    });

    const maxM = Math.max(topGain.length, topLoss.length);
    for (let i = 0; i < maxM; i++) {
        const g = topGain[i];
        const l = topLoss[i];
        moverTable.push([
            g ? `${chalk.yellow.bold((g.symbol || '').padEnd(8))}  ${chalk.green.bold('+' + parseFloat(g.change24h).toFixed(2) + '%')}  ${chalk.dim('$' + parseFloat(g.currentPrice || 0).toLocaleString())}` : '',
            l ? `${chalk.yellow.bold((l.symbol || '').padEnd(8))}  ${chalk.red.bold(parseFloat(l.change24h).toFixed(2) + '%')}  ${chalk.dim('$' + parseFloat(l.currentPrice || 0).toLocaleString())}` : '',
        ]);
    }
    moverTable.toString().split('\n').forEach(l => buf.line(l));
    buf.divider('─', W, chalk.dim);

    return buf;
}

export function renderCryptoMarket(coins) {
    buildCryptoBuffer(coins).lines.forEach(l => console.log(l));
}