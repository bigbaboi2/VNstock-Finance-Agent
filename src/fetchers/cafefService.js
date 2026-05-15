import axios from 'axios';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://s.cafef.vn/'
};

export const fetchCafefData = async (symbol) => {
    const ticker = symbol.toUpperCase();
    let logs = [];
    
    try {
        const [infoRes, financeRes, ownerRes] = await Promise.all([
            axios.get(`https://cafef.vn/du-lieu/ajax/pagenew/companyinfor.ashx?symbol=${ticker}`, { headers: HEADERS })
                 .catch(e => { logs.push(`❌ Lỗi Info: ${e.message}`); return null; }),
            axios.get(`https://cafef.vn/du-lieu/Ajax/PageNew/ChiSoTaiChinh.ashx?Symbol=${ticker}`, { headers: HEADERS })
                 .catch(e => { logs.push(`❌ Lỗi Finance: ${e.message}`); return null; }),
            axios.get(`https://cafef.vn/du-lieu/Ajax/PageNew/CoCauSoHuu.ashx?Symbol=${ticker}`, { headers: HEADERS })
                 .catch(e => { logs.push(`❌ Lỗi Ownership: ${e.message}`); return null; })
        ]);

        let mktCap = '---', pe = '---', companyName = ticker, exchange = 'VNX', overview = 'Đang phân tích doanh nghiệp...';

        // Đóng gói data thô
        let rawData = {
            info: null,
            finance: null,
            ownership: null
        };

        if (infoRes?.data?.Success && infoRes.data.Data) {
            rawData.info = infoRes.data.Data; 
            exchange = rawData.info.San || exchange;
            overview = `Ngành: ${rawData.info.Nganh || 'N/A'}. Ngày giao dịch đầu tiên: ${rawData.info.NgayGDDauTien || 'N/A'}.`;
            logs.push(`✅ CafeF: Đã lấy thông tin cơ bản (${exchange}).`);
        }

        if (financeRes?.data?.Success && Array.isArray(financeRes.data.Data)) {
            rawData.finance = financeRes.data.Data; 
            const capItem = rawData.finance.find(item => item.Code === "VonHoaThiTruong");
            if (capItem && capItem.Value) mktCap = capItem.Value + ' Tỷ';
            const peItem = rawData.finance.find(item => item.Code === "P/E");
            if (peItem && peItem.Value) pe = peItem.Value;
            logs.push(`✅ CafeF: Đã lấy Vốn hóa (${mktCap}) & P/E (${pe}).`);
        }

        if (ownerRes?.data) {
            rawData.ownership = ownerRes.data.Data || ownerRes.data; 
            logs.push(`✅ CafeF: Đã hốt trọn ổ Cơ cấu sở hữu.`);
        }

        // Trả data về
        return { success: true, rawData, mktCap, pe, companyName, exchange, overview, logs };

    } catch (error) {
        return { success: false, logs: [`❌ CafeF Service Lỗi: ${error.message}`] };
    }
};