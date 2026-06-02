import axios from 'axios';
import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { getBrowser } from '../utils/browserManager.js';
import chalk from 'chalk';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const cacheMap  = new Map();

 const MARKET_OPEN_HOUR  = 9;
const MARKET_CLOSE_HOUR = 15; 

function getActiveCacheTTL() {
    const now = new Date();
     const ictHour = (now.getUTCHours() + 7) % 24;
    const isWeekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
    const isMarketHours = ictHour >= MARKET_OPEN_HOUR && ictHour < MARKET_CLOSE_HOUR;
    return (isWeekday && isMarketHours)
        ? 3  * 60 * 1000   
        : 30 * 60 * 1000; 
}


//[FIX] Import from shared util — avoid duplicates with newsCron.js
import { decodeGoogleNewsUrl } from '../utils/googleNewsDecoder.js';
export { decodeGoogleNewsUrl };

const MODE_DATE_WINDOW = {
    official: 90,
    balanced: 60,
    negative: 30,
    rumor:    21,
};

const TICKER_ALIASES = {
    // === NHÓM NGÂN HÀNG (BANKING) ===
    'VCB': '"Vietcombank" OR "Ngân hàng Ngoại thương" OR VCB',
    'BID': '"BIDV" OR "Ngân hàng Đầu tư và Phát triển" OR BID',
    'CTG': '"VietinBank" OR "Ngân hàng Công Thương" OR CTG',
    'TCB': '"Techcombank" OR "Ngân hàng Kỹ Thương" OR TCB',
    'MBB': '"MBBank" OR "Ngân hàng Quân đội" OR MBB',
    'VPB': '"VPBank" OR "Ngân hàng Việt Nam Thịnh Vượng" OR VPB',
    'ACB': '"Ngân hàng Á Châu" OR ACB',
    'STB': '"Sacombank" OR "Ngân hàng Sài Gòn Thương Tín" OR STB',
    'HDB': '"HDBank" OR "Ngân hàng Phát triển TP.HCM" OR HDB',
    'SHB': '"Ngân hàng Sài Gòn - Hà Nội" OR SHB',
    'VIB': '"Ngân hàng Quốc tế" OR VIB',
    'SSB': '"SeABank" OR "Ngân hàng Đông Nam Á" OR SSB',
    'LPB': '"LPBank" OR "Ngân hàng Lộc Phát" OR LPB',
    'MSB': '"Ngân hàng Hàng Hải" OR MSB',
    'OCB': '"Ngân hàng Phương Đông" OR OCB',
    'EIB': '"Eximbank" OR "Ngân hàng Xuất Nhập Khẩu" OR EIB',
    'NAB': '"Nam A Bank" OR "Ngân hàng Nam Á" OR NAB',
    'KLB': '"Kienlongbank" OR "Ngân hàng Kiên Long" OR KLB',
    'BVB': '"BVBank" OR "Ngân hàng Bản Việt" OR BVB',
    'SGB': '"Saigonbank" OR SGB',
    'VAB': '"VietABank" OR "Ngân hàng Việt Á" OR VAB',

    // === NHÓM CHỨNG KHOÁN (SECURITIES) ===
    'SSI': '"Chứng khoán SSI" OR SSI',
    'VND': '"VNDirect" OR "Chứng khoán VNDirect" OR VND',
    'VCI': '"Vietcap" OR "Chứng khoán Bản Việt" OR VCI',
    'HCM': '"Chứng khoán HSC" OR "Chứng khoán TP.HCM" OR HCM',
    'SHS': '"Chứng khoán Sài Gòn Hà Nội" OR SHS',
    'VIX': '"Chứng khoán VIX" OR VIX',
    'MBS': '"Chứng khoán MB" OR MBS',
    'FTS': '"Chứng khoán FPT" OR FTS',
    'BSI': '"Chứng khoán BIDV" OR BSI',
    'CTS': '"Chứng khoán VietinBank" OR CTS',
    'VDS': '"Chứng khoán Rồng Việt" OR VDS',
    'AGR': '"Chứng khoán Agribank" OR AGR',
    'ORS': '"Chứng khoán Tiên Phong" OR "Chứng khoán TPS" OR ORS',
    'TVB': '"Chứng khoán Trí Việt" OR TVB',
    'TVS': '"Chứng khoán Thiên Việt" OR TVS',
    'APS': '"Chứng khoán Châu Á Thái Bình Dương" OR APS',
    'WSS': '"Chứng khoán Phố Wall" OR WSS',
    'TCI': '"Chứng khoán Thành Công" OR TCI',
    'DSC': '"Chứng khoán DSC" OR DSC',
    'BVS': '"Chứng khoán Bảo Việt" OR BVS',
    'VFS': '"Chứng khoán Nhất Việt" OR VFS',
    'VIG': '"Chứng khoán Đầu tư Việt Nam" OR VIG',

    // === NHÓM BẤT ĐỘNG SẢN (REAL ESTATE) ===
    'VHM': '"Vinhomes" OR VHM',
    'VIC': '"Vingroup" OR VIC',
    'VRE': '"Vincom Retail" OR VRE',
    'NVL': '"Novaland" OR NVL',
    'DIG': '"DIC Corp" OR "Tổng Công ty Đầu tư Phát triển Xây dựng" OR DIG',
    'PDR': '"Bất động sản Phát Đạt" OR "Địa ốc Phát Đạt" OR PDR',
    'KBC': '"Tổng công ty Kinh Bắc" OR "Đô thị Kinh Bắc" OR KBC',
    'DXG': '"Tập đoàn Đất Xanh" OR "Địa ốc Đất Xanh" OR DXG',
    'NLG': '"Tập đoàn Nam Long" OR "Đầu tư Nam Long" OR NLG',
    'KDH': '"Nhà Khang Điền" OR "Đầu tư Khang Điền" OR KDH',
    'CEO': '"CEO Group" OR "Tập đoàn CEO" OR CEO',
    'HDC': '"Hodeco" OR "Phát triển nhà Bà Rịa" OR HDC',
    'NTL': '"Nhà Từ Liêm" OR "Lideco" OR NTL',
    'SJS': '"Sudico" OR SJS',
    'TCH': '"Tài chính Hoàng Huy" OR "Tập đoàn Hoàng Huy" OR TCH',
    'QCG': '"Quốc Cường Gia Lai" OR QCG',
    'HQC': '"Địa ốc Hoàng Quân" OR "Tập đoàn Hoàng Quân" OR HQC',
    'SCR': '"TTC Land" OR "Địa ốc Sài Gòn Thương Tín" OR SCR',
    'ITA': '"Tập đoàn Tân Tạo" OR "Khu công nghiệp Tân Tạo" OR ITA',
    'L14': '"Licogi 14" OR L14',
    'IJC': '"Hạ tầng Kỹ thuật Becamex" OR IJC',
    'TDC': '"Kinh doanh và Phát triển Bình Dương" OR TDC',
    'NBB': '"Năm Bảy Bảy" OR NBB',
    'CRE': '"Cen Land" OR CRE',
    'KHG': '"Khải Hoàn Land" OR KHG',
    'DXS': '"Đất Xanh Services" OR DXS',
    'HPX': '"Tập đoàn Hải Phát" OR "Địa ốc Hải Phát" OR "Hải Phát Invest" OR HPX',
    'NRC': '"Tập đoàn Danh Khôi" OR NRC',
    'VPH': '"Vạn Phát Hưng" OR VPH',
    'TIG': '"Tập đoàn Đầu tư Thăng Long" OR TIG',

    // === NHÓM BẤT ĐỘNG SẢN KHU CÔNG NGHIỆP ===
    'IDC': '"Idico" OR "Tổng công ty IDICO" OR IDC',
    'BCM': '"Becamex" OR "Becamex IDC" OR BCM',
    'SZC': '"Sonadezi Châu Đức" OR SZC',
    'SZL': '"Sonadezi Long Thành" OR SZL',
    'SNZ': '"Tổng công ty Sonadezi" OR SNZ',
    'TIP': '"Phát triển Khu Công nghiệp Tín Nghĩa" OR TIP',
    'SIP': '"Đầu tư Sài Gòn VRG" OR SIP',
    'NTC': '"Nam Tân Uyên" OR NTC',
    'VGC': '"Viglacera" OR VGC',
    'D2D': '"Phát triển Đô thị Công nghiệp Số 2" OR D2D',
    'IDV': '"Hạ tầng Vĩnh Phúc" OR IDV',

    // === NHÓM THÉP & VẬT LIỆU XÂY DỰNG ===
    'HPG': '"Tập đoàn Hòa Phát" OR "Thép Hòa Phát" OR HPG',
    'HSG': '"Tập đoàn Hoa Sen" OR "Tôn Hoa Sen" OR HSG',
    'NKG': '"Thép Nam Kim" OR NKG',
    'SMC': '"Đầu tư Thương mại SMC" OR SMC',
    'TLH': '"Thép Tiến Lên" OR "Tập đoàn Tiến Lên" OR TLH',
    'POM': '"Thép Pomina" OR POM',
    'TVN': '"Tổng Công ty Thép" OR TVN',
    'VGS': '"Ống thép Việt Đức" OR VGS',
    'KSB': '"Khoáng sản Bình Dương" OR KSB',
    'DHA': '"Hóa An" OR DHA',
    'VLB': '"Xây dựng Đồng Nai" OR VLB',
    'HT1': '"Xi măng Hà Tiên" OR "Vicem Hà Tiên" OR HT1',
    'BCC': '"Xi măng Bỉm Sơn" OR "Vicem Bỉm Sơn" OR BCC',
    'PLC': '"Hóa dầu Petrolimex" OR PLC',
    'BMP': '"Nhựa Bình Minh" OR BMP',
    'NTP': '"Nhựa Tiền Phong" OR NTP',
    'AAA': '"Nhựa An Phát Xanh" OR AAA',
    'APH': '"An Phát Holdings" OR APH',

    // === NHÓM XÂY DỰNG & ĐẦU TƯ CÔNG ===
    'CTD': '"Coteccons" OR CTD',
    'HBC': '"Xây dựng Hòa Bình" OR "Tập đoàn Hòa Bình" OR HBC',
    'VCG': '"Vinaconex" OR VCG',
    'HHV': '"Tập đoàn Đèo Cả" OR "Giao thông Đèo Cả" OR HHV',
    'C4G': '"Tập đoàn Cienco 4" OR C4G',
    'LCG': '"Lizen" OR LCG',
    'FCN': '"Tập đoàn FECON" OR FCN',
    'HUT': '"Tasco" OR HUT',
    'CII': '"Hạ tầng Kỹ thuật TP.HCM" OR CII',
    'DPG': '"Tập đoàn Đạt Phương" OR DPG',
    'PC1': '"Tập đoàn PC1" OR "Xây lắp Điện 1" OR PC1',
    'TV2': '"Tư vấn Xây dựng Điện 2" OR TV2',
    'REE': '"Cơ Điện Lạnh" OR REE',
    'HDG': '"Tập đoàn Hà Đô" OR HDG',

    // === NHÓM HÓA CHẤT & PHÂN BÓN & CAO SU ===
    'DGC': '"Hóa chất Đức Giang" OR "Tập đoàn Hóa chất Đức Giang" OR DGC',
    'CSV': '"Hóa chất Cơ bản Miền Nam" OR CSV',
    'LAS': '"Supe Phốt phát và Hóa chất Lâm Thao" OR LAS',
    'BFC': '"Phân bón Bình Điền" OR BFC',
    'DCM': '"Phân bón Cà Mau" OR "Đạm Cà Mau" OR DCM',
    'DPM': '"Phân bón Phú Mỹ" OR "Đạm Phú Mỹ" OR DPM',
    'DDV': '"DAP-Vinachem" OR DDV',
    'PHR': '"Cao su Phước Hòa" OR PHR',
    'GVR': '"Công nghiệp Cao su Việt Nam" OR "Tập đoàn Công nghiệp Cao su" OR GVR',
    'DPR': '"Cao su Đồng Phú" OR DPR',
    'TRC': '"Cao su Tây Ninh" OR TRC',
    'DRI': '"Đầu tư Cao su Đắk Lắk" OR DRI',
    'CSM': '"Cao su Miền Nam" OR "Casumina" OR CSM',
    'DRC': '"Cao su Đà Nẵng" OR DRC',

    // === NHÓM BÁN LẺ & TIÊU DÙNG & THỰC PHẨM ===
    'MWG': '"Thế giới di động" OR "Đầu tư Thế Giới Di Động" OR MWG',
    'PNJ': '"Vàng bạc Đá quý Phú Nhuận" OR PNJ',
    'FRT': '"FPT Retail" OR "Bán lẻ Kỹ thuật số FPT" OR FRT',
    'DGW': '"Digiworld" OR DGW',
    'PET': '"Petrovietnam Retail" OR "Dịch vụ Tổng hợp Dầu khí" OR PET',
    'MSN': '"Tập đoàn Masan" OR MSN',
    'VNM': '"Vinamilk" OR "Sữa Việt Nam" OR VNM',
    'SAB': '"Sabeco" OR "Bia Rượu Nước giải khát Sài Gòn" OR SAB',
    'BHN': '"Habeco" OR "Bia Rượu Nước giải khát Hà Nội" OR BHN',
    'KDC': '"Tập đoàn KIDO" OR KDC',
    'SBT': '"Thành Thành Công - Biên Hòa" OR "TTC AgriS" OR SBT',
    'QNS': '"Đường Quảng Ngãi" OR QNS',
    'LSS': '"Mía đường Lam Sơn" OR LSS',
    'SLS': '"Mía đường Sơn La" OR SLS',
    'BAF': '"Nông nghiệp BAF" OR BAF',
    'DBC': '"Tập đoàn Dabaco" OR DBC',
    'HAG': '"Hoàng Anh Gia Lai" OR "Tập đoàn Hoàng Anh Gia Lai" OR HAG',
    'HNG': '"Nông nghiệp Quốc tế Hoàng Anh Gia Lai" OR "HAGL Agrico" OR HNG',
    'VHC': '"Thủy sản Vĩnh Hoàn" OR VHC',
    'ANV': '"Thủy sản Nam Việt" OR ANV',
    'IDI': '"Đầu tư và Phát triển Đa Quốc Gia I.D.I" OR IDI',
    'FMC': '"Thực phẩm Sao Ta" OR FMC',
    'MPC': '"Thủy sản Minh Phú" OR "Tập đoàn Thủy sản Minh Phú" OR MPC',
    'ASM': '"Tập đoàn Sao Mai" OR ASM',
    'PAN': '"Tập đoàn PAN" OR "The PAN Group" OR PAN',
    'TAR': '"Nông nghiệp Công nghệ cao Trung An" OR TAR',
    'LTG': '"Tập đoàn Lộc Trời" OR LTG',

    // === NHÓM NĂNG LƯỢNG & DẦU KHÍ ===
    'GAS': '"PV GAS" OR "Khí Việt Nam" OR GAS',
    'PVD': '"PV Drilling" OR "Khoan và Dịch vụ Khoan Dầu khí" OR PVD',
    'PVS': '"Dịch vụ Kỹ thuật Dầu khí" OR PVS',
    'BSR': '"Lọc hóa dầu Bình Sơn" OR BSR',
    'PLX': '"Petrolimex" OR "Xăng dầu Việt Nam" OR PLX',
    'OIL': '"PV OIL" OR "Dầu Việt Nam" OR OIL',
    'PVT': '"Vận tải Dầu khí" OR PVT',
    'POW': '"PV Power" OR "Điện lực Dầu khí Việt Nam" OR POW',
    'NT2': '"Điện lực Dầu khí Nhơn Trạch 2" OR NT2',
    'PGV': '"Phát điện 3" OR "EVNGENCO 3" OR PGV',
    'GEG': '"Điện Gia Lai" OR GEG',
    'QTP': '"Nhiệt điện Quảng Ninh" OR QTP',
    'HND': '"Nhiệt điện Hải Phòng" OR HND',
    'VSH': '"Thủy điện Vĩnh Sơn - Sông Hinh" OR VSH',
    'SBA': '"Thủy điện Sông Ba" OR SBA',

    // === NHÓM LOGISTICS & HÀNG HẢI & HÀNG KHÔNG ===
    'GMD': '"Gemadept" OR GMD',
    'HAH': '"Vận tải và Xếp dỡ Hải An" OR HAH',
    'VOS': '"Vận tải biển Việt Nam" OR VOS',
    'VTO': '"Vận tải Xăng dầu Vitaco" OR VTO',
    'VIP': '"Vận tải Xăng dầu VIPCO" OR VIP',
    'MVN': '"Hàng hải Việt Nam" OR "Vinalines" OR MVN',
    'SGP': '"Cảng Sài Gòn" OR SGP',
    'PHP': '"Cảng Hải Phòng" OR PHP',
    'VJC': '"Vietjet" OR "Hàng không Vietjet" OR VJC',
    'HVN': '"Vietnam Airlines" OR "Hàng không Quốc gia Việt Nam" OR HVN',
    'ACV': '"Tổng công ty Cảng hàng không" OR ACV',
    'AST': '"Dịch vụ Hàng không Taseco" OR AST',
    'SCS': '"Dịch vụ Hàng hóa Sài Gòn" OR SCS',
    'SGN': '"Phục vụ Mặt đất Sài Gòn" OR SGN',
    'VSC': '"Viconship" OR "Tập đoàn Container Việt Nam" OR VSC',

    // === NHÓM CÔNG NGHỆ & VIỄN THÔNG ===
    'FPT': '"Tập đoàn FPT" OR FPT',
    'CMG': '"Tập đoàn Công nghệ CMC" OR CMG',
    'ELC': '"Công nghệ Viễn thông Elcom" OR ELC',
    'ITD': '"Công nghệ Tiên Phong" OR ITD',
    'VGI': '"Viettel Global" OR VGI',
    'CTR': '"Viettel Construction" OR "Công trình Viettel" OR CTR',
    'FOX': '"FPT Telecom" OR "Viễn thông FPT" OR FOX',
    'TTN': '"Công nghệ và Truyền thông Việt Nam" OR TTN',
    'YEG': '"Tập đoàn Yeah1" OR YEG',

    // === NHÓM BẢO HIỂM ===
    'BVH': '"Tập đoàn Bảo Việt" OR BVH',
    'BMI': '"Bảo hiểm Bảo Minh" OR BMI',
    'MIG': '"Bảo hiểm Quân đội" OR "MIC" OR MIG',
    'BIC': '"Bảo hiểm BIDV" OR BIC',
    'PVI': '"Bảo hiểm PVI" OR PVI',
    'VNR': '"Tái bảo hiểm Quốc gia" OR VNR',
    'PTI': '"Bảo hiểm Bưu điện" OR PTI',

    // === NHÓM DỆT MAY ===
    'VGT': '"Vinatex" OR "Dệt may Việt Nam" OR VGT',
    'TNG': '"Đầu tư và Thương mại TNG" OR TNG',
    'MSH': '"May Sông Hồng" OR MSH',
    'GIL': '"Sản xuất Kinh doanh Xuất nhập khẩu Bình Thạnh" OR GIL',
    'TCM': '"Dệt may Thành Công" OR TCM',
    'STK': '"Sợi Thế Kỷ" OR STK',
    'VGG': '"Tổng Công ty May Việt Tiến" OR VGG',
    'M10': '"Tổng Công ty May 10" OR M10',

    // === NHÓM NƯỚC & TIỆN ÍCH ===
    'BWE': '"Nước - Môi trường Bình Dương" OR BWE',
    'TDM': '"Nước Thủ Dầu Một" OR TDM',
    
    // === NHÓM TẬP ĐOÀN ĐA NGÀNH / KHÁC ===
    'GEX': '"Tập đoàn GELEX" OR GEX',
    'FIT': '"Tập đoàn F.I.T" OR FIT',
    'DVN': '"Tổng Công ty Dược Việt Nam" OR DVN'
};

const getSearchTerm = (ticker) => TICKER_ALIASES[ticker] || ticker;

/**
 * Returns an ISO date string N days ago, formatted as YYYY-MM-DD,
 * for use with Google News "after:" operator.
 */
function googleAfterDate(days) {
    const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10); // "2025-11-21"
}

const buildGoogleNewsQueries = (ticker, mode) => {
    const t = encodeURIComponent(getSearchTerm(ticker)); 
    const base = 'hl=vi&gl=VN&ceid=VN:vi';
    const days = MODE_DATE_WINDOW[mode] || 60;
    const after = encodeURIComponent(`after:${googleAfterDate(days)}`);

    switch (mode) {
        case 'official':
            return [
                `https://news.google.com/rss/search?q=${t}+${after}+site:cafef.vn+OR+site:vietstock.vn+OR+site:baodautu.vn+OR+site:vneconomy.vn&${base}`,
                `https://news.google.com/rss/search?q=${t}+${after}+site:tinnhanhchungkhoan.vn+OR+site:dantri.com.vn&${base}`,
                // Fallback: no site filter but still date-bound, so we still get official-ish results
                `https://news.google.com/rss/search?q=${t}+${after}+chứng+khoán+OR+cổ+phiếu&${base}`,
            ];
        case 'negative':
            return [
                `https://news.google.com/rss/search?q=${t}+${after}+bán+tháo+OR+ngoại+bán+ròng+OR+nợ+xấu+OR+điều+tra+OR+vi+phạm&${base}`,
                `https://news.google.com/rss/search?q=${t}+${after}+margin+call+OR+cắt+lỗ+OR+thua+lỗ+OR+bị+xử+phạt+OR+rủi+ro&${base}`,
                // Widen to last 60d if negative keywords return few hits
                `https://news.google.com/rss/search?q=${t}+${encodeURIComponent(`after:${googleAfterDate(60)}`)}+giảm+mạnh+OR+sụt+giảm+OR+cảnh+báo&${base}`,
            ];
        case 'rumor':
            return [
                `https://news.google.com/rss/search?q=${t}+${after}+tin+đồn+OR+nội+bộ+OR+dòng+tiền+lớn+OR+tay+to+OR+thâu+tóm&${base}`,
                `https://news.google.com/rss/search?q=${t}+${after}+cổ+phiếu+chứng+khoán&${base}`,
                `https://news.google.com/rss/search?q=${t}+${encodeURIComponent(`after:${googleAfterDate(45)}`)}+mua+gom+OR+thâu+tóm+OR+đột+biến+khối+lượng&${base}`,
            ];
        case 'balanced':
        default:
            return [
                `https://news.google.com/rss/search?q=${t}+${after}+cổ+phiếu+OR+chứng+khoán+OR+thị+trường&${base}`,
                `https://news.google.com/rss/search?q=${t}+${after}+tin+tức+OR+doanh+nghiệp+OR+đầu+tư&${base}`,
                `https://news.google.com/rss/search?q=${t}+${after}&${base}`,
            ];
    }
};

const DIRECT_RSS_SOURCES = [
    { name: 'VietStock CK',  url: 'https://vietstock.vn/rss/chung-khoan.rss',       domain: 'vietstock.vn'          },
    { name: 'CafeF CK',      url: 'https://cafef.vn/thi-truong-chung-khoan.rss',     domain: 'cafef.vn'              },
    { name: 'VnEconomy CK',  url: 'https://vneconomy.vn/chung-khoan.rss',            domain: 'vneconomy.vn'          },
    { name: 'BaoDauTu CK',   url: 'https://baodautu.vn/chung-khoan.rss',             domain: 'baodautu.vn'           },
    { name: 'TNCK',          url: 'https://tinnhanhchungkhoan.vn/rss/chung-khoan.rss', domain: 'tinnhanhchungkhoan.vn' },
];

const SEARCH_SOURCES = [
    {
        name: 'CafeF', domain: 'cafef.vn',
        buildUrl: (t) => `https://cafef.vn/tim-kiem.chn?keywords=${encodeURIComponent(t)}`,
        itemSelector: '.knc-name a, .tlitem h3 a, .list-content .news-item a',
    },
    {
        name: 'VietStock', domain: 'vietstock.vn',
        buildUrl: (t) => `https://vietstock.vn/search/?q=${encodeURIComponent(t)}`,
        itemSelector: '.news-list .item a[href*="/"], .search-result a[href*="/"]',
    },
];



const NEG_MAP = new Map([
    
    ['bán tháo', 3], ['bán ròng', 2], ['xả hàng', 2], ['rút vốn', 2], ['tháo chạy', 3],
    
    ['cắt lỗ', 2], ['margin call', 3], ['thua lỗ', 3], ['lỗ ròng', 3], ['nợ xấu', 3],
    ['nợ quá hạn', 2], ['âm vốn', 3], ['mất vốn', 3],
    
    ['vi phạm', 3], ['bị xử phạt', 3], ['điều tra', 3], ['khởi tố', 4], ['bắt tạm giam', 4],
    ['cưỡng chế', 3], ['sai phạm', 3],
    
    ['rủi ro cao', 2], ['lao dốc', 3], ['sụt giảm mạnh', 2], ['giảm sâu', 2],
    ['phá sản', 4], ['giải thể', 3], ['tạm dừng giao dịch', 3], ['bị hủy niêm yết', 4],
    ['cảnh báo', 2], ['kiểm soát đặc biệt', 3],
]);

const POS_MAP = new Map([
    
    ['mua ròng', 2], ['mua vào', 1], ['gom hàng', 2], ['tích lũy', 1],
    
    ['lợi nhuận tăng', 3], ['doanh thu tăng', 2], ['lãi kỷ lục', 3], ['lợi nhuận vượt', 2],
    ['vượt kế hoạch', 2], ['hoàn thành chỉ tiêu', 2],
    
    ['tăng trưởng', 2], ['vượt đỉnh', 2], ['đột phá', 2], ['khởi sắc', 2], ['bứt phá', 2],
    ['phục hồi', 1], ['kỳ vọng tăng', 2], ['nâng mục tiêu giá', 2],
    
    ['ký hợp đồng lớn', 2], ['mở rộng', 1], ['hợp tác chiến lược', 1], ['phát hành thành công', 2],
    ['chia cổ tức', 2], ['thưởng cổ phiếu', 1], ['mua lại cổ phiếu', 2],
]);

const NEGATION_WINDOW = 45; //[FIX] Increase negative word scan window to 45 characters
const NEGATION_WORDS  = ['không', 'chưa', 'chẳng', 'chả', 'không hề', 'chưa hề', 'không phải', 'ngoại trừ', 'loại trừ', 'ngừng'];

const REGEX_NEG = new RegExp(`(?:^|\\s)(${Array.from(NEG_MAP.keys()).join('|')})(?:\\s|$)`, 'gi');
const REGEX_POS = new RegExp(`(?:^|\\s)(${Array.from(POS_MAP.keys()).join('|')})(?:\\s|$)`, 'gi');

function isNegated(text, index) {
    const lookBack = text.slice(Math.max(0, index - NEGATION_WINDOW), index).toLowerCase();
    return NEGATION_WORDS.some(w => lookBack.includes(w));
}

function countScoreWithNegation(text, regex, map, weight) {
    let score = 0;
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
        const keyword = match[1].toLowerCase();  
        const points  = (map.get(keyword) || 1) * weight;
        const negated = isNegated(text, match.index);
        
       //[FIX] Remove reverse cumulative logic. If negated, the score is reduced to 0.
        if (!negated) {
            score += points;
        }
    }
    return score;
}
 //GET macro news from Reddit (using RSS feeds )
export async function fetchRedditMacro(ticker) {
     const macroKeywords = 'Vietnam economy OR SBV OR FDI Vietnam'; 
    const query = ticker === 'VFS' ? 'VinFast' : macroKeywords;
    const subreddits = ['VietNam', 'investing', 'Economics'];
    let macroReport = `--- TIN VĨ MÔ TỪ REDDIT (${query}) ---\n`;
    let foundPosts = 0;

    for (const sub of subreddits) {
        try {
            const url = `https://www.reddit.com/r/${sub}/search.rss?q=${encodeURIComponent(query)}&restrict_sr=on&sort=new&t=week&limit=3`;
            const response = await axios.get(url, { 
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/rss+xml, application/xml, text/xml',
                    'Referer': `https://www.reddit.com/r/${sub}/`
                },
                timeout: 6000 
            });
            
            const parsedData = xmlParser.parse(response.data);
            let entries = parsedData?.feed?.entry;
            
            if (entries) {
                if (!Array.isArray(entries)) entries = [entries]; 
                
                macroReport += `\n📍 r/${sub}:\n`;
                entries.slice(0, 3).forEach(p => {
                    const title = p.title || '';
                    const date = new Date(p.updated || p.published).toLocaleDateString('vi-VN');
                    macroReport += `  [${date}] ${title}\n`;
                    foundPosts++;
                });
            }
        } catch (error) {
            console.log(chalk.gray(`[REDDIT] Bỏ qua r/${sub} do kết nối RSS từ chối.`));
        }
    }
    return foundPosts > 0 ? macroReport : '[REDDIT] Không có tin vĩ mô đáng chú ý tuần này.';
}
//─────────────────────────────────────────────────────────────────────────────
//GET news from FireAnt social platform  [OPTIMIZED v2]
//
//Endpoints used:
//[A] restv2 symbol+type=0 → Community discussion/analysis (specific code)
//[B] restv2 symbol+type=1 → Official news approved (specific code)
//[C] betarest type=0 → General market /macro, latest
//[D] restv2 /feed → General market, the hottest
//
//Stratified cache:
//-tickerCache (discuss/news): 3 minutes TT /15 minutes overtime
//-marketCache (macro/feed): 5 minutes TT /30 minutes overtime
//-macro/feed uses the same fetch for all code, avoiding wasteful callbacks
//─────────────────────────────────────────────────────────────────────────────

const FIREANT_BASE = 'https://restv2.fireant.vn';
const FIREANT_BETA = 'https://betarest.fireant.vn';
const FA_TIMEOUT   = 6_000;
const FA_LIMIT     = 30;

const tickerCache = new Map();   
const marketCache = new Map();  

function _faCacheTTL(type) {
    const ictHour  = (new Date().getUTCHours() + 7) % 24;
    const isWeekday = (() => { const d = new Date().getUTCDay(); return d >= 1 && d <= 5; })();
    const isMarket  = isWeekday && ictHour >= MARKET_OPEN_HOUR && ictHour < MARKET_CLOSE_HOUR;
    return type === 'market'
        ? (isMarket ? 5 * 60_000 : 30 * 60_000)
        : (isMarket ? 3 * 60_000 : 15 * 60_000);
}

function _faCacheGet(store, key, type) {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > _faCacheTTL(type)) { store.delete(key); return null; }
    return entry.data;
}

function _faCacheSet(store, key, data) {
    store.set(key, { ts: Date.now(), data });
}

function _faBuildHeaders() {
    const h = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin':  'https://fireant.vn',
        'Referer': 'https://fireant.vn/',
        'Accept':  'application/json',
    };
    const token = process.env.FIREANT_TOKEN || '';
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
}

async function _faSafeFetch(url, label) {
    try {
        const res = await axios.get(url, { headers: _faBuildHeaders(), timeout: FA_TIMEOUT });
        return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
        const status = err.response?.status;
        if (status === 401) {
            console.log(chalk.yellow(`[FIREANT][${label}] API yêu cầu đăng nhập (Lỗi 401). Đã tạm ẩn luồng Social.`));
        } else if (err.code === 'ECONNABORTED') {
            console.log(chalk.gray(`[FIREANT][${label}] Timeout sau ${FA_TIMEOUT}ms.`));
        } else {
            console.log(chalk.redBright(`[FIREANT][${label}] Lỗi: ${err.message}`));
        }
        return [];
    }
}

async function _faCachedFetch(store, key, url, label, type) {
    const hit = _faCacheGet(store, key, type);
    if (hit) {
        console.log(chalk.cyan(`[FIREANT][${label}] Cache HIT — "${key}" TTL=${_faCacheTTL(type)/1000}s`));
        return hit;
    }
    const data = await _faSafeFetch(url, label);
    if (data.length > 0) _faCacheSet(store, key, data);  
    return data;
}
//Filter data before returning, calculate relevance score based on title, keywords, source and news age
function getRelevanceScore(item, ticker, mode) {
    let score = 0;
    const titleStr = (item.title || '').toLowerCase();
    const tickerStr = ticker.toLowerCase();
    const aliasStr = (TICKER_ALIASES[ticker] || '').replace(/"/g, '').replace(/ OR /g, '|').toLowerCase();

     if (titleStr.includes(` ${tickerStr} `) || titleStr.includes(`(${tickerStr})`) || titleStr.startsWith(`${tickerStr}:`)) score += 50;
    
     if (aliasStr && new RegExp(`(${aliasStr})`, 'i').test(titleStr)) score += 35;
    
     if (mode === 'negative' && /bán tháo|lao dốc|thua lỗ|vi phạm|điều tra|cắt lỗ|margin/i.test(titleStr)) score += 30;
    if (mode === 'rumor' && /tin đồn|nội bộ|thâu tóm|tay to|dòng tiền lớn/i.test(titleStr)) score += 30;
    if (mode === 'official' && ['cafef.vn', 'vietstock.vn', 'vneconomy.vn'].some(d => (item.rawLink || '').includes(d))) score += 20;

     const ageDays = (Date.now() - (item.publishedAt?.getTime?.() ?? Date.now())) / (1000 * 60 * 60 * 24);
    score -= ageDays;

    return score;
}
//─────────────────────────────────────────────────────────────────────────────
function _faNormalizePost(post, sourceLabel) {
    const rawContent = post.originalContent || post.content || '';
    const content = rawContent
        .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))) //[FIX] hex entities
        .replace(/\+/g, ' ') //[FIX] /+/g is regex broken (quantifier without operand) → escape to literal '+'
        .trim();
    const date    = post.date ? new Date(post.date) : new Date();
    const dateStr = date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const tagged  = (post.taggedSymbols || []).map(s => `${s.symbol}(${s.price > 0 ? s.price : '?'})`).join(', ');
    const engagement = (post.totalLikes || 0) + (post.totalReplies || 0) * 2 + (post.totalShares || 0) * 3;
    return {
        postID: post.postID,
        source: sourceLabel,
        date,
        dateStr,
        author:   post.user?.name || 'Ẩn danh',
        isExpert: post.isExpertIdea || false,
        content:  content.length > 200 ? content.slice(0, 200) + '…' : content,
        tagged,
        sentiment:  detectSentiment(post.title || '', content),
        engagement,
        likes:   post.totalLikes   || 0,
        replies: post.totalReplies || 0,
        shares:  post.totalShares  || 0,
    };
}

function _faFormatSection(title, posts, maxShow = 8) {
    if (posts.length === 0) return `${title}
  (Không có dữ liệu)
`;
    let out = `${title}
`;
    posts.slice(0, maxShow).forEach(p => {
        const icon      = p.sentiment === 'positive' ? '🟢' : p.sentiment === 'negative' ? '🔴' : '⚪';
        const expert    = p.isExpert ? ' ⭐[Expert]' : '';
        const tagLine   = p.tagged ? ` | 🏷 ${p.tagged}` : '';
        const engLine   = p.engagement > 0 ? ` | 👍${p.likes} 💬${p.replies}` : '';
        out += `  [${p.dateStr}] ${icon}${expert} ${p.content}${tagLine}${engLine}
`;
    });
    return out;
}

export async function fetchFireAntSocial(ticker, { returnRaw = false, maxPerSection = 8 } = {}) {
    const sym = ticker.toUpperCase();

    //Call 4 endpoints in parallel — [A][B] cache by code, [C][D] cache by market
    const [discussRaw, newsRaw, macroRaw, feedRaw] = await Promise.all([
        _faCachedFetch(tickerCache, `${sym}_discuss`,
            `${FIREANT_BASE}/posts?symbol=${sym}&type=0&offset=0&limit=${FA_LIMIT}`, 'DISCUSS', 'ticker'),
        _faCachedFetch(tickerCache, `${sym}_news`,
            `${FIREANT_BASE}/posts?symbol=${sym}&type=1&offset=0&limit=${FA_LIMIT}`, 'NEWS', 'ticker'),
        _faCachedFetch(marketCache, 'macro',
            `${FIREANT_BETA}/posts?type=0&offset=0&limit=${FA_LIMIT}`, 'MACRO', 'market'),
        _faCachedFetch(marketCache, 'feed',
            `${FIREANT_BASE}/posts/feed?offset=0&limit=${FA_LIMIT}`, 'FEED', 'market'),
    ]);

    //Return fallback string if none — backward compatible with legacy caller
    if (discussRaw.length === 0 && newsRaw.length === 0) {
        return `[FIREANT] Hiện tại không có ai bàn luận về ${ticker}.`;
    }

    const discuss  = discussRaw.map(p => _faNormalizePost(p, 'FireAnt-Discuss'));
    const news     = newsRaw.map(p   => _faNormalizePost(p, 'FireAnt-News'));
    const macroAll = macroRaw.map(p  => _faNormalizePost(p, 'FireAnt-Macro'));
    const feedAll  = feedRaw.map(p   => _faNormalizePost(p, 'FireAnt-Feed'));

    //Categorize macros/feeds: which articles mention code → cross-ref, the rest → general market
    const relatedMacro  = macroAll.filter(p => p.tagged.includes(sym) || p.content.toUpperCase().includes(sym));
    const generalMacro  = macroAll.filter(p => !relatedMacro.includes(p));
    const relatedFeed   = feedAll.filter(p  => p.tagged.includes(sym) || p.content.toUpperCase().includes(sym));
    const generalFeed   = feedAll.filter(p  => !relatedFeed.includes(p));

    //Velocity: count 1h + 24h — keep the old velocity idea, add 1h
    const now    = Date.now();
    const inHour = [...discussRaw, ...newsRaw].filter(p => new Date(p.date).getTime() > now - 3_600_000).length;
    const inDay  = [...discussRaw, ...newsRaw].filter(p => new Date(p.date).getTime() > now - 86_400_000).length;
    let velocityTag = 'BÌNH THƯỜNG';
    if (inHour >= 10 || inDay > 20) velocityTag = 'CỰC KỲ SÔI ĐỘNG 🔥 (FOMO / HOẢNG LOẠN)';
    else if (inHour >= 4 || inDay > 10) velocityTag = 'ĐANG ĐƯỢC CHÚ Ý 📈';
    else if (inDay === 0) velocityTag = 'IM LẶNG — Không có bàn luận 24h qua';

    //Aggregate sentiment
    const allRelated = [...discuss, ...news, ...relatedMacro, ...relatedFeed];
    const sentCount  = { positive: 0, negative: 0, neutral: 0 };
    allRelated.forEach(p => sentCount[p.sentiment]++);

     if (returnRaw) {
        return {
            ticker: sym,
            velocity: { inHour, inDay, tag: velocityTag },
            sentiment: sentCount,
            discuss,
            news,
            relatedMacro,
            relatedFeed,
            generalMacro: generalMacro.slice(0, 10),
            generalFeed:  generalFeed.slice(0, 10),
            topDiscuss:   [...discuss].sort((a, b) => b.engagement - a.engagement).slice(0, 5),
            fetchedAt:    new Date().toISOString(),
        };
    }

     const sentBar = `🟢${sentCount.positive} 🔴${sentCount.negative} ⚪${sentCount.neutral}`;
    let socialReport = `--- BÌNH LUẬN ĐÁM ĐÔNG TỪ FIREANT (TẦN SUẤT: ${velocityTag}) ---
`;
    socialReport += `  24h: ${inDay} bài | 1h: ${inHour} bài | Sentiment: ${sentBar}

`;

    socialReport += _faFormatSection(`📣 THẢO LUẬN CỘNG ĐỒNG (${discuss.length} bài)`,
        [...discuss].sort((a, b) => b.engagement - a.engagement), maxPerSection
    );

    socialReport += '' + _faFormatSection(`📰 TIN TỨC CHÍNH THỨC (${news.length} bài)`,
        [...news].sort((a, b) => b.date - a.date), maxPerSection
    );

    const crossRef = [...relatedMacro, ...relatedFeed].sort((a, b) => b.date - a.date);
    if (crossRef.length > 0) {
        socialReport += '' + _faFormatSection(`🔗 TIN THỊ TRƯỜNG CHUNG CÓ NHẮC ĐẾN ${sym} (${crossRef.length} bài)`,
            crossRef, maxPerSection
        );
    }

    const hotGeneral = generalFeed.slice(0, 5);
    if (hotGeneral.length > 0) {
        socialReport += '' + _faFormatSection(`🌏 THỊ TRƯỜNG CHUNG ĐANG HOT (feed)`, hotGeneral, 5);
    }

    const latestMacro = [...generalMacro].sort((a, b) => b.date - a.date).slice(0, 5);
    if (latestMacro.length > 0) {
        socialReport += '' + _faFormatSection(`📡 VĨ MÔ MỚI NHẤT (betarest)`, latestMacro, 5);
    }

    return socialReport;
}

export async function fetchFireAntMarket({ maxShow = 8 } = {}) {
    const [macroRaw, feedRaw] = await Promise.all([
        _faCachedFetch(marketCache, 'macro', `${FIREANT_BETA}/posts?type=0&offset=0&limit=30`, 'MACRO', 'market'),
        _faCachedFetch(marketCache, 'feed',  `${FIREANT_BASE}/posts/feed?offset=0&limit=30`,  'FEED',  'market'),
    ]);
    const macro = macroRaw.map(p => _faNormalizePost(p, 'Macro'));
    const feed  = feedRaw.map(p  => _faNormalizePost(p, 'Feed'));
    let report  = '--- FIREANT MARKET OVERVIEW ---';
    report += _faFormatSection('🌏 THỊ TRƯỜNG CHUNG — MỚI NHẤT (betarest)', macro, maxShow);
    report += '' + _faFormatSection('🔥 ĐANG HOT NHẤT (feed)', feed, maxShow);
    return report;
}

 export const detectSentiment = (title = '', content = '') => {
    const tLow = title.toLowerCase();
    const cLow = content.toLowerCase();

    let neg = countScoreWithNegation(tLow, REGEX_NEG, NEG_MAP, 2)
            + countScoreWithNegation(cLow, REGEX_NEG, NEG_MAP, 1);

    let pos = countScoreWithNegation(tLow, REGEX_POS, POS_MAP, 2)
            + countScoreWithNegation(cLow, REGEX_POS, POS_MAP, 1);

    const pctMatches = tLow.match(/-\d+([.,]\d+)?%/g) || [];
    pctMatches.forEach(pm => {
        const pmIdx   = tLow.indexOf(pm);
        const context = tLow.slice(Math.max(0, pmIdx - 15), pmIdx + 10);
        const hasPosContext = NEGATION_WORDS.some(w => context.includes(w))
            || /phục hồi|vượt|từ mức|từ đáy|giảm nhẹ/.test(context);
        if (!hasPosContext) neg += 2;
    });

    if (neg >= 3 && neg > pos + 1) return 'negative';
    if (pos >= 3 && pos > neg + 1) return 'positive';
    if (neg >= 2 && neg > pos)     return 'negative';
    if (pos >= 2 && pos > neg)     return 'positive';
    return 'neutral';
};
const parsePubDate = (s) => {
    const d = new Date(s);
    return (!s || isNaN(d.getTime()))
        ? { publishedAt: new Date(), date: new Date().toLocaleDateString('vi-VN') }
        : { publishedAt: d, date: d.toLocaleDateString('vi-VN') };
};

const extractDomain      = (url) => { try { return new URL(url).hostname.replace('www.', ''); } catch { return 'Internet'; } };
const isValidArticleLink = (url) => url && typeof url === 'string' && url.startsWith('http')
    && !url.includes('google.com') && !url.includes('googleusercontent.com');


const fetchGoogleNewsRSS = async (url, maxItems = 25) => {
    try {
        const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
        const itemsList = [].concat(xmlParser.parse(data)?.rss?.channel?.item || []);
        return itemsList.slice(0, maxItems).map(el => {
            const title   = (el?.title || '').toString().replace(/ - [^-]+$/, '').trim();
            const rawLink = el?.link || el?.guid?.['#text'] || el?.guid || '';
            if (title.length < 10 || !rawLink) return null;
            return {
                ...parsePubDate(el.pubDate),
                title,
                rawLink,
                sourceName:  typeof el.source === 'string' ? el.source : (el.source?.['#text'] || 'Google News'),
                description: el.description || '',
            };
        }).filter(Boolean);
    } catch { return []; }
};


const preflightCheck = async (url) => {
    try {
        const res = await axios.get(url, { maxRedirects: 0, validateStatus: s => s >= 200 && s < 400, timeout: 4000 });
        return res.headers.location || url;
    } catch (err) { return err.response?.headers?.location || url; }
};

const resolveOneGoogleLink = async (browser, googleUrl) => {
    if (!googleUrl) return null;
    if (isValidArticleLink(googleUrl)) return googleUrl;
    if (!googleUrl.includes('google.com')) return null;

    
    const decoded = decodeGoogleNewsUrl(googleUrl);
    if (decoded && isValidArticleLink(decoded)) return decoded;

    
    const preflightUrl = await preflightCheck(googleUrl);
    if (isValidArticleLink(preflightUrl) && !preflightUrl.includes('google.com')) return preflightUrl;

    
    let page;
    try {
        page = await browser.newPage();
        await page.setRequestInterception(true);

        const finalUrl = await new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), 15000);
            page.on('request', (req) => {
                const u = req.url();
                if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) { req.abort(); return; }
                if (u.includes('consent.google.com')) {
                    clearTimeout(timer); req.abort('aborted'); resolve(null); return;
                }
                if (req.isNavigationRequest() && req.frame() === page.mainFrame()
                    && !u.includes('news.google.com') && !u.includes('about:blank')) {
                    clearTimeout(timer); req.abort('aborted'); resolve(u); return;
                }
                req.continue();
            });
            page.goto(googleUrl).catch(() => {});
        });

        return (finalUrl && isValidArticleLink(finalUrl)) ? finalUrl : null;
    } catch { return null; }
    finally { if (page) await page.close().catch(() => {}); }
};

 
const PUPPETEER_GLOBAL_TIMEOUT = 60_000; 
// Search mode
const resolveGoogleLinksParallel = async (items, concurrency = 5, bypassPuppeteer = false) => {
    if (bypassPuppeteer) {
        return items.map(item => {
            const decoded = decodeGoogleNewsUrl(item.rawLink);
            if (decoded && isValidArticleLink(decoded)) {
                return {
                    title:       item.title,
                    link:        decoded,
                    source:      item.sourceName,
                    domain:      extractDomain(decoded),
                    sentiment:   detectSentiment(item.title, item.description),
                    publishedAt: item.publishedAt,
                    date:        item.date,
                    fromGoogle:  true,
                };
            }
            return null;
        }).filter(Boolean);
    }
//============================================================================
    const browser = await getBrowser();
    if (!browser) return [];

    const results = [];
    let isTimedOut = false;

     const timer = setTimeout(() => {
        console.warn(`[vnNewsSearch] Puppeteer global timeout sau ${PUPPETEER_GLOBAL_TIMEOUT}ms — trả kết quả một phần (${results.length} links).`);
        isTimedOut = true;
    }, PUPPETEER_GLOBAL_TIMEOUT);

    for (let i = 0; i < items.length; i += concurrency) {
        if (isTimedOut) break; 
        
        const batch = items.slice(i, i + concurrency);
        const resolved = await Promise.all(batch.map(async (item) => {
            const realLink = await resolveOneGoogleLink(browser, item.rawLink);
            if (!realLink) return null;
            return {
                title:       item.title,
                link:        realLink,
                source:      item.sourceName,
                domain:      extractDomain(realLink),
                sentiment:   detectSentiment(item.title, item.description),
                publishedAt: item.publishedAt,
                date:        item.date,
                fromGoogle:  true,
            };
        }));
        results.push(...resolved.filter(Boolean));
    }

    clearTimeout(timer); 
    return results;
};


const fetchDirectRSS = async (source, ticker, maxItems = 50) => {
    try {
        const { data } = await axios.get(source.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
        const itemsRaw = [].concat(xmlParser.parse(data)?.rss?.channel?.item || []);
        const tickerUp = ticker.toUpperCase();
        
        const aliasStr = TICKER_ALIASES[tickerUp]?.replace(/"/g, '').replace(/ OR /g, '|').toLowerCase() || '';
        
        return itemsRaw.slice(0, maxItems).map(el => {
            const title = (el?.title || '').toString();
            const rawLink = el?.link || el?.guid?.['#text'] || el?.guid || '';
            const titleLow = title.toLowerCase();
            
            if (!isValidArticleLink(rawLink) || title.length < 15) return null;
            const titleUp = title.toUpperCase();
            const hasTicker = titleUp.includes(` ${tickerUp} `) || titleUp.includes(`(${tickerUp})`) || titleUp.startsWith(`${tickerUp}:`);
            const hasAlias = aliasStr ? new RegExp(`(${aliasStr})`, 'i').test(titleLow) : false;
            
            if (!hasTicker && !hasAlias) return null;

            return {
                ...parsePubDate(el.pubDate),
                title,
                link: rawLink,
                source: source.name,
                domain: source.domain || extractDomain(rawLink),
                sentiment: detectSentiment(title, el.description || ''),
                fromGoogle: false,
            };
        }).filter(Boolean);
    } catch { return []; }
};


const searchOnSite = async (source, ticker, maxItems = 10) => {
    try {
        const { data } = await axios.get(source.buildUrl(ticker), {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': `https://${source.domain}/` },
            timeout: 12000,
        });
        const $         = cheerio.load(data);
        const results   = [];
        const tickerUp  = ticker.toUpperCase();

        $(source.itemSelector).each((i, el) => {
            if (i >= maxItems) return false;
            const $el  = $(el);
            const href = $el.attr('href');
            const title = ($el.text().trim() || $el.attr('title') || '').replace(/\s+/g, ' ').trim();
            const titleLow = title.toLowerCase();
            const titleUp = title.toUpperCase();
            const aliasStr = TICKER_ALIASES[tickerUp]?.replace(/"/g, '').replace(/ OR /g, '|').toLowerCase() || '';
            const hasTicker = titleUp.includes(` ${tickerUp} `) || titleUp.includes(`(${tickerUp})`) || titleUp.startsWith(`${tickerUp}:`);
            const hasAlias = aliasStr ? new RegExp(`(${aliasStr})`, 'i').test(titleLow) : false;
            if (!title || title.length < 15 || !href) return;
            if (!hasTicker && !hasAlias) return; 
            const link = href.startsWith('/') ? `https://${source.domain}${href}` : href;

            results.push({
                title, link, source: source.name, domain: source.domain,
                sentiment:   detectSentiment(title),
                publishedAt: new Date(),
                date:        new Date().toLocaleDateString('vi-VN'),
                fromGoogle:  false,
                fromSearch:  true,
            });
        });
        return results;
    } catch { return []; }
};

export const rescoreSentiment = (item) => ({
    ...item,
    sentiment: detectSentiment(item.title, item.content || ''),
});

const dedupByLink = (articles) => {
    const seen = new Set();
    return articles.filter(a => {
        const key = a.link.split('?')[0].replace(/\/$/, '').toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};
 
const OFFICIAL_DOMAINS = ['cafef.vn', 'vietstock.vn', 'baodautu.vn', 'tinnhanhchungkhoan.vn', 'vneconomy.vn'];

const MIN_COUNT_BY_MODE = {
    official: 12,  
    balanced: 15, 
    negative: 6,
    rumor:    5,
};
export { MIN_COUNT_BY_MODE };
 
function hotScore(article, mode) {
    const ageMs     = Date.now() - (article.publishedAt?.getTime?.() ?? Date.now());
    const ageHours  = ageMs / 3_600_000;
    // Recency: 100 → 0 over 7 days (168 h), floored at 0
    const recency   = Math.max(0, 100 - (ageHours / 168) * 100);
    const domain    = OFFICIAL_DOMAINS.includes(article.domain) ? 8 : 0;
    const sentBonus = (mode === 'negative' && article.sentiment === 'negative') ? 5
                    : (mode === 'rumor'    && /tin đồn|nội bộ|thâu tóm|tay to|dòng tiền lớn/i.test(article.title)) ? 5
                    : 0;
    return recency + domain + sentBonus;
}

const filterByMode = (articles, mode) => {
    const minCount = MIN_COUNT_BY_MODE[mode] ?? 8;

    // Helper: fill from secondary pool until we hit minCount (or exhaust pool)
    const fillToMin = (primary, secondary) => {
        if (primary.length >= minCount) return primary;
        const primarySet = new Set(primary.map(a => a.link));
        const extras = secondary
            .filter(a => !primarySet.has(a.link))
            .sort((a, b) => hotScore(b, mode) - hotScore(a, mode));
        const combined = [...primary, ...extras];
        console.log(
            `[filterByMode][${mode}] primary=${primary.length} → filled to ${Math.min(combined.length, minCount)} ` +
            `(extras=${extras.length}, min=${minCount})`
        );
        return combined.slice(0, Math.max(combined.length, minCount));
    };

    switch (mode) {
        case 'negative': {
            const primary = articles.filter(a =>
                a.sentiment === 'negative' ||
                /bán tháo|lao dốc|thua lỗ|vi phạm|điều tra|cắt lỗ|margin call/i.test(a.title)
            );
            const secondary = articles.filter(a => !primary.includes(a));
            return fillToMin(primary, secondary);
        }
        case 'official': {
            const primary   = articles.filter(a => OFFICIAL_DOMAINS.includes(a.domain));
            const secondary = articles.filter(a => !primary.includes(a));
            return fillToMin(primary, secondary);
        }
        case 'rumor': {
            const primary = articles.filter(a =>
                /tin đồn|nội bộ|thâu tóm|tay to|dòng tiền lớn|đột biến khối lượng|mua gom/i.test(a.title) ||
                ['dantri.com.vn', 'vnexpress.net', 'cafebiz.vn'].includes(a.domain)
            );
            const secondary = articles.filter(a => !primary.includes(a));
            return fillToMin(primary, secondary);
        }
        default: // balanced
            return articles;
    }
};


 const distributeSentiment = (articles, mode) => {
    if (mode === 'negative' || mode === 'official') return articles;
    const neg = articles.filter(a => a.sentiment === 'negative');
    const pos = articles.filter(a => a.sentiment === 'positive');
    const neu = articles.filter(a => a.sentiment === 'neutral');
    const result = [];
    const maxLen = Math.max(neg.length, pos.length, neu.length);
    for (let i = 0; i < maxLen; i++) {
        if (i < neg.length) result.push(neg[i]);
        if (i < neu.length) result.push(neu[i]);
        if (i < pos.length) result.push(pos[i]);
    }
    return result;
};

// MAIN ENTRY POINT
export async function searchVnNewsDirectly(
    ticker,
    mode = 'balanced',
    limit = 30,
    offset = 0,
    newsMode = 'balanced'  
) {
    const clean    = ticker.toUpperCase();
    let googleLimit = 45;
    let rssLimit = 80;
    let searchLimit = 20;
    let pptrConcurrency = 5;
    let bypassPuppeteer = false;

    switch (newsMode) {
        case 'fast':
            googleLimit = 20; rssLimit = 30; searchLimit = 5;
            bypassPuppeteer = true; 
            break;
        case 'deep':
            googleLimit = 50; rssLimit = 80; searchLimit = 20;
            break;  
        case 'ultra':
            googleLimit = 80; rssLimit = 120; searchLimit = 35;
            pptrConcurrency = 10;  
            break;
        case 'balanced':
        default:
            break;  
    }

    const ttl      = getActiveCacheTTL();          
    const cacheKey = `${clean}_${mode}_${newsMode}`;  
    const cached = cacheMap.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < ttl)) {
        console.log(`[vnNewsSearch] Cache hit — ${clean} offset=${offset}`);
        return cached.data.slice(offset, offset + limit);
    }
// Kiểm tra tính tương tích của tin tức ================================================
    const [googleRawItems, rssResults, searchResults] = await Promise.all([
        Promise.all(buildGoogleNewsQueries(clean, mode).map(q => fetchGoogleNewsRSS(q, googleLimit)))  
            .then(r => r.flat()),
        Promise.allSettled(DIRECT_RSS_SOURCES.map(s => fetchDirectRSS(s, clean, rssLimit)))  
            .then(r => r.filter(x => x.status === 'fulfilled').flatMap(x => x.value)),
        Promise.allSettled(SEARCH_SOURCES.map(s => searchOnSite(s, clean, searchLimit)))  
            .then(r => r.filter(x => x.status === 'fulfilled').flatMap(x => x.value)),
    ]);

//2. SCORING RELEVANCE FOR EACH NEWS FROM GOOGLE BEFORE ENTERING PUPPETEER
    const scoredGoogleItems = googleRawItems.map(item => ({
        ...item,
        relevanceScore: getRelevanceScore(item, clean, mode)
    }))
    .filter(item => item.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

    const topGoogleItems = scoredGoogleItems.slice(0, googleLimit);
    const googleResolved = await resolveGoogleLinksParallel(topGoogleItems, pptrConcurrency, bypassPuppeteer);

    const googleResolvedWithScore = googleResolved.map(item => {
        const originalItem = topGoogleItems.find(g => g.title === item.title);
        return { ...item, relevanceScore: originalItem?.relevanceScore || 10 };
    });

    const scoredDirectItems = [...rssResults, ...searchResults].map(item => ({
        ...item,
        relevanceScore: getRelevanceScore(item, clean, mode)
    }));

    // 3. HARD DATE CUT-OFF 
    const FALLBACK_EXTRA_DAYS = 30;
    const maxAgeDays = (MODE_DATE_WINDOW[mode] || 60) + FALLBACK_EXTRA_DAYS;
    const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

    const merged = dedupByLink([...googleResolvedWithScore, ...scoredDirectItems])
        .filter(item => item.publishedAt && item.publishedAt >= cutoffTime)
        .sort((a, b) => {
            if (Math.abs(b.relevanceScore - a.relevanceScore) > 10) {
                return b.relevanceScore - a.relevanceScore;
            }
            return b.publishedAt - a.publishedAt;
        });

    const filtered = filterByMode(merged, mode);
    const allResults = distributeSentiment(filtered, mode);      
    cacheMap.set(cacheKey, { timestamp: Date.now(), data: allResults });
//=============================================================================
    const sentimentSummary = {
        positive: allResults.filter(a => a.sentiment === 'positive').length,
        negative: allResults.filter(a => a.sentiment === 'negative').length,
        neutral:  allResults.filter(a => a.sentiment === 'neutral').length,
        };
        console.log(
        `[vnNewsSearch] ${clean} | mode=${mode} | ${allResults.length} tin`
        + ` | +${sentimentSummary.positive}`
        + ` -${sentimentSummary.negative}`
        + ` ~${sentimentSummary.neutral}`
        + ` | TTL=${ttl / 1000}s`
    );

    return allResults.slice(offset, offset + limit);
}