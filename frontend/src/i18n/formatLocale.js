/** Map app language code → Intl locale for dates/numbers. */
export function formatLocale(lang) {
  return lang === 'en' ? 'en-US' : 'vi-VN';
}

export function normalizeLanguage(value) {
  return value === 'en' ? 'en' : 'vi';
}
