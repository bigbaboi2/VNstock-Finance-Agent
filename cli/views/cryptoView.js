import Table from 'cli-table3';
import {
    C, contentWidth, sectionTitle, divider, changeFmt, badge
} from '../theme.js';
import { renderMiniTrend, renderSparkline, renderCandles } from '../charts.js';
import { ScreenBuffer, getTermSize } from '../screenManager.js';

function formatVolume(val) {
    if (typeof val === 'string' && /\$|B|M|K/i.test(val) && Number.isNaN(Number(val))) {
        return val; // already formatted (e.g. from /crypto/price)
    }
    const num = parseFloat(val) || 0;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
}

function formatPrice(val) {
    const price = parseFloat(val);
    if (!Number.isFinite(price) || price === 0) return C.muted('—');
    if (price >= 1000) return C.accentBold(`$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
    if (price >= 1) return C.accentBold(`$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
    return C.accentBold(`$${price.toPrecision(4)}`);
}

function coinPrice(c) {
    return parseFloat(c?.currentPrice ?? c?.price ?? 0);
}

function coinChange(c) {
    const n = parseFloat(c?.change24h ?? c?.change);
    return Number.isFinite(n) ? n : NaN;
}

function rankBadge(i) {
    if (i === 0) return C.accentBold('#1');
    if (i === 1) return C.label('#2');
    if (i === 2) return C.muted('#3');
    return C.muted(`#${i + 1}`);
}

/**
 * @param {object} payload
 * @param {Array}  payload.markets  — top by market cap (price fields required)
 * @param {Array}  [payload.gainers]
 * @param {Array}  [payload.losers]
 * @param {object} [payload.radar]   — fear/greed / dominance
 */
export function buildCryptoBuffer(payload = {}) {
    const buf = new ScreenBuffer();
    const W = contentWidth();

    const markets = Array.isArray(payload)
        ? payload
        : (payload.markets || payload.coins || []);
    const gainers = payload.gainers || [];
    const losers = payload.losers || [];
    const radar = payload.radar || null;

    if (!markets.length && !gainers.length && !losers.length) {
        buf.blank().line(C.warn('  No crypto market data. Check CoinGecko / backend cache.'));
        return buf;
    }

    buf.sectionHeader('', 'CRYPTO GLOBAL — TOP BY MARKET CAP', C.accent, W);

    if (radar) {
        const fg = radar.fearGreed || {};
        const dom = radar.dominance || {};
        const gm = radar.globalMarket || {};
        buf.blank()
            .line(
                `  ${badge('F&G ' + (fg.value ?? '—'), fg.value >= 55 ? 'up' : fg.value <= 40 ? 'down' : 'warn')}` +
                `  ${C.muted(fg.labelVi || fg.label || '')}` +
                `   ${C.label('BTC.D')} ${C.value((dom.btc || '—') + '%')}` +
                `   ${C.label('Cap')} ${C.accent(gm.totalMarketCap || '—')}` +
                `   ${C.label('24h')} ${changeFmt(gm.marketCapChangePercent)}`
            );
        if (dom.altSeason) buf.line(`  ${C.muted(dom.altSeason)}`);
    }

    const top20 = markets.slice(0, 20);
    if (top20.length) {
        const changes = top20.map(c => {
            const n = coinChange(c);
            return Number.isFinite(n) ? n : 0;
        });
        const gainN = changes.filter(n => n > 0).length;
        const loseN = changes.filter(n => n < 0).length;
        const avgChange = (changes.reduce((s, n) => s + n, 0) / changes.length).toFixed(2);
        const totalMktCap = top20.reduce((s, c) => s + parseFloat(c.marketCap || 0), 0);
        const sentimentColor = parseFloat(avgChange) >= 0 ? C.upBold : C.downBold;
        const sentimentText = parseFloat(avgChange) >= 0 ? 'RISK-ON' : 'RISK-OFF';

        buf.blank()
            .line(
                `  ${C.label('Bias')} ${sentimentColor(sentimentText)} ${C.muted(`avg ${avgChange}%`)}` +
                `   ${C.up(`▲ ${gainN}`)}  ${C.down(`▼ ${loseN}`)}` +
                `   ${C.label('Top cap')} ${C.accent(formatVolume(totalMktCap))}`
            )
            .line(`  ${C.label('24h pulse')}  ${renderSparkline(changes, Math.min(40, W - 20))}`)
            .blank();

        const table = new Table({
            head: [
                C.label('#'), C.label('ASSET'),
                C.label('PRICE'), C.label('24H'),
                C.label('TREND'), C.label('MKT CAP'), C.label('VOL'),
            ],
            colWidths: [5, 18, 14, 12, 10, 12, 12],
            style: { border: [], head: [], 'padding-left': 1, 'padding-right': 1 },
        });

        top20.forEach((c, i) => {
            const changeNum = coinChange(c);
            const changeColor = !Number.isFinite(changeNum) ? C.muted
                : changeNum >= 0 ? C.upBold : C.downBold;
            const changeSign = changeNum > 0 ? '+' : '';
            const changeStr = Number.isFinite(changeNum)
                ? `${changeSign}${changeNum.toFixed(2)}%`
                : '—';

            const sym = String(c.symbol || '').toUpperCase();
            const name = String(c.name || '').trim();
            const assetLabel = name && name.toUpperCase() !== sym
                ? C.value(sym.padEnd(6)) + '\n' + C.muted(name.slice(0, 14))
                : C.value(sym);
            table.push([
                rankBadge(i),
                assetLabel,
                formatPrice(coinPrice(c)),
                changeColor(changeStr),
                Number.isFinite(changeNum) ? renderMiniTrend(changeNum, 7) : C.muted('·'.repeat(7)),
                C.white(formatVolume(c.marketCap)),
                C.muted(formatVolume(c.volume24h || c.volume || 0)),
            ]);
        });
        table.toString().split('\n').forEach(l => buf.line(l));
    }

    const topGain = gainers.length
        ? gainers.slice(0, 3)
        : [...top20].sort((a, b) => (coinChange(b) || -999) - (coinChange(a) || -999)).slice(0, 3);
    const topLoss = losers.length
        ? losers.slice(0, 3)
        : [...top20].sort((a, b) => (coinChange(a) || 999) - (coinChange(b) || 999)).slice(0, 3);

    if (topGain.length || topLoss.length) {
        buf.blank().line(sectionTitle('Top movers 24h', C.accent, W)).blank();

        const moverTable = new Table({
            head: [C.upBold('GAINERS'), C.downBold('LOSERS')],
            colWidths: [Math.floor((W - 6) / 2), Math.floor((W - 6) / 2)],
            style: { border: [], head: [], 'padding-left': 1, 'padding-right': 1 },
        });

        const maxM = Math.max(topGain.length, topLoss.length);
        for (let i = 0; i < maxM; i++) {
            const g = topGain[i];
            const l = topLoss[i];
            const gCh = g ? coinChange(g) : NaN;
            const lCh = l ? coinChange(l) : NaN;
            moverTable.push([
                g ? `${C.accentBold((g.symbol || '').padEnd(8))}  ${changeFmt(gCh)}  ${C.muted('$' + (coinPrice(g) || 0).toLocaleString())}` : '',
                l ? `${C.accentBold((l.symbol || '').padEnd(8))}  ${changeFmt(lCh)}  ${C.muted('$' + (coinPrice(l) || 0).toLocaleString())}` : '',
            ]);
        }
        moverTable.toString().split('\n').forEach(l => buf.line(l));
    }

    buf.blank().line(divider('─', W, C.muted));
    buf.line(C.muted('  Tip: pick Chart from crypto workspace to view candles'));
    return buf;
}

export function buildCryptoChartBuffer(candles, symbol, intervalLabel) {
    const buf = new ScreenBuffer();
    const { cols } = getTermSize();
    buf.blank()
        .line(C.accentBold(`  ${symbol}`) + C.muted(`  ·  ${intervalLabel}`) + C.muted(`  ·  ${candles?.length || 0} bars`))
        .blank();
    if (!candles || candles.length === 0) {
        buf.line(C.warn('  No candle data for this interval.'));
        return buf;
    }
    // crypto candles may use `time` not `date` — charts.js reads open/high/low/close/volume
    const chartW = Math.min(cols - 20, 72);
    renderCandles(candles, { width: chartW, height: 14, showVolume: true })
        .forEach(l => buf.line(l));
    buf.blank().line(divider('─', contentWidth(), C.muted));
    return buf;
}

export function buildCryptoQuoteLines(priceData) {
    const lines = [];
    if (!priceData) return lines;
    const W = contentWidth();
    lines.push(sectionTitle(`${priceData.symbol || 'CRYPTO'} quote`, C.accent, W));
    lines.push('');
    lines.push(
        `  ${C.label('Last')} ${formatPrice(priceData.currentPrice)}` +
        `   ${changeFmt(priceData.change24h)}` +
        `   ${C.label('Vol')} ${C.white(String(priceData.volume24h || '—'))}`
    );
    lines.push(
        `  ${C.label('High')} ${C.up(String(priceData.high24h ?? '—'))}` +
        `   ${C.label('Low')} ${C.down(String(priceData.low24h ?? '—'))}` +
        (priceData.marketCap ? `   ${C.label('Cap')} ${C.accent(formatVolume(priceData.marketCap))}` : '')
    );
    if (priceData.technicals?.score != null) {
        lines.push(`  ${C.label('Tech score')} ${C.value(String(priceData.technicals.score))}`);
    }
    lines.push('');
    return lines;
}

export function renderCryptoMarket(coins) {
    buildCryptoBuffer(Array.isArray(coins) ? { markets: coins } : coins).lines.forEach(l => console.log(l));
}
