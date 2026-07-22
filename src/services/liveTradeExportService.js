import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import AutoTrade from '../../models/AutoTrade.js';
import ExchangeOrder from '../../models/ExchangeOrder.js';
import ManualTrade from '../../models/ManualTrade.js';
import UserOrder from '../../models/UserOrder.js';
import {
    DEFAULT_EXPORT_FILE_NAME_PATTERN,
    LIVE_EXPORT_NAME_TAGS,
    resolveExportBaseName,
    parseExportDateRange,
    exportOverlapsDateRange,
} from '../utils/liveExportName.js';

export { DEFAULT_EXPORT_FILE_NAME_PATTERN, LIVE_EXPORT_NAME_TAGS, resolveExportBaseName, parseExportDateRange };

export const DEFAULT_EXPORT_DIR = 'exports';
/** @deprecated alias */
export const DEFAULT_FILE_NAME_PATTERN = DEFAULT_EXPORT_FILE_NAME_PATTERN;

export const resolveExportOutputDir = (rawDir) => {
    const cwd = process.cwd();
    const trimmed = String(rawDir ?? '').trim();
    const resolved = trimmed
        ? (path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(cwd, trimmed))
        : path.resolve(cwd, DEFAULT_EXPORT_DIR);
    if (resolved.includes('\0')) {
        throw new Error('Đường dẫn xuất file không hợp lệ.');
    }
    return resolved;
};

/** Mô tả bộ file xuất LIVE (dùng cho UI + tài liệu). */
export const LIVE_EXPORT_FILE_CATALOG = [
    {
        id: 'json',
        extension: '.json',
        label: 'JSON — dump đầy đủ',
        purpose: 'Toàn bộ dữ liệu máy đọc được: summary, breakdowns, từng lệnh LIVE, packages, exchange orders, manual trades. Dùng cho Python/notebook hoặc import lại hệ thống.',
    },
    {
        id: 'md',
        extension: '.md',
        label: 'Markdown — báo cáo tổng hợp',
        purpose: 'Báo cáo đọc nhanh: win rate, PnL, phân tích theo symbol/setup/exit, so sánh early vs late 21 ngày, partial scale-out.',
    },
    {
        id: 'xlsx',
        extension: '.xlsx',
        label: 'Excel — workbook 6 sheet',
        purpose: 'Một file Excel mở bằng Excel/LibreOffice; mỗi sheet tương ứng một bảng phân tích (thay cho 6 CSV riêng lẻ).',
        sheets: [
            { name: 'Trades LIVE', purpose: 'Từng lệnh AutoTrade LIVE: entry/exit, PnL VND, hold time, signal breakdown, exit tag…' },
            { name: 'Exchange Orders', purpose: 'Lệnh gửi sàn (LIVE + testnet): side, purpose, notional, trạng thái fill/fail.' },
            { name: 'Packages LIVE', purpose: 'Gói vốn UserOrder LIVE: capital, allocation, realized PnL, số allocation.' },
            { name: 'Theo Symbol', purpose: 'Thống kê gom theo mã: số lệnh, win rate, tổng/trung bình PnL, thời gian giữ.' },
            { name: 'Equity Curve', purpose: 'Đường NAV theo thời gian: cum PnL, drawdown, % drawdown so với đỉnh NAV.' },
            { name: 'Early vs Late 21d', purpose: 'So sánh hiệu suất trước vs trong 21 ngày gần nhất (win rate, expectancy, max DD).' },
        ],
    },
];

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const r0 = (n) => Math.round(Number(n) || 0);
const pct = (n, d) => (d ? r2((n / d) * 100) : 0);
const fmtNum = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);
const fmtDate = (d) => (d ? new Date(d).toISOString() : '');
const holdHours = (openedAt, closedAt) => {
    if (!openedAt || !closedAt) return null;
    return (new Date(closedAt) - new Date(openedAt)) / 3600_000;
};
const outcome = (pnl, pnlPercent) => {
    const v = pnlPercent != null && Number.isFinite(Number(pnlPercent))
        ? Number(pnlPercent)
        : Number(pnl);
    if (!Number.isFinite(v)) return 'breakeven';
    if (v > 0) return 'win';
    if (v < 0) return 'loss';
    return 'breakeven';
};

const percentile = (sorted, p) => {
    if (!sorted.length) return 0;
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

const distStats = (values) => {
    const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (!nums.length) {
        return { n: 0, sum: 0, avg: 0, min: 0, max: 0, median: 0, p25: 0, p75: 0, p90: 0, stdev: 0 };
    }
    const sum = nums.reduce((s, v) => s + v, 0);
    const avg = sum / nums.length;
    const variance = nums.reduce((s, v) => s + (v - avg) ** 2, 0) / nums.length;
    return {
        n: nums.length,
        sum: r2(sum),
        avg: r2(avg),
        min: r2(nums[0]),
        max: r2(nums[nums.length - 1]),
        median: r2(percentile(nums, 0.5)),
        p25: r2(percentile(nums, 0.25)),
        p75: r2(percentile(nums, 0.75)),
        p90: r2(percentile(nums, 0.9)),
        stdev: r2(Math.sqrt(variance)),
    };
};

const groupBy = (items, keyFn) => {
    const map = new Map();
    for (const item of items) {
        const key = keyFn(item);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
    }
    return map;
};

const tradeStats = (trades, {
    amountKey = 'investedAmount',
    pnlKey = 'pnl',
    pnlPctKey = 'pnlPercent',
    currency = 'VND',
    initialCapital = 0,
} = {}) => {
    const closed = trades.filter((t) => t.status === 'CLOSED' || t._closed === true);
    const open = trades.filter((t) => ['OPEN', 'PENDING'].includes(t.status));
    const wins = closed.filter((t) => outcome(t[pnlKey], t[pnlPctKey]) === 'win');
    const losses = closed.filter((t) => outcome(t[pnlKey], t[pnlPctKey]) === 'loss');
    const be = closed.filter((t) => outcome(t[pnlKey], t[pnlPctKey]) === 'breakeven');

    const amounts = closed.map((t) => fmtNum(t[amountKey]));
    const pnls = closed.map((t) => fmtNum(t[pnlKey]));
    const pnlPcts = closed.map((t) => fmtNum(t[pnlPctKey]));
    const winPnls = wins.map((t) => fmtNum(t[pnlKey]));
    const lossPnls = losses.map((t) => fmtNum(t[pnlKey]));
    const winPcts = wins.map((t) => fmtNum(t[pnlPctKey]));
    const lossPcts = losses.map((t) => fmtNum(t[pnlPctKey]));
    const holds = closed.map((t) => holdHours(t.openedAt, t.closedAt)).filter((h) => h != null && h >= 0);
    const holdsWin = wins.map((t) => holdHours(t.openedAt, t.closedAt)).filter((h) => h != null && h >= 0);
    const holdsLoss = losses.map((t) => holdHours(t.openedAt, t.closedAt)).filter((h) => h != null && h >= 0);

    const amountDist = distStats(amounts);
    const pnlDist = distStats(pnls);
    const pnlPctDist = distStats(pnlPcts);
    const holdDist = distStats(holds);

    const grossProfit = winPnls.reduce((s, v) => s + v, 0);
    const grossLoss = Math.abs(lossPnls.reduce((s, v) => s + v, 0));
    const profitFactor = grossLoss > 0 ? r2(grossProfit / grossLoss) : (grossProfit > 0 ? Infinity : 0);
    const expectancyPct = closed.length
        ? r2((wins.length / closed.length) * (winPcts.length ? winPcts.reduce((s, v) => s + v, 0) / winPcts.length : 0)
            + (losses.length / closed.length) * (lossPcts.length ? lossPcts.reduce((s, v) => s + v, 0) / lossPcts.length : 0))
        : 0;
    const expectancyAmount = closed.length
        ? r2((wins.length / closed.length) * (winPnls.length ? winPnls.reduce((s, v) => s + v, 0) / winPnls.length : 0)
            + (losses.length / closed.length) * (lossPnls.length ? lossPnls.reduce((s, v) => s + v, 0) / lossPnls.length : 0))
        : 0;

    // Max drawdown on NAV = initialCapital + cumulative PnL (not bare PnL peak %)
    const ordered = [...closed].sort((a, b) => new Date(a.closedAt) - new Date(b.closedAt));
    const nav0 = Number(initialCapital) || 0;
    let cumPnl = 0;
    let peakNav = nav0;
    let maxDd = 0;
    let maxDdPctOfNavPeak = 0;
    let peakAt = null;
    let troughAt = null;
    let troughNav = nav0;
    const equityCurve = [];
    for (const t of ordered) {
        cumPnl += fmtNum(t[pnlKey]);
        const nav = nav0 + cumPnl;
        if (nav >= peakNav) {
            peakNav = nav;
            peakAt = t.closedAt;
        }
        const dd = peakNav - nav;
        if (dd > maxDd) {
            maxDd = dd;
            troughAt = t.closedAt;
            troughNav = nav;
        }
        if (peakNav > 0) {
            maxDdPctOfNavPeak = Math.max(maxDdPctOfNavPeak, (dd / peakNav) * 100);
        }
        equityCurve.push({
            closedAt: fmtDate(t.closedAt),
            cumPnl: r2(cumPnl),
            nav: r2(nav),
            peakNav: r2(peakNav),
            drawdown: r2(dd),
            drawdownPctOfNavPeak: peakNav > 0 ? r2((dd / peakNav) * 100) : 0,
            pnl: fmtNum(t[pnlKey]),
        });
    }

    // Streaks
    let curWin = 0; let curLoss = 0; let maxWinStreak = 0; let maxLossStreak = 0;
    for (const t of ordered) {
        const o = outcome(t[pnlKey], t[pnlPctKey]);
        if (o === 'win') {
            curWin++; curLoss = 0;
            maxWinStreak = Math.max(maxWinStreak, curWin);
        } else if (o === 'loss') {
            curLoss++; curWin = 0;
            maxLossStreak = Math.max(maxLossStreak, curLoss);
        } else {
            curWin = 0; curLoss = 0;
        }
    }

    const firstOpen = trades.map((t) => t.openedAt).filter(Boolean).sort((a, b) => a - b)[0];
    const lastClose = closed.map((t) => t.closedAt).filter(Boolean).sort((a, b) => b - a)[0];

    return {
        currency,
        period: {
            firstOpenedAt: fmtDate(firstOpen),
            lastClosedAt: fmtDate(lastClose),
            spanDays: firstOpen && lastClose
                ? r2((new Date(lastClose) - new Date(firstOpen)) / 86400_000)
                : 0,
        },
        counts: {
            total: trades.length,
            closed: closed.length,
            open: open.length,
            wins: wins.length,
            losses: losses.length,
            breakeven: be.length,
            winRatePct: pct(wins.length, closed.length),
            lossRatePct: pct(losses.length, closed.length),
        },
        capital: {
            totalInvestedClosed: amountDist.sum,
            avgPerTrade: amountDist.avg,
            minPerTrade: amountDist.min,
            maxPerTrade: amountDist.max,
            medianPerTrade: amountDist.median,
            p25: amountDist.p25,
            p75: amountDist.p75,
            p90: amountDist.p90,
            stdev: amountDist.stdev,
            currentlyOpenInvested: r2(open.reduce((s, t) => s + fmtNum(t[amountKey]), 0)),
        },
        pnl: {
            total: pnlDist.sum,
            avg: pnlDist.avg,
            min: pnlDist.min,
            max: pnlDist.max,
            median: pnlDist.median,
            avgWin: winPnls.length ? r2(winPnls.reduce((s, v) => s + v, 0) / winPnls.length) : 0,
            avgLoss: lossPnls.length ? r2(lossPnls.reduce((s, v) => s + v, 0) / lossPnls.length) : 0,
            grossProfit: r2(grossProfit),
            grossLoss: r2(grossLoss),
            profitFactor: profitFactor === Infinity ? 'Infinity' : profitFactor,
            expectancy: expectancyAmount,
            maxDrawdown: r2(maxDd),
            maxDrawdownPctOfNavPeak: r2(maxDdPctOfNavPeak),
            initialCapital: nav0,
            peakNav: r2(peakNav),
            troughNav: r2(troughNav),
            peakAt: fmtDate(peakAt),
            troughAt: fmtDate(troughAt),
            note: nav0 > 0
                ? 'DD% = drawdown / NAV peak (capital + cum PnL)'
                : 'initialCapital=0 → DD% trên peak của (0+cumPnL); nên truyền vốn gói LIVE',
            returnOnInvestedPct: amountDist.sum ? pct(pnlDist.sum, amountDist.sum) : 0,
        },
        pnlPercent: {
            total: pnlPctDist.sum,
            avg: pnlPctDist.avg,
            min: pnlPctDist.min,
            max: pnlPctDist.max,
            median: pnlPctDist.median,
            avgWin: winPcts.length ? r2(winPcts.reduce((s, v) => s + v, 0) / winPcts.length) : 0,
            avgLoss: lossPcts.length ? r2(lossPcts.reduce((s, v) => s + v, 0) / lossPcts.length) : 0,
            expectancy: expectancyPct,
        },
        holdTimeHours: {
            ...holdDist,
            avgWin: holdsWin.length ? r2(holdsWin.reduce((s, v) => s + v, 0) / holdsWin.length) : 0,
            avgLoss: holdsLoss.length ? r2(holdsLoss.reduce((s, v) => s + v, 0) / holdsLoss.length) : 0,
            buckets: (() => {
                const buckets = { lt1h: 0, '1h_6h': 0, '6h_24h': 0, '1d_3d': 0, gt3d: 0 };
                for (const h of holds) {
                    if (h < 1) buckets.lt1h++;
                    else if (h < 6) buckets['1h_6h']++;
                    else if (h < 24) buckets['6h_24h']++;
                    else if (h < 72) buckets['1d_3d']++;
                    else buckets.gt3d++;
                }
                return buckets;
            })(),
        },
        streaks: { maxWinStreak, maxLossStreak },
        equityCurve: equityCurve,
        equityCurveSample: equityCurve.length > 500
            ? equityCurve.filter((_, i) => i % Math.ceil(equityCurve.length / 500) === 0 || i === equityCurve.length - 1)
            : equityCurve,
    };
};

const breakdown = (closed, keyFn, { amountKey = 'investedAmount', pnlKey = 'pnl', pnlPctKey = 'pnlPercent' } = {}) => {
    const map = groupBy(closed, keyFn);
    return [...map.entries()]
        .map(([key, list]) => {
            const wins = list.filter((t) => outcome(t[pnlKey], t[pnlPctKey]) === 'win').length;
            const amounts = list.map((t) => fmtNum(t[amountKey]));
            const pnls = list.map((t) => fmtNum(t[pnlKey]));
            const holds = list.map((t) => holdHours(t.openedAt, t.closedAt)).filter((h) => h != null);
            return {
                key: String(key),
                count: list.length,
                wins,
                losses: list.length - wins,
                winRatePct: pct(wins, list.length),
                totalPnl: r2(pnls.reduce((s, v) => s + v, 0)),
                avgPnl: r2(pnls.reduce((s, v) => s + v, 0) / list.length),
                totalPnlPct: r2(list.reduce((s, t) => s + fmtNum(t[pnlPctKey]), 0)),
                avgPnlPct: r2(list.reduce((s, t) => s + fmtNum(t[pnlPctKey]), 0) / list.length),
                totalInvested: r2(amounts.reduce((s, v) => s + v, 0)),
                avgInvested: r2(amounts.reduce((s, v) => s + v, 0) / list.length),
                avgHoldHours: holds.length ? r2(holds.reduce((s, v) => s + v, 0) / holds.length) : 0,
            };
        })
        .sort((a, b) => b.count - a.count);
};

const csvEscape = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
};

/** UTF-8 BOM so Excel (Windows) detects Vietnamese correctly. */
const UTF8_BOM = '\uFEFF';

const toCsv = (rows, columns) => {
    const header = columns.map((c) => csvEscape(c.label)).join(',');
    const body = rows.map((row) => columns.map((c) => csvEscape(c.get(row))).join(',')).join('\n');
    return `${UTF8_BOM}${header}\n${body}\n`;
};

const writeExportWorkbook = async (filePath, sheetDefs) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OMNI DUCK Live Export';
    workbook.created = new Date();

    for (const { name, rows, columns } of sheetDefs) {
        const ws = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
        ws.addRow(columns.map((c) => c.label));
        const headerRow = ws.getRow(1);
        headerRow.font = { bold: true };
        headerRow.alignment = { vertical: 'middle' };

        for (const row of rows) {
            ws.addRow(columns.map((c) => {
                const v = c.get(row);
                return v == null ? '' : v;
            }));
        }

        columns.forEach((c, i) => {
            ws.getColumn(i + 1).width = Math.min(32, Math.max(10, c.label.length + 3));
        });
    }

    await workbook.xlsx.writeFile(filePath);
};

const mdTable = (rows, columns) => {
    if (!rows.length) return '_Không có dữ liệu._\n';
    const head = `| ${columns.map((c) => c.label).join(' | ')} |`;
    const sep = `| ${columns.map(() => '---').join(' | ')} |`;
    const body = rows.map((r) => `| ${columns.map((c) => c.get(r)).join(' | ')} |`).join('\n');
    return `${head}\n${sep}\n${body}\n`;
};

export const exportLiveTradeStats = async ({ outputDir, fileNamePattern, dateFrom, dateTo } = {}) => {
    const OUT_DIR = resolveExportOutputDir(outputDir);
    const pattern = String(fileNamePattern ?? '').trim() || DEFAULT_FILE_NAME_PATTERN;
    const dateRange = parseExportDateRange({ dateFrom, dateTo });
    const generatedAt = new Date();
    const rangeEndFallback = dateRange.to || generatedAt;

    const [autoLiveAll, exchangeOrdersAll, manualTradesAll, userOrdersLiveAll] = await Promise.all([
        AutoTrade.find({ executionMode: 'LIVE' }).lean(),
        ExchangeOrder.find({}).lean(),
        ManualTrade.find({}).lean(),
        UserOrder.find({ executionMode: 'LIVE' }).lean(),
    ]);

    const inRange = (fields) => exportOverlapsDateRange({
        ...fields,
        from: dateRange.from,
        to: dateRange.to,
        rangeEndFallback,
    });

    const autoLive = autoLiveAll.filter((t) => inRange({
        openedAt: t.openedAt,
        closedAt: t.closedAt,
        status: t.status,
    }));
    const filteredTradeIds = new Set(autoLive.map((t) => String(t._id)));

    const exchangeOrders = exchangeOrdersAll.filter((o) => {
        if (o.autoTradeId && filteredTradeIds.has(String(o.autoTradeId))) return true;
        const pending = o.status === 'PENDING';
        return inRange({
            openedAt: o.sentAt,
            closedAt: o.filledAt,
            at: o.sentAt,
            status: pending ? 'PENDING' : 'CLOSED',
        });
    });

    const manualTrades = manualTradesAll.filter((t) => {
        const status = ['OPEN', 'PENDING_ENTRY'].includes(t.status) ? t.status === 'OPEN' ? 'OPEN' : 'PENDING' : t.status;
        return inRange({ openedAt: t.openedAt, closedAt: t.closedAt, status });
    });

    const userOrdersLive = userOrdersLiveAll.filter((u) => {
        const allocs = u.tradeAllocations || [];
        if (allocs.some((a) => inRange({
            openedAt: a.openedAt,
            closedAt: a.closedAt,
            status: a.closedAt ? 'CLOSED' : 'OPEN',
        }))) return true;
        return allocs.some((a) => a.trade && filteredTradeIds.has(String(a.trade)));
    });

    const closedAuto = autoLive.filter((t) => t.status === 'CLOSED');
    const openAuto = autoLive.filter((t) => ['OPEN', 'PENDING'].includes(t.status));
    const liveExchange = exchangeOrders.filter((o) => o.environment === 'LIVE');
    const testnetExchange = exchangeOrders.filter((o) => o.environment === 'TESTNET');
    const closedManual = manualTrades.filter((t) => t.status === 'CLOSED').map((t) => ({
        ...t,
        _closed: true,
        investedAmount: t.amountUSDT,
        pnl: t.realizedPnlUsdt,
    }));

    const liveCapital = userOrdersLive.reduce((s, u) => s + fmtNum(u.totalCapital || u.capital), 0);
    const autoStats = tradeStats(autoLive, { currency: 'VND', initialCapital: liveCapital });
    const stamp = resolveExportBaseName(pattern, {
        generatedAt,
        dateRange,
        stats: {
            tradeCount: autoLive.length,
            closed: closedAuto.length,
            winRatePct: autoStats.counts.winRatePct,
        },
    });
    const manualStats = tradeStats(closedManual.map((t) => ({ ...t, status: 'CLOSED' })), {
        amountKey: 'amountUSDT',
        pnlKey: 'realizedPnlUsdt',
        pnlPctKey: 'pnlPercent',
        currency: 'USDT',
    });

    const LATE_MS = 21 * 86400_000;
    const lateSince = new Date(Date.now() - LATE_MS);
    const closedEarly = closedAuto.filter((t) => new Date(t.closedAt) < lateSince);
    const closedLate = closedAuto.filter((t) => new Date(t.closedAt) >= lateSince);
    const earlyStats = tradeStats(closedEarly.map((t) => ({ ...t, status: 'CLOSED' })), { currency: 'VND', initialCapital: liveCapital });
    const lateStats = tradeStats(closedLate.map((t) => ({ ...t, status: 'CLOSED' })), { currency: 'VND', initialCapital: liveCapital });

    // Enrich auto trades with hold + outcome + plan fields
    const tradeRows = autoLive
        .map((t) => {
            const holdH = holdHours(t.openedAt, t.closedAt);
            const sb = t.signalBreakdown || {};
            return {
                id: String(t._id),
                symbol: t.symbol,
                assetType: t.assetType,
                direction: t.direction,
                marketType: t.marketType,
                leverage: t.leverage,
                status: t.status,
                entryPrice: t.entryPrice,
                exitPrice: t.exitPrice,
                stopLossPrice: t.stopLossPrice,
                takeProfitPrice: t.takeProfitPrice,
                takeProfit1Price: t.takeProfit1Price,
                entryAtr: t.entryAtr,
                tp1Fraction: t.tp1Fraction,
                tp1FillPrice: t.tp1FillPrice,
                peakPrice: t.peakPrice,
                volume: t.volume,
                investedAmount: t.investedAmount,
                pnl: t.pnl,
                pnlPercent: t.pnlPercent,
                realizedPartialPnl: t.realizedPartialPnl || 0,
                runnerPnl: t.status === 'CLOSED' ? r2(fmtNum(t.pnl) - fmtNum(t.realizedPartialPnl)) : '',
                outcome: t.status === 'CLOSED' ? outcome(t.pnl, t.pnlPercent) : '',
                aiScore: t.aiScore,
                confidence: t.confidence,
                exitTag: t.exitTag || '',
                exitReason: t.exitReason || '',
                marketCondition: t.marketCondition || '',
                entrySetup: sb.entrySetup || '',
                edge: sb.edge ?? '',
                adx: sb.adx ?? '',
                confluenceCount: sb.confluenceCount ?? '',
                rsi: sb.rsi ?? '',
                volumeSurge: sb.volumeSurge ?? '',
                fearGreed: sb.fearGreed ?? '',
                btcChangePct: sb.btcChangePct ?? '',
                plannedRR: sb.plannedRR ?? '',
                plannedRR_tp1: sb.plannedRR_tp1 ?? '',
                riskLevel: t.riskLevel,
                tp1Filled: !!t.tp1Filled,
                openedAt: fmtDate(t.openedAt),
                closedAt: fmtDate(t.closedAt),
                holdHours: holdH != null ? r2(holdH) : '',
                period: t.closedAt && new Date(t.closedAt) >= lateSince ? 'LATE_21d' : (t.status === 'CLOSED' ? 'EARLY' : 'OPEN'),
                exchangeConnectionId: t.exchangeConnectionId ? String(t.exchangeConnectionId) : '',
                externalOrderId: t.externalOrderId || '',
            };
        })
        .sort((a, b) => String(b.openedAt).localeCompare(String(a.openedAt)));

    const bySymbol = breakdown(closedAuto, (t) => t.symbol);
    const byAsset = breakdown(closedAuto, (t) => t.assetType);
    const byDirection = breakdown(closedAuto, (t) => t.direction);
    const byExitTag = breakdown(closedAuto, (t) => t.exitTag || t.exitReason || 'UNKNOWN');
    const byMarketType = breakdown(closedAuto, (t) => t.marketType || 'SPOT');
    const byTp1xExit = breakdown(closedAuto, (t) => `${t.tp1Filled ? 'TP1_YES' : 'TP1_NO'}|${t.exitTag || 'UNKNOWN'}`);
    const byScore = breakdown(closedAuto, (t) => {
        const s = t.aiScore || 0;
        if (s < 65) return 'lt65';
        if (s < 72) return 's65_72';
        if (s < 80) return 's72_80';
        return 'gt80';
    });
    const byHourVn = breakdown(closedAuto, (t) => {
        const d = new Date(new Date(t.openedAt).toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        return `H${String(d.getHours()).padStart(2, '0')}`;
    });
    const byDowVn = breakdown(closedAuto, (t) => {
        const d = new Date(new Date(t.openedAt).toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
    });
    const byMonth = breakdown(closedAuto, (t) => {
        const d = new Date(t.closedAt || t.openedAt);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    });
    const bySetup = breakdown(closedAuto, (t) => t.signalBreakdown?.entrySetup || 'UNKNOWN');
    const bySetupLate = breakdown(closedLate, (t) => t.signalBreakdown?.entrySetup || 'UNKNOWN');
    const bySymbolLate = breakdown(closedLate, (t) => t.symbol);

    // Monthly capital inflow (opened invested)
    const monthlyInflow = [...groupBy(autoLive, (t) => {
        const d = new Date(t.openedAt);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }).entries()]
        .map(([month, list]) => ({
            month,
            tradesOpened: list.length,
            capitalIn: r2(list.reduce((s, t) => s + fmtNum(t.investedAmount), 0)),
            closed: list.filter((t) => t.status === 'CLOSED').length,
            pnlClosed: r2(list.filter((t) => t.status === 'CLOSED').reduce((s, t) => s + fmtNum(t.pnl), 0)),
        }))
        .sort((a, b) => a.month.localeCompare(b.month));

    // Exchange order fill stats
    const summarizeOrders = (orders, label) => {
        const filled = orders.filter((o) => ['FILLED', 'PARTIAL'].includes(o.status));
        const failed = orders.filter((o) => o.status === 'FAILED');
        const entries = filled.filter((o) => o.purpose === 'ENTRY');
        const exits = filled.filter((o) => o.purpose === 'EXIT');
        const notionals = filled.map((o) => fmtNum(o.notionalUSDT));
        return {
            label,
            total: orders.length,
            filled: filled.length,
            failed: failed.length,
            pending: orders.filter((o) => o.status === 'PENDING').length,
            cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
            fillRatePct: pct(filled.length, orders.length),
            entries: entries.length,
            exits: exits.length,
            notionalUSDT: distStats(notionals),
            byPurpose: [...groupBy(orders, (o) => o.purpose || 'UNKNOWN').entries()].map(([k, list]) => ({
                purpose: k,
                count: list.length,
                filled: list.filter((o) => ['FILLED', 'PARTIAL'].includes(o.status)).length,
                failed: list.filter((o) => o.status === 'FAILED').length,
            })),
            bySymbol: [...groupBy(filled, (o) => o.symbol).entries()]
                .map(([symbol, list]) => ({
                    symbol,
                    count: list.length,
                    notionalUSDT: r2(list.reduce((s, o) => s + fmtNum(o.notionalUSDT), 0)),
                }))
                .sort((a, b) => b.notionalUSDT - a.notionalUSDT)
                .slice(0, 30),
            topErrors: [...groupBy(failed, (o) => (o.errorMessage || 'unknown').slice(0, 120)).entries()]
                .map(([msg, list]) => ({ error: msg, count: list.length }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 15),
        };
    };

    const exchangeLiveStats = summarizeOrders(liveExchange, 'LIVE');
    const exchangeTestnetStats = summarizeOrders(testnetExchange, 'TESTNET');

    // UserOrder LIVE packages
    const packageRows = userOrdersLive.map((u) => {
        const allocs = u.tradeAllocations || [];
        const closedAllocs = allocs.filter((a) => a.closedAt);
        return {
            id: String(u._id),
            username: u.username,
            status: u.status,
            capital: u.capital,
            totalCapital: u.totalCapital || u.capital,
            usedCapital: u.usedCapital || 0,
            realizedPnl: u.realizedPnl || 0,
            allocationMode: u.allocationMode,
            allocationPercent: u.allocationPercent,
            maxConcurrentOrders: u.maxConcurrentOrders,
            allocationsTotal: allocs.length,
            allocationsClosed: closedAllocs.length,
            createdAt: fmtDate(u.createdAt),
            updatedAt: fmtDate(u.updatedAt),
        };
    });

    const packageStats = {
        packages: packageRows.length,
        byStatus: [...groupBy(userOrdersLive, (u) => u.status).entries()].map(([k, list]) => ({
            status: k,
            count: list.length,
            totalCapital: r2(list.reduce((s, u) => s + fmtNum(u.totalCapital || u.capital), 0)),
            realizedPnl: r2(list.reduce((s, u) => s + fmtNum(u.realizedPnl), 0)),
        })),
        totalCapitalAll: r2(userOrdersLive.reduce((s, u) => s + fmtNum(u.totalCapital || u.capital), 0)),
        totalRealizedPnl: r2(userOrdersLive.reduce((s, u) => s + fmtNum(u.realizedPnl), 0)),
        totalUsedCapital: r2(userOrdersLive.reduce((s, u) => s + fmtNum(u.usedCapital), 0)),
    };

    // Partial TP usage
    const tp1Trades = closedAuto.filter((t) => t.tp1Filled);
    const partialStats = {
        closedWithTp1: tp1Trades.length,
        pctOfClosed: pct(tp1Trades.length, closedAuto.length),
        avgPartialPnl: tp1Trades.length
            ? r2(tp1Trades.reduce((s, t) => s + fmtNum(t.realizedPartialPnl), 0) / tp1Trades.length)
            : 0,
        totalPartialPnl: r2(tp1Trades.reduce((s, t) => s + fmtNum(t.realizedPartialPnl), 0)),
        winRateWithTp1: pct(tp1Trades.filter((t) => outcome(t.pnl, t.pnlPercent) === 'win').length, tp1Trades.length),
        winRateWithoutTp1: (() => {
            const rest = closedAuto.filter((t) => !t.tp1Filled);
            return pct(rest.filter((t) => outcome(t.pnl, t.pnlPercent) === 'win').length, rest.length);
        })(),
    };

    const scopeLabel = dateRange.from || dateRange.to
        ? `AutoTrade LIVE trong khoảng ${dateRange.label} (giờ VN) + ExchangeOrder / ManualTrade / UserOrder LIVE liên quan`
        : 'All-time AutoTrade executionMode=LIVE (+ ExchangeOrder + ManualTrade + UserOrder LIVE)';

    const report = {
        generatedAt: generatedAt.toISOString(),
        fileNamePattern: pattern,
        baseName: stamp,
        timezoneNote: 'Hold/open times stored UTC; hour/DOW buckets use Asia/Ho_Chi_Minh',
        dateRange: {
            from: dateRange.fromLabel || null,
            to: dateRange.toLabel || null,
            label: dateRange.label,
        },
        scope: scopeLabel,
        summary: {
            autoLive: autoStats,
            early21dAgo: earlyStats,
            late21d: lateStats,
            liveCapitalUsedForNav: liveCapital,
            manualLive: manualStats,
            packages: packageStats,
            exchangeOrders: {
                live: exchangeLiveStats,
                testnet: exchangeTestnetStats,
            },
            partialScaleOut: partialStats,
        },
        breakdowns: {
            bySymbol,
            bySymbolLate,
            byAsset,
            byDirection,
            byExitTag,
            byTp1xExit,
            byMarketType,
            byScore,
            bySetup,
            bySetupLate,
            byHourVn,
            byDowVn,
            byMonth,
            monthlyInflow,
        },
        openPositions: openAuto.map((t) => ({
            id: String(t._id),
            symbol: t.symbol,
            direction: t.direction,
            investedAmount: t.investedAmount,
            entryPrice: t.entryPrice,
            openedAt: fmtDate(t.openedAt),
            holdHoursSoFar: r2(holdHours(t.openedAt, new Date())),
            aiScore: t.aiScore,
        })),
        tradeCount: tradeRows.length,
        packageCount: packageRows.length,
    };

    fs.mkdirSync(OUT_DIR, { recursive: true });

    const jsonPath = path.join(OUT_DIR, `${stamp}.json`);
    const mdPath = path.join(OUT_DIR, `${stamp}.md`);
    const xlsxPath = path.join(OUT_DIR, `${stamp}.xlsx`);

    const tradesColumns = [
        { label: 'id', get: (r) => r.id },
        { label: 'symbol', get: (r) => r.symbol },
        { label: 'assetType', get: (r) => r.assetType },
        { label: 'direction', get: (r) => r.direction },
        { label: 'marketType', get: (r) => r.marketType },
        { label: 'leverage', get: (r) => r.leverage },
        { label: 'status', get: (r) => r.status },
        { label: 'period', get: (r) => r.period },
        { label: 'outcome', get: (r) => r.outcome },
        { label: 'entryPrice', get: (r) => r.entryPrice },
        { label: 'exitPrice', get: (r) => r.exitPrice },
        { label: 'stopLossPrice', get: (r) => r.stopLossPrice },
        { label: 'takeProfitPrice', get: (r) => r.takeProfitPrice },
        { label: 'takeProfit1Price', get: (r) => r.takeProfit1Price },
        { label: 'entryAtr', get: (r) => r.entryAtr },
        { label: 'tp1Fraction', get: (r) => r.tp1Fraction },
        { label: 'tp1FillPrice', get: (r) => r.tp1FillPrice },
        { label: 'peakPrice', get: (r) => r.peakPrice },
        { label: 'volume', get: (r) => r.volume },
        { label: 'investedAmount_VND', get: (r) => r.investedAmount },
        { label: 'pnl_VND', get: (r) => r.pnl },
        { label: 'pnlPercent', get: (r) => r.pnlPercent },
        { label: 'realizedPartialPnl_VND', get: (r) => r.realizedPartialPnl },
        { label: 'runnerPnl_VND', get: (r) => r.runnerPnl },
        { label: 'aiScore', get: (r) => r.aiScore },
        { label: 'confidence', get: (r) => r.confidence },
        { label: 'entrySetup', get: (r) => r.entrySetup },
        { label: 'edge', get: (r) => r.edge },
        { label: 'adx', get: (r) => r.adx },
        { label: 'confluenceCount', get: (r) => r.confluenceCount },
        { label: 'rsi', get: (r) => r.rsi },
        { label: 'volumeSurge', get: (r) => r.volumeSurge },
        { label: 'fearGreed', get: (r) => r.fearGreed },
        { label: 'btcChangePct', get: (r) => r.btcChangePct },
        { label: 'plannedRR', get: (r) => r.plannedRR },
        { label: 'plannedRR_tp1', get: (r) => r.plannedRR_tp1 },
        { label: 'exitTag', get: (r) => r.exitTag },
        { label: 'exitReason', get: (r) => r.exitReason },
        { label: 'marketCondition', get: (r) => r.marketCondition },
        { label: 'riskLevel', get: (r) => r.riskLevel },
        { label: 'tp1Filled', get: (r) => r.tp1Filled },
        { label: 'openedAt', get: (r) => r.openedAt },
        { label: 'closedAt', get: (r) => r.closedAt },
        { label: 'holdHours', get: (r) => r.holdHours },
        { label: 'exchangeConnectionId', get: (r) => r.exchangeConnectionId },
        { label: 'externalOrderId', get: (r) => r.externalOrderId },
    ];

    const equityColumns = [
        { label: 'closedAt', get: (r) => r.closedAt },
        { label: 'pnl', get: (r) => r.pnl },
        { label: 'cumPnl', get: (r) => r.cumPnl },
        { label: 'nav', get: (r) => r.nav },
        { label: 'peakNav', get: (r) => r.peakNav },
        { label: 'drawdown', get: (r) => r.drawdown },
        { label: 'drawdownPctOfNavPeak', get: (r) => r.drawdownPctOfNavPeak },
    ];

    const earlyLateRows = [
        { key: 'EARLY_before_21d', ...earlyStats.counts, totalPnl: earlyStats.pnl.total, expectancyPct: earlyStats.pnlPercent.expectancy, tp1Rate: pct(closedEarly.filter((t) => t.tp1Filled).length, closedEarly.length), maxDd: earlyStats.pnl.maxDrawdown, maxDdPctNav: earlyStats.pnl.maxDrawdownPctOfNavPeak },
        { key: 'LATE_21d', ...lateStats.counts, totalPnl: lateStats.pnl.total, expectancyPct: lateStats.pnlPercent.expectancy, tp1Rate: pct(closedLate.filter((t) => t.tp1Filled).length, closedLate.length), maxDd: lateStats.pnl.maxDrawdown, maxDdPctNav: lateStats.pnl.maxDrawdownPctOfNavPeak },
    ];

    const earlyLateColumns = [
        { label: 'window', get: (r) => r.key },
        { label: 'closed', get: (r) => r.closed },
        { label: 'wins', get: (r) => r.wins },
        { label: 'losses', get: (r) => r.losses },
        { label: 'winRatePct', get: (r) => r.winRatePct },
        { label: 'totalPnl', get: (r) => r.totalPnl },
        { label: 'expectancyPct', get: (r) => r.expectancyPct },
        { label: 'tp1RatePct', get: (r) => r.tp1Rate },
        { label: 'maxDd_VND', get: (r) => r.maxDd },
        { label: 'maxDdPctNavPeak', get: (r) => r.maxDdPctNav },
    ];

    const ordersColumns = [
        { label: 'id', get: (o) => String(o._id) },
        { label: 'autoTradeId', get: (o) => o.autoTradeId ? String(o.autoTradeId) : '' },
        { label: 'username', get: (o) => o.username },
        { label: 'exchangeName', get: (o) => o.exchangeName },
        { label: 'environment', get: (o) => o.environment },
        { label: 'symbol', get: (o) => o.symbol },
        { label: 'side', get: (o) => o.side },
        { label: 'purpose', get: (o) => o.purpose },
        { label: 'marketType', get: (o) => o.marketType },
        { label: 'quantity', get: (o) => o.quantity },
        { label: 'filledPrice', get: (o) => o.filledPrice },
        { label: 'filledQuantity', get: (o) => o.filledQuantity },
        { label: 'notionalUSDT', get: (o) => o.notionalUSDT },
        { label: 'feeUSDT', get: (o) => o.feeUSDT || 0 },
        { label: 'feeAsset', get: (o) => o.feeAsset || '' },
        { label: 'feeSource', get: (o) => o.feeSource || '' },
        { label: 'status', get: (o) => o.status },
        { label: 'errorMessage', get: (o) => o.errorMessage || '' },
        { label: 'sentAt', get: (o) => fmtDate(o.sentAt) },
        { label: 'filledAt', get: (o) => fmtDate(o.filledAt) },
    ];

    const packagesColumns = [
        { label: 'id', get: (r) => r.id },
        { label: 'username', get: (r) => r.username },
        { label: 'status', get: (r) => r.status },
        { label: 'capital', get: (r) => r.capital },
        { label: 'totalCapital', get: (r) => r.totalCapital },
        { label: 'usedCapital', get: (r) => r.usedCapital },
        { label: 'realizedPnl', get: (r) => r.realizedPnl },
        { label: 'allocationMode', get: (r) => r.allocationMode },
        { label: 'allocationsTotal', get: (r) => r.allocationsTotal },
        { label: 'allocationsClosed', get: (r) => r.allocationsClosed },
        { label: 'createdAt', get: (r) => r.createdAt },
    ];

    const symbolColumns = [
        { label: 'symbol', get: (r) => r.key },
        { label: 'count', get: (r) => r.count },
        { label: 'wins', get: (r) => r.wins },
        { label: 'winRatePct', get: (r) => r.winRatePct },
        { label: 'totalPnl_VND', get: (r) => r.totalPnl },
        { label: 'avgPnl_VND', get: (r) => r.avgPnl },
        { label: 'totalPnlPct', get: (r) => r.totalPnlPct },
        { label: 'avgPnlPct', get: (r) => r.avgPnlPct },
        { label: 'totalInvested_VND', get: (r) => r.totalInvested },
        { label: 'avgInvested_VND', get: (r) => r.avgInvested },
        { label: 'avgHoldHours', get: (r) => r.avgHoldHours },
    ];

    // Full JSON includes trade list (for deep analysis)
    fs.writeFileSync(jsonPath, JSON.stringify({
        ...report,
        trades: tradeRows,
        packages: packageRows,
        exchangeOrdersLive: liveExchange.map((o) => ({
            id: String(o._id),
            autoTradeId: o.autoTradeId ? String(o.autoTradeId) : '',
            username: o.username,
            exchangeName: o.exchangeName,
            environment: o.environment,
            symbol: o.symbol,
            side: o.side,
            purpose: o.purpose,
            marketType: o.marketType,
            quantity: o.quantity,
            filledPrice: o.filledPrice,
            filledQuantity: o.filledQuantity,
            notionalUSDT: o.notionalUSDT,
            status: o.status,
            errorMessage: o.errorMessage || '',
            sentAt: fmtDate(o.sentAt),
            filledAt: fmtDate(o.filledAt),
        })),
        manualTrades: manualTrades.map((t) => ({
            id: String(t._id),
            symbol: t.symbol,
            direction: t.direction,
            status: t.status,
            amountUSDT: t.amountUSDT,
            realizedPnlUsdt: t.realizedPnlUsdt,
            pnlPercent: t.pnlPercent,
            openedAt: fmtDate(t.openedAt),
            closedAt: fmtDate(t.closedAt),
            holdHours: holdHours(t.openedAt, t.closedAt) != null ? r2(holdHours(t.openedAt, t.closedAt)) : '',
            closeReason: t.closeReason || '',
            requestedBy: t.requestedBy,
        })),
    }, null, 2));

    await writeExportWorkbook(xlsxPath, [
        { name: 'Trades LIVE', rows: tradeRows, columns: tradesColumns },
        { name: 'Exchange Orders', rows: [...liveExchange, ...testnetExchange], columns: ordersColumns },
        { name: 'Packages LIVE', rows: packageRows, columns: packagesColumns },
        { name: 'Theo Symbol', rows: bySymbol, columns: symbolColumns },
        { name: 'Equity Curve', rows: autoStats.equityCurve || [], columns: equityColumns },
        { name: 'Early vs Late 21d', rows: earlyLateRows, columns: earlyLateColumns },
    ]);

    const s = autoStats;
    const mdTitle = dateRange.from || dateRange.to
        ? `# LIVE Trade Statistics — ${dateRange.label}`
        : '# LIVE Trade Statistics — All Time';
    const md = `${mdTitle}

Generated: \`${report.generatedAt}\`

Scope: \`${scopeLabel}\`

---

## 1. Overview (AutoDuck LIVE)

| Metric | Value |
| --- | --- |
| Total trades | ${s.counts.total} |
| Closed | ${s.counts.closed} |
| Open / Pending | ${s.counts.open} |
| Wins / Losses / BE | ${s.counts.wins} / ${s.counts.losses} / ${s.counts.breakeven} |
| Win rate | **${s.counts.winRatePct}%** |
| First opened | ${s.period.firstOpenedAt} |
| Last closed | ${s.period.lastClosedAt} |
| Span (days) | ${s.period.spanDays} |

---

## 2. Capital / Size (VND)

| Metric | Value |
| --- | --- |
| Total invested (closed) | ${s.capital.totalInvestedClosed} |
| Currently open invested | ${s.capital.currentlyOpenInvested} |
| Avg / trade | ${s.capital.avgPerTrade} |
| Median | ${s.capital.medianPerTrade} |
| Min | ${s.capital.minPerTrade} |
| Max | ${s.capital.maxPerTrade} |
| P25 / P75 / P90 | ${s.capital.p25} / ${s.capital.p75} / ${s.capital.p90} |
| Stdev | ${s.capital.stdev} |

---

## 3. PnL (VND)

| Metric | Value |
| --- | --- |
| Total PnL | **${s.pnl.total}** |
| Avg PnL / trade | ${s.pnl.avg} |
| Median | ${s.pnl.median} |
| Min / Max | ${s.pnl.min} / ${s.pnl.max} |
| Avg win / Avg loss | ${s.pnl.avgWin} / ${s.pnl.avgLoss} |
| Gross profit / Gross loss | ${s.pnl.grossProfit} / ${s.pnl.grossLoss} |
| Profit factor | ${s.pnl.profitFactor} |
| Expectancy (VND) | ${s.pnl.expectancy} |
| Return on invested | ${s.pnl.returnOnInvestedPct}% |
| Max drawdown (NAV) | **${s.pnl.maxDrawdown}** VND (${s.pnl.maxDrawdownPctOfNavPeak}% of NAV peak) |
| NAV initial / peak / trough | ${s.pnl.initialCapital} / ${s.pnl.peakNav} / ${s.pnl.troughNav} |
| Peak / trough at | ${s.pnl.peakAt} / ${s.pnl.troughAt} |

### Early vs Late (21 ngày gần nhất = Late)

| Window | Closed | Win% | Total PnL | Expectancy% | TP1 rate | Max DD% NAV |
| --- | --- | --- | --- | --- | --- | --- |
| Early | ${earlyStats.counts.closed} | ${earlyStats.counts.winRatePct}% | ${earlyStats.pnl.total} | ${earlyStats.pnlPercent.expectancy} | ${pct(closedEarly.filter((t) => t.tp1Filled).length, closedEarly.length)}% | ${earlyStats.pnl.maxDrawdownPctOfNavPeak}% |
| Late 21d | ${lateStats.counts.closed} | ${lateStats.counts.winRatePct}% | ${lateStats.pnl.total} | ${lateStats.pnlPercent.expectancy} | ${pct(closedLate.filter((t) => t.tp1Filled).length, closedLate.length)}% | ${lateStats.pnl.maxDrawdownPctOfNavPeak}% |
| Max win / loss streak | ${s.streaks.maxWinStreak} / ${s.streaks.maxLossStreak} |

### PnL %

| Metric | Value |
| --- | --- |
| Sum pnl% | ${s.pnlPercent.total} |
| Avg pnl% | ${s.pnlPercent.avg} |
| Median | ${s.pnlPercent.median} |
| Min / Max | ${s.pnlPercent.min} / ${s.pnlPercent.max} |
| Avg win% / Avg loss% | ${s.pnlPercent.avgWin} / ${s.pnlPercent.avgLoss} |
| Expectancy % | ${s.pnlPercent.expectancy} |

---

## 4. Hold time (hours)

| Metric | Value |
| --- | --- |
| Avg hold | ${s.holdTimeHours.avg} |
| Median | ${s.holdTimeHours.median} |
| Min / Max | ${s.holdTimeHours.min} / ${s.holdTimeHours.max} |
| P25 / P75 / P90 | ${s.holdTimeHours.p25} / ${s.holdTimeHours.p75} / ${s.holdTimeHours.p90} |
| Avg hold wins / losses | ${s.holdTimeHours.avgWin} / ${s.holdTimeHours.avgLoss} |
| Buckets lt1h / 1-6h / 6-24h / 1-3d / >3d | ${s.holdTimeHours.buckets.lt1h} / ${s.holdTimeHours.buckets['1h_6h']} / ${s.holdTimeHours.buckets['6h_24h']} / ${s.holdTimeHours.buckets['1d_3d']} / ${s.holdTimeHours.buckets.gt3d} |

---

## 5. Partial scale-out (TP1)

| Metric | Value |
| --- | --- |
| Closed with TP1 | ${partialStats.closedWithTp1} (${partialStats.pctOfClosed}%) |
| Total partial PnL | ${partialStats.totalPartialPnl} |
| Avg partial PnL | ${partialStats.avgPartialPnl} |
| Win rate with TP1 | ${partialStats.winRateWithTp1}% |
| Win rate without TP1 | ${partialStats.winRateWithoutTp1}% |

---

## 6. Breakdown by symbol (top)

${mdTable(bySymbol.slice(0, 40), [
    { label: 'Symbol', get: (r) => r.key },
    { label: 'N', get: (r) => r.count },
    { label: 'Win%', get: (r) => r.winRatePct },
    { label: 'Total PnL', get: (r) => r.totalPnl },
    { label: 'Avg PnL%', get: (r) => r.avgPnlPct },
    { label: 'Invested', get: (r) => r.totalInvested },
    { label: 'Avg hold h', get: (r) => r.avgHoldHours },
])}

## 7. By asset / direction / market / exit / AI score

### Asset
${mdTable(byAsset, [
    { label: 'Asset', get: (r) => r.key },
    { label: 'N', get: (r) => r.count },
    { label: 'Win%', get: (r) => r.winRatePct },
    { label: 'Total PnL', get: (r) => r.totalPnl },
    { label: 'Avg PnL%', get: (r) => r.avgPnlPct },
])}

### Direction
${mdTable(byDirection, [
    { label: 'Direction', get: (r) => r.key },
    { label: 'N', get: (r) => r.count },
    { label: 'Win%', get: (r) => r.winRatePct },
    { label: 'Total PnL', get: (r) => r.totalPnl },
    { label: 'Avg PnL%', get: (r) => r.avgPnlPct },
])}

### Market type
${mdTable(byMarketType, [
    { label: 'Market', get: (r) => r.key },
    { label: 'N', get: (r) => r.count },
    { label: 'Win%', get: (r) => r.winRatePct },
    { label: 'Total PnL', get: (r) => r.totalPnl },
])}

### Exit tag
${mdTable(byExitTag, [
    { label: 'Exit', get: (r) => r.key },
    { label: 'N', get: (r) => r.count },
    { label: 'Win%', get: (r) => r.winRatePct },
    { label: 'Total PnL', get: (r) => r.totalPnl },
    { label: 'Avg PnL%', get: (r) => r.avgPnlPct },
])}

### AI score bucket
${mdTable(byScore, [
    { label: 'Bucket', get: (r) => r.key },
    { label: 'N', get: (r) => r.count },
    { label: 'Win%', get: (r) => r.winRatePct },
    { label: 'Total PnL', get: (r) => r.totalPnl },
    { label: 'Avg PnL%', get: (r) => r.avgPnlPct },
])}

## 8. Timing (VN timezone)

### By hour opened
${mdTable(byHourVn, [
    { label: 'Hour', get: (r) => r.key },
    { label: 'N', get: (r) => r.count },
    { label: 'Win%', get: (r) => r.winRatePct },
    { label: 'Avg PnL%', get: (r) => r.avgPnlPct },
])}

### By day of week
${mdTable(byDowVn, [
    { label: 'DOW', get: (r) => r.key },
    { label: 'N', get: (r) => r.count },
    { label: 'Win%', get: (r) => r.winRatePct },
    { label: 'Total PnL', get: (r) => r.totalPnl },
    { label: 'Avg PnL%', get: (r) => r.avgPnlPct },
])}

### By month (closed)
${mdTable(byMonth, [
    { label: 'Month', get: (r) => r.key },
    { label: 'N', get: (r) => r.count },
    { label: 'Win%', get: (r) => r.winRatePct },
    { label: 'Total PnL', get: (r) => r.totalPnl },
    { label: 'Invested', get: (r) => r.totalInvested },
])}

### Monthly capital inflow (by open month)
${mdTable(monthlyInflow, [
    { label: 'Month', get: (r) => r.month },
    { label: 'Opened', get: (r) => r.tradesOpened },
    { label: 'Capital in', get: (r) => r.capitalIn },
    { label: 'Closed', get: (r) => r.closed },
    { label: 'PnL closed', get: (r) => r.pnlClosed },
])}

---

## 9. Open LIVE positions now

${mdTable(report.openPositions, [
    { label: 'Symbol', get: (r) => r.symbol },
    { label: 'Dir', get: (r) => r.direction },
    { label: 'Invested', get: (r) => r.investedAmount },
    { label: 'Entry', get: (r) => r.entryPrice },
    { label: 'Hold h', get: (r) => r.holdHoursSoFar },
    { label: 'Score', get: (r) => r.aiScore },
    { label: 'Opened', get: (r) => r.openedAt },
])}

---

## 10. Exchange orders (broker fills)

### LIVE environment
| Metric | Value |
| --- | --- |
| Total | ${exchangeLiveStats.total} |
| Filled / Failed | ${exchangeLiveStats.filled} / ${exchangeLiveStats.failed} |
| Fill rate | ${exchangeLiveStats.fillRatePct}% |
| Entries / Exits | ${exchangeLiveStats.entries} / ${exchangeLiveStats.exits} |
| Notional USDT sum / avg / min / max | ${exchangeLiveStats.notionalUSDT.sum} / ${exchangeLiveStats.notionalUSDT.avg} / ${exchangeLiveStats.notionalUSDT.min} / ${exchangeLiveStats.notionalUSDT.max} |

### TESTNET environment (for reference)
| Metric | Value |
| --- | --- |
| Total | ${exchangeTestnetStats.total} |
| Filled / Failed | ${exchangeTestnetStats.filled} / ${exchangeTestnetStats.failed} |
| Fill rate | ${exchangeTestnetStats.fillRatePct}% |

### Top LIVE fill errors
${mdTable(exchangeLiveStats.topErrors, [
    { label: 'Error', get: (r) => r.error.replace(/\|/g, '/') },
    { label: 'Count', get: (r) => r.count },
])}

---

## 11. LIVE packages (UserOrder)

| Metric | Value |
| --- | --- |
| Packages | ${packageStats.packages} |
| Total capital | ${packageStats.totalCapitalAll} |
| Used capital | ${packageStats.totalUsedCapital} |
| Realized PnL (packages) | ${packageStats.totalRealizedPnl} |

${mdTable(packageStats.byStatus, [
    { label: 'Status', get: (r) => r.status },
    { label: 'N', get: (r) => r.count },
    { label: 'Capital', get: (r) => r.totalCapital },
    { label: 'Realized PnL', get: (r) => r.realizedPnl },
])}

---

## 12. Manual LIVE trades (Telegram)

| Metric | Value |
| --- | --- |
| Closed | ${manualStats.counts.closed} |
| Win rate | ${manualStats.counts.winRatePct}% |
| Total PnL USDT | ${manualStats.pnl.total} |
| Avg size USDT | ${manualStats.capital.avgPerTrade} |
| Avg hold h | ${manualStats.holdTimeHours.avg} |

---

## Files in this export

- \`${path.basename(mdPath)}\` — báo cáo Markdown (đọc nhanh)
- \`${path.basename(jsonPath)}\` — dump JSON đầy đủ (máy đọc / Python)
- \`${path.basename(xlsxPath)}\` — Excel workbook 6 sheet:
  - **Trades LIVE** — từng lệnh AutoTrade LIVE
  - **Exchange Orders** — lệnh sàn LIVE + testnet
  - **Packages LIVE** — gói vốn UserOrder LIVE
  - **Theo Symbol** — thống kê theo mã
  - **Equity Curve** — NAV / drawdown theo thời gian
  - **Early vs Late 21d** — so sánh trước vs 21 ngày gần nhất

Mở file \`.xlsx\` trong Excel hoặc dùng JSON cho phân tích sâu hơn.
`;

    fs.writeFileSync(mdPath, md);

    const files = [
        { id: 'md', filePath: mdPath },
        { id: 'json', filePath: jsonPath },
        { id: 'xlsx', filePath: xlsxPath },
    ].map(({ id, filePath }) => {
        const meta = LIVE_EXPORT_FILE_CATALOG.find((f) => f.id === id);
        return {
            path: filePath,
            name: path.basename(filePath),
            kind: id,
            label: meta?.label || id,
            purpose: meta?.purpose || '',
            sheets: meta?.sheets,
            sizeBytes: fs.statSync(filePath).size,
        };
    });

    return {
        stamp,
        baseName: stamp,
        fileNamePattern: pattern,
        outputDir: OUT_DIR,
        generatedAt: report.generatedAt,
        dateRange: report.dateRange,
        files,
        fileCatalog: LIVE_EXPORT_FILE_CATALOG,
        summary: {
            autoTradeLive: autoLive.length,
            closed: closedAuto.length,
            open: openAuto.length,
            winRatePct: s.counts.winRatePct,
            totalPnlVnd: s.pnl.total,
            avgSizeVnd: s.capital.avgPerTrade,
            maxDrawdownVnd: s.pnl.maxDrawdown,
            maxDrawdownPctNavPeak: s.pnl.maxDrawdownPctOfNavPeak,
            exchangeOrdersLive: liveExchange.length,
            packages: packageRows.length,
            late21dWinRatePct: lateStats.counts.winRatePct,
            earlyWinRatePct: earlyStats.counts.winRatePct,
        },
    };
};
