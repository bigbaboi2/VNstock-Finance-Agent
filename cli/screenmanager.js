/**
 * screenManager.js — ANSI In-Place Terminal Renderer
 * Keyboard via readline keypress (Windows-compatible, same path as inquirer).
 * No ANSI mouse capture — keeps the OS mouse pointer free in Cursor/VS Code.
 */

import readline from 'readline';

// ─── ANSI escape helpers ───────────────────────────────────────────────────────
const ESC         = '\x1b[';
const SHOW_CURSOR = '\x1b[?25h';
const CLEAR_ALL   = '\x1b[2J\x1b[H';
const moveTo      = (row, col = 1) => `${ESC}${row};${col}H`;
const clearEOL    = `${ESC}K`;
const clearBelow  = `${ESC}J`;

// Ensure mouse-tracking is OFF (otherwise OS pointer disappears in some terminals)
const DISABLE_MOUSE = '\x1b[?1006l\x1b[?1003l\x1b[?1000l\x1b[?1002l';
// Steady block caret (PowerShell-style). DECSCUSR: 2 = solid block
const CARET_BLOCK   = '\x1b[2 q';
const CARET_RESET   = '\x1b[0 q';

/** Drawn block — looks like the white PowerShell caret even if DECSCUSR is ignored */
function paintBlockCursor(chalk) {
    return chalk.bgWhite(' ');
}

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
        this._lines     = [];
        this._lastRows  = 0;
        this._active    = false;
        this._cursorRow = null;
        this._cursorCol = 2;
    }

    enter() {
        process.stdout.write(DISABLE_MOUSE + CLEAR_ALL + CARET_BLOCK + SHOW_CURSOR);
        this._active = true;
        process.stdout.on('resize', () => {
            if (this._active && this._lines.length) this._flush();
        });
    }

    exit() {
        this._active = false;
        const row = Math.max(1, this._lastRows);
        this._cursorRow = null;
        process.stdout.write(
            DISABLE_MOUSE + CARET_RESET +
            moveTo(row + 1) + clearBelow + SHOW_CURSOR + '\n'
        );
    }

    setCaret(row, col = 2) {
        this._cursorRow = row;
        this._cursorCol = col;
    }

    render(lines) {
        this._lines = lines;
        this._flush();
    }

    _flush() {
        const { cols, rows } = getTermSize();
        const lines = this._lines;
        let out = moveTo(1);

        const maxRows = Math.min(lines.length, rows - 1);
        for (let i = 0; i < maxRows; i++) {
            const visible = stripAnsi(lines[i] || '');
            const truncated = visible.length > cols
                ? ansiSlice(lines[i], cols)
                : lines[i] || '';
            out += truncated + clearEOL + '\n';
        }

        if (this._lastRows > maxRows) out += clearBelow;

        const caretRow = this._cursorRow != null
            ? Math.min(Math.max(1, this._cursorRow), Math.max(1, maxRows))
            : Math.max(1, maxRows);
        out += moveTo(caretRow, this._cursorCol || 2) + CARET_BLOCK + SHOW_CURSOR;

        process.stdout.write(out);
        this._lastRows = maxRows;
    }
}

export const screen = new Screen();

/**
 * Keyboard listener — uses readline keypress so ↑↓ work on Windows CMD
 * the same way Inquirer menus do (raw `data` bytes often break there).
 *
 * @param {(name: string, key: object) => void} handler
 * @returns {() => void} detach
 */
function attachKeys(handler) {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
        try { process.stdin.setRawMode(true); } catch { /* ignore */ }
    }
    process.stdin.resume();

    const onKeypress = (_str, key) => {
        if (!key) return;
        if (key.ctrl && key.name === 'c') {
            handler('ctrl-c', key);
            return;
        }
        // key.name: up, down, left, right, return, escape, pageup, pagedown, …
        const name = key.name || _str || '';
        handler(name, key);
    };

    process.stdin.on('keypress', onKeypress);

    return () => {
        process.stdin.removeListener('keypress', onKeypress);
        try { process.stdin.setRawMode(false); } catch { /* ignore */ }
        process.stdin.pause();
    };
}

// ─── Buffer builder ───────────────────────────────────────────────────────────
export class ScreenBuffer {
    constructor() {
        this.lines = [];
    }

    line(text = '') {
        this.lines.push(text);
        return this;
    }

    blank(n = 1) {
        for (let i = 0; i < n; i++) this.lines.push('');
        return this;
    }

    divider(char = '─', width, color) {
        const { cols } = getTermSize();
        const w = width || cols - 2;
        const str = char.repeat(w);
        this.lines.push(color ? color(str) : str);
        return this;
    }

    sectionHeader(_icon, title, color, width) {
        const { cols } = getTermSize();
        const W = width || Math.min(cols - 2, 120);
        const label = ` ${String(title || '').toUpperCase()} `;
        const padLen = Math.max(0, W - 4 - stripAnsi(label).length);
        const paint = color || ((s) => s);
        this.lines.push(paint(`──${label}${'─'.repeat(padLen)}`));
        return this;
    }

    flush() {
        screen.render(this.lines);
    }
}

// ─── Scrollable pager ─────────────────────────────────────────────────────────
/**
 * Pager — ↑↓ moves the yellow selection cursor (content ↔ Exit).
 * Enter / q / Esc leaves. OS mouse stays free for text selection.
 */
export async function pager(lines, title = '', opts = {}) {
    const exitLabel = opts.exitLabel || 'Back to previous menu';
    const { rows, cols } = getTermSize();
    const HEADER_ROWS = 3;
    const FOOTER_ROWS = 3;
    const viewHeight = Math.max(4, rows - HEADER_ROWS - FOOTER_ROWS);
    let scrollOffset = 0;
    const maxScroll = Math.max(0, lines.length - viewHeight);
    const isScrollable = lines.length > viewHeight;
    let focus = isScrollable ? 'content' : 'exit';

    const chalk = (await import('chalk')).default;
    const muted = chalk.hex('#6B7C8A');

    const render = () => {
        const out = [];
        const block = paintBlockCursor(chalk);
        const t = title || 'VIEWER';
        const headPad = Math.max(1, cols - stripAnsi(t).length - 2);
        out.push(chalk.bgHex('#E8B84A').black.bold(' ' + t + ' '.repeat(headPad)));
        out.push(muted(
            ` ${scrollOffset + 1}–${Math.min(scrollOffset + viewHeight, lines.length)}/${lines.length}` +
            '   ↑↓ move block cursor   Enter confirm   q back'
        ));
        out.push(muted('─'.repeat(cols)));

        const windowH = isScrollable ? viewHeight : Math.max(lines.length, 1);
        const visible = lines.slice(scrollOffset, scrollOffset + windowH);
        for (let i = 0; i < windowH; i++) {
            const raw = visible[i] !== undefined ? visible[i] : '';
            if (focus === 'content' && i === 0) {
                out.push(block + ' ' + raw);
            } else {
                out.push('  ' + raw);
            }
        }

        out.push(muted('─'.repeat(cols)));

        if (focus === 'exit') {
            out.push(block + chalk.bgHex('#E8B84A').black.bold(` ← Exit   ${exitLabel} `));
        } else {
            out.push('  ' + muted(`← Exit   ${exitLabel}`) + muted('  ·  ↓'));
        }

        const caretRow = focus === 'exit' ? out.length : HEADER_ROWS + 1;
        screen.setCaret(caretRow, 1);
        screen.render(out);
    };

    const moveUp = () => {
        if (focus === 'exit') {
            focus = 'content';
            return;
        }
        if (isScrollable) scrollOffset = Math.max(0, scrollOffset - 1);
    };

    const moveDown = () => {
        if (focus === 'content') {
            if (isScrollable && scrollOffset < maxScroll) {
                scrollOffset += 1;
            } else {
                focus = 'exit';
            }
        }
    };

    screen.enter();
    render();

    return new Promise((resolve) => {
        const detach = attachKeys((name) => {
            if (name === 'q' || name === 'escape' || name === 'ctrl-c' || name === 'x' || name === 'b') {
                detach();
                screen.exit();
                resolve();
                return;
            }
            if (name === 'return') {
                if (focus === 'exit') {
                    detach();
                    screen.exit();
                    resolve();
                    return;
                }
                focus = 'exit';
                render();
                return;
            }
            if (name === 'up' || name === 'k') {
                moveUp();
                render();
                return;
            }
            if (name === 'down' || name === 'j') {
                moveDown();
                render();
                return;
            }
            if (name === 'pageup') {
                focus = 'content';
                scrollOffset = Math.max(0, scrollOffset - viewHeight);
                render();
                return;
            }
            if (name === 'pagedown') {
                scrollOffset = Math.min(maxScroll, scrollOffset + viewHeight);
                if (scrollOffset >= maxScroll) focus = 'exit';
                render();
            }
        });
    });
}

// ─── Live dashboard ───────────────────────────────────────────────────────────
/**
 * LiveDashboard — auto-refresh + ↑↓ moves yellow selection (CONTENT ↔ EXIT).
 */
export class LiveDashboard {
    constructor(intervalMs = 5000) {
        this.intervalMs = intervalMs;
        this._timer = null;
        this._running = false;
    }

    async start(renderFn) {
        this._running = true;
        screen.enter();

        const chalk = (await import('chalk')).default;
        const muted = chalk.hex('#6B7C8A');

        let contentLines = [];
        let scrollOffset = 0;
        let focus = 'exit';

        const paint = () => {
            const { rows, cols } = getTermSize();
            const block = paintBlockCursor(chalk);
            const FOOTER = 3;
            const viewH = Math.max(4, rows - FOOTER - 1);
            const maxScroll = Math.max(0, contentLines.length - viewH);
            if (scrollOffset > maxScroll) scrollOffset = maxScroll;
            const isScrollable = contentLines.length > viewH;
            const windowH = isScrollable ? viewH : Math.max(contentLines.length, 1);
            const visible = contentLines.slice(scrollOffset, scrollOffset + windowH);

            const out = [];
            out.push(muted(
                ` ${scrollOffset + 1}–${Math.min(scrollOffset + windowH, contentLines.length)}/${contentLines.length}` +
                '   ↑↓ move block cursor   Enter leave'
            ));
            out.push(muted('─'.repeat(Math.min(cols, 100))));

            for (let i = 0; i < windowH; i++) {
                const raw = visible[i] !== undefined ? visible[i] : '';
                out.push(focus === 'content' && i === 0 ? block + ' ' + raw : '  ' + raw);
            }

            out.push(muted('─'.repeat(Math.min(cols, 100))));
            if (focus === 'exit') {
                out.push(block + chalk.bgHex('#E8B84A').black.bold(' ← Exit ') + muted('  Enter / q'));
            } else {
                out.push('  ' + muted('← Exit') + muted('  ·  ↓'));
            }

            screen.setCaret(focus === 'exit' ? out.length : 3, 1);
            screen.render(out);
        };

        const tick = async () => {
            if (!this._running) return;
            try {
                const result = await renderFn();
                contentLines = result instanceof ScreenBuffer ? [...result.lines]
                    : Array.isArray(result) ? [...result]
                        : [];
                paint();
            } catch { /* ignore */ }
        };

        await tick();
        this._timer = setInterval(tick, this.intervalMs);

        return new Promise((resolve) => {
            const detach = attachKeys((name) => {
                const { rows } = getTermSize();
                const viewH = Math.max(4, rows - 5);
                const maxScroll = Math.max(0, contentLines.length - viewH);
                const isScrollable = contentLines.length > viewH;

                if (name === 'q' || name === 'escape' || name === 'ctrl-c' || name === 'x' || name === 'b') {
                    this.stop();
                    detach();
                    screen.exit();
                    resolve();
                    return;
                }
                if (name === 'return') {
                    if (focus === 'exit') {
                        this.stop();
                        detach();
                        screen.exit();
                        resolve();
                        return;
                    }
                    focus = 'exit';
                    paint();
                    return;
                }
                if (name === 'up' || name === 'k') {
                    if (focus === 'exit') {
                        focus = 'content';
                        if (isScrollable) scrollOffset = maxScroll;
                    } else {
                        scrollOffset = Math.max(0, scrollOffset - 1);
                    }
                    paint();
                    return;
                }
                if (name === 'down' || name === 'j') {
                    if (focus === 'content') {
                        if (isScrollable && scrollOffset < maxScroll) scrollOffset += 1;
                        else focus = 'exit';
                    }
                    paint();
                    return;
                }
                if (name === 'pageup') {
                    focus = 'content';
                    scrollOffset = Math.max(0, scrollOffset - viewH);
                    paint();
                    return;
                }
                if (name === 'pagedown') {
                    scrollOffset = Math.min(maxScroll, scrollOffset + viewH);
                    if (scrollOffset >= maxScroll) focus = 'exit';
                    paint();
                }
            });
        });
    }

    stop() {
        this._running = false;
        if (this._timer) clearInterval(this._timer);
    }
}

// ─── ANSI utilities ───────────────────────────────────────────────────────────
export function stripAnsi(str) {
    return String(str)
        .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
        .replace(/\x1b\]8;;[^\x07]*\x07/g, '')
        .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

export function padVisible(str, width, char = ' ') {
    const visible = stripAnsi(str);
    const diff = width - visible.length;
    return diff > 0 ? str + char.repeat(diff) : str;
}

function ansiSlice(str, maxWidth) {
    let visible = 0;
    let result = '';
    let inEsc = false;
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
    return result + '\x1b[0m';
}
