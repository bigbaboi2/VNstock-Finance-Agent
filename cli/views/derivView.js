import Table from 'cli-table3';
import chalk from 'chalk';

export function renderDerivativesMatrix(derivRadar, derivAnalysis, volumeProfile) {
    if (!derivRadar || !derivAnalysis) {
        console.log(chalk.yellow('\n[!] Trống dữ liệu Luồng Phái sinh Realtime...'));
        return;
    }

    console.log(`\n=== ⚡ ${chalk.bgMagenta.black.bold(' QUANT METRIC ENGINE: VN30F1M ')} ===`);
    
    //1. Orderflow & Basic Index
    const flowTable = new Table({
        head: [chalk.cyan('Giá F1M'), chalk.cyan('VN30 INDEX'), chalk.cyan('Độ Lệch (Basis)'), chalk.cyan('Tốc Độ Xé Basis'), chalk.cyan('Khối Ngoại ròng')],
        colWidths: [15, 15, 18, 20, 18]
    });

    const basisNum = parseFloat(derivRadar.basis || 0);
    const basisColor = basisNum >= 0 ? chalk.green.bold : chalk.red.bold;

    flowTable.push([
        chalk.yellow.bold(derivRadar.vn30f1m),
        chalk.white(derivRadar.vn30),
        basisColor(derivRadar.basis),
        chalk.magenta(derivRadar.basisSpeed + ' đ/nhịp'),
        chalk.blue(derivRadar.foreignNet + ' HĐ')
    ]);
    console.log(flowTable.toString());

    //2. System technical momentum status (Confluence Analytics)
    console.log(`Điểm Hợp Lưu Hệ Thống (Confluence Score): ${chalk.yellow.bold(derivAnalysis.score + '/100')}`);
    
    let actionColor = chalk.yellow.bold;
    if (derivAnalysis.mechAction.includes('LONG')) actionColor = chalk.bgGreen.black.bold;
    if (derivAnalysis.mechAction.includes('SHORT')) actionColor = chalk.bgRed.white.bold;

    console.log(`Đề xuất cơ máy: ${actionColor(` ${derivAnalysis.mechAction} `)} [Xu hướng: ${chalk.italic(derivAnalysis.mechTrend)}]\n`);

    //3. Display Volume Profile (POC order stuck area)
    if (volumeProfile && volumeProfile.pocPrice) {
        console.log(`📍 Vùng kẹt lệnh (POC): ${chalk.yellow.bold(volumeProfile.pocPrice)} | Khoảng cách: ${chalk.cyan(derivAnalysis.pocDistance)}`);
        
        //Plot a small volume histogram in the terminal
        console.log(chalk.gray('Mật độ Volume Profile:'));
        volumeProfile.bins.slice(0, 5).forEach(b => {
            const barLength = Math.round((b.volume / volumeProfile.maxVol) * 15) || 1;
            const isPoc = b.priceCenter == volumeProfile.pocPrice;
            const barStr = '█'.repeat(barLength);
            console.log(`  ${b.priceCenter} | ${isPoc ? chalk.yellow(barStr + ' [POC]') : chalk.gray(barStr)}`);
        });
        console.log();
    }

    //4. Action Plan
    const planTable = new Table({
        head: [chalk.green('Vùng Mua/Bán (Entry)'), chalk.red('Cắt Lỗ (SL)'), chalk.green('Chốt Lời 1 (TP1)'), chalk.green('Chốt Lời 2 (TP2)'), chalk.cyan('Tỷ lệ R:R')],
        colWidths: [22, 16, 18, 18, 12]
    });

    planTable.push([
        chalk.yellow.bold(derivRadar.vn30f1m),
        chalk.red.bold(derivAnalysis.sl),
        chalk.green.bold(derivAnalysis.tp1),
        chalk.green.bold(derivAnalysis.tp2),
        chalk.white(`1:${derivAnalysis.rrRatio}`)
    ]);
    console.log(chalk.bold('🎯 KỊCH BẢN THỰC THI LỆNH MÁY MÓC:'));
    console.log(planTable.toString());
    console.log(`${chalk.cyan('Lý do cấu trúc:')} ${chalk.gray(derivAnalysis.mechReason)}\n`);
}