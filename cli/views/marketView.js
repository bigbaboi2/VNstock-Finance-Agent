import Table from 'cli-table3';
import chalk from 'chalk';

const BOX_WIDTH = 80;

function divider(char = '─', color = chalk.dim) {
    return color(char.repeat(BOX_WIDTH));
}

function sectionHeader(icon, title, color = chalk.cyan) {
    const inner = ` ${icon}  ${title} `;
    const pad = BOX_WIDTH - 2 - inner.length;
    return color('┌' + '─'.repeat(BOX_WIDTH - 2) + '┐') + '\n' +
           color('│') + chalk.bold.white(inner) + ' '.repeat(Math.max(0, pad)) + color('│') + '\n' +
           color('└' + '─'.repeat(BOX_WIDTH - 2) + '┘');
}

export function renderMarketRadar(apiResponse) {
    // Support both old and new response shapes
    const intelData = apiResponse?.data || apiResponse;
    
    if (!intelData || !intelData.success) {
        console.log('\n' + chalk.yellow('⚠  Chưa có dữ liệu ma trận hoặc hệ thống đang khởi tạo...'));
        if (intelData?.message) console.log(chalk.dim('   ' + intelData.message));
        return;
    }

    const intel = intelData.intelligence;
    const isLive = apiResponse?.isLive ?? true;

    // ── Header ────────────────────────────────────────────────────────────
    console.log('\n' + sectionHeader('📡', 'MA TRẬN RADAR THỊ TRƯỜNG — VN-INDEX'));
    
    const liveTag = isLive ? chalk.bgGreen.black(' ● LIVE ') : chalk.bgYellow.black(' ◌ CACHE ');
    console.log(`\n  ${liveTag}  ${chalk.dim('Cập nhật: ' + new Date().toLocaleTimeString('vi-VN'))}\n`);

    // ── Market Status Card ─────────────────────────────────────────────────
    let statusBg = chalk.bgYellow.black;
    if (intel.statusType === 'bullish')  statusBg = chalk.bgGreen.black;
    if (intel.statusType === 'bearish')  statusBg = chalk.bgRed.white;
    if (intel.statusType === 'warning')  statusBg = chalk.bgMagenta.white;

    const changePct  = parseFloat(intel.indexChangePct);
    const changeText = changePct >= 0
        ? chalk.green.bold(`▲ +${intel.indexChangePct}%`)
        : chalk.red.bold(`▼ ${intel.indexChangePct}%`);

    const breadthPct = parseFloat(intel.breadthRatio);
    const breadthText = breadthPct >= 60
        ? chalk.green.bold(`${intel.breadthRatio}%`)
        : breadthPct >= 45
        ? chalk.yellow.bold(`${intel.breadthRatio}%`)
        : chalk.red.bold(`${intel.breadthRatio}%`);

    const foreignVal  = intel.foreignNetValue || 0;
    const foreignBn   = (foreignVal / 1e9).toFixed(1);
    const foreignText = foreignVal >= 0
        ? chalk.green(`+${foreignBn} tỷ ↑ Mua ròng`)
        : chalk.red(`${foreignBn} tỷ ↓ Bán ròng`);

    console.log(chalk.cyan('  ┌─ TRẠNG THÁI THỊ TRƯỜNG ' + '─'.repeat(52) + '┐'));
    console.log(chalk.cyan('  │') + `  ${statusBg.bold(` ${intel.marketStatus} `)}` + chalk.cyan('│'.padStart(BOX_WIDTH - 4 - intel.marketStatus.length)));
    console.log(chalk.cyan('  │') + `  ${chalk.dim('Chẩn đoán:')} ${chalk.italic.white(intel.diagnosticDesc)}` + chalk.cyan('│'.padStart(Math.max(1, BOX_WIDTH - 14 - (intel.diagnosticDesc?.length || 0)))));
    console.log(chalk.cyan('  └' + '─'.repeat(BOX_WIDTH - 4) + '┘\n'));

    // ── Key Metrics Row ────────────────────────────────────────────────────
    const metricsTable = new Table({
        head: [
            chalk.cyan.bold('Biến Động Index'),
            chalk.cyan.bold('Breadth (Tỷ lệ tăng)'),
            chalk.cyan.bold('Khối Ngoại Ròng'),
            chalk.cyan.bold('Nguồn Breadth'),
        ],
        colWidths: [20, 22, 20, 18],
        style: { border: ['cyan'], head: [] },
        chars: { 'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
                 'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
                 'left': '│', 'right': '│', 'mid': '─', 'mid-mid': '┼', 'middle': '│' }
    });

    metricsTable.push([
        changeText,
        breadthText,
        foreignText,
        chalk.dim(intel.breadthSource || 'N/A')
    ]);
    console.log(metricsTable.toString());

    // ── Sector Analysis ────────────────────────────────────────────────────
    console.log('\n' + chalk.bold('  📊 PHÂN TÍCH NGÀNH:'));

    const sectorTable = new Table({
        head: [
            chalk.green.bold('🔥 TOP NGÀNH MẠNH (SPS > 0)'),
            chalk.red.bold('❄️  TOP NGÀNH YẾU  (SPS < 0)')
        ],
        colWidths: [38, 38],
        style: { border: ['dim'], head: [] },
    });

    const maxRows = Math.max(
        intel.strongSectors?.length || 0,
        intel.weakSectors?.length || 0
    );

    if (maxRows === 0) {
        sectorTable.push([
            chalk.gray('  Không có dòng tiền đột biến'),
            chalk.gray('  Không có áp lực tháo chạy')
        ]);
    } else {
        for (let i = 0; i < maxRows; i++) {
            const s = intel.strongSectors?.[i];
            const w = intel.weakSectors?.[i];

            const sText = s
                ? `${chalk.green.bold(s.name)}\n  ${chalk.dim('SPS:')} ${chalk.green(s.sps?.toFixed(2) || '—')}  ${chalk.dim(s.tickers?.slice(0,3).join(' · ') || '')}`
                : '';
            const wText = w
                ? `${chalk.red.bold(w.name)}\n  ${chalk.dim('SPS:')} ${chalk.red(w.sps?.toFixed(2) || '—')}  ${chalk.dim(w.tickers?.slice(0,3).join(' · ') || '')}`
                : '';

            sectorTable.push([sText, wText]);
        }
    }
    console.log(sectorTable.toString());

    // ── Top Movers ─────────────────────────────────────────────────────────
    const topGainers = intel.topGainers || [];
    const topLosers  = intel.topLosers  || [];
    const topVolume  = intel.topVolume  || [];

    if (topGainers.length > 0 || topLosers.length > 0) {
        console.log('\n' + chalk.bold('  🏆 TOP MOVERS HÔM NAY:'));

        const moverTable = new Table({
            head: [chalk.green.bold('📈 Tăng Mạnh'), chalk.red.bold('📉 Giảm Mạnh'), chalk.blue.bold('💹 Khối lượng')],
            colWidths: [24, 24, 24],
            style: { border: ['dim'], head: [] },
        });

        const maxMoverRows = Math.max(topGainers.length, topLosers.length, topVolume.length);
        for (let i = 0; i < Math.min(maxMoverRows, 3); i++) {
            const g = topGainers[i];
            const l = topLosers[i];
            const v = topVolume[i];

            moverTable.push([
                g ? `${chalk.green.bold(g.symbol)}  ${chalk.green('+' + (g.changePct || '—') + '%')}` : '',
                l ? `${chalk.red.bold(l.symbol)}  ${chalk.red((l.changePct || '—') + '%')}` : '',
                v ? `${chalk.blue.bold(v.symbol)}  ${chalk.dim(v.volume || '—')}` : '',
            ]);
        }
        console.log(moverTable.toString());
    }

    // ── Sector Detail (optional) ───────────────────────────────────────────
    const sectorDetails = intel.sectorDetails || [];
    if (sectorDetails.length > 0) {
        console.log('\n' + chalk.bold('  📋 CHI TIẾT CÁC NGÀNH:'));
        const detailTable = new Table({
            head: [chalk.cyan('Ngành'), chalk.cyan('SPS Score'), chalk.cyan('Avg %'), chalk.cyan('Top Tăng'), chalk.cyan('Top Giảm')],
            colWidths: [22, 14, 10, 18, 18],
            style: { border: ['dim'], head: [] },
        });

        sectorDetails.forEach(s => {
            const spsColor = s.sps > 0.3 ? chalk.green : s.sps < -0.3 ? chalk.red : chalk.yellow;
            const avgColor = s.avgChange >= 0 ? chalk.green : chalk.red;
            detailTable.push([
                chalk.white(s.name || '—'),
                spsColor(s.sps?.toFixed(2) || '—'),
                avgColor((s.avgChange >= 0 ? '+' : '') + (s.avgChange?.toFixed(2) || '—') + '%'),
                chalk.dim(s.topGainers?.slice(0,2).join(', ') || '—'),
                chalk.dim(s.topLosers?.slice(0,2).join(', ') || '—'),
            ]);
        });
        console.log(detailTable.toString());
    }

    console.log('\n' + chalk.dim('─'.repeat(BOX_WIDTH)));
}
