/**
 * Format tên công ty cho UI.
 * - vi: Title Case tiếng Việt, giữ acronym (FPT, HOSE…).
 * - en: dùng companyNameEn chính thức từ nguồn listing (Vietcap) nếu có;
 *   không "dịch chắp vá" tiền tố pháp lý — thiếu EN thì giữ tên VI.
 */

const KEEP_UPPER = new Set([
  'FPT', 'QP', 'HOSE', 'HNX', 'UPCOM', 'VN30', 'VNINDEX', 'HNX30',
  'ATO', 'ATC', 'MP', 'LO', 'CEO', 'CFO', 'IPO', 'ETF', 'USD', 'VND',
  'MBB', 'VCB', 'TCB', 'ACB', 'BID', 'CTG', 'VPB', 'TPB', 'MSB', 'STB',
  'SSI', 'HCM', 'VIC', 'VHM', 'VRE', 'MWG', 'PNJ', 'MSN', 'GAS', 'TMCP',
  'JSC', 'JSC.', 'CORP', 'PLC',
]);

const FORCE_LOWER = new Set(['ty', 'và', 'của', 'cho', 'với', 'tại', 'trên', 'các']);

const isLatinAcronym = (word) => {
  if (!word) return false;
  if (!/^[A-Za-z0-9.]+$/.test(word)) return false;
  const up = word.toUpperCase();
  if (KEEP_UPPER.has(up)) return true;
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

const titleCaseVi = (raw) =>
  String(raw)
    .split(/\s+/)
    .filter(Boolean)
    .map(capitalizeWord)
    .join(' ');

/**
 * @param {string} name - Vietnamese / primary company name
 * @param {'vi'|'en'} [lang='vi']
 * @param {string} [nameEn=''] - Official English name from listing provider
 */
export const formatCompanyName = (name, lang = 'vi', nameEn = '') => {
  if (name == null && !nameEn) return '';
  const raw = String(name || '').trim();
  const en = String(nameEn || '').trim();

  if (lang === 'en' && en) {
    return en;
  }

  if (!raw) return en || '';
  if (/^đang /i.test(raw) || raw === '...' || raw === 'N/A') return raw;

  return titleCaseVi(raw);
};

/**
 * Convenience for stock meta objects from /api/symbols or marketData.
 * @param {{ companyName?: string, name?: string, companyNameEn?: string }|null|undefined} meta
 * @param {'vi'|'en'} [lang='vi']
 */
export const displayCompanyName = (meta, lang = 'vi') => {
  if (!meta) return '';
  return formatCompanyName(meta.companyName || meta.name, lang, meta.companyNameEn);
};

export default formatCompanyName;
