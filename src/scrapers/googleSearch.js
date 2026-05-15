import googleIt from 'google-it';

/**
 * Tìm kiếm tin tức đa nguồn dựa trên Ticker
 * @param {string} ticker - Mã chứng khoán hoặc Coin (VD: MBB, BTC)
 */
export async function searchFinancialLinks(ticker) {
    const cleanTicker = ticker.replace('.HM', '').replace('.HN', '');
    
    // Query tối ưu: Tập trung vào các nguồn tin nhanh và diễn đàn lớn
    const query = `${cleanTicker} chứng khoán (site:cafef.vn OR site:vietstock.vn OR site:f319.com OR site:tinnhanhchungkhoan.vn OR site:fireant.vn)`;

    try {
        const results = await googleIt({ 
            query: query,
            limit: 8, // Lấy 8 kết quả hàng đầu
            'no-display': true 
        });

        return results.map(item => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet
        }));
    } catch (error) {
        console.error("Lỗi khi tìm kiếm Google:", error.message);
        return [];
    }
}