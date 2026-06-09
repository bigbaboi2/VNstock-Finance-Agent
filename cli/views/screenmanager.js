/**
 * screenManager.js — ANSI In-Place Terminal Renderer
 * Render toàn bộ nội dung vào buffer, write 1 lần → không scroll, không nhảy dòng.
 * Không cần dependency ngoài (blessed, ink...) — chỉ dùng ANSI escape codes.
 */

// ─── ANSI escape helpers ───────────────────────────────────────────────────────
const ESC         = '\x1b[';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const CLEAR_ALL   = '\x1b[2J\x1b[H';
const moveTo      = (row, col = 1) => `${ESC}${row};${col}H`;
const clearEOL    = `${ESC}K`;          // clear from cursor to end of line
const clearBelow  = `${ESC}J`;          // clear from cursor to end of screen

// ─── Terminal size ─────────────────────────────────────────────────────────────
export function getTermSize() {
    return {
        cols: process.stdout.columns  || 120,
        rows: process.stdout.rows     || 40,
    };
}

// ─── Screen class ─────────────────────────────────────────────────────────────
export class Screen {
    constructor() {
        this._lines    = [];   // string[] — rendered lines with ANSI
        this._lastRows = 0;    // how many rows we wrote last frame
        this._active   = false;
    }

    /** Enter fullscreen mode (hide cursor, clear screen) */
    enter() {
        process.stdout.write(HIDE_CURSOR + CLEAR_ALL);
        this._active = true;
        // Re-render on resize
        process.stdout.on('resize', () => {
            if (this._active && this._lines.length) this._flush();
        });
    }

    /** Exit fullscreen mode (show cursor, move below content) */
    exit() {
        this._active = false;
        const rows = this._lastRows;
        process.stdout.write(moveTo(rows + 2) + SHOW_CURSOR);
    }

    /**
     * Render a list of lines onto the screen.
     * Overwrites previous content in-place — no scroll.
     * @param {string[]} lines  Array of strings (may contain ANSI codes)
     */
    render(lines) {
        this._lines = lines;
        this._flush();
    }

    _flush() {
        const { cols, rows } = getTermSize();
        const lines   = this._lines;
        let   out     = moveTo(1);   // go home, don't clear (avoids flicker)

        const maxRows = Math.min(lines.length, rows - 1);
        for (let i = 0; i < maxRows; i++) {
            // Truncate visible width to avoid wrapping
            const visible = stripAnsi(lines[i] || '');
            const truncated = visible.length > cols
                ? ansiSlice(lines[i], cols)
                : lines[i] || '';
            out += truncated + clearEOL + '\n';
        }

        // Clear leftover rows from previous render
        if (this._lastRows > maxRows) {
            out += clearBelow;
        }

        process.stdout.write(out);
        this._lastRows = maxRows;
    }
}

// ─── Singleton screen ─────────────────────────────────────────────────────────
export const screen = new Screen();

// ─── Buffer builder ───────────────────────────────────────────────────────────
/**
 * ScreenBuffer — collect lines, then flush to Screen.
 * Usage:
 *   const buf = new ScreenBuffer();
 *   buf.line('hello');
 *   buf.blank();
 *   screen.render(buf.lines);
 */
export class ScreenBuffer {
    constructor() {
        this.lines = [];
    }

    /** Add a line (string with optional ANSI) */
    line(text = '') {
        this.lines.push(text);
        return this;
    }

    /** Add N blank lines (default 1) */
    blank(n = 1) {
        for (let i = 0; i < n; i++) this.lines.push('');
        return this;
    }

    /** Add a horizontal divider */
    divider(char = '─', width, color) {
        const { cols } = getTermSize();
        const w   = width || cols - 2;
        const str = char.repeat(w);
        this.lines.push(color ? color(str) : str);
        return this;
    }

    /**
     * Add a box section header:
     * ┌─ TITLE ──────────────────┐
     */
    sectionHeader(icon, title, color, width) {
        const { cols } = getTermSize();
        const W     = width || Math.min(cols - 2, 100);
        const inner = ` ${icon}  ${title} `;
        const pad   = Math.max(0, W - 2 - stripAnsi(inner).length);
        this.lines.push(color('┌─' + inner.slice(1) + '─'.repeat(pad) + '┐'));
        return this;
    }

    /** Render to screen immediately */
    flush() {
        screen.render(this.lines);
    }
}

// ─── Scrollable pager (for long content like AI reports) ──────────────────────
/**
 * Pager — render long content in a scrollable viewport within the terminal.
 * Controls: ↑/↓ arrows or j/k to scroll, q / Enter / ESC to exit.
 * @param {string[]} lines   Content lines
 * @param {string}   title   Header title
 */
export async function pager(lines, title = '') {
    const { rows, cols } = getTermSize();
    const HEADER_ROWS   = 3;
    const FOOTER_ROWS   = 2;
    const viewHeight    = rows - HEADER_ROWS - FOOTER_ROWS;
    let   scrollOffset  = 0;
    const maxScroll     = Math.max(0, lines.length - viewHeight);

    const chalk = (await import('chalk')).default;

    const render = () => {
        const out_lines = [];

        // Header
        out_lines.push(chalk.bgGreen.black.bold(
            ' ' + (title || 'VIEWER') + ' '.repeat(Math.max(1, cols - stripAnsi(title || 'VIEWER').length - 2))
        ));
        out_lines.push(chalk.dim(
            ` Dòng ${scrollOffset + 1}–${Math.min(scrollOffset + viewHeight, lines.length)} / ${lines.length}` +
            '  ↑↓ cuộn  q / Enter thoát' +
            ' '.repeat(Math.max(0, cols - 60))
        ));
        out_lines.push(chalk.dim('─'.repeat(cols)));

        // Content slice
        const visible = lines.slice(scrollOffset, scrollOffset + viewHeight);
        for (let i = 0; i < viewHeight; i++) {
            out_lines.push(visible[i] !== undefined ? visible[i] : '');
        }

        // Footer scrollbar
        const thumbSize = Math.max(1, Math.round((viewHeight / lines.length) * viewHeight));
        const thumbPos  = lines.length <= viewHeight ? 0
            : Math.round((scrollOffset / maxScroll) * (viewHeight - thumbSize));
        const bar = Array.from({ length: viewHeight }, (_, i) =>
            i >= thumbPos && i < thumbPos + thumbSize ? '█' : '░'
        ).join('');
        out_lines.push(chalk.dim('─'.repeat(cols - 1)));

        screen.render(out_lines);
    };

    screen.enter();
    render();

    return new Promise((resolve) => {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        const onKey = (key) => {
            if (key === '\x1b[A' || key === 'k') { // up
                scrollOffset = Math.max(0, scrollOffset - 1);
            } else if (key === '\x1b[B' || key === 'j') { // down
                scrollOffset = Math.min(maxScroll, scrollOffset + 1);
            } else if (key === '\x1b[5~') { // page up
                scrollOffset = Math.max(0, scrollOffset - viewHeight);
            } else if (key === '\x1b[6~') { // page down
                scrollOffset = Math.min(maxScroll, scrollOffset + viewHeight);
            } else if (key === 'g') {
                scrollOffset = 0;
            } else if (key === 'G') {
                scrollOffset = maxScroll;
            } else if (key === '\r' || key === 'q' || key === '\x1b' || key === '\x03') {
                process.stdin.removeListener('data', onKey);
                process.stdin.setRawMode(false);
                process.stdin.pause();
                screen.exit();
                resolve();
                return;
            }
            render();
        };

        process.stdin.on('data', onKey);
    });
}

// ─── Live dashboard (auto-refresh) ────────────────────────────────────────────
/**
 * LiveDashboard — gọi `renderFn()` định kỳ, render kết quả vào screen.
 * renderFn phải trả về ScreenBuffer hoặc string[].
 *
 * Usage:
 *   const dash = new LiveDashboard(5000);
 *   dash.start(async () => {
 *     const buf = new ScreenBuffer();
 *     buf.line('...');
 *     return buf;
 *   });
 *   // Nhấn 'q' để thoát
 */
export class LiveDashboard {
    constructor(intervalMs = 5000) {
        this.intervalMs = intervalMs;
        this._timer     = null;
        this._running   = false;
    }

    async start(renderFn) {
        this._running = true;
        screen.enter();

        const tick = async () => {
            if (!this._running) return;
            try {
                const result = await renderFn();
                const lines  = result instanceof ScreenBuffer ? result.lines
                             : Array.isArray(result)          ? result
                             : [];
                screen.render(lines);
            } catch (e) {
                // silently ignore render errors — don't crash dashboard
            }
        };

        await tick();
        this._timer = setInterval(tick, this.intervalMs);

        return new Promise((resolve) => {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.setEncoding('utf8');

            const onKey = (key) => {
                if (key === 'q' || key === '\x03' || key === '\x1b') {
                    this.stop();
                    process.stdin.removeListener('data', onKey);
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    screen.exit();
                    resolve();
                }
            };
            process.stdin.on('data', onKey);
        });
    }

    stop() {
        this._running = false;
        if (this._timer) clearInterval(this._timer);
    }
}

// ─── ANSI utilities ───────────────────────────────────────────────────────────
// Strip ANSI escape codes to get visible string length
export function stripAnsi(str) {
    return String(str).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

// Pad a string to visible width (accounting for ANSI codes)
export function padVisible(str, width, char = ' ') {
    const visible = stripAnsi(str);
    const diff    = width - visible.length;
    return diff > 0 ? str + char.repeat(diff) : str;
}

// Slice a string to visible width (preserving ANSI codes as much as possible)
function ansiSlice(str, maxWidth) {
    let visible = 0;
    let result  = '';
    let inEsc   = false;
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '\x1b') { inEsc = true; result += str[i]; continue; }
        if (inEsc) {
            result += str[i];
            if (str[i].match(/[A-Za-z]/)) inEsc = false;
            continue;
        }
        if (visible >= maxWidth) break;
        result += str[i];
        visible++;
    }
    // Reset ANSI at end to avoid color bleed
    return result + '\x1b[0m';
}