import Table from 'cli-table3';
import chalk from 'chalk';

export function renderStockDetail(marketData, chartData) {
    if (!marketData) return;

    const info = marketData.stockInfo;
    const profile = marketData.companyProfile;

    console.log(`\n⚡ ${chalk.bgBlue.black.bold(` PROFILE: ${info.symbol} - ${profile.companyName || 'N/A'} `)} [${chalk.yellow(info.exchange || 'HOSE')}]`);
    console.log(`🎯 Cốt lõi kinh doanh: ${chalk.gray(profile.overview || 'Chưa cập nhật tổng quan.')}\n`);

    //1. Realtime Specs table (Realtime Specs)
    const specTable = new Table({
        head: [chalk.cyan('Giá Hiện Tại'), chalk.cyan('Biến Động'), chalk.cyan('Khối Lượng'), chalk.cyan('P/E'), chalk.cyan('P/B')],
        colWidths: [18, 15, 20, 10, 10]
    });

    const changeColor = info.changePercent >= 0 ? chalk.green.bold : chalk.red.bold;
    const changeSign = info.changePercent >= 0 ? '+' : '';

    specTable.push([
        chalk.yellow.bold(info.currentPrice + ' đ'),
        changeColor(`${changeSign}${parseFloat(info.changePercent || 0).toFixed(2)}%`),
        chalk.blue(info.totalVolume || 'N/A'),
        chalk.white(info.pe || 'N/A'),
        chalk.white(info.pb || 'N/A')
    ]);

    console.log(specTable.toString());

//2. Draw a Price Action Chart (Price Action ASCII Simple)
    if (chartData && chartData.length > 0) {
        console.log(chalk.cyan(`\n📈 BIỂU ĐỒ HÀNH VI GIÁ (30 phiên gần nhất):`));
        const sampleData = chartData.slice(-20);  
        let chartLine = 'Giá: ';
        sampleData.forEach(c => {
            const isUp = c.close >= c.open;
            chartLine += isUp ? chalk.green('◼ ') : chalk.red('◼ ');
        });
        console.log(chartLine + '\n');
    }
}

export function renderAiReport(aiReport) {
    if (!aiReport) {
        console.log(chalk.magenta('💡 Mẹo: Nhấn phím chức năng phân tích để kích hoạt siêu não bộ OMNI DUCK AI...'));
        return;
    }

    console.log(chalk.bgMagenta.black.bold('\n 🦆 OMNI DUCK STRATEGIC AI REPORT '));
    
    let cleanReport = aiReport
        .replace(/<span className="text-emerald-500 font-black uppercase">([\s\S]*?)<\/span>/g, chalk.green.bold('$1'))
        .replace(/<span className="text-red-500 font-black uppercase">([\s\S]*?)<\/span>/g, chalk.red.bold('$1'))
        .replace(/<span className="text-yellow-500 font-black text-lg">([\s\S]*?)<\/span>/g, chalk.yellow.bold('$1'));

    console.log(cleanReport);
    console.log(chalk.gray('\n────────────────────────────────────────────────────────────'));
}