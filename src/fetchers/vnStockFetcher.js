import axios from 'axios';

export async function getVnStockData(ticker) {
    const cleanTicker = ticker.toUpperCase();
    
    try {
        // Lấy mốc thời gian 10 ngày gần nhất để đảm bảo luôn lấy được giá chốt phiên cuối cùng
        const toDate = Math.floor(Date.now() / 1000);
        const fromDate = toDate - (10 * 24 * 60 * 60); 

        // API Biểu đồ của VNDirect
        const priceUrl = `https://dchart-api.vndirect.com.vn/dchart/history?symbol=${cleanTicker}&resolution=D&from=${fromDate}&to=${toDate}`;
        
        const response = await axios.get(priceUrl, { 
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000 
        });

        const data = response.data;

        // Kiểm tra nếu có ít nhất 2 phiên dữ liệu để tính biến động
        if (data.s === "ok" && data.c && data.c.length > 1) {
            const lastPrice = data.c[data.c.length - 1]; 
            const prevPrice = data.c[data.c.length - 2];
            
            // Tính toán biến động (VNDirect trả về đơn vị 1.0, cần nhân 1000)
            const change = (lastPrice - prevPrice) * 1000;
            const changePercent = ((lastPrice - prevPrice) / prevPrice) * 100;
            
            return {
                symbol: cleanTicker,
                name: cleanTicker,
                currentPrice: (lastPrice * 1000).toLocaleString('vi-VN'),
                change: change, // Trả về số để App.jsx xử lý màu xanh/đỏ
                changePercent: parseFloat(changePercent.toFixed(2))
            };
        }

        // Trường hợp chỉ có 1 phiên dữ liệu (mới lên sàn hoặc thanh khoản thấp)
        if (data.s === "ok" && data.c && data.c.length === 1) {
            const lastPrice = data.c[0];
            return {
                symbol: cleanTicker,
                currentPrice: (lastPrice * 1000).toLocaleString('vi-VN'),
                change: 0,
                changePercent: 0
            };
        }
        
        return null;
    } catch (error) {
        console.error(`❌ Lỗi truy xuất giá cho mã ${ticker}:`, error.message);
        return null;
    }
}