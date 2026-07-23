import inquirer from 'inquirer';
import chalk from 'chalk';
import clear from 'clear';
import { exec } from 'child_process';
import { promisify } from 'util';

import apiClient from './apiClient.js';
import { buildMarketBuffer } from './views/marketView.js';
import {
    buildStockBuffer, buildAiReportLines, buildNewsLines, buildChartOnlyBuffer
} from './views/stockView.js';
import { buildDerivBuffer } from './views/derivView.js';
import {
    buildCryptoBuffer, buildCryptoChartBuffer, buildCryptoQuoteLines
} from './views/cryptoView.js';
import {
    ScreenBuffer, pager, LiveDashboard, getTermSize
} from './screenManager.js';
import {
    C, contentWidth, brandHeader, breadcrumb as themeBreadcrumb,
    badge, changeFmt, priceFmt, divider
} from './theme.js';

const execAsync = promisify(exec);

const BACK = '__BACK__';
const backChoice = (label = 'Back') => ({
    name: `${C.muted('←')}   ${label}`,
    value: BACK,
});
const withBack = (choices, label = 'Back') => [
    ...choices,
    new inquirer.Separator(C.muted('  ' + '·'.repeat(40))),
    backChoice(label),
];

/** Cached HOSE/HNX/UPCOM universe — used to block junk tickers before market scrape */
let _equityUniverse = null;

function isListedSymbolRow(s) {
    const sym = String(s?.symbol || '').toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(sym)) return false;
    if (['VNINDEX', 'HNXINDEX', 'UPCOMINDEX'].includes(sym)) return false;
    const ex = String(s.exchange || '').toUpperCase();
    const name = String(s.companyName || s.name || '').trim();
    if (['HOSE', 'HNX', 'UPCOM'].includes(ex) && name && name.toUpperCase() !== sym) return true;
    if (s.cafeF?.info?.Symbol || s.cafeF?.info?.San) return true;
    if (Array.isArray(s.cafeF?.finance) && s.cafeF.finance.length > 0) return true;
    return false;
}

async function loadEquityUniverse() {
    if (_equityUniverse) return _equityUniverse;
    const res = await apiClient.get('/symbols', { timeout: 20000 });
    const rows = Array.isArray(res.data) ? res.data : (res.data?.data || []);
    const map = new Map();
    for (const row of rows) {
        if (!isListedSymbolRow(row)) continue;
        const sym = String(row.symbol).toUpperCase();
        map.set(sym, {
            name: row.companyName || row.name || sym,
            exchange: row.exchange || '—',
        });
    }
    _equityUniverse = map;
    return map;
}

/**
 * Validate ticker against listing DB before any heavy /info|/history scrape.
 * @returns {{ ok: true, meta: object } | { ok: false, reason: string }}
 */
async function assertValidEquitySymbol(symbol) {
    if (!symbol) return { ok: false, reason: 'Empty ticker.' };
    if (!/^[A-Z0-9]{2,10}$/.test(symbol)) {
        return { ok: false, reason: 'Ticker must be 2–10 letters/digits (e.g. MBB, FPT, SSI).' };
    }

    const uni = await ui.spinner('Checking ticker against listing database...', loadEquityUniverse);
    if (uni.has(symbol)) {
        return { ok: true, meta: uni.get(symbol) };
    }

    // Not in DB — last chance: real candles (covers brand-new listings)
    try {
        const hist = await apiClient.get(`/history/${encodeURIComponent(symbol)}`, {
            params: { interval: '1 ngày' },
            timeout: 12000,
        });
        const bars = hist.data?.data || [];
        if (bars.length >= 5) {
            const meta = { name: symbol, exchange: '?' };
            uni.set(symbol, meta);
            return { ok: true, meta };
        }
    } catch { /* ignore */ }

    return {
        ok: false,
        reason: `${symbol} is not a listed VN equity (HOSE / HNX / UPCOM).`,
    };
}

//=======================================================================
// SHARED UTILITIES
//=======================================================================

export const ui = {
    separator: (char = '─') => divider(char),

    sectionTitle: (title) => {
        const w = contentWidth();
        const label = ` ${String(title).toUpperCase()} `;
        const padLen = Math.max(0, w - 4 - label.length);
        return `\n${C.accent(`──${label}${'─'.repeat(padLen)}`)}`;
    },

    badge: (text, tone = 'accent') => badge(text, tone),

    statusDot: (type) => {
        const dots = {
            bullish: C.up('●'),
            bearish: C.down('●'),
            warning: C.warn('●'),
            neutral: C.muted('●'),
        };
        return dots[type] || dots.neutral;
    },

    spinner: async (msg, fn) => {
        const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let i = 0;
        const interval = setInterval(() => {
            process.stdout.write(`\r${C.accent(frames[i++ % frames.length])}  ${C.muted(msg)}   `);
        }, 80);
        try {
            const result = await fn();
            clearInterval(interval);
            process.stdout.write('\r' + ' '.repeat(msg.length + 12) + '\r');
            return result;
        } catch (e) {
            clearInterval(interval);
            process.stdout.write('\r' + ' '.repeat(msg.length + 12) + '\r');
            throw e;
        }
    },

    numberColor: (val, decimals = 2) => changeFmt(val, decimals),
    formatPrice: (val) => priceFmt(val),
    tag: (text) => C.frame(`[${text}]`),
};

function errMsg(error) {
    if (!error) return 'Unknown error';
    if (error.response?.data?.message) return error.response.data.message;
    if (error.code === 'ECONNREFUSED') return 'Backend offline — start with npm run dev:backend';
    if (error.code === 'ECONNABORTED') return 'Request timed out';
    return error.message || String(error);
}

async function openInBrowser(url) {
    if (!url) return false;
    try {
        if (process.platform === 'win32') {
            await execAsync(`cmd /c start "" "${url.replace(/"/g, '')}"`);
        } else if (process.platform === 'darwin') {
            await execAsync(`open "${url}"`);
        } else {
            await execAsync(`xdg-open "${url}"`);
        }
        return true;
    } catch {
        return false;
    }
}

//=======================================================================
// HEADER
//=======================================================================

const showHeader = () => {
    clear();
    console.log('');
    brandHeader().forEach(l => console.log(l));
    console.log('');
};

const showBreadcrumb = (...parts) => {
    console.log(themeBreadcrumb(...parts) + '\n');
};

//=======================================================================
// PAUSE
//=======================================================================

const pause = async () => {
    console.log('\n' + divider());
    await inquirer.prompt([{
        type: 'input',
        name: 'continue',
        message: C.accent('↩') + C.muted('  Press [Enter] to return...')
    }]);
};

//=======================================================================
// MODULE 1: MARKET RADAR
//=======================================================================

const handleMarketRadar = async () => {
    showHeader();
    showBreadcrumb('Market Radar');

    const { mode } = await inquirer.prompt([{
        type: 'select',
        name: 'mode',
        message: C.title('View mode'),
        choices: withBack([
            { name: `${C.up('●')}  Live dashboard  ${C.muted('(refresh 10s — press q to exit)')}`, value: 'live' },
            { name: `${C.frame('○')}  Single shot     ${C.muted('(scroll + Enter to exit)')}`, value: 'once' },
        ], 'Back to main menu'),
    }]);
    if (mode === BACK) return;

    const fetchAndBuild = async () => {
        const res = await apiClient.get('/market-radar');
        const buf = buildMarketBuffer(res.data);
        const { cols } = getTermSize();
        const now = new Date().toLocaleTimeString('vi-VN');
        const left = badge('MARKET RADAR', 'live') + C.muted(`  ${now}`);
        const right = C.muted('q = exit');
        const gap = Math.max(2, cols - left.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length - 10);
        buf.lines.unshift(left + ' '.repeat(gap) + right, C.muted('─'.repeat(cols)));
        return buf;
    };

    if (mode === 'live') {
        const dash = new LiveDashboard(10_000);
        try {
            await dash.start(fetchAndBuild);
        } catch (err) {
            clear();
            console.log('\n' + badge('ERROR', 'down') + ' ' + C.down(errMsg(err)));
            await pause();
        }
    } else {
        try {
            const res = await ui.spinner('Scanning market flow matrix...', () =>
                apiClient.get('/market-radar')
            );
            const buf = buildMarketBuffer(res.data);
            await pager(buf.lines, 'MARKET RADAR', { exitLabel: 'Back to main menu' });
        } catch (error) {
            console.log('\n' + badge('CONNECTION ERROR', 'down') + ' ' + C.down(errMsg(error)));
            await pause();
        }
    }
};

//=======================================================================
// MODULE 2: STOCK ANALYSIS — interactive workspace
//=======================================================================

const CHART_INTERVALS = [
    { name: '1 phút', value: '1 phút' },
    { name: '5 phút', value: '5 phút' },
    { name: '15 phút', value: '15 phút' },
    { name: '30 phút', value: '30 phút' },
    { name: '1 giờ', value: '1 giờ' },
    { name: '4 giờ', value: '4 giờ' },
    { name: '1 ngày', value: '1 ngày' },
    { name: '1 tuần', value: '1 tuần' },
    { name: '1 tháng', value: '1 tháng' },
];

async function loadEquitySnapshot(symbol) {
    // Sequential spinners — parallel dual-spinners corrupt stdout / look like a hang
    const historyRes = await ui.spinner(`Syncing price history [${symbol}]...`, () =>
        apiClient.get(`/history/${symbol}`, { params: { interval: '1 ngày' }, timeout: 20000 })
    );
    const infoRes = await ui.spinner(`Loading market info [${symbol}]...`, () =>
        apiClient.get(`/info/${symbol}`, { timeout: 45000 })
    );

    let actionData = null;
    try {
        const actionRes = await ui.spinner(`Action panel [${symbol}] (optional)...`, () =>
            apiClient.post(
                `/action-panel/${symbol}`,
                { currentPrice: 0, priceReason: 'CLI Request' },
                { timeout: 25000 }
            )
        );
        actionData = actionRes.data?.data || null;
    } catch {
        actionData = null;
    }

    return {
        chartData: historyRes.data?.data || [],
        marketData: infoRes.data?.data,
        actionData,
        logs: infoRes.data?.logs || [],
    };
}

async function showEquityChart(symbol) {
    const { interval } = await inquirer.prompt([{
        type: 'select',
        name: 'interval',
        message: C.title('Chart interval'),
        choices: withBack(CHART_INTERVALS, 'Back to workspace'),
        default: '1 ngày',
    }]);
    if (interval === BACK) return;

    try {
        const res = await ui.spinner(`Loading ${symbol} candles (${interval})...`, () =>
            apiClient.get(`/history/${encodeURIComponent(symbol)}`, {
                params: { interval },
                timeout: 25000,
            })
        );
        const candles = res.data?.data || [];
        const buf = buildChartOnlyBuffer(candles, symbol, interval);
        await pager(buf.lines, `${symbol} · ${interval}`, { exitLabel: 'Back to Equity Workspace' });
    } catch (e) {
        console.log('\n' + badge('CHART ERROR', 'down') + ' ' + C.down(errMsg(e)));
        await pause();
    }
}

async function showLatestAi(symbol) {
    try {
        // Prefer /api/ai/... (proper mount). Flat /api/analyze alias used to drop ?query.
        const res = await ui.spinner(`Looking up cached AI report [${symbol}]...`, () =>
            apiClient.get(`/ai/analyze/latest/${encodeURIComponent(symbol)}`, { timeout: 15000 })
                .catch(() => apiClient.get(`/analyze/latest/${encodeURIComponent(symbol)}`, { timeout: 15000 }))
        );
        const payload = res.data?.data;
        const report = payload?.aiReport || res.data?.aiReport;
        if (!res.data?.success || !report) {
            console.log('\n' + badge('NO CACHE', 'warn') + C.muted(
                `  ${res.data?.message || 'No saved AI report. Run a new analysis from the menu.'}`
            ));
            await pause();
            return;
        }
        const meta = C.muted(`  Saved ${payload?.timestamp || '—'}${payload?.user ? ` · ${payload.user}` : ''}`);
        await pager(
            [meta, '', ...buildAiReportLines(report, symbol)],
            `AI CACHED — ${symbol}`,
            { exitLabel: 'Back to Equity Workspace' }
        );
    } catch (e) {
        console.log('\n' + badge('AI CACHE ERROR', 'down') + ' ' + C.down(errMsg(e)));
        await pause();
    }
}

async function runFreshAi(symbol, marketData, chartData) {
    const payload = {
        stockInfo: marketData.stockInfo,
        companyProfile: marketData.companyProfile,
        technicalData: (chartData || []).slice(-30),
        user: 'cli',
    };
    try {
        const aiRes = await ui.spinner('AI engine generating quantitative report (may take 1–3 min)...', () =>
            apiClient.post(`/analyze/${symbol}`, payload, { timeout: 240000 })
        );
        const report = aiRes.data?.aiReport || aiRes.data?.data?.aiReport;
        if (!report) {
            console.log('\n' + badge('EMPTY', 'warn') + C.muted('  AI returned no report body.'));
            await pause();
            return;
        }
        await pager(buildAiReportLines(report, symbol), `AI REPORT — ${symbol}`, {
            exitLabel: 'Back to Equity Workspace',
        });
    } catch (aiErr) {
        console.log('\n' + badge('AI ERROR', 'down') + ' ' + C.down(errMsg(aiErr)));
        await pause();
    }
}

async function showNewsWorkspace(symbol, seedNews = []) {
    let news = Array.isArray(seedNews) ? [...seedNews] : [];

    if (news.length === 0) {
        try {
            const info = await ui.spinner(`Loading news cache [${symbol}]...`, () =>
                apiClient.get(`/info/${symbol}`, { timeout: 30000 })
            );
            news = info.data?.data?.deepNewsData || [];
        } catch { /* keep empty */ }
    }

    const { newsAction } = await inquirer.prompt([{
        type: 'select',
        name: 'newsAction',
        message: C.title(`News · ${symbol}`),
        choices: withBack([
            { name: `${C.accent('01')}  View headlines  ${C.muted(`(${news.length} cached)`)}`, value: 'VIEW' },
            { name: `${C.accent('02')}  Refresh via AI search`, value: 'REFRESH' },
        ], 'Back to workspace'),
    }]);

    if (newsAction === BACK) return;

    if (newsAction === 'REFRESH') {
        try {
            const res = await ui.spinner(`AI news search [${symbol}]...`, () =>
                apiClient.get(`/ai-news/${symbol}`, { params: { mode: 'balanced' }, timeout: 90000 })
            );
            const fresh = res.data?.data || [];
            if (fresh.length) news = fresh;
            else console.log(C.warn('\n  AI search returned no new articles.'));
        } catch (e) {
            console.log('\n' + badge('NEWS ERROR', 'down') + ' ' + C.down(errMsg(e)));
            await pause();
            return;
        }
    }

    if (!news.length) {
        console.log(C.warn('\n  No news available for this ticker yet.'));
        await pause();
        return;
    }

    await pager(buildNewsLines(news, symbol, 12, { withLinks: true }), `NEWS — ${symbol}`, {
        exitLabel: 'Back to Equity Workspace',
    });

    const linkChoices = news
        .filter(n => n.link)
        .slice(0, 12)
        .map((n, i) => ({
            name: `${C.accent(String(i + 1).padStart(2, '0'))}  ${(n.title || n.link).slice(0, 70)}`,
            value: n.link,
        }));

    if (linkChoices.length === 0) return;

        const { openUrl } = await inquirer.prompt([{
        type: 'select',
        name: 'openUrl',
        message: C.title('Open in browser'),
        choices: [
            ...linkChoices,
            new inquirer.Separator(C.muted('  ' + '·'.repeat(40))),
            { name: C.muted('Skip / Back'), value: null },
        ],
        pageSize: 14,
    }]);

    if (openUrl) {
        const ok = await openInBrowser(openUrl);
        console.log(ok
            ? C.up('\n  Opened in default browser.')
            : C.warn('\n  Could not launch browser. URL:\n  ') + C.floor(openUrl)
        );
        await pause();
    }
}

async function equityWorkspace(symbol, snapshot) {
    let { chartData, marketData, actionData } = snapshot;

    let browsing = true;
    while (browsing) {
        console.log('');
        const price = marketData?.stockInfo?.currentPrice || '—';
        const chg = marketData?.stockInfo?.changePercent;
        console.log(
            `  ${C.accentBold(symbol)}  ${C.value(price)}` +
            (chg != null ? '  ' + changeFmt(chg) : '') +
            C.muted('  ·  choose an action')
        );

        const { action } = await inquirer.prompt([{
            type: 'select',
            name: 'action',
            message: C.title('EQUITY WORKSPACE'),
            pageSize: 12,
            choices: [
                { name: `${C.accent('01')}  Overview          ${C.muted('price · tech · valuation')}`, value: 'OVERVIEW' },
                { name: `${C.accent('02')}  Chart             ${C.muted('pick interval · candles')}`, value: 'CHART' },
                { name: `${C.accent('03')}  Latest AI report  ${C.muted('cached in DB if any')}`, value: 'AI_LATEST' },
                { name: `${C.accent('04')}  Run new AI        ${C.muted('fresh deep analysis')}`, value: 'AI_NEW' },
                { name: `${C.accent('05')}  News              ${C.muted('headlines · open links')}`, value: 'NEWS' },
                { name: `${C.accent('06')}  Refresh data`, value: 'REFRESH' },
                new inquirer.Separator(C.muted('  ' + '·'.repeat(48))),
                backChoice('Back to main menu'),
            ],
        }]);

        switch (action) {
            case 'OVERVIEW':
                await pager(
                    buildStockBuffer(marketData, chartData, actionData).lines,
                    `${symbol} — EQUITY DETAIL`,
                    { exitLabel: 'Back to Equity Workspace' }
                );
                break;
            case 'CHART':
                await showEquityChart(symbol);
                break;
            case 'AI_LATEST':
                await showLatestAi(symbol);
                break;
            case 'AI_NEW':
                await runFreshAi(symbol, marketData, chartData);
                break;
            case 'NEWS':
                await showNewsWorkspace(symbol, marketData?.deepNewsData || []);
                break;
            case 'REFRESH':
                try {
                    const fresh = await loadEquitySnapshot(symbol);
                    chartData = fresh.chartData;
                    marketData = fresh.marketData;
                    actionData = fresh.actionData;
                    console.log(C.up('\n  Data refreshed.'));
                } catch (e) {
                    console.log('\n' + badge('REFRESH ERROR', 'down') + ' ' + C.down(errMsg(e)));
                    await pause();
                }
                break;
            case BACK:
                browsing = false;
                break;
        }
    }
}

const handleStockAnalysis = async () => {
    showHeader();
    showBreadcrumb('Equity Lookup');

    while (true) {
        const { symbol } = await inquirer.prompt([{
            type: 'input',
            name: 'symbol',
            message: C.title('Ticker') + C.muted(' (e.g. MBB, SSI — empty = back)'),
            filter: (val) => val.toUpperCase().trim(),
        }]);

        if (!symbol) return;
        console.log();

        try {
            const check = await assertValidEquitySymbol(symbol);
            if (!check.ok) {
                console.log('\n' + badge('INVALID TICKER', 'down') + ' ' + C.down(check.reason));
                console.log(C.muted('  Enter another ticker, or leave blank to go back.\n'));
                continue;
            }
            console.log(
                C.muted('  ') +
                C.accentBold(symbol) +
                C.muted(`  ·  ${check.meta?.name || ''}  ·  ${check.meta?.exchange || ''}`)
            );

            const snapshot = await loadEquitySnapshot(symbol);
            const { marketData, chartData, logs } = snapshot;

            if (!marketData || !marketData.stockInfo) {
                console.log('\n' + badge('NOT FOUND', 'down') + C.down(`  ${symbol} missing or offline.`));
                console.log(C.muted('  Enter another ticker, or leave blank to go back.\n'));
                continue;
            }

            // Extra gate: listed but no tradeable data
            const priceRaw = String(marketData.stockInfo.currentPrice || '').replace(/[^\d.]/g, '');
            const hasPrice = parseFloat(priceRaw) > 0;
            const hasBars = Array.isArray(chartData) && chartData.length > 0;
            if (!hasPrice && !hasBars) {
                console.log('\n' + badge('NO MARKET DATA', 'warn') + C.muted(
                    `  ${symbol} is listed but has no price/candles right now.`
                ));
                console.log(C.muted('  Enter another ticker, or leave blank to go back.\n'));
                continue;
            }

            if (logs.length > 0) {
                console.log(C.muted('\n  System log:'));
                logs.slice(0, 6).forEach(l => console.log(C.muted('  · ' + l)));
            }

            await equityWorkspace(symbol, snapshot);
            return;
        } catch (error) {
            console.log('\n' + badge('SYSTEM ERROR', 'down') + ' ' + C.down(errMsg(error)));
            console.log(C.muted('  Enter another ticker, or leave blank to go back.\n'));
        }
    }
};

//=======================================================================
// MODULE 3: DERIVATIVES — overview + chart workspace
//=======================================================================

const DERIV_INTERVALS = [
    { name: '1 phút', value: '1 phút' },
    { name: '5 phút', value: '5 phút' },
    { name: '15 phút', value: '15 phút' },
    { name: '30 phút', value: '30 phút' },
    { name: '1 giờ', value: '1 giờ' },
    { name: '1 ngày', value: '1 ngày' },
];

async function buildDerivOverviewBuffer() {
    const [radarRes, chartRes] = await Promise.all([
        apiClient.get('/deriv-radar'),
        apiClient.get('/history/VN30F1M', { params: { interval: '5 phút' } }).catch(() => ({ data: { data: [] } }))
    ]);

    const derivRadar = radarRes.data?.data;
    const derivChart = chartRes.data?.data || [];

    let volumeProfile = null;
    if (derivChart.length > 0) {
        const binsCount = 12;
        let minP = Math.min(...derivChart.map(d => d.low));
        let maxP = Math.max(...derivChart.map(d => d.high));
        if (maxP === minP) { maxP += 1; minP -= 1; }
        const binSize = (maxP - minP) / binsCount;
        const bins = Array.from({ length: binsCount }, (_, i) => ({
            priceCenter: (minP + (i + 0.5) * binSize).toFixed(1), volume: 0
        }));
        let maxVol = 0; let pocPrice = 0;
        derivChart.forEach(candle => {
            const tp = (candle.high + candle.low + candle.close) / 3;
            const idx = Math.min(Math.floor((tp - minP) / binSize), binsCount - 1);
            if (idx >= 0 && idx < binsCount) {
                bins[idx].volume += candle.volume;
                if (bins[idx].volume > maxVol) { maxVol = bins[idx].volume; pocPrice = bins[idx].priceCenter; }
            }
        });
        volumeProfile = { bins: bins.reverse(), maxVol, pocPrice };
    }

    if (!derivRadar) {
        const buf = new ScreenBuffer();
        buf.line(C.warn('  No derivatives data available.'));
        return buf;
    }

    const basisNum = parseFloat(derivRadar.basis || 0);
    const basisSpeedNum = parseFloat(derivRadar.basisSpeed || 0);
    const foreignNetNum = parseFloat(derivRadar.foreignNet || 0);
    let mechAction = 'QUAN SÁT'; let mechTrend = 'TÍCH LŨY'; let score = 50;
    if (basisNum > 2 && foreignNetNum > 0) { mechAction = 'LONG TIẾP CẬN'; mechTrend = 'TĂNG'; score = 72; }
    else if (basisNum < -2 && foreignNetNum < 0) { mechAction = 'SHORT TIẾP CẬN'; mechTrend = 'GIẢM'; score = 28; }
    else if (basisNum > 0 && basisSpeedNum > 0) { mechAction = 'QUAN SÁT LONG'; mechTrend = 'PHÂN HÓA'; score = 60; }
    else if (basisNum < 0 && basisSpeedNum < 0) { mechAction = 'QUAN SÁT SHORT'; mechTrend = 'PHÂN HÓA'; score = 40; }

    const basePrice = parseFloat(derivRadar.vn30f1m) || 0;
    const derivAnalysis = {
        score, mechAction, mechTrend,
        pocDistance: Math.abs(basisNum).toFixed(2) + '%',
        sl: (basePrice - 3.5).toFixed(1), tp1: (basePrice + 2.5).toFixed(1),
        tp2: (basePrice + 5.0).toFixed(1), rrRatio: '1:1.5',
        mechReason: basisNum > 0
            ? `Basis dương ${basisNum.toFixed(2)} điểm → Kỳ vọng lạc quan. Theo dõi hỗ trợ kỹ thuật.`
            : `Basis âm ${basisNum.toFixed(2)} điểm → Áp lực bán. Thận trọng vùng kháng cự.`,
    };

    const buf = buildDerivBuffer(derivRadar, derivAnalysis, volumeProfile);
    const { cols } = getTermSize();
    const now = new Date().toLocaleTimeString('vi-VN');
    const left = badge('VN30F1M', 'accent') + C.muted(`  ${now}`);
    const right = C.muted('q = exit');
    const gap = Math.max(2, cols - 28);
    buf.lines.unshift(left + ' '.repeat(gap) + right, C.muted('─'.repeat(cols)));
    return buf;
}

async function showDerivChart() {
    const { interval } = await inquirer.prompt([{
        type: 'select',
        name: 'interval',
        message: C.title('VN30F1M chart interval'),
        choices: withBack(DERIV_INTERVALS, 'Back to workspace'),
        default: '5 phút',
    }]);
    if (interval === BACK) return;

    try {
        const res = await ui.spinner(`Loading VN30F1M (${interval})...`, () =>
            apiClient.get('/history/VN30F1M', {
                params: { interval },
                timeout: 25000,
            })
        );
        const candles = res.data?.data || [];
        const buf = buildChartOnlyBuffer(candles, 'VN30F1M', interval);
        await pager(buf.lines, `VN30F1M · ${interval}`, { exitLabel: 'Back to Derivatives Workspace' });
    } catch (e) {
        console.log('\n' + badge('CHART ERROR', 'down') + ' ' + C.down(errMsg(e)));
        await pause();
    }
}

async function showDerivOverviewModes() {
    const { mode } = await inquirer.prompt([{
        type: 'select',
        name: 'mode',
        message: C.title('Overview mode'),
        choices: withBack([
            { name: `${C.up('●')}  Live dashboard  ${C.muted('(refresh 5s — press q to exit)')}`, value: 'live' },
            { name: `${C.frame('○')}  Single shot     ${C.muted('(scroll + Enter to exit)')}`, value: 'once' },
        ], 'Back to workspace'),
    }]);
    if (mode === BACK) return;

    if (mode === 'live') {
        const dash = new LiveDashboard(5_000);
        try {
            await dash.start(buildDerivOverviewBuffer);
        } catch (err) {
            clear();
            console.log('\n' + badge('ERROR', 'down') + ' ' + C.down(errMsg(err)));
            await pause();
        }
    } else {
        try {
            const buf = await ui.spinner('Loading VN30F1M realtime...', buildDerivOverviewBuffer);
            await pager(buf.lines, 'DERIVATIVES VN30F1M', { exitLabel: 'Back to Derivatives Workspace' });
        } catch (error) {
            console.log('\n' + badge('API ERROR', 'down') + ' ' + C.down(errMsg(error)));
            await pause();
        }
    }
}

const handleDerivatives = async () => {
    showHeader();
    showBreadcrumb('Derivatives VN30F1M');

    let browsing = true;
    while (browsing) {
        console.log('');
        console.log(`  ${C.accentBold('VN30F1M')}` + C.muted('  ·  choose an action'));

        const { action } = await inquirer.prompt([{
            type: 'select',
            name: 'action',
            message: C.title('DERIVATIVES WORKSPACE'),
            pageSize: 10,
            choices: [
                { name: `${C.accent('01')}  Overview          ${C.muted('basis · OI · plan · live/once')}`, value: 'OVERVIEW' },
                { name: `${C.accent('02')}  Chart             ${C.muted('pick interval · candles')}`, value: 'CHART' },
                new inquirer.Separator(C.muted('  ' + '·'.repeat(48))),
                backChoice('Back to main menu'),
            ],
        }]);

        switch (action) {
            case 'OVERVIEW':
                await showDerivOverviewModes();
                break;
            case 'CHART':
                await showDerivChart();
                break;
            case BACK:
                browsing = false;
                break;
        }
    }
};

//=======================================================================
// MODULE 4: CRYPTO — market overview + chart workspace
//=======================================================================

const CRYPTO_INTERVALS = [
    { name: '15 phút', value: '15m' },
    { name: '1 giờ', value: '1h' },
    { name: '4 giờ', value: '4h' },
    { name: '1 ngày', value: '1d' },
    { name: '1 tuần', value: '1w' },
];

async function loadCryptoMarketSnapshot() {
    const [moversRes, radarRes] = await Promise.all([
        apiClient.get('/crypto/top-movers', { timeout: 20000 }),
        apiClient.get('/crypto/radar', { timeout: 15000 }).catch(() => ({ data: null })),
    ]);
    const movers = moversRes.data?.data || {};
    let markets = movers.markets || [];

    // Fallback when backend cache is stale (symbols-only / no markets array)
    if (!markets.length) {
        const majors = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'LINK', 'TRX', 'TON'];
        const priced = await Promise.all(majors.map(async (s) => {
            try {
                const r = await apiClient.get(`/crypto/price/${s}`, {
                    params: { interval: '1d' },
                    timeout: 20000,
                });
                const d = r.data?.data;
                if (!d?.currentPrice) return null;
                // Prefer numeric vol from last candles; API volume24h is often a formatted string
                const lastBars = (d.candles || []).slice(-24);
                const rawVol = lastBars.reduce((sum, c) => sum + (parseFloat(c.volume) || 0), 0);
                return {
                    symbol: s,
                    name: s,
                    currentPrice: d.currentPrice,
                    change24h: d.change24h,
                    marketCap: d.marketCap || 0,
                    volume24h: rawVol > 0 ? rawVol : (d.volume24h || 0),
                };
            } catch {
                return null;
            }
        }));
        markets = priced.filter(Boolean);
    }

    return {
        markets,
        gainers: movers.gainers || [],
        losers: movers.losers || [],
        radar: radarRes.data?.data || null,
    };
}

async function showCryptoChart(symbol) {
    const { interval } = await inquirer.prompt([{
        type: 'select',
        name: 'interval',
        message: C.title(`Chart · ${symbol}`),
        choices: withBack(CRYPTO_INTERVALS, 'Back to workspace'),
        default: '4h',
    }]);
    if (interval === BACK) return;

    try {
        // Prefer /crypto/price which returns candles + quote; fallback to /crypto/history
        let candles = [];
        let quote = null;
        try {
            const priceRes = await ui.spinner(`Loading ${symbol} (${interval})...`, () =>
                apiClient.get(`/crypto/price/${encodeURIComponent(symbol)}`, {
                    params: { interval },
                    timeout: 30000,
                })
            );
            if (priceRes.data?.success && priceRes.data?.data) {
                quote = priceRes.data.data;
                candles = quote.candles || [];
            }
        } catch { /* fall through */ }

        if (!candles.length) {
            const histRes = await ui.spinner(`Loading history ${symbol}...`, () =>
                apiClient.get(`/crypto/history/${encodeURIComponent(symbol)}`, {
                    params: { interval },
                    timeout: 30000,
                })
            );
            candles = histRes.data?.data || [];
        }

        const lines = [];
        if (quote) lines.push(...buildCryptoQuoteLines(quote));
        lines.push(...buildCryptoChartBuffer(candles, symbol, interval).lines);
        await pager(lines, `${symbol} · ${interval}`, { exitLabel: 'Back to Crypto Workspace' });
    } catch (e) {
        console.log('\n' + badge('CHART ERROR', 'down') + ' ' + C.down(errMsg(e)));
        await pause();
    }
}

async function showCryptoNews(symbol) {
    try {
        const res = await ui.spinner(`Fetching news [${symbol}]...`, () =>
            apiClient.get(`/crypto/news/${encodeURIComponent(symbol)}`, { timeout: 45000 })
        );
        const news = res.data?.data || [];
        if (!news.length) {
            console.log(C.warn('\n  No crypto news found.'));
            await pause();
            return;
        }
        await pager(buildNewsLines(news, symbol, 12, { withLinks: true }), `CRYPTO NEWS — ${symbol}`, {
            exitLabel: 'Back to Crypto Workspace',
        });

        const linkChoices = news.filter(n => n.link).slice(0, 10).map((n, i) => ({
            name: `${C.accent(String(i + 1).padStart(2, '0'))}  ${(n.title || n.link).slice(0, 70)}`,
            value: n.link,
        }));
        if (!linkChoices.length) return;

        const { openUrl } = await inquirer.prompt([{
            type: 'select',
            name: 'openUrl',
            message: C.title('Open in browser'),
            choices: [
                ...linkChoices,
                new inquirer.Separator(C.muted('  ' + '·'.repeat(40))),
                { name: C.muted('Skip / Back'), value: null },
            ],
            pageSize: 12,
        }]);
        if (openUrl) {
            const ok = await openInBrowser(openUrl);
            console.log(ok ? C.up('\n  Opened in browser.') : C.warn('\n  URL: ') + C.floor(openUrl));
            await pause();
        }
    } catch (e) {
        console.log('\n' + badge('NEWS ERROR', 'down') + ' ' + C.down(errMsg(e)));
        await pause();
    }
}

async function cryptoWorkspace(snapshot) {
    let data = snapshot;
    let browsing = true;

    while (browsing) {
        console.log('');
        const btc = data.markets?.find(c => c.symbol === 'BTC');
        console.log(
            `  ${C.accentBold('CRYPTO')}` +
            (btc ? `  BTC ${C.value('$' + Number(btc.currentPrice).toLocaleString())} ${changeFmt(btc.change24h)}` : '') +
            C.muted('  ·  choose an action')
        );

        const { action } = await inquirer.prompt([{
            type: 'select',
            name: 'action',
            message: C.title('CRYPTO WORKSPACE'),
            pageSize: 10,
            choices: [
                { name: `${C.accent('01')}  Market overview   ${C.muted('top 20 · movers · F&G')}`, value: 'OVERVIEW' },
                { name: `${C.accent('02')}  Chart             ${C.muted('pick coin · interval')}`, value: 'CHART' },
                { name: `${C.accent('03')}  News              ${C.muted('headlines · open links')}`, value: 'NEWS' },
                { name: `${C.accent('04')}  Refresh data`, value: 'REFRESH' },
                new inquirer.Separator(C.muted('  ' + '·'.repeat(48))),
                backChoice('Back to main menu'),
            ],
        }]);

        switch (action) {
            case 'OVERVIEW':
                await pager(buildCryptoBuffer(data).lines, 'CRYPTO GLOBAL MARKET', {
                    exitLabel: 'Back to Crypto Workspace',
                });
                break;
            case 'CHART': {
                const defaults = (data.markets || []).slice(0, 12).map(c => c.symbol);
                const { pick } = await inquirer.prompt([{
                    type: 'select',
                    name: 'pick',
                    message: C.title('Select coin'),
                    choices: withBack([
                        ...defaults.map(s => ({ name: s, value: s })),
                        new inquirer.Separator(C.muted('  ' + '·'.repeat(24))),
                        { name: C.muted('Type another symbol…'), value: '__CUSTOM__' },
                    ], 'Back to workspace'),
                    pageSize: 16,
                }]);
                if (pick === BACK) break;
                let symbol = pick;
                if (pick === '__CUSTOM__') {
                    const ans = await inquirer.prompt([{
                        type: 'input',
                        name: 'symbol',
                        message: C.title('Symbol') + C.muted(' (e.g. BTC — empty = back)'),
                        filter: v => v.toUpperCase().trim(),
                    }]);
                    symbol = ans.symbol;
                }
                if (symbol) await showCryptoChart(symbol);
                break;
            }
            case 'NEWS': {
                const { symbol } = await inquirer.prompt([{
                    type: 'input',
                    name: 'symbol',
                    message: C.title('News for') + C.muted(' (default BTC, empty = back)'),
                    default: 'BTC',
                    filter: v => v.toUpperCase().trim(),
                }]);
                if (!symbol) break;
                await showCryptoNews(symbol);
                break;
            }
            case 'REFRESH':
                try {
                    data = await ui.spinner('Refreshing crypto markets...', loadCryptoMarketSnapshot);
                    console.log(C.up('\n  Data refreshed.'));
                } catch (e) {
                    console.log('\n' + badge('REFRESH ERROR', 'down') + ' ' + C.down(errMsg(e)));
                    await pause();
                }
                break;
            case BACK:
                browsing = false;
                break;
        }
    }
}

const handleCryptoRadar = async () => {
    showHeader();
    showBreadcrumb('Crypto Global');

    try {
        const snapshot = await ui.spinner('Scanning crypto markets (CoinGecko)...', loadCryptoMarketSnapshot);
        if (!snapshot.markets.length && !snapshot.gainers.length) {
            console.log('\n' + C.warn('  No crypto data. CoinGecko may be rate-limited — try again shortly.'));
            await pause();
            return;
        }
        await cryptoWorkspace(snapshot);
    } catch (error) {
        console.log('\n' + badge('API ERROR', 'down') + ' ' + C.down(errMsg(error)));
        await pause();
    }
};

//=======================================================================
// MAIN MENU
//=======================================================================

const startOmniTerminal = async () => {
    let running = true;

    while (running) {
        showHeader();
        console.log(C.muted('  Use ↑↓ to select a module, then Enter\n'));

        const { action } = await inquirer.prompt([{
            type: 'select',
            name: 'action',
            message: C.accentBold('MODULES'),
            pageSize: 10,
            choices: [
                {
                    name: `${C.accent('01')}  ${C.title('Market Radar')}        ${C.muted('VN-Index · flow · sector SPS')}`,
                    value: 'RADAR'
                },
                {
                    name: `${C.accent('02')}  ${C.title('Equity Lookup')}       ${C.muted('Fundamentals · chart · AI · news')}`,
                    value: 'STOCK'
                },
                {
                    name: `${C.accent('03')}  ${C.title('Derivatives')}         ${C.muted('VN30F1M · chart · basis · plan')}`,
                    value: 'DERIVATIVES'
                },
                {
                    name: `${C.accent('04')}  ${C.title('Crypto Global')}       ${C.muted('Top markets · chart · news')}`,
                    value: 'CRYPTO'
                },
                new inquirer.Separator(C.muted('  ' + '·'.repeat(52))),
                {
                    name: `${C.down('✕')}   ${C.title('Exit')}`,
                    value: 'EXIT'
                }
            ]
        }]);

        switch (action) {
            case 'RADAR': await handleMarketRadar(); break;
            case 'STOCK': await handleStockAnalysis(); break;
            case 'DERIVATIVES': await handleDerivatives(); break;
            case 'CRYPTO': await handleCryptoRadar(); break;
            case 'EXIT': {
                clear();
                const w = contentWidth();
                console.log('\n' + C.accent('╭' + '─'.repeat(w - 2) + '╮'));
                console.log(
                    C.accent('│') +
                    '  ' +
                    C.title('Session closed.') + C.muted('  OMNI DUCK offline.') +
                    ' '.repeat(Math.max(0, w - 42)) +
                    C.accent('│')
                );
                console.log(C.accent('╰' + '─'.repeat(w - 2) + '╯') + '\n');
                running = false;
                process.exit(0);
            }
        }
    }
};

process.on('uncaughtException', (err) => {
    console.error('\n' + badge('CRASH', 'down') + ' ' + C.down(err?.message || err));
});
process.on('unhandledRejection', (err) => {
    console.error('\n' + badge('UNHANDLED', 'down') + ' ' + C.down(err?.message || err));
});

startOmniTerminal();
