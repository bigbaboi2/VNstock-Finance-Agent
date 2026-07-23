import Table from 'cli-table3';
import {
    C, contentWidth, badge, changeFmt, sectionTitle, divider, hbar
} from '../theme.js';
import { renderSparkline } from '../charts.js';
import { ScreenBuffer } from '../screenManager.js';

/**
 * Normalize /market-radar payload.
 * Backend returns: { success, isLive, data: <intelligence fields> }
 * (intelligence is flat on `data`, not nested under data.intelligence)
 */
function extractIntelligence(apiResponse) {
    if (!apiResponse) return { ok: false, message: 'Empty response' };

    if (apiResponse.success === false) {
        return { ok: false, message: apiResponse.message || 'Radar request failed' };
    }

    const payload = apiResponse.data !== undefined ? apiResponse.data : apiResponse;

    if (payload == null) {
        return { ok: false, message: 'Quant cache empty — wait for market scan or open hours' };
    }

    // Wrapped shape: { success, intelligence: {...} }
    if (payload.intelligence && typeof payload.intelligence === 'object') {
        if (payload.success === false) {
            return { ok: false, message: payload.message || payload.error || 'Quant engine failed' };
        }
        return {
            ok: true,
            intel: payload.intelligence,
            isLive: apiResponse.isLive ?? payload.isLive ?? true,
        };
    }

    // Flat intelligence object (actual API / Mongo cache)
    if (payload.marketStatus != null || payload.indexChangePct != null || payload.breadthRatio != null) {
        return {
            ok: true,
            intel: payload,
            isLive: apiResponse.isLive ?? true,
        };
    }

    // Top-level already is intelligence
    if (apiResponse.marketStatus != null || apiResponse.indexChangePct != null) {
        return { ok: true, intel: apiResponse, isLive: apiResponse.isLive ?? true };
    }

    return { ok: false, message: apiResponse.message || 'Unrecognized radar payload' };
}

export function buildMarketBuffer(apiResponse) {
    const buf = new ScreenBuffer();
    const W = contentWidth();
    const extracted = extractIntelligence(apiResponse);

    if (!extracted.ok) {
        buf.blank().line(C.warn('  Market matrix unavailable or still initializing...'));
        if (extracted.message) buf.line(C.muted('  ' + extracted.message));
        return buf;
    }

    const intel = extracted.intel;
    const isLive = extracted.isLive;

    buf.sectionHeader('', 'MARKET RADAR — VN-INDEX', C.accent, W);

    const liveTag = isLive ? badge('LIVE', 'live') : badge('CACHE', 'cache');
    buf.blank()
        .line(`  ${liveTag}  ${C.muted(new Date().toLocaleTimeString('vi-VN'))}`)
        .blank();

    let statusTone = 'warn';
    if (intel.statusType === 'bullish') statusTone = 'up';
    if (intel.statusType === 'bearish') statusTone = 'down';

    buf.line(C.frame(`  ┌─ STATUS ${'─'.repeat(Math.max(0, W - 14))}┐`))
        .line(C.frame('  │') + `  ${badge(intel.marketStatus || 'N/A', statusTone)}`)
        .line(C.frame('  │') + `  ${C.label('Diagnosis')}  ${C.italic(intel.diagnosticDesc || '')}`)
        .line(C.frame(`  └${'─'.repeat(Math.max(0, W - 4))}┘`))
        .blank();

    const changePct = parseFloat(intel.indexChangePct);
    const breadthPct = parseFloat(intel.breadthRatio) || 0;
    const foreignVal = Number(intel.foreignNetValue);
    const foreignSrc = intel.foreignSource || '';
    const foreignMissing = !Number.isFinite(foreignVal) || foreignSrc === 'none';
    const foreignBn = foreignMissing ? null : (foreignVal / 1e9);
    const foreignText = foreignMissing
        ? C.warn('N/A (no feed)')
        : foreignBn >= 0
            ? C.upBold(`${foreignBn >= 0 ? '+' : ''}${foreignBn.toFixed(1)}B net buy`)
            : C.downBold(`${foreignBn.toFixed(1)}B net sell`);
    // Avoid "+0.0B net buy" when missing — already handled above
    const foreignDisplay = (!foreignMissing && Math.abs(foreignBn) < 0.05 && foreignSrc === 'none')
        ? C.warn('N/A')
        : foreignText;
    const breadthColor = breadthPct >= 60 ? C.upBold : breadthPct >= 45 ? C.accentBold : C.downBold;

    const metricsTable = new Table({
        head: [C.label('INDEX Δ'), C.label('BREADTH'), C.label('FOREIGN NET'), C.label('SOURCE')],
        colWidths: [
            16,
            24,
            22,
            Math.max(28, Math.min(42, W - 16 - 24 - 22 - 8)),
        ],
        style: { border: [], head: [], 'padding-left': 1, 'padding-right': 1 },
        wordWrap: true,
        wrapOnWordBoundary: true,
    });
    metricsTable.push([
        changeFmt(changePct),
        breadthColor(`${intel.breadthRatio}%`) + ' ' + hbar(breadthPct, 10),
        foreignDisplay,
        C.value(intel.breadthSource || 'N/A'),
    ]);
    metricsTable.toString().split('\n').forEach(l => buf.line(l));
    if (intel.breadthSource && String(intel.breadthSource).length > 36) {
        buf.line(`  ${C.label('Breadth src')}  ${C.muted(String(intel.breadthSource))}`);
    }
    if (foreignSrc && foreignSrc !== 'none') {
        buf.line(`  ${C.label('Foreign src')}  ${C.muted(foreignSrc)}`);
    } else if (foreignMissing) {
        buf.line(`  ${C.label('Foreign src')}  ${C.warn('unavailable — feeds offline')}`);
    }

    buf.blank()
        .line(`  ${C.label('Breadth pulse')}  ${renderSparkline(
            Array.from({ length: 24 }, (_, i) => breadthPct + Math.sin(i / 3) * 3),
            Math.min(36, W - 24)
        )}`)
        .blank();

    buf.line(sectionTitle('Sector flow', C.accent, W)).blank();

    const colW = Math.floor((W - 6) / 2);
    const sectorTable = new Table({
        head: [C.upBold('STRONG (SPS > 0)'), C.downBold('WEAK (SPS < 0)')],
        colWidths: [colW, colW],
        style: { border: [], head: [], 'padding-left': 1, 'padding-right': 1 },
    });

    const maxRows = Math.max(intel.strongSectors?.length || 0, intel.weakSectors?.length || 0);
    if (maxRows === 0) {
        sectorTable.push([C.muted('No surge flow'), C.muted('No sell pressure')]);
    } else {
        for (let i = 0; i < maxRows; i++) {
            const s = intel.strongSectors?.[i];
            const wSec = intel.weakSectors?.[i];
            sectorTable.push([
                s ? `${C.upBold(s.name)}\n  ${C.muted('SPS')} ${C.up(s.sps?.toFixed(2) || '—')}  ${C.muted(s.tickers?.slice(0, 3).join(' · ') || '')}` : '',
                wSec ? `${C.downBold(wSec.name)}\n  ${C.muted('SPS')} ${C.down(wSec.sps?.toFixed(2) || '—')}  ${C.muted(wSec.tickers?.slice(0, 3).join(' · ') || '')}` : '',
            ]);
        }
    }
    sectorTable.toString().split('\n').forEach(l => buf.line(l));

    const topGainers = intel.topGainers || [];
    const topLosers = intel.topLosers || [];
    const topVolume = intel.topVolume || [];

    if (topGainers.length > 0 || topLosers.length > 0) {
        buf.blank().line(sectionTitle('Top movers', C.accent, W)).blank();

        const moverTable = new Table({
            head: [C.upBold('GAINERS'), C.downBold('LOSERS'), C.frame('VOLUME')],
            colWidths: [24, 24, 24],
            style: { border: [], head: [], 'padding-left': 1, 'padding-right': 1 },
        });

        const maxM = Math.max(topGainers.length, topLosers.length, topVolume.length);
        for (let i = 0; i < Math.min(maxM, 3); i++) {
            const g = topGainers[i];
            const l = topLosers[i];
            const v = topVolume[i];
            moverTable.push([
                g ? `${C.upBold(g.symbol)}  ${C.up('+' + (g.changePct || '—') + '%')}` : '',
                l ? `${C.downBold(l.symbol)}  ${C.down((l.changePct || '—') + '%')}` : '',
                v ? `${C.value(v.symbol)}  ${C.muted(v.volume || '—')}` : '',
            ]);
        }
        moverTable.toString().split('\n').forEach(l => buf.line(l));
    }

    buf.blank().line(divider('─', W, C.muted));
    return buf;
}

export function renderMarketRadar(apiResponse) {
    buildMarketBuffer(apiResponse).lines.forEach(l => console.log(l));
}
