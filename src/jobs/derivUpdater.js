import axios from 'axios';

 export const globalDerivCache = {
    oi: 54210,         
    foreignNet: -1240,
    lastBasis: 0,       
    lastOi: 54210     
};

export const startDerivUpdater = () => {
    console.log('⏳ [JOB] Hệ thống theo dõi dòng tiền Phái sinh (OI) đã khởi động...');
    
    setInterval(async () => {
        try {
            const res = await axios.get(`https://finfo-api.vndirect.com.vn/v4/derivatives_prices?q=code:VN30F1M`, { 
                timeout: 3000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Accept': 'application/json, text/plain, */*',
                    'Origin': 'https://dboard.vndirect.com.vn',
                    'Referer': 'https://dboard.vndirect.com.vn/'
                }
            });
            
            if (res.data && res.data.data && res.data.data.length > 0) {
                const derivInfo = res.data.data[0];
                globalDerivCache.oi = derivInfo.openInterest || globalDerivCache.oi;
                const foreignBuy = derivInfo.foreignBuyVolume || 0;
                const foreignSell = derivInfo.foreignSellVolume || 0;
                globalDerivCache.foreignNet = foreignBuy - foreignSell;
            }
        } catch (error) {}
    }, 60000); 
};