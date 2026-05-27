import Table from 'cli-table3';
import chalk from 'chalk';

export function renderMarketRadar(intelData) {
    if (!intelData || !intelData.success) {
        console.log(chalk.yellow('\n[!] Chưa có dữ liệu ma trận thị trường hoặc hệ thống đang quét...'));
        return;
    }

    const intel = intelData.intelligence;
    
    //1. Displays the general status of the market
    let statusColor = chalk.yellow.bold;
    if (intel.statusType === 'bullish') statusColor = chalk.bgGreen.black.bold;
    if (intel.statusType === 'bearish') statusColor = chalk.bgRed.white.bold;
    if (intel.statusType === 'warning') statusColor = chalk.bgYellow.black.bold;

    console.log(`\n=== 📡 ${chalk.bold('MA TRẬN RADAR THỊ TRƯỜNG')} ===`);
    console.log(`Trạng thái: ${statusColor(` ${intel.marketStatus} `)}`);
    console.log(`Chẩn đoán:  ${chalk.italic(intel.diagnosticDesc)}`);
    console.log(`Nguồn Breadth: ${chalk.cyan(intel.breadthSource || 'N/A')} | Khối ngoại ròng: ${chalk.magenta((intel.foreignNetValue / 1e9).toFixed(2) + ' B')}\n`);

    //2. Index & Market breadth table
    const indexTable = new Table({
        head: [chalk.cyan('Chỉ số biến động (%)'), chalk.cyan('Tỷ lệ Số mã tăng (%)')],
        colWidths: [30, 30]
    });

    const changePct = parseFloat(intel.indexChangePct);
    const changeText = changePct >= 0 ? chalk.green.bold(`+${intel.indexChangePct}%`) : chalk.red.bold(`${intel.indexChangePct}%`);
    const breadthText = parseFloat(intel.breadthRatio) >= 50 ? chalk.green.bold(`${intel.breadthRatio}%`) : chalk.red.bold(`${intel.breadthRatio}%`);

    indexTable.push([changeText, breadthText]);
    console.log(indexTable.toString());

    //3. Leading Sectors grouping table (Strong/Weak Sectors)
    const sectorTable = new Table({
        head: [chalk.green('🔥TOP NGÀNH MẠNH (SPS > 0.3)'), chalk.red('❄️ TOP NGÀNH YẾU (SPS < -0.3)')],
        colWidths: [40, 40]
    });

    const maxRows = Math.max(intel.strongSectors?.length || 0, intel.weakSectors?.length || 0);
    
    if (maxRows === 0) {
        sectorTable.push([chalk.gray('Không có dòng tiền đột biến'), chalk.gray('Không có áp lực tháo chạy rõ rệt')]);
    } else {
        for (let i = 0; i < maxRows; i++) {
            const strong = intel.strongSectors?.[i];
            const weak = intel.weakSectors?.[i];

            const strongText = strong ? `${chalk.green.bold(strong.name)} [${strong.tickers?.join(', ')}]` : '';
            const weakText = weak ? `${chalk.red.bold(weak.name)} [${weak.tickers?.join(', ')}]` : '';
            
            sectorTable.push([strongText, weakText]);
        }
    }
    console.log(sectorTable.toString());
}