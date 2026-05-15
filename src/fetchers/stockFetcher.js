import YahooFinance from 'yahoo-finance2';

// Cấu hình thêm để tắt thông báo và giả lập yêu cầu sạch hơn
const yahooFinance = new YahooFinance({ 
    suppressNotices: ['yahooSurvey'],
    queue: { concurrency: 1, delay: 2000 } // Thêm độ trễ giữa các lần gọi (nếu gọi nhiều mã)
});

export async function getStockData(ticker) {
    try {
        // Thử thiết lập cookie/crumb trước khi gọi (giúp né lỗi 429 một phần)
        const quote = await yahooFinance.quote(ticker);
        
        return {
            symbol: quote.symbol,
            name: quote.longName,
            currentPrice: quote.regularMarketPrice,
            marketCap: quote.marketCap,
            peRatio: quote.trailingPE || 'N/A',
            fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
        };
    } catch (error) {
        // Nếu vẫn lỗi 429, báo lỗi rõ ràng cho Đại ca biết
        if (error.status === 429) {
            console.error(chalk.red("⚠ Yahoo Finance đang chặn IP của bạn (Lỗi 429). Hãy đợi vài phút hoặc đổi mạng."));
        } else {
            console.error("Lỗi khi lấy dữ liệu cổ phiếu:", error.message);
        }
        return null;
    }
}