/**
 * Localize VN market data labels for English UI.
 * Vietnamese mode keeps original strings (including EN finance terms elsewhere).
 */

const SECTOR_EN = {
  'NGÂN HÀNG': 'BANKING',
  'BẤT ĐỘNG SẢN': 'REAL ESTATE',
  'CHỨNG KHOÁN': 'SECURITIES',
  'THÉP': 'STEEL',
  'CÔNG NGHỆ': 'TECHNOLOGY',
  'DẦU KHÍ': 'OIL & GAS',
  'BÁN LẺ': 'RETAIL',
  'HÓA CHẤT': 'CHEMICALS',
  'VẬN TẢI': 'TRANSPORT',
  'THỰC PHẨM': 'FOOD',
  'ĐIỆN': 'UTILITIES',
  'KHÁC': 'OTHER',
};

const STATUS_EN = {
  'BÙNG NỔ ĐÀ TĂNG': 'BULLISH BREAKOUT',
  'XANH VỎ ĐỎ LÒNG (RỦI RO)': 'INDEX UP, BREADTH WEAK (RISK)',
  'TĂNG TRƯỞNG PHÂN HÓA': 'SELECTIVE RALLY',
  'ÁP LỰC BÁN THÁO': 'BROAD SELLING PRESSURE',
  'ĐỎ VỎ XANH LÒNG': 'INDEX DOWN, UNDERLYING FIRM',
  'ĐIỀU CHỈNH LÀNH MẠNH': 'HEALTHY PULLBACK',
  'TÍCH LŨY TÍCH CỰC': 'CONSTRUCTIVE CONSOLIDATION',
  'PHÂN PHỐI ẨN': 'HIDDEN DISTRIBUTION',
  'ĐI NGANG TÍCH LŨY': 'SIDEWAYS ACCUMULATION',
};

/** Diagnostic templates keyed by Vietnamese marketStatus. */
const DIAGNOSTIC_EN = {
  'BÙNG NỔ ĐÀ TĂNG': 'Price rising with broad money-flow participation. Uptrend confirmation.',
  'XANH VỎ ĐỎ LÒNG (RỦI RO)': 'Index distorted by large caps. Money leaving mid/penny names. Watch for bull traps.',
  'TĂNG TRƯỞNG PHÂN HÓA': 'Money flow concentrated in a few leading names.',
  'ÁP LỰC BÁN THÁO': 'Panic selling across the board. Support-break risk.',
  'ĐỎ VỎ XANH LÒNG': 'Large caps weigh on the index, but capital still seeks niche opportunities.',
  'ĐIỀU CHỈNH LÀNH MẠNH': 'Normal shakeout. Wait for exhaustion signals.',
  'TÍCH LŨY TÍCH CỰC': 'Most names slightly green; money quietly building a base.',
  'PHÂN PHỐI ẨN': 'Index flat but quiet profit-taking pressure is underway.',
  'ĐI NGANG TÍCH LŨY': 'Money flow mixed; no clear trend.',
};

const FOREIGN_BIAS_EN = {
  ' Khối ngoại mua ròng mạnh hỗ trợ.': ' Strong foreign net buying is supportive.',
  ' Khối ngoại bán ròng gây áp lực.': ' Strong foreign net selling is pressuring the market.',
};

/** Chart / API interval values stay Vietnamese; this is display-only. */
export const INTERVAL_DISPLAY_EN = {
  '1 phút': '1 min',
  '3 phút': '3 min',
  '5 phút': '5 min',
  '15 phút': '15 min',
  '30 phút': '30 min',
  '1 giờ': '1 hour',
  '2 giờ': '2 hours',
  '4 giờ': '4 hours',
  '1 ngày': '1 day',
  '1 tuần': '1 week',
  '1 tháng': '1 month',
  '1 năm': '1 year',
};

export function localizeSector(name, lang = 'vi') {
  if (!name || lang !== 'en') return name || '';
  const key = String(name).trim().toUpperCase();
  return SECTOR_EN[key] || SECTOR_EN[name] || name;
}

export function localizeMarketStatus(status, lang = 'vi') {
  if (!status || lang !== 'en') return status || '';
  return STATUS_EN[status] || status;
}

export function localizeDiagnostic(desc, marketStatus, lang = 'vi') {
  if (!desc || lang !== 'en') return desc || '';
  let out = DIAGNOSTIC_EN[marketStatus] || desc;
  for (const [vi, en] of Object.entries(FOREIGN_BIAS_EN)) {
    if (desc.includes(vi.trim()) || desc.includes(vi)) {
      // Prefer EN template + EN bias when we know the status
      if (DIAGNOSTIC_EN[marketStatus]) {
        out = DIAGNOSTIC_EN[marketStatus] + en;
      } else {
        out = String(out).replace(vi, en);
      }
    }
  }
  // If still mostly Vietnamese (no template hit), strip known bias and append EN bias if present
  if (!DIAGNOSTIC_EN[marketStatus]) {
    let replaced = String(desc);
    for (const [vi, en] of Object.entries(FOREIGN_BIAS_EN)) {
      replaced = replaced.replace(vi, en);
    }
    out = replaced;
  }
  return out;
}

export function localizeIntervalLabel(interval, lang = 'vi') {
  if (!interval || lang !== 'en') return interval || '';
  return INTERVAL_DISPLAY_EN[interval] || interval;
}

export { SECTOR_EN, STATUS_EN };
