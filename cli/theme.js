/**
 * theme.js — OMNI DUCK CLI design system
 * Trading-desk palette: amber brand, cyan frames, green/red P&L.
 */
import chalk from 'chalk';
import { getTermSize, stripAnsi, padVisible } from './screenManager.js';

export const C = {
    accent: chalk.hex('#E8B84A'),
    accentBold: chalk.hex('#E8B84A').bold,
    accentBg: chalk.bgHex('#E8B84A').black.bold,
    frame: chalk.hex('#3D8B9C'),
    frameDim: chalk.hex('#2A5F6A'),
    up: chalk.hex('#3DDC97'),
    upBold: chalk.hex('#3DDC97').bold,
    down: chalk.hex('#F07178'),
    downBold: chalk.hex('#F07178').bold,
    warn: chalk.hex('#E8B84A'),
    muted: chalk.hex('#6B7C8A'),
    label: chalk.hex('#8A9BAA'),
    value: chalk.white.bold,
    title: chalk.white.bold,
    italic: chalk.hex('#9AABB8').italic,
    ceiling: chalk.hex('#C792EA'),
    floor: chalk.hex('#82AAFF'),
    white: chalk.white,
    dim: chalk.dim,
};

const MAX_CONTENT = 120;

export function contentWidth(cap = MAX_CONTENT) {
    const { cols } = getTermSize();
    return Math.max(60, Math.min(cols - 2, cap));
}

export function visibleLen(str) {
    return stripAnsi(String(str)).length;
}

export function pad(str, width, align = 'left') {
    const clean = stripAnsi(String(str));
    const diff = width - clean.length;
    if (diff <= 0) return fitVisible(String(str), width);
    if (align === 'right') return ' '.repeat(diff) + str;
    if (align === 'center') {
        const L = Math.floor(diff / 2);
        return ' '.repeat(L) + str + ' '.repeat(diff - L);
    }
    return str + ' '.repeat(diff);
}

/**
 * Fit content into exactly `innerW` visible columns (truncate + pad).
 * Handles CSI colors and OSC-8 hyperlinks so URLs do not inflate width.
 */
export function fitVisible(str, innerW) {
    const s = String(str ?? '');
    const plain = stripAnsi(s);
    if (plain.length === innerW) return s;
    if (plain.length < innerW) return s + ' '.repeat(innerW - plain.length);

    let visible = 0;
    let out = '';
    let i = 0;
    while (i < s.length && visible < innerW) {
        if (s[i] === '\x1b') {
            const next = s[i + 1];
            if (next === ']') {
                // OSC: \x1b]...\x07  or  \x1b]...\x1b\\
                out += s[i++] + s[i++];
                while (i < s.length) {
                    out += s[i];
                    if (s[i] === '\x07') { i++; break; }
                    if (s[i] === '\x1b' && s[i + 1] === '\\') { out += s[++i]; i++; break; }
                    i++;
                }
                continue;
            }
            if (next === '[') {
                // CSI: \x1b[...Letter
                out += s[i++] + s[i++];
                while (i < s.length) {
                    out += s[i];
                    if (/[A-Za-z]/.test(s[i])) { i++; break; }
                    i++;
                }
                continue;
            }
            out += s[i++];
            continue;
        }
        out += s[i++];
        visible++;
    }
    return out + '\x1b[0m';
}

export function boxTop(title = '', color = C.frame, w = contentWidth()) {
    if (!title) return color(`┌${'─'.repeat(Math.max(0, w - 2))}┐`);
    const raw = stripAnsi(title).trim();
    const maxTitle = Math.max(1, w - 6);
    const t = raw.length > maxTitle ? raw.slice(0, maxTitle - 1) + '…' : raw;
    const label = ` ${t} `;
    // ┌─ + label + ─* + ┐  must equal w
    const padLen = Math.max(0, w - 3 - label.length);
    return color(`┌─${label}${'─'.repeat(padLen)}┐`);
}

export function boxBot(color = C.frame, w = contentWidth()) {
    return color(`└${'─'.repeat(Math.max(0, w - 2))}┘`);
}

export function boxRow(content, color = C.frame, w = contentWidth()) {
    const inner = fitVisible(String(content ?? ''), Math.max(1, w - 4));
    return color('│') + ' ' + inner + ' ' + color('│');
}

export function boxBlank(color = C.frame, w = contentWidth()) {
    return boxRow('', color, w);
}

export function sectionTitle(title, color = C.accent, w = contentWidth()) {
    const label = ` ${title.toUpperCase()} `;
    const padLen = Math.max(0, w - 4 - visibleLen(label));
    return color(`──${label}${'─'.repeat(padLen)}`);
}

export function divider(char = '─', w = contentWidth(), color = C.muted) {
    return color(char.repeat(w));
}

export function badge(text, tone = 'accent') {
    const map = {
        accent: C.accentBg,
        up: chalk.bgHex('#3DDC97').black.bold,
        down: chalk.bgHex('#F07178').white.bold,
        warn: chalk.bgHex('#E8B84A').black.bold,
        muted: chalk.bgHex('#3A4550').white.bold,
        live: chalk.bgHex('#3DDC97').black.bold,
        cache: chalk.bgHex('#E8B84A').black.bold,
    };
    const fn = map[tone] || map.accent;
    return fn(` ${text} `);
}

export function statusBar(left, right = '', w = contentWidth()) {
    const gap = Math.max(1, w - visibleLen(left) - visibleLen(right));
    return left + ' '.repeat(gap) + right;
}

export function hbar(pct, width = 20, { upTone = true } = {}) {
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    const filled = Math.round((p / 100) * width);
    const empty = width - filled;
    let color = C.warn;
    if (upTone) {
        if (p >= 65) color = C.up;
        else if (p <= 35) color = C.down;
    }
    return color('█'.repeat(filled)) + C.muted('░'.repeat(empty));
}

export function kpi(label, value, hint = '') {
    return `${C.label(label)} ${C.value(value)}${hint ? C.muted(' ' + hint) : ''}`;
}

export function changeFmt(pct, decimals = 2) {
    const n = parseFloat(pct);
    if (isNaN(n)) return C.muted('N/A');
    const sign = n >= 0 ? '+' : '';
    const text = `${sign}${n.toFixed(decimals)}%`;
    if (n > 0) return C.upBold(`▲ ${text}`);
    if (n < 0) return C.downBold(`▼ ${text}`);
    return C.muted(`─ ${text}`);
}

export function priceFmt(val, suffix = '') {
    if (val === null || val === undefined || val === '---' || val === '') return C.muted('---');
    const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
    if (isNaN(n)) return C.accentBold(String(val));
    return C.accentBold(n.toLocaleString('vi-VN') + (suffix ? ` ${suffix}` : ''));
}

/** Block / shadow glyphs for drop-shadow layer */
const SHADOW_MAP = {
    '█': '░', '╗': '░', '╔': '░', '╚': '░', '╝': '░', '═': '░',
    '║': '░', '╠': '░', '╣': '░', '╦': '░', '╩': '░', '╬': '░',
    '▓': '░', '▒': '░', '│': '┊', '─': '┈', '┃': '┊',
};

function toShadow(line) {
    return [...line].map(ch => (ch === ' ' ? ' ' : (SHADOW_MAP[ch] || '░'))).join('');
}

function frameRow(content, w = contentWidth(), color = C.accent) {
    const inner = fitVisible(content, w - 2);
    return color('│') + inner + color('│');
}

function frameTop(w = contentWidth(), color = C.accent) {
    return color('╭' + '─'.repeat(Math.max(0, w - 2)) + '╮');
}

function frameBot(w = contentWidth(), color = C.accent) {
    return color('╰' + '─'.repeat(Math.max(0, w - 2)) + '╯');
}

/**
 * Wide FIGlet-style "OMNI DUCK" (~74 cols) with drop shadow.
 * Narrow terminals get a compact slanted mark.
 * Logo is rendered WITHOUT side borders (avoids Unicode width skew).
 */
export function asciiBrandLogo(width = contentWidth()) {
    const shadow = chalk.hex('#3D3010');
    const hilite = chalk.hex('#FFE08A').bold;
    const mid = C.accentBold;
    const deep = chalk.hex('#B8892A');

    const wide = [
        '██████╗ ███╗   ███╗███╗   ██╗██╗     ██████╗ ██╗   ██╗ ██████╗██╗  ██╗',
        '██╔═══██╗████╗ ████║████╗  ██║██║     ██╔══██╗██║   ██║██╔════╝██║ ██╔╝',
        '██║   ██║██╔████╔██║██╔██╗ ██║██║     ██║  ██║██║   ██║██║     █████╔╝',
        '██║   ██║██║╚██╔╝██║██║╚██╗██║██║     ██║  ██║██║   ██║██║     ██╔═██╗',
        '╚██████╔╝██║ ╚═╝ ██║██║ ╚████║██║     ██████╔╝╚██████╔╝╚██████╗██║  ██╗',
        ' ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═══╝╚═╝     ╚═════╝  ╚═════╝  ╚═════╝╚═╝  ╚═╝',
    ];

    const compact = [
        '▄▀▀▀ █▄█ █▄ █ █  ▄▀▀▄ ▄▀▀▄ █ █ ▄▀▀',
        '█  █ █ █ █ ▀█ █  █  █ █  █ █▄█ █  ',
        '▀▀▀  ▀ ▀ ▀  ▀ ▀▀  ▀▀  ▀▀▀   ▀  ▀▀▀',
    ];

    const art = width >= 72 ? wide : compact;
    // Normalize every art row to the same visible width (max row length)
    const maxLen = Math.max(...art.map(l => l.length));
    const normalized = art.map(l => l + ' '.repeat(maxLen - l.length));

    const paintRow = (line, i, total) => {
        if (i === 0) return hilite(line);
        if (i >= total - 1) return deep(line);
        if (i === 1) return mid(line);
        return deep(line);
    };

    const lines = normalized.map((line, i) => '  ' + paintRow(line, i, normalized.length));

    // Soft ground shadow (same width family, no side frame)
    const last = normalized[normalized.length - 1];
    lines.push(shadow('   ' + toShadow(last)));
    lines.push(shadow('    ' + toShadow(last).replace(/░/g, '·')));

    return lines;
}

export function brandHeader({ subtitle = 'Quantitative Terminal', now } = {}) {
    const w = contentWidth();
    const ts = now || new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const lines = [];

    // Logo freestanding — Unicode block art never sits inside │…│ (avoids stair-step borders)
    asciiBrandLogo(w).forEach(row => lines.push(row));
    lines.push('');

    // Tight subtitle frame with exact-width rows
    lines.push(frameTop(w));
    lines.push(frameRow(
        '  ' + fitVisible(C.muted('·') + ' ' + C.title(subtitle) + ' ' + C.muted('·'), w - 4),
        w
    ));
    lines.push(frameRow(
        '  ' + fitVisible(
            C.muted('AI Finance Intelligence') + C.muted('  ·  ') + C.label(ts + ' ICT'),
            w - 4
        ),
        w
    ));
    lines.push(frameBot(w));
    return lines;
}

export function breadcrumb(...parts) {
    const segs = ['OMNI DUCK', ...parts];
    const colored = segs.map((p, i) =>
        i === segs.length - 1 ? C.accent(p) : C.muted(p)
    );
    return '  ' + colored.join(C.muted(' › '));
}

export function menuItem(num, title, desc) {
    return `${C.accent(num)}  ${C.title(title)}  ${C.muted(desc)}`;
}

export { padVisible, stripAnsi, getTermSize };
