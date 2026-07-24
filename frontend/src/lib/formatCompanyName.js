/**
 * Format tên công ty: viết hoa chữ cái đầu mỗi từ (Title Case).
 * Giữ nguyên acronym ngắn kiểu FPT, QP, HOSE, VN30, ATC…
 * Ví dụ: "NGÂN HÀNG TMCP QUÂN ĐỘI" → "Ngân Hàng Tmcp Quân Đội"
 *         "CÔNG TY CỔ PHẦN FPT" → "Công Ty Cổ Phần FPT"
 */
const KEEP_UPPER = new Set([
  'FPT', 'QP', 'HOSE', 'HNX', 'UPCOM', 'VN30', 'VNINDEX', 'HNX30',
  'ATO', 'ATC', 'MP', 'LO', 'CEO', 'CFO', 'IPO', 'ETF', 'USD', 'VND',
  'MBB', 'VCB', 'TCB', 'ACB', 'BID', 'CTG', 'VPB', 'TPB', 'MSB', 'STB',
  'SSI', 'HCM', 'VIC', 'VHM', 'VRE', 'MWG', 'PNJ', 'MSN', 'GAS', 'TMCP',
]);

/** Từ ngắn thường viết thường trong tên công ty VN (sau Title Case). */
const FORCE_LOWER = new Set(['ty', 'và', 'của', 'cho', 'với', 'tại', 'trên', 'các']);

const isLatinAcronym = (word) => {
  if (!word) return false;
  if (!/^[A-Za-z0-9]+$/.test(word)) return false;
  const up = word.toUpperCase();
  if (KEEP_UPPER.has(up)) return true;
  // Ticker-like ≥3 ký tự Latin viết hoa, không nguyên âm (FPT, HCM, SSI…)
  if (
    word.length >= 3 &&
    word.length <= 5 &&
    word === up &&
    !/[AEIOU]/.test(up)
  ) {
    return true;
  }
  return false;
};

const capitalizeWord = (word) => {
  if (!word) return word;
  if (word.includes('-')) {
    return word.split('-').map(capitalizeWord).join('-');
  }
  if (isLatinAcronym(word)) {
    return word.toUpperCase();
  }
  const lower = word.toLocaleLowerCase('vi-VN');
  if (FORCE_LOWER.has(lower)) return lower;
  return lower.charAt(0).toLocaleUpperCase('vi-VN') + lower.slice(1);
};

export const formatCompanyName = (name) => {
  if (name == null) return '';
  const raw = String(name).trim();
  if (!raw) return '';
  // Placeholder / đang tải
  if (/^đang /i.test(raw) || raw === '...' || raw === 'N/A') return raw;

  return raw
    .split(/\s+/)
    .map(capitalizeWord)
    .join(' ');
};

export default formatCompanyName;
