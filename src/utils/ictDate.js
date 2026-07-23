/** Calendar day helpers for Asia/Ho_Chi_Minh (ICT). */

export const ICT_TZ = 'Asia/Ho_Chi_Minh';

/**
 * YYYY-MM-DD in Asia/Ho_Chi_Minh (not the machine local timezone).
 * @param {Date} [date]
 * @returns {string}
 */
export const getIctDayKey = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: ICT_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date instanceof Date ? date : new Date(date));
    const get = (type) => parts.find((p) => p.type === type)?.value || '00';
    return `${get('year')}-${get('month')}-${get('day')}`;
};
