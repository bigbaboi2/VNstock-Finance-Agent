import Table from 'cli-table3';
import chalk from 'chalk';
import { ScreenBuffer, padVisible, getTermSize } from './screenManager.js';

export function buildMarketBuffer(apiResponse) {
    const buf      = new ScreenBuffer();
    const { cols } = getTermSize();
    const W        = Math.min(cols - 2, 100);

    const intelData = apiResponse?.data || apiResponse;

    if (!intelData || !intelData.success) {
        buf.blank()
           .line(chalk.yellow('⚠  Chưa có dữ liệu ma trận hoặc hệ thống đang khởi tạo...'));
        if (intelData?.message) buf.line(chalk.dim('   ' + intelData.message));
        return buf;
    }

    const intel  = intelData.intelligence;
    const isLive = apiResponse?.isLive ?? true;

    // ── Header ────────────────────────────────────────────────────────────────
    buf.sectionHeader('📡', 'MA TRẬN RADAR THỊ TRƯỜNG — VN-INDEX', chalk.cyan, W);

    const liveTag = isLive
        ? chalk.bgGreen.black(' ● LIVE ')
        : chalk.bgYellow.black(' ◌ CACHE ');
    buf.blank()
       .line(`  ${liveTag}  ${chalk.dim('Cập nhật: ' + new Date().toLocaleTimeString('vi-VN'))}`)
       .blank();

    // ── Market Status Card ─────────────────────────────────────────────────────
    let statusBg = chalk.bgYellow.black;
    if (intel.statusType === 'bullish')  statusBg = chalk.bgGreen.black;
    if (intel.statusType === 'bearish')  statusBg = chalk.bgRed.white;
    if (intel.statusType === 'warning')  statusBg = chalk.bgMagenta.white;

    const changePct  = parseFloat(intel.indexChangePct);
    const changeText = changePct >= 0
        ? chalk.green.bold(`▲ +${intel.indexChangePct}%`)
        : chalk.red.bold(`▼ ${intel.indexChangePct}%`);

    const breadthPct  = parseFloat(intel.breadthRatio);
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

    buf.line(chalk.cyan('  ┌─ TRẠNG THÁI THỊ TRƯỜNG ' + '─'.repeat(Math.max(0, W - 28)) + '┐'))
       .line(chalk.cyan('  │') + `  ${statusBg.bold(` ${intel.marketStatus} `)}`)
       .line(chalk.cyan('  │') + `  ${chalk.dim('Chẩn đoán:')} ${chalk.italic.white(intel.diagnosticDesc || '')}`)
       .line(chalk.cyan('  └' + '─'.repeat(W - 4) + '┘'))
       .blank();

    // ── Key Metrics ───────────────────────────────────────────────────────────
    const metricsTable = new Table({
        head: [
            chalk.cyan.bold('Biến Động Index'),
            chalk.cyan.bold('Breadth (Tỷ lệ tăng)'),
            chalk.cyan.bold('Khối Ngoại Ròng'),
            chalk.cyan.bold('Nguồn Breadth'),
        ],
        colWidths: [20, 22, 22, 18],
        style: { border: ['cyan'], head: [] },
    });
    metricsTable.push([changeText, breadthText, foreignText, chalk.dim(intel.breadthSource || 'N/A')]);
    metricsTable.toString().split('\n').forEach(l => buf.line(l));

    // ── Sector Analysis ───────────────────────────────────────────────────────
    buf.blank().line(chalk.bold('  📊 PHÂN TÍCH NGÀNH:'));

    const sectorTable = new Table({
        head: [chalk.green.bold('🔥 TOP NGÀNH MẠNH (SPS > 0)'), chalk.red.bold('❄️  TOP NGÀNH YẾU  (SPS < 0)')],
        colWidths: [38, 38],
        style: { border: ['dim'], head: [] },
    });

    const maxRows = Math.max(intel.strongSectors?.length || 0, intel.weakSectors?.length || 0);
    if (maxRows === 0) {
        sectorTable.push([chalk.gray('  Không có dòng tiền đột biến'), chalk.gray('  Không có áp lực tháo chạy')]);
    } else {
        for (let i = 0; i < maxRows; i++) {
            const s = intel.strongSectors?.[i];
            const w = intel.weakSectors?.[i];
            sectorTable.push([
                s ? `${chalk.green.bold(s.name)}\n  ${chalk.dim('SPS:')} ${chalk.green(s.sps?.toFixed(2) || '—')}  ${chalk.dim(s.tickers?.slice(0,3).join(' · ') || '')}` : '',
                w ? `${chalk.red.bold(w.name)}\n  ${chalk.dim('SPS:')} ${chalk.red(w.sps?.toFixed(2) || '—')}  ${chalk.dim(w.tickers?.slice(0,3).join(' · ') || '')}` : '',
            ]);
        }
    }
    sectorTable.toString().split('\n').forEach(l => buf.line(l));

    // ── Top Movers ─────────────────────────────────────────────────────────────
    const topGainers = intel.topGainers || [];
    const topLosers  = intel.topLosers  || [];
    const topVolume  = intel.topVolume  || [];

    if (topGainers.length > 0 || topLosers.length > 0) {
        buf.blank().line(chalk.bold('  🏆 TOP MOVERS HÔM NAY:'));

        const moverTable = new Table({
            head: [chalk.green.bold('📈 Tăng Mạnh'), chalk.red.bold('📉 Giảm Mạnh'), chalk.blue.bold('💹 Khối lượng')],
            colWidths: [24, 24, 24],
            style: { border: ['dim'], head: [] },
        });

        const maxM = Math.max(topGainers.length, topLosers.length, topVolume.length);
        for (let i = 0; i < Math.min(maxM, 3); i++) {
            const g = topGainers[i];
            const l = topLosers[i];
            const v = topVolume[i];
            moverTable.push([
                g ? `${chalk.green.bold(g.symbol)}  ${chalk.green('+' + (g.changePct || '—') + '%')}` : '',
                l ? `${chalk.red.bold(l.symbol)}  ${chalk.red((l.changePct || '—') + '%')}` : '',
                v ? `${chalk.blue.bold(v.symbol)}  ${chalk.dim(v.volume || '—')}` : '',
            ]);
        }
        moverTable.toString().split('\n').forEach(l => buf.line(l));
    }

    buf.blank().divider('─', W, chalk.dim);
    return buf;
}

/** Legacy: render trực tiếp ra console (dùng trong pause mode) */
export function renderMarketRadar(apiResponse) {
    buildMarketBuffer(apiResponse).lines.forEach(l => console.log(l));
}