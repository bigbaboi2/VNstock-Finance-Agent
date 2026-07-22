export const DEFAULT_EXPORT_FILE_NAME_PATTERN = 'live_trade_stats_<timestamp>';

/** Tags khả dụng trong mẫu tên file (phần gốc, không gồm .json / .md / .xlsx). */
export const LIVE_EXPORT_NAME_TAGS = [
    { tag: '<timestamp>', label: 'Thời điểm VN', example: '2026-07-22T15-09-18' },
    { tag: '<day>', label: 'Ngày VN', example: '2026-07-22' },
    { tag: '<date>', label: 'Ngày gọn', example: '20260722' },
    { tag: '<year>', label: 'Năm', example: '2026' },
    { tag: '<month>', label: 'Tháng', example: '07' },
    { tag: '<time>', label: 'Giờ VN', example: '6h34m23s' },
    { tag: '<from>', label: 'Ngày bắt đầu range', example: '20260701' },
    { tag: '<to>', label: 'Ngày kết thúc range', example: '20260722' },
    { tag: '<trades>', label: 'Số lệnh LIVE', example: '91' },
    { tag: '<closed>', label: 'Số lệnh đã đóng', example: '89' },
    { tag: '<winrate>', label: 'Win rate (%)', example: '44' },
];

const VN_TZ = 'Asia/Ho_Chi_Minh';

const getVnParts = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: VN_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(date);
    const pick = (type) => parts.find((p) => p.type === type)?.value ?? '00';
    return {
        year: pick('year'),
        month: pick('month'),
        day: pick('day'),
        hour: pick('hour'),
        minute: pick('minute'),
        second: pick('second'),
    };
};

/** Giữ chữ Unicode (tiếng Việt), loại ký tự cấm trên Windows. */
export const sanitizeExportFileBaseName = (raw) => {
    let safe = String(raw ?? '')
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^[-_.]+|[-_.]+$/g, '')
        .slice(0, 120);

    if (!safe) safe = '';
    return safe;
};

/** YYYY-MM-DD theo lịch VN (cho input type=date). */
export const toVnDateInputValue = (date = new Date()) => {
    const vn = getVnParts(date);
    return `${vn.year}-${vn.month}-${vn.day}`;
};

/** Parse dateFrom/dateTo (YYYY-MM-DD, giờ VN). Trống cả hai = toàn thời gian. */
export const parseExportDateRange = ({ dateFrom, dateTo } = {}) => {
    const fromStr = String(dateFrom ?? '').trim();
    const toStr = String(dateTo ?? '').trim();
    if (!fromStr && !toStr) {
        return {
            from: null,
            to: null,
            label: 'Toàn thời gian',
            fromLabel: '',
            toLabel: '',
            fromCompact: '',
            toCompact: '',
        };
    }
    const from = fromStr ? new Date(`${fromStr}T00:00:00+07:00`) : null;
    const to = toStr ? new Date(`${toStr}T23:59:59.999+07:00`) : null;
    if (from && Number.isNaN(from.getTime())) throw new Error('Ngày bắt đầu không hợp lệ (YYYY-MM-DD).');
    if (to && Number.isNaN(to.getTime())) throw new Error('Ngày kết thúc không hợp lệ (YYYY-MM-DD).');
    if (from && to && from > to) throw new Error('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
    let label = 'Toàn thời gian';
    if (fromStr && toStr) label = `${fromStr} → ${toStr}`;
    else if (fromStr) label = `Từ ${fromStr}`;
    else if (toStr) label = `Đến ${toStr}`;
    return {
        from,
        to,
        label,
        fromLabel: fromStr,
        toLabel: toStr,
        fromCompact: fromStr.replace(/-/g, ''),
        toCompact: toStr.replace(/-/g, ''),
    };
};

/** Lệnh/record giao với khoảng [from, to] (mở–đóng overlap, giờ VN). */
export const exportOverlapsDateRange = ({
    openedAt,
    closedAt,
    status,
    at,
    from,
    to,
    rangeEndFallback = new Date(),
} = {}) => {
    if (!from && !to) return true;
    const startMs = from?.getTime() ?? Number.NEGATIVE_INFINITY;
    const endMs = to?.getTime() ?? Number.POSITIVE_INFINITY;
    const openedMs = openedAt ? new Date(openedAt).getTime() : NaN;
    const closedMs = closedAt ? new Date(closedAt).getTime() : NaN;
    const atMs = at ? new Date(at).getTime() : NaN;

    const pointInRange = (ms) => Number.isFinite(ms) && ms >= startMs && ms <= endMs;
    if (pointInRange(openedMs) || pointInRange(closedMs) || pointInRange(atMs)) return true;

    if (!Number.isFinite(openedMs)) return false;
    const effectiveEnd = Number.isFinite(closedMs)
        ? closedMs
        : (['OPEN', 'PENDING'].includes(status)
            ? Math.min(endMs, rangeEndFallback.getTime())
            : openedMs);
    return openedMs <= endMs && effectiveEnd >= startMs;
};

export const resolveExportBaseName = (pattern, { generatedAt = new Date(), stats: statsIn = {}, dateRange = {} } = {}) => {
    const stats = statsIn ?? {};
    const d = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
    const vn = getVnParts(d);
    const ts = `${vn.year}-${vn.month}-${vn.day}T${vn.hour}-${vn.minute}-${vn.second}`;
    const day = `${vn.year}-${vn.month}-${vn.day}`;
    const dateCompact = `${vn.year}${vn.month}${vn.day}`;
    const timeLabel = `${Number(vn.hour)}h${vn.minute}m${vn.second}s`;

    let raw = String(pattern ?? '').trim() || DEFAULT_EXPORT_FILE_NAME_PATTERN;
    raw = raw
        .replace(/<timestamp>/gi, ts)
        .replace(/<day>/gi, day)
        .replace(/<date>/gi, dateCompact)
        .replace(/<year>/gi, vn.year)
        .replace(/<month>/gi, vn.month)
        .replace(/<time>/gi, timeLabel)
        .replace(/<from>/gi, dateRange.fromCompact || 'all')
        .replace(/<to>/gi, dateRange.toCompact || 'all')
        .replace(/<trades>/gi, String(stats.tradeCount ?? stats.autoTradeLive ?? 0))
        .replace(/<closed>/gi, String(stats.closed ?? 0))
        .replace(/<winrate>/gi, String(stats.winRatePct ?? 0));

    let safe = sanitizeExportFileBaseName(raw);
    if (!safe) safe = sanitizeExportFileBaseName(`live_trade_stats_${ts}`) || `live_trade_stats_${ts}`;
    return safe;
};
