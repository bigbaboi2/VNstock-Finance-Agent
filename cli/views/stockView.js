import Table from 'cli-table3';
import {
    C, contentWidth, pad, badge, boxTop, boxBot, boxRow, boxBlank,
    changeFmt, divider, sectionTitle, fitVisible
} from '../theme.js';
import { renderCandles, renderGauge } from '../charts.js';
import { ScreenBuffer, getTermSize } from '../screenManager.js';

const BOX_WIDTH = () => contentWidth(100);

//=======================================================================
// TECHNICAL CALCULATORS (unchanged logic)
//=======================================================================

function calcEMA(prices, period) {
    if (!prices || prices.length < period) return null;
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((s, v) => s + v, 0) / period;
    for (let i = period; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
    return ema;
}

function calcSMA(prices, period) {
    if (!prices || prices.length < period) return null;
    const slice = prices.slice(-period);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function calcRSI(prices, period = 14) {
    if (!prices || prices.length < period + 1) return null;
    const slice = prices.slice(-(period + 1));
    let gains = 0, losses = 0;
    for (let i = 1; i < slice.length; i++) {
        const diff = slice[i] - slice[i - 1];
        if (diff >= 0) gains += diff; else losses -= diff;
    }
    const avgGain = gains / period, avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcBollinger(prices, period = 20) {
    const sma = calcSMA(prices, period);
    if (!sma || prices.length < period) return null;
    const slice = prices.slice(-period);
    const variance = slice.reduce((s, v) => s + Math.pow(v - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    return { mid: sma, upper: sma + 2 * std, lower: sma - 2 * std, std };
}

function calcMACD(prices) {
    const ema12 = calcEMA(prices, 12);
    const ema26 = calcEMA(prices, 26);
    if (!ema12 || !ema26) return null;
    const macd = ema12 - ema26;
    const macdValues = [];
    for (let i = prices.length - 9; i <= prices.length - 1; i++) {
        const e12 = calcEMA(prices.slice(0, i + 1), 12);
        const e26 = calcEMA(prices.slice(0, i + 1), 26);
        if (e12 && e26) macdValues.push(e12 - e26);
    }
    const signal = macdValues.length >= 9 ? calcEMA(macdValues, 9) : null;
    return { macd, signal, histogram: signal !== null ? macd - signal : null };
}

function calcATR(candles, period = 14) {
    if (!candles || candles.length < 2) return null;
    const trs = candles.slice(1).map((c, i) =>
        Math.max(c.high - c.low, Math.abs(c.high - candles[i].close), Math.abs(c.low - candles[i].close))
    );
    return calcSMA(trs.slice(-period), period);
}

//=======================================================================
// PANELS
//=======================================================================

function bigHeaderLines(symbol, name, exchange, industry) {
    const w = BOX_WIDTH();
    const exTag = exchange ? badge(exchange, 'muted') : '';
    const inTag = industry ? C.frame(` ${(industry || '').slice(0, 40)} `) : '';
    const tags = [exTag, inTag].filter(Boolean).join('  ');
    const shortName = String(name || 'N/A');
    const title = `${C.accentBold(symbol)}  ${C.muted('—')}  ${C.italic(shortName)}`;
    return [
        C.accent('╭' + '─'.repeat(Math.max(0, w - 2)) + '╮'),
        C.accent('│') + ' ' + fitVisible(title, w - 4) + ' ' + C.accent('│'),
        C.accent('│') + ' ' + fitVisible(tags, w - 4) + ' ' + C.accent('│'),
        C.accent('╰' + '─'.repeat(Math.max(0, w - 2)) + '╯'),
    ];
}

function buildPricePanelLines(info, chartData) {
    const lines = [];
    const w = BOX_WIDTH();
    const current = parseFloat((info.currentPrice || '0').toString().replace(/\./g, '').replace(',', '.'));
    const changePct = parseFloat(info.changePercent || 0);
    const changeAmt = parseFloat(info.change || 0);

    let refPrice = 0;
    if (chartData && chartData.length >= 2) refPrice = parseFloat(chartData[chartData.length - 2].close) * 1000;
    if (!refPrice && current) refPrice = current;

    const exchange = (info.exchange || 'HOSE').toUpperCase();
    const limitPct = exchange.includes('HNX') ? 0.10 : exchange.includes('UPCOM') ? 0.15 : 0.07;
    const ceiling = refPrice * (1 + limitPct);
    const floor = refPrice * (1 - limitPct);

    let priceColor = C.accentBold;
    if (current >= ceiling * 0.998) priceColor = C.ceiling.bold;
    else if (current >= refPrice) priceColor = C.upBold;
    else if (current <= floor * 1.002) priceColor = C.floor.bold;
    else priceColor = C.downBold;

    const positionPct = ceiling > floor ? (current - floor) / (ceiling - floor) : 0.5;
    const barWidth = 28;
    const filled = Math.round(Math.max(0, Math.min(1, positionPct)) * barWidth);
    const progressBar =
        C.floor('[') +
        C.muted('░').repeat(Math.max(0, filled - 1)) +
        (filled > 0 ? C.accent('◆') : '') +
        C.muted('░').repeat(Math.max(0, barWidth - filled)) +
        C.ceiling(']');

    const fmt = v => v ? Math.round(v).toLocaleString('vi-VN') + ' đ' : '---';

    lines.push(boxTop('LAST PRICE', C.frame, w));
    lines.push(boxRow(
        C.label(pad('LAST', 16)) +
        C.ceiling(pad(`CEIL ${(limitPct * 100)}%`, 16)) +
        C.accent(pad('REF', 16)) +
        C.floor(pad(`FLR ${(limitPct * 100)}%`, 16)),
        C.frame, w
    ));
    lines.push(boxRow(
        priceColor(pad(fmt(current), 16)) +
        C.ceiling(pad(fmt(ceiling), 16)) +
        C.accent(pad(fmt(refPrice), 16)) +
        C.floor(pad(fmt(floor), 16)),
        C.frame, w
    ));
    lines.push(boxBlank(C.frame, w));
    lines.push(boxRow(
        changeFmt(changePct) + '  ' +
        (changePct >= 0 ? C.up : C.down)(`(${changePct >= 0 ? '+' : ''}${Math.round(changeAmt).toLocaleString('vi-VN')} đ)`) +
        '    ' + C.label('VOL') + ' ' + C.value(info.totalVolume || '---'),
        C.frame, w
    ));
    lines.push(boxRow(
        C.floor('FLR') + '  ' + progressBar + '  ' + C.ceiling('CEIL') +
        C.muted(`  ${(positionPct * 100).toFixed(0)}% from floor`),
        C.frame, w
    ));
    if (info.high52w || info.low52w) {
        lines.push(boxBlank(C.frame, w));
        lines.push(boxRow(
            C.label('52W High') + ' ' + C.upBold(fmt(info.high52w)) +
            '    ' + C.label('52W Low') + ' ' + C.downBold(fmt(info.low52w)),
            C.frame, w
        ));
    }
    lines.push(boxBot(C.frame, w));
    lines.push('');
    return lines;
}

function buildTechnicalLines(chartData) {
    const lines = [];
    const w = BOX_WIDTH();
    if (!chartData || chartData.length < 20) return lines;

    const closes = chartData.map(c => parseFloat(c.close));
    const rsi = calcRSI(closes, 14);
    const ma5 = calcSMA(closes, 5);
    const ma20 = calcSMA(closes, 20);
    const ma50 = calcSMA(closes, 50);
    const macd = calcMACD(closes);
    const bb = calcBollinger(closes, 20);
    const atr = calcATR(chartData.map((c, i) => ({
        high: parseFloat(c.high), low: parseFloat(c.low),
        close: i > 0 ? parseFloat(chartData[i - 1].close) : parseFloat(c.close)
    })));
    const current = closes[closes.length - 1];
    const fmt2 = v => v !== null ? (v * 1000).toFixed(0) : 'N/A';

    lines.push(boxTop('TECHNICALS', C.accent, w));

    if (rsi !== null) {
        let rsiLabel = C.warn('NEUTRAL');
        if (rsi >= 70) rsiLabel = C.downBold('OVERBOUGHT');
        else if (rsi <= 30) rsiLabel = C.upBold('OVERSOLD');
        else if (rsi >= 60) rsiLabel = C.up('MOMENTUM UP');
        else if (rsi <= 40) rsiLabel = C.down('MOMENTUM DOWN');

        lines.push(boxRow(
            C.label('RSI(14)') + ' ' + C.value(rsi.toFixed(1)) +
            '  ' + renderGauge(rsi, 18) + '  ' + rsiLabel,
            C.accent, w
        ));
    }

    if (macd) {
        const macdClr = macd.histogram > 0 ? C.up : C.down;
        const crossLabel = macd.histogram > 0 ? C.up('BULLISH') : C.down('BEARISH');
        lines.push(boxRow(
            C.label('MACD') + ' ' + macdClr(`${macd.macd >= 0 ? '+' : ''}${(macd.macd * 1000).toFixed(2)}`) +
            '  ' + C.label('Sig') + ' ' + macdClr(`${(macd.signal * 1000).toFixed(2)}`) +
            '  ' + C.label('Hist') + ' ' + macdClr(`${macd.histogram >= 0 ? '+' : ''}${(macd.histogram * 1000).toFixed(2)}`) +
            '  ' + crossLabel,
            C.accent, w
        ));
    }

    const maLine = [
        ma5 !== null ? (C.label('MA5') + ' ' + (current >= ma5 ? C.up : C.down)(fmt2(ma5))) : '',
        ma20 !== null ? (C.label('MA20') + ' ' + (current >= ma20 ? C.up : C.down)(fmt2(ma20))) : '',
        ma50 !== null ? (C.label('MA50') + ' ' + (current >= ma50 ? C.up : C.down)(fmt2(ma50))) : '',
    ].filter(Boolean).join('   ');

    let trendLabel = '';
    if (ma5 && ma20 && ma50) {
        if (ma5 > ma20 && ma20 > ma50) trendLabel = C.upBold('↑ UPTREND (MA5>MA20>MA50)');
        else if (ma5 < ma20 && ma20 < ma50) trendLabel = C.downBold('↓ DOWNTREND (MA5<MA20<MA50)');
        else if (ma5 > ma20) trendLabel = C.warn('→ POTENTIAL REVERSAL');
        else trendLabel = C.muted('◈ SIDEWAYS');
    }

    lines.push(boxRow(maLine, C.accent, w));
    if (trendLabel) lines.push(boxRow('  ' + trendLabel, C.accent, w));

    if (bb) {
        const pos = (current - bb.lower) / (bb.upper - bb.lower);
        let bbLabel = C.warn('Below midline');
        if (pos >= 0.9) bbLabel = C.down('Near UPPER band');
        else if (pos <= 0.1) bbLabel = C.up('Near LOWER band');
        else if (pos >= 0.6) bbLabel = C.up('Above midline');

        lines.push(boxRow(
            C.label('BB') + '  ' +
            C.floor('Lo ' + fmt2(bb.lower)) + '  ' +
            C.white('Mid ' + fmt2(bb.mid)) + '  ' +
            C.ceiling('Hi ' + fmt2(bb.upper)),
            C.accent, w
        ));
        lines.push(boxRow('  ' + bbLabel, C.accent, w));
    }

    if (atr) {
        lines.push(boxRow(
            C.label('ATR(14)') + ' ' + C.value(parseInt((atr * 1000).toFixed(0)).toLocaleString('vi-VN') + ' đ') +
            C.muted('  avg session range'),
            C.accent, w
        ));
    }

    lines.push(boxBot(C.accent, w));
    lines.push('');
    return lines;
}

function buildValuationLines(info, profile) {
    const lines = [];
    const pe = info.pe || profile?.peRatio || '---';
    const pb = info.pb || '---';
    const eps = info.eps || '---';
    const bvps = info.bvps || '---';
    const mkt = info.marketCap || profile?.marketCap || '---';
    const exch = info.exchange || profile?.exchange || '---';

    lines.push(sectionTitle('Valuation', C.accent, BOX_WIDTH()));

    const tbl = new Table({
        head: [C.label('P/E'), C.label('P/B'), C.label('EPS'), C.label('BVPS'), C.label('MKT CAP'), C.label('EXCH')],
        colWidths: [10, 10, 14, 14, 16, 10],
        style: { border: [], head: [], 'padding-left': 1, 'padding-right': 1 },
    });
    const peNum = parseFloat(pe);
    const peColor = isNaN(peNum) ? C.muted : peNum > 25 ? C.down : peNum < 10 ? C.up : C.warn;
    tbl.push([
        peColor(pe.toString()), C.white(pb.toString()),
        C.white(eps.toString()), C.white(bvps.toString()),
        C.white(typeof mkt === 'number' ? (mkt / 1e9).toFixed(1) + 'B' : mkt.toString()),
        C.frame(exch),
    ]);
    tbl.toString().split('\n').forEach(l => lines.push(l));
    lines.push('');
    return lines;
}

function buildForeignLines(info) {
    const lines = [];
    const w = BOX_WIDTH();
    const fBuy = info.foreignBuy || info.foreignBuyVol || null;
    const fSell = info.foreignSell || info.foreignSellVol || null;
    const fNet = info.foreignNet || info.foreignNetVal || null;
    if (!fBuy && !fSell && !fNet) return lines;

    const fBuyN = parseFloat((fBuy || '0').toString().replace(/[^0-9.-]/g, ''));
    const fSellN = parseFloat((fSell || '0').toString().replace(/[^0-9.-]/g, ''));
    const netN = fNet ? parseFloat((fNet || '0').toString().replace(/[^0-9.-]/g, '')) : fBuyN - fSellN;
    const netColor = netN >= 0 ? C.upBold : C.downBold;
    const netArrow = netN >= 0 ? 'NET BUY' : 'NET SELL';

    lines.push(boxTop('FOREIGN FLOW', C.frame, w));
    lines.push(boxRow(
        C.up('Buy ') + C.upBold(String(fBuy || '---')) +
        '    ' + C.down('Sell ') + C.downBold(String(fSell || '---')) +
        '    ' + C.label('Net') + ' ' + netColor((netN >= 0 ? '+' : '') + netN.toLocaleString('vi-VN') + '  ' + netArrow),
        C.frame, w
    ));
    lines.push(boxBot(C.frame, w));
    lines.push('');
    return lines;
}

function buildCompanyLines(profile) {
    const lines = [];
    const w = BOX_WIDTH();

    const clip = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

    const rows = [
        ['Listed', profile.listing_date],
        ['Charter', profile.charter_capital],
        ['Shares', profile.shares_listed],
        ['Industry', profile.industry],
        ['Address', profile.address],
        ['Web', profile.website],
        ['Email', profile.email],
    ].filter(([, v]) => v);

    if (rows.length === 0 && !(profile.companyName || profile.overview)) return lines;

    lines.push(boxTop('COMPANY PROFILE', C.frame, w));

    // Plain summary — wrap fully (no hard ellipsis cut-off)
    const raw = String(profile.overview || profile.description || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (raw) {
        const chunk = Math.max(20, w - 6);
        for (let i = 0; i < raw.length; i += chunk) {
            lines.push(boxRow(C.italic(raw.slice(i, i + chunk)), C.frame, w));
        }
        lines.push(boxBlank(C.frame, w));
    }

    rows.forEach(([label, val]) => {
        const text = clip(val);
        const labelPart = C.label(pad(label, 10));
        const chunk = Math.max(16, w - 18);
        if (text.length <= chunk) {
            lines.push(boxRow(labelPart + C.white(text), C.frame, w));
            return;
        }
        lines.push(boxRow(labelPart + C.white(text.slice(0, chunk)), C.frame, w));
        for (let i = chunk; i < text.length; i += chunk) {
            lines.push(boxRow(' '.repeat(10) + C.white(text.slice(i, i + chunk)), C.frame, w));
        }
    });

    lines.push(boxBot(C.frame, w));
    lines.push('');
    return lines;
}

export function buildNewsLines(newsData, symbol = '', maxItems = 7, { withLinks = true } = {}) {
    const lines = [];
    const w = BOX_WIDTH();
    if (!newsData || newsData.length === 0) return lines;

    lines.push(boxTop(`NEWS${symbol ? ' — ' + symbol : ''}`, C.frame, w));

    newsData.slice(0, maxItems).forEach((n, i) => {
        const sl = (n.sentiment || '').toLowerCase();
        let icon = C.muted('·');
        let clr = C.muted;
        if (sl.includes('pos') || sl === 'tích cực') { icon = C.up('▲'); clr = C.up; }
        else if (sl.includes('neg') || sl === 'tiêu cực') { icon = C.down('▼'); clr = C.down; }

        const title = (n.title || 'Untitled').slice(0, 64);
        const src = n.source ? C.muted(` [${n.source}]`) : '';
        const date = n.date ? C.muted(` ${n.date}`) : '';
        const aiTag = n.isAiGenerated ? C.accent(' [AI]') : '';
        const idx = C.accent(String(i + 1).padStart(2, '0'));

        lines.push(boxRow(`${idx} ${icon} ${clr(title)}${src}${date}${aiTag}`, C.frame, w));

        if (withLinks && n.link) {
            // Label only — full URL opened via workspace menu (OSC URL must not inflate visible width)
            const osc = `\x1b]8;;${n.link}\x07${C.floor('[open]')}\x1b]8;;\x07`;
            lines.push(boxRow(`    ${osc}`, C.frame, w));
        }

        if (i < Math.min(maxItems, newsData.length) - 1) {
            lines.push(boxRow(C.muted('  ' + '·'.repeat(60)), C.frame, w));
        }
    });

    if (newsData.length > maxItems) {
        lines.push(boxBlank(C.frame, w));
        lines.push(boxRow(C.muted(`  … and ${newsData.length - maxItems} more`), C.frame, w));
    }

    lines.push(boxBot(C.frame, w));
    lines.push('');
    return lines;
}

/** Chart-only buffer for a given interval label */
export function buildChartOnlyBuffer(chartData, symbol, intervalLabel) {
    const buf = new ScreenBuffer();
    const { cols } = getTermSize();
    buf.blank()
        .line(C.accentBold(`  ${symbol}`) + C.muted(`  ·  ${intervalLabel}`) + C.muted(`  ·  ${chartData?.length || 0} bars`))
        .blank();
    if (!chartData || chartData.length === 0) {
        buf.line(C.warn('  No candle data for this interval.'));
        return buf;
    }
    const chartW = Math.min(cols - 20, 72);
    renderCandles(chartData, { width: chartW, height: 14, showVolume: true })
        .forEach(l => buf.line(l));
    buf.blank().line(divider('─', BOX_WIDTH(), C.muted));
    return buf;
}

export function buildActionLines(actionData, symbol = '') {
    const lines = [];
    const w = BOX_WIDTH();
    if (!actionData) return lines;

    const action = actionData.action || actionData.signal || 'QUAN SÁT';
    const trend = actionData.trend || actionData.mechTrend || '---';
    const sl = actionData.sl || actionData.stopLoss || '---';
    const tp1 = actionData.tp1 || actionData.takeProfit1 || '---';
    const tp2 = actionData.tp2 || actionData.takeProfit2 || '---';
    const rr = actionData.rrRatio || '---';
    const score = actionData.score || actionData.confidence || null;
    const reason = actionData.reason || actionData.mechReason || '';
    const entry = actionData.entry || actionData.entryZone || '---';

    let actionBg = badge(action, 'warn');
    let actionColor = C.warn;
    if (/LONG|MUA|BUY/i.test(action)) { actionBg = badge(action, 'up'); actionColor = C.up; }
    else if (/SHORT|BÁN|SELL/i.test(action)) { actionBg = badge(action, 'down'); actionColor = C.down; }

    const scoreBar = score !== null ? renderGauge(parseFloat(score), 18) : '';

    lines.push(boxTop(`ACTION${symbol ? ' — ' + symbol : ''}`, C.accent, w));
    lines.push(boxBlank(C.accent, w));
    lines.push(boxRow(
        '  ' + actionBg +
        (trend !== '---' ? '   ' + C.label('Trend') + ' ' + actionColor(trend) : '') +
        (scoreBar ? '   ' + scoreBar : ''),
        C.accent, w
    ));
    lines.push(boxBlank(C.accent, w));

    if (sl !== '---' || tp1 !== '---') {
        const fmtPrice = v => {
            if (v === '---' || !v) return C.muted('---');
            const n = parseFloat(v.toString().replace(/[^0-9.]/g, ''));
            return isNaN(n) ? C.muted(v) : C.value(n.toLocaleString('vi-VN'));
        };
        lines.push(boxRow(
            C.label('Entry') + ' ' + C.accentBold(String(entry)) +
            '   ' + C.label('SL') + ' ' + C.downBold(fmtPrice(sl)) +
            '   ' + C.label('R:R') + ' ' + C.accentBold(rr),
            C.accent, w
        ));
        lines.push(boxRow(
            C.label('TP1') + ' ' + C.upBold(fmtPrice(tp1)) +
            '   ' + C.label('TP2') + ' ' + C.upBold(fmtPrice(tp2)),
            C.accent, w
        ));
    }

    if (reason) {
        lines.push(boxBlank(C.accent, w));
        const words = reason.split(' '); let line = ''; const wrapped = [];
        words.forEach(word => {
            if ((line + ' ' + word).length > 70) { wrapped.push(line); line = word; }
            else line = line ? line + ' ' + word : word;
        });
        if (line) wrapped.push(line);
        wrapped.forEach(l => lines.push(boxRow(C.italic('  ' + l), C.accent, w)));
    }

    lines.push(boxBlank(C.accent, w));
    lines.push(boxBot(C.accent, w));
    lines.push('');
    return lines;
}

//=======================================================================
// MAIN EXPORTS
//=======================================================================

/**
 * Overview buffer — company + key metrics only.
 * Chart / AI / News live in their own workspace actions.
 */
export function buildStockBuffer(marketData, chartData, actionData = null, _newsData = null) {
    const buf = new ScreenBuffer();
    if (!marketData) return buf;

    const info = marketData.stockInfo || {};
    const profile = marketData.companyProfile || {};

    buf.blank();
    bigHeaderLines(
        info.symbol || '???',
        profile.companyName || info.companyName || 'N/A',
        info.exchange || profile.exchange || 'VNX',
        profile.industry || ''
    ).forEach(l => buf.line(l));

    buf.blank()
        .line(`  ${badge('LIVE', 'live')}  ${C.muted(new Date().toLocaleTimeString('vi-VN'))}` +
            C.muted('  ·  overview = company + metrics'))
        .blank();

    // Price & band indicators
    buildPricePanelLines(info, chartData).forEach(l => buf.line(l));

    // Compact technicals (RSI / MACD / MA) as indicators — no full candle chart
    if (chartData && chartData.length >= 14) {
        buildTechnicalLines(chartData).forEach(l => buf.line(l));
    }

    buildValuationLines(info, profile).forEach(l => buf.line(l));
    buildForeignLines(info).forEach(l => buf.line(l));
    buildCompanyLines(profile).forEach(l => buf.line(l));

    if (marketData.reportPdf) {
        const url = String(marketData.reportPdf);
        const short = url.length > 70 ? url.slice(0, 67) + '…' : url;
        buf.line(C.muted('  TCBS: ') + C.frame(short)).blank();
    }

    buf.line(divider('─', BOX_WIDTH(), C.muted));
    buf.line(C.muted('  Tip: use Chart / AI / News from the workspace menu'));
    return buf;
}

export function renderStockDetail(marketData, chartData, actionData = null, newsData = null) {
    buildStockBuffer(marketData, chartData, actionData, newsData).lines.forEach(l => console.log(l));
}

export function buildAiReportLines(aiReport, symbol = '') {
    const lines = [];
    const w = BOX_WIDTH();
    if (!aiReport) {
        lines.push('');
        lines.push(C.warn('  AI engine returned no report. Try again later.'));
        return lines;
    }

    const header = `  OMNI DUCK · AI STRATEGIC REPORT${symbol ? ' — ' + symbol : ''}`;
    lines.push('');
    lines.push(C.accent('═'.repeat(w)));
    lines.push(C.accentBold(pad(header, w)));
    lines.push(C.accent('═'.repeat(w)));
    lines.push('');

    let clean = aiReport
        .replace(/<span\s+className="[^"]*text-emerald[^"]*"[^>]*>([\s\S]*?)<\/span>/g, (_, t) => C.upBold(t))
        .replace(/<span\s+className="[^"]*text-green[^"]*"[^>]*>([\s\S]*?)<\/span>/g, (_, t) => C.upBold(t))
        .replace(/<span\s+className="[^"]*text-red[^"]*"[^>]*>([\s\S]*?)<\/span>/g, (_, t) => C.downBold(t))
        .replace(/<span\s+className="[^"]*text-yellow[^"]*"[^>]*>([\s\S]*?)<\/span>/g, (_, t) => C.accentBold(t))
        .replace(/<span\s+className="[^"]*text-blue[^"]*"[^>]*>([\s\S]*?)<\/span>/g, (_, t) => C.floor(t))
        .replace(/<span\s+className="[^"]*text-cyan[^"]*"[^>]*>([\s\S]*?)<\/span>/g, (_, t) => C.frame(t))
        .replace(/<span\s+className="[^"]*text-white[^"]*"[^>]*>([\s\S]*?)<\/span>/g, (_, t) => C.white(t))
        .replace(/<span\s+className="[^"]*font-black[^"]*"[^>]*>([\s\S]*?)<\/span>/g, (_, t) => C.value(t))
        .replace(/<\/?span[^>]*>/g, '')
        .replace(/\*\*(.*?)\*\*/g, (_, t) => C.value(t))
        .replace(/^#{1,3}\s+(.+)$/gm, (_, t) => '\n' + C.accentBold('  ▸  ' + t.toUpperCase()))
        .replace(/^---+$/gm, C.muted('─'.repeat(w)))
        .replace(/^[\-•]\s+/gm, '  · ')
        .replace(/^\d+\.\s+/gm, m => C.muted(m));

    clean.split('\n').forEach(line => {
        if (!line.trim()) { lines.push(''); return; }
        if (line.includes('▸')) lines.push(line);
        else if (line.startsWith('  ·')) lines.push('  ' + C.muted('·') + line.slice(3));
        else lines.push('  ' + line);
    });

    lines.push('');
    lines.push(C.accent('═'.repeat(w)));
    lines.push(C.muted('  Research only. Not investment advice.'));
    lines.push(C.accent('═'.repeat(w)));
    return lines;
}

export function renderAiReport(aiReport, symbol = '') {
    buildAiReportLines(aiReport, symbol).forEach(l => console.log(l));
}
