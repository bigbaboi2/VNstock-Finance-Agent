/** Map app language code → Intl locale for dates/numbers. */
export function formatLocale(lang) {
  return lang === 'en' ? 'en-US' : 'vi-VN';
}

export function normalizeLanguage(value) {
  if (!value) return 'vi';
  const str = String(value).trim().toLowerCase();
  return str.startsWith('en') ? 'en' : 'vi';
}
