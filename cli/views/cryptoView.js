import Table from 'cli-table3';
import chalk from 'chalk';

export function renderCryptoMarket(coins) {
    if (!coins || coins.length === 0) {
        console.log(chalk.yellow('\n[!] Đang kết nối mạng lưới Crypto hoặc không có dữ liệu.'));
        return;
    }

    console.log(`\n=== 🪙 ${chalk.bgYellow.black.bold(' BẢNG ĐIỆN TỬ CRYPTO GLOBAL (TOP 10) ')} ===\n`);

    const table = new Table({
        head: [
            chalk.cyan('Tên Đồng'), 
            chalk.cyan('Mã (Symbol)'), 
            chalk.cyan('Giá (USD)'), 
            chalk.cyan('Biến động 24h'), 
            chalk.cyan('Vốn hóa (USD)')
        ],
        colWidths: [20, 15, 18, 18, 20]
    });

    // Lọc top 10 coin theo vốn hóa
    coins.slice(0, 10).forEach(c => {
        const changeNum = parseFloat(c.change24h || 0);
        const changeColor = changeNum >= 0 ? chalk.green.bold : chalk.red.bold;
        const sign = changeNum >= 0 ? '+' : '';
        
        table.push([
            chalk.white(c.name || 'N/A'),
            chalk.yellow.bold(c.symbol || 'N/A'),
            `$${parseFloat(c.currentPrice || 0).toLocaleString()}`,
            changeColor(`${sign}${changeNum.toFixed(2)}%`),
            `$${((c.marketCap || 0) / 1e9).toFixed(2)}B`
        ]);
    });

    console.log(table.toString());
}