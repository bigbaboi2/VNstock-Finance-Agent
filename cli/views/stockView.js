import Table from 'cli-table3';
import chalk from 'chalk';

const BOX_WIDTH = 80;

function sectionHeader(icon, title, color = chalk.cyan) {
    const inner = ` ${icon}  ${title} `;
    const pad = BOX_WIDTH - 2 - inner.length;
    return color('┌' + '─'.repeat(BOX_WIDTH - 2) + '┐') + '\n' +
           color('│') + chalk.bold.white(inner) + ' '.repeat(Math.max(0, pad)) + color('│') + '\n' +
           color('└' + '─'.repeat(BOX_WIDTH - 2) + '┘');
}

function miniSparkline(chartData, width = 30) {
    if (!chartData || chartData.length === 0) return chalk.gray('Không có dữ liệu');

    const prices = chartData.map(c => parseFloat(c.close || c.c || 0)).filter(Boolean);
    if (prices.length === 0) return chalk.gray('Không có dữ liệu');

    const sample = prices.slice(-width);
    const min = Math.min(...sample);
    const max = Math.max(...sample);
    const range = max - min || 1;

    const blocks = ['▁','▂','▃','▄','▅','▆','▇','█'];
    let line = '';
    sample.forEach((p, i) => {
        const level = Math.round(((p - min) / range) * 7);
        const isUp = i === 0 || p >= sample[i - 1];
        line += isUp ? chalk.green(blocks[level]) : chalk.red(blocks[level]);
    });
    return line;
}

export function renderStockDetail(marketData, chartData) {
    if (!marketData) return;

    const info    = marketData.stockInfo    || {};
    const profile = marketData.companyProfile || {};

    // ── Company Header ─────────────────────────────────────────────────────
    console.log('\n' + sectionHeader('🏢', `${info.symbol} — ${profile.companyName || info.companyName || 'N/A'}`, chalk.blue));

    const exchangeTag = info.exchange
        ? chalk.bgBlue.white.bold(` ${info.exchange} `)
        : chalk.bgGray.white(' VNX ');
    
    const industryTag = profile.industry
        ? chalk.bgCyan.black(` ${profile.industry} `)
        : '';

    console.log(`\n  ${exchangeTag}  ${industryTag}`);

    if (profile.overview || profile.description) {
        const overviewText = (profile.overview || profile.description || '').slice(0, 120);
        console.log('\n' + chalk.dim('  ℹ  ') + chalk.italic.gray(overviewText + (overviewText.length >= 120 ? '...' : '')));
    }

    // ── Real-time Price Panel ──────────────────────────────────────────────
    console.log('\n' + chalk.bold.white('  ══ GIÁ THỜI GIAN THỰC ══'));

    const changeColor = parseFloat(info.changePercent) >= 0 ? chalk.green.bold : chalk.red.bold;
    const changeSign  = parseFloat(info.changePercent) >= 0 ? '+' : '';
    const changeArrow = parseFloat(info.changePercent) >= 0 ? '▲' : '▼';

    const priceTable = new Table({
        head: [
            chalk.cyan.bold('Giá Hiện Tại'),
            chalk.cyan.bold('Biến Động'),
            chalk.cyan.bold('Thay Đổi (đ)'),
            chalk.cyan.bold('Khối Lượng')
        ],
        colWidths: [20, 18, 18, 20],
        style: { border: ['cyan'], head: [] },
    });

    priceTable.push([
        chalk.yellow.bold((info.currentPrice || '---') + ' đ'),
        changeColor(`${changeArrow} ${changeSign}${parseFloat(info.changePercent || 0).toFixed(2)}%`),
        changeColor(`${changeSign}${info.change ? parseInt(info.change).toLocaleString('vi-VN') : '---'} đ`),
        chalk.white(info.totalVolume || '---'),
    ]);
    console.log(priceTable.toString());

    // ── Valuation Metrics ──────────────────────────────────────────────────
    console.log(chalk.bold.white('  ══ ĐỊNH GIÁ & CHỈ SỐ TÀI CHÍNH ══'));

    const valuationTable = new Table({
        head: [
            chalk.cyan.bold('P/E'),
            chalk.cyan.bold('P/B'),
            chalk.cyan.bold('EPS (đ)'),
            chalk.cyan.bold('BVPS (đ)'),
            chalk.cyan.bold('Vốn hóa (tỷ)'),
            chalk.cyan.bold('Sàn'),
        ],
        colWidths: [10, 10, 14, 14, 18, 10],
        style: { border: ['dim'], head: [] },
    });

    const pe   = info.pe   || profile.peRatio  || '---';
    const pb   = info.pb   || '---';
    const eps  = info.eps  || '---';
    const bvps = info.bvps || '---';
    const mkt  = info.marketCap || profile.marketCap || '---';
    const exch = info.exchange  || profile.exchange  || '---';

    valuationTable.push([
        chalk.white(pe),
        chalk.white(pb),
        chalk.white(eps),
        chalk.white(bvps),
        chalk.white(typeof mkt === 'number' ? (mkt / 1e9).toFixed(1) : mkt),
        chalk.cyan(exch),
    ]);
    console.log(valuationTable.toString());

    // ── Volume Breakdown ───────────────────────────────────────────────────
    if (info.buyVolume || info.sellVolume) {
        console.log(chalk.bold.white('  ══ PHÂN TÍCH KHỐI LƯỢNG ══'));

        const volTable = new Table({
            head: [chalk.green.bold('KL Mua (ước tính)'), chalk.red.bold('KL Bán (ước tính)'), chalk.cyan.bold('Tổng KL')],
            colWidths: [25, 25, 26],
            style: { border: ['dim'], head: [] },
        });

        volTable.push([
            chalk.green(info.buyVolume  || '---'),
            chalk.red(info.sellVolume   || '---'),
            chalk.white(info.totalVolume || '---'),
        ]);
        console.log(volTable.toString());
    }

    // ── Company Profile Extra ──────────────────────────────────────────────
    const hasExtra = profile.listing_date || profile.charter_capital || profile.shares_listed || profile.address;
    if (hasExtra) {
        console.log(chalk.bold.white('  ══ THÔNG TIN CÔNG TY ══'));

        const profileTable = new Table({
            style: { border: ['dim'], head: [] },
            colWidths: [25, 51],
        });

        const rows = [
            ['Ngày niêm yết', profile.listing_date],
            ['Vốn điều lệ',   profile.charter_capital],
            ['CP lưu hành',   profile.shares_listed],
            ['Địa chỉ',       profile.address ? profile.address.slice(0, 50) : null],
            ['Website',       profile.website],
            ['Email',         profile.email],
        ].filter(r => r[1]);

        rows.forEach(([label, val]) => {
            profileTable.push([chalk.dim(label), chalk.white(val)]);
        });

        if (rows.length > 0) console.log(profileTable.toString());
    }

    // ── Sparkline Chart ────────────────────────────────────────────────────
    if (chartData && chartData.length > 0) {
        console.log(chalk.bold.white('  ══ HÀNH VI GIÁ 30 PHIÊN GẦN NHẤT ══'));
        console.log('');

        const spark = miniSparkline(chartData, 30);
        console.log('  ' + spark);

        // Candlestick summary of last 5 sessions
        const last5 = chartData.slice(-5);
        console.log('\n' + chalk.dim('  5 phiên gần nhất (Mở / Cao / Thấp / Đóng):'));
        last5.forEach(c => {
            const isUp = parseFloat(c.close) >= parseFloat(c.open);
            const color = isUp ? chalk.green : chalk.red;
            const arrow = isUp ? '▲' : '▼';
            const date  = c.date ? chalk.dim(new Date(c.date * 1000 || c.date).toLocaleDateString('vi-VN')) : '';
            console.log(`  ${color(arrow)} ${date}  ${chalk.dim('O:')}${color(c.open)}  ${chalk.dim('H:')}${chalk.white(c.high)}  ${chalk.dim('L:')}${chalk.white(c.low)}  ${chalk.dim('C:')}${color.bold(c.close)}  ${chalk.dim('Vol:')}${chalk.white(parseInt(c.volume || 0).toLocaleString('vi-VN'))}`);
        });
        console.log();
    }

    // ── PDF Report ─────────────────────────────────────────────────────────
    if (marketData.reportPdf) {
        console.log(chalk.dim('  📎 Báo cáo TCBS: ') + chalk.blue.underline(marketData.reportPdf));
    }
}

// ── AI Report Renderer ─────────────────────────────────────────────────────

export function renderAiReport(aiReport, symbol = '') {
    if (!aiReport) {
        console.log('\n' + chalk.yellow('⚠  AI Engine không trả về báo cáo. Thử lại sau.'));
        return;
    }

    console.log('\n' + chalk.bgMagenta.black('═'.repeat(BOX_WIDTH)));
    console.log(chalk.bgMagenta.black.bold(`  🦆 OMNI DUCK · AI STRATEGIC REPORT${symbol ? ' — ' + symbol : ''}${' '.repeat(Math.max(0, BOX_WIDTH - 38 - symbol.length))}`));
    console.log(chalk.bgMagenta.black('═'.repeat(BOX_WIDTH)) + '\n');

    // Strip React JSX/HTML class tags and convert to chalk terminal styles
    let cleanReport = aiReport
        // Remove JSX/HTML span tags with className - extract content
        .replace(/<span\s+className="[^"]*text-emerald[^"]*"[^>]*>([\s\S]*?)<\/span>/g, (_, content) => chalk.green.bold(content))
        .replace(/<span\s+className="[^"]*text-green[^"]*"[^>]*>([\s\S]*?)<\/span>/g, (_, content) => chalk.green.bold(content))
        .replace(/<span\s+className="[^"]*text-red[^"]*"[^>]*>([\s\S]*?)<\/span>/g, (_, content) => chalk.red.bold(content))
        .replace(/<span\s+className="[^"]*text-yellow[^"]*"[^>]*>([\s\S]*?)<\/span>/g, (_, content) => chalk.yellow.bold(content))
        .replace(/<span\s+className="[^"]*text-blue[^"]*"[^>]*>([\s\S]*?)<\/span>/g, (_, content) => chalk.blue.bold(content))
        .replace(/<span\s+className="[^"]*text-cyan[^"]*"[^>]*>([\s\S]*?)<\/span>/g, (_, content) => chalk.cyan.bold(content))
        .replace(/<span\s+className="[^"]*text-white[^"]*"[^>]*>([\s\S]*?)<\/span>/g, (_, content) => chalk.white(content))
        .replace(/<span\s+className="[^"]*font-black[^"]*"[^>]*>([\s\S]*?)<\/span>/g, (_, content) => chalk.bold(content))
        // Any remaining span tags
        .replace(/<\/?span[^>]*>/g, '')
        // Markdown-like bold
        .replace(/\*\*(.*?)\*\*/g, (_, t) => chalk.bold(t))
        // Section separators
        .replace(/^---+$/gm, chalk.dim('─'.repeat(BOX_WIDTH)))
        // Leading bullets
        .replace(/^[\-\•]\s+/gm, '  · ');

    // Print with indentation
    cleanReport.split('\n').forEach(line => {
        if (line.trim() === '') {
            console.log();
        } else if (line.startsWith('  ·')) {
            console.log('  ' + chalk.dim('·') + line.slice(3));
        } else {
            console.log('  ' + line);
        }
    });

    console.log('\n' + chalk.magenta('═'.repeat(BOX_WIDTH)));
    console.log(chalk.dim(`  ⚠  Báo cáo AI chỉ mang tính tham khảo. Không phải khuyến nghị đầu tư.`));
    console.log(chalk.magenta('═'.repeat(BOX_WIDTH)));
}
