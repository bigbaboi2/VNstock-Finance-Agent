/**
 * charts.js — ANSI chart primitives for OMNI DUCK CLI
 * Pure string output, no extra dependencies.
 */
import chalk from 'chalk';
import { C, pad, visibleLen } from './theme.js';

const BLOCKS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const BRAILLE = [' ', '⠄', '⠆', '⠇', '⡇', '⡏', '⡟', '⡿', '⣿'];

/**
 * OHLC candlestick chart.
 * @param {Array<{open,high,low,close,volume?}>} ohlc
 * @param {{width?:number,height?:number,showVolume?:boolean}} opts
 * @returns {string[]}
 */
export function renderCandles(ohlc, opts = {}) {
    const height = opts.height || 11;
    const showVolume = opts.showVolume !== false;
    if (!ohlc || ohlc.length === 0) return [C.muted('  (no chart data)')];

    const maxBars = opts.width || Math.min(ohlc.length, 64);
    const candles = ohlc.slice(-maxBars);
    const highs = candles.map(c => parseFloat(c.high));
    const lows = candles.map(c => parseFloat(c.low));
    const minP = Math.min(...lows);
    const maxP = Math.max(...highs);
    const range = maxP - minP || 1;

    const yOf = (price) => {
        const t = (price - minP) / range;
        return Math.max(0, Math.min(height - 1, Math.round(t * (height - 1))));
    };

    // grid[row][col] — row 0 = top (max price)
    const grid = Array.from({ length: height }, () =>
        Array.from({ length: candles.length }, () => ({ ch: ' ', color: null }))
    );

    candles.forEach((c, i) => {
        const o = parseFloat(c.open);
        const h = parseFloat(c.high);
        const l = parseFloat(c.low);
        const cl = parseFloat(c.close);
        const up = cl >= o;
        const color = up ? C.up : C.down;
        const yH = yOf(h);
        const yL = yOf(l);
        const yO = yOf(o);
        const yC = yOf(cl);
        const bodyTop = Math.max(yO, yC);
        const bodyBot = Math.min(yO, yC);

        for (let y = yL; y <= yH; y++) {
            const row = height - 1 - y;
            let ch = '│';
            if (y >= bodyBot && y <= bodyTop) {
                ch = bodyTop === bodyBot ? '━' : '┃';
            }
            grid[row][i] = { ch, color };
        }
    });

    const labelW = 12;
    const fmtPrice = (p) => {
        const v = p * 1000;
        return Math.round(v).toLocaleString('vi-VN');
    };

    const lines = [];
    lines.push(C.title('  PRICE CHART') + C.muted(`  ${candles.length} bars`));
    lines.push('');

    for (let r = 0; r < height; r++) {
        const priceAtRow = maxP - (r / (height - 1)) * range;
        const showLabel = r === 0 || r === height - 1 || r === Math.floor(height / 2);
        const label = showLabel ? C.muted(pad(fmtPrice(priceAtRow), labelW, 'right')) : pad('', labelW);
        const rowStr = grid[r].map(cell =>
            cell.color ? cell.color(cell.ch) : C.muted(cell.ch === ' ' ? '·' : cell.ch)
        ).join('');
        lines.push(`  ${label} ${C.frameDim('│')} ${rowStr}`);
    }

    if (showVolume) {
        const volumes = candles.map(c => parseInt(c.volume || 0, 10));
        const maxV = Math.max(...volumes, 1);
        const volLine = candles.map((c, i) => {
            const level = Math.round((volumes[i] / maxV) * 7);
            const up = parseFloat(c.close) >= parseFloat(c.open);
            const ch = BLOCKS[level];
            return up ? C.up(ch) : C.down(ch);
        }).join('');
        lines.push(`  ${pad(C.muted('VOL'), labelW, 'right')} ${C.frameDim('│')} ${volLine}`);
    }

    // Last 3 sessions summary
    lines.push('');
    lines.push(C.muted('  Recent sessions (O / H / L / C):'));
    candles.slice(-3).forEach(c => {
        const up = parseFloat(c.close) >= parseFloat(c.open);
        const clr = up ? C.up : C.down;
        const arrow = up ? '▲' : '▼';
        const fmt = v => Math.round(parseFloat(v) * 1000).toLocaleString('vi-VN');
        const dateStr = c.date
            ? new Date(c.date * 1000 || c.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
            : (c.time
                ? String(c.time).slice(5, 16)
                : '--/--');
        lines.push(
            `  ${clr(arrow)} ${C.muted(dateStr)}` +
            `  ${C.muted('O')} ${clr(fmt(c.open))}` +
            `  ${C.muted('H')} ${C.white(fmt(c.high))}` +
            `  ${C.muted('L')} ${C.white(fmt(c.low))}` +
            `  ${C.muted('C')} ${clr.bold ? clr.bold(fmt(c.close)) : clr(fmt(c.close))}`
        );
    });

    return lines;
}

/**
 * Dense sparkline from a numeric series.
 * @param {number[]} series
 * @param {number} width
 * @param {{braille?:boolean,colorize?:boolean}} opts
 * @returns {string}
 */
export function renderSparkline(series, width = 40, opts = {}) {
    if (!series || series.length === 0) return C.muted('─'.repeat(width));
    const useBraille = opts.braille !== false;
    const chars = useBraille ? BRAILLE : BLOCKS;
    const maxLevel = chars.length - 1;

    const step = Math.max(1, Math.floor(series.length / width));
    const sampled = [];
    for (let i = 0; i < width; i++) {
        const idx = Math.min(series.length - 1, i * step);
        sampled.push(series[idx]);
    }

    const min = Math.min(...sampled);
    const max = Math.max(...sampled);
    const range = max - min || 1;
    const first = sampled[0];
    const last = sampled[sampled.length - 1];
    const up = last >= first;

    return sampled.map(v => {
        const level = Math.round(((v - min) / range) * maxLevel);
        const ch = chars[level];
        if (opts.colorize === false) return C.muted(ch);
        return up ? C.up(ch) : C.down(ch);
    }).join('');
}

/**
 * Horizontal volume profile bars.
 * @param {Array<{priceCenter,volume}>} bins
 * @param {number} maxVol
 * @param {{width?:number,pocPrice?:string|number,maxRows?:number}} opts
 * @returns {string[]}
 */
export function renderVolumeProfile(bins, maxVol, opts = {}) {
    const barW = opts.width || 28;
    const maxRows = opts.maxRows || 10;
    const poc = opts.pocPrice;
    if (!bins || bins.length === 0) return [C.muted('  (no volume profile)')];

    const lines = [];
    lines.push(C.title('  VOLUME PROFILE') + (poc != null ? C.muted(`  POC ${poc}`) : ''));
    lines.push('');

    const slice = bins.slice(0, maxRows);
    const peak = maxVol || Math.max(...slice.map(b => b.volume || 0), 1);

    slice.forEach(b => {
        const isPoc = String(b.priceCenter) === String(poc);
        const len = Math.max(1, Math.round(((b.volume || 0) / peak) * barW));
        const bar = '█'.repeat(len) + '░'.repeat(Math.max(0, barW - len));
        const vol = parseInt(b.volume || 0, 10).toLocaleString('vi-VN');
        const price = String(b.priceCenter).padStart(8);
        if (isPoc) {
            lines.push(`  ${C.accentBold(price)}  ${C.accent(bar)}  ${C.accentBold('POC')} ${C.accent(vol)}`);
        } else {
            lines.push(`  ${C.muted(price)}  ${C.frameDim(bar)}  ${C.muted(vol)}`);
        }
    });
    return lines;
}

/**
 * Score / confluence gauge bar.
 * @param {number} score 0–100
 * @param {number} width
 * @returns {string}
 */
export function renderGauge(score, width = 24) {
    const s = Math.max(0, Math.min(100, Number(score) || 0));
    const filled = Math.round((s / 100) * width);
    let color = C.warn;
    if (s >= 65) color = C.up;
    else if (s <= 35) color = C.down;
    const bar = color('█'.repeat(filled)) + C.muted('░'.repeat(width - filled));
    return `${bar} ${C.value(String(Math.round(s)))}${C.muted('/100')}`;
}

/**
 * Mini trend bar for a single change percent (−10..+10 mapped).
 * @param {number|string} changePct
 * @param {number} width
 * @returns {string}
 */
export function renderMiniTrend(changePct, width = 7) {
    const n = parseFloat(changePct) || 0;
    const mid = Math.floor(width / 2);
    const cells = Array(width).fill(C.muted('·'));
    const magnitude = Math.min(mid, Math.round(Math.abs(n) / 2));
    if (n > 0) {
        for (let i = 0; i < magnitude; i++) cells[mid + i] = C.up('▮');
        cells[mid] = C.upBold('▲');
    } else if (n < 0) {
        for (let i = 0; i < magnitude; i++) cells[mid - i] = C.down('▮');
        cells[mid] = C.downBold('▼');
    } else {
        cells[mid] = C.muted('━');
    }
    return cells.join('');
}

export { visibleLen };
