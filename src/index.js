import chalk from 'chalk';
import { getVnStockData } from './fetchers/vnStockFetcher.js';
import { getCompanyProfile } from './fetchers/companyProfileFetcher.js';
import { searchVnNewsDirectly } from './scrapers/vnNewsSearch.js';
import { scrapeArticleContent } from './scrapers/contentScraper.js';
import { getCachedData, saveToCache } from './services/cacheService.js';
import { exportToLog } from './services/logService.js';
import { analyzeWithGemini } from './services/aiService.js';

async function main() {
    console.log(chalk.bgBlue.white.bold('\n ============================================= '));
    console.log(chalk.bgBlue.white.bold('       HỆ THỐNG PHÂN TÍCH TÀI CHÍNH OMNI-VN    '));
    console.log(chalk.bgBlue.white.bold(' ============================================= \n'));

    const ticker = 'MBB'; 
    console.log(`${chalk.blue('▶')} Đang quét thị trường nội địa cho mã: ${chalk.green.bold(ticker)}`);

    let fullData = null; // Biến này sẽ chứa toàn bộ dữ liệu (từ Kho hoặc Cào mới) để đưa cho AI

    // =======================================================
    // BƯỚC 1: TÌM TRONG KHO (CACHE)
    // =======================================================
    console.log(chalk.gray(`\n🔍 Đang kiểm tra kho dữ liệu cũ cho mã ${ticker}...`));
    const cachedData = await getCachedData(ticker);

    if (cachedData) {
        console.log(chalk.bgGreen.black.bold('\n ⚡ TÌM THẤY DỮ LIỆU TRONG KHO! TỐC ĐỘ: 0.01s ⚡ '));
        fullData = cachedData; // Nạp đạn từ Kho luôn
    } 
    // =======================================================
    // BƯỚC 2: NẾU KHO TRỐNG -> ĐI CÀO MỚI & LƯU LẠI
    // =======================================================
    else {
        console.log(chalk.yellow('⚠ Kho trống hoặc dữ liệu đã cũ. Tiến hành lấy dữ liệu mới từ thị trường...\n'));
        
        let stockInfo = null;
        let companyProfile = null;
        let newsLinks = [];
        let deepNewsData = [];

        console.log(chalk.yellow('[1/3] Đang tải Hồ sơ doanh nghiệp và Chỉ số tài chính...'));
        try {
            [stockInfo, companyProfile] = await Promise.all([
                getVnStockData(ticker),
                getCompanyProfile(ticker)
            ]);
            if (companyProfile) console.log(chalk.green(`  ✔ Hồ sơ: ${companyProfile.fullName}`));
            if (stockInfo) console.log(chalk.green(`  ✔ Chỉ số: ${stockInfo.currentPrice} VNĐ`));
        } catch (e) { console.log(chalk.red('  ✘ Lỗi Bước 1.')); }

        console.log(chalk.yellow('\n[2/3] Đang quét tin tức trực tiếp từ báo chí...'));
        try {
            newsLinks = await searchVnNewsDirectly(ticker);
            if (newsLinks.length > 0) console.log(chalk.green(`  ✔ Đã tìm thấy ${newsLinks.length} link dự phòng.`));
        } catch (e) { console.log(chalk.red('  ✘ Lỗi Bước 2.')); }

        if (newsLinks.length > 0) {
            const TARGET_ARTICLES = 10; 
            console.log(chalk.yellow(`\n[3/3] Đang trích xuất nội dung chi tiết...`));
            for (let i = 0; i < newsLinks.length; i++) {
                if (deepNewsData.length >= TARGET_ARTICLES) break; 
                const item = newsLinks[i];
                process.stdout.write(chalk.gray(`  (${i + 1}/${newsLinks.length}) Đang đọc: ${item.title.substring(0, 30)}... `));
                try {
                    const content = await scrapeArticleContent(item.link);
                    if (content && content.length > 50) {
                        deepNewsData.push({ title: item.title, source: item.link, content: content });
                        console.log(chalk.green(`XONG`));
                    } else { console.log(chalk.red('BỎ QUA')); }
                } catch (err) { console.log(chalk.red('LỖI')); }
            }
        }

        // Nếu lấy đủ 3 món -> Đóng gói, Lưu kho và Xuất Log
        if (stockInfo && companyProfile && deepNewsData.length > 0) {
            fullData = { stockInfo, companyProfile, deepNewsData };
            
            console.log(chalk.cyan('\n💾 Đang đóng gói dữ liệu và lưu Kho...'));
            await saveToCache(ticker, fullData);
            const logPath = await exportToLog(ticker, fullData);
            
            console.log(chalk.green('✔ Đã lưu kho Cache tự động.'));
            if (logPath) console.log(chalk.green(`✔ Đã xuất Log đọc tay tại: ${chalk.underline(logPath)}`));
        }
    }

    // =======================================================
    // BƯỚC 3: GIAO DỮ LIỆU ĐÃ ĐÓNG GÓI CHO GEMINI AI
    // =======================================================
    if (fullData) {
        console.log(chalk.bgGreen.black.bold('\n [HỆ THỐNG SẴN SÀNG] Chuyển giao dữ liệu cho AI... \n'));
        
        // Gọi hàm phân tích (từ file aiService.js)
        const aiReport = await analyzeWithGemini(ticker, fullData);
        
        if (aiReport) {
            console.log(chalk.bgMagenta.white.bold('\n ==================== BÁO CÁO PHÂN TÍCH TỪ GEMINI AI ==================== \n'));
            console.log(chalk.white(aiReport));
            console.log(chalk.bgMagenta.white.bold('\n ======================================================================== \n'));
        }
    } else {
        console.log(chalk.bgRed.white.bold('\n [CẢNH BÁO] Hệ thống không có đủ dữ liệu để AI phân tích. \n'));
    }
}

main();