import Table from 'cli-table3';
import {
    C, contentWidth, badge, sectionTitle, divider
} from '../theme.js';
import { renderVolumeProfile, renderGauge } from '../charts.js';
import { ScreenBuffer } from '../screenManager.js';

export function buildDerivBuffer(derivRadar, derivAnalysis, volumeProfile) {
    const buf = new ScreenBuffer();
    const W = contentWidth();

    if (!derivRadar || !derivAnalysis) {
        buf.blank().line(C.warn('  No realtime derivatives data.'));
        return buf;
    }

    buf.sectionHeader('', 'QUANT ENGINE — VN30F1M', C.accent, W).blank();

    buf.line(sectionTitle('Market tape', C.accent, W)).blank();

    const basisNum = parseFloat(derivRadar.basis || 0);
    const basisColor = basisNum >= 0 ? C.upBold : C.downBold;
    const basisArrow = basisNum >= 0 ? '▲' : '▼';
    const basisSpeedNum = parseFloat(derivRadar.basisSpeed || 0);
    const speedColor = basisSpeedNum >= 0 ? C.up : C.down;
    const foreignNetNum = parseFloat(derivRadar.foreignNet || 0);
    const foreignColor = foreignNetNum >= 0 ? C.up : C.down;
    const foreignArrow = foreignNetNum >= 0 ? '▲' : '▼';

    const flowTable = new Table({
        head: [
            C.label('F1M'), C.label('VN30'),
            C.label('BASIS'), C.label('BASIS Δ'),
            C.label('FOREIGN'),
        ],
        colWidths: [14, 14, 16, 16, 16],
        style: { border: [], head: [], 'padding-left': 1, 'padding-right': 1 },
    });
    flowTable.push([
        C.accentBold(derivRadar.vn30f1m || '---'),
        C.white(derivRadar.vn30 || '---'),
        basisColor(`${basisArrow} ${derivRadar.basis || '---'}`),
        speedColor(`${basisSpeedNum >= 0 ? '+' : ''}${derivRadar.basisSpeed || '---'}/tick`),
        foreignColor(`${foreignArrow} ${derivRadar.foreignNet || '---'} ctr`),
    ]);
    flowTable.toString().split('\n').forEach(l => buf.line(l));

    if (derivRadar.openInterest || derivRadar.totalVolume || derivRadar.sessionVolume) {
        const extraTable = new Table({
            head: [C.label('OPEN INTEREST'), C.label('SESSION VOL'), C.label('TOTAL VOL')],
            colWidths: [24, 24, 24],
            style: { border: [], head: [], 'padding-left': 1, 'padding-right': 1 },
        });
        extraTable.push([
            C.white(derivRadar.openInterest ? parseInt(derivRadar.openInterest).toLocaleString('vi-VN') + ' ctr' : '---'),
            C.white(derivRadar.sessionVolume ? parseInt(derivRadar.sessionVolume).toLocaleString('vi-VN') + ' ctr' : '---'),
            C.white(derivRadar.totalVolume ? parseInt(derivRadar.totalVolume).toLocaleString('vi-VN') + ' ctr' : '---'),
        ]);
        extraTable.toString().split('\n').forEach(l => buf.line(l));
    }

    buf.blank().line(sectionTitle('Confluence', C.accent, W)).blank();

    let actionTone = 'warn';
    let trendColor = C.warn;
    if (derivAnalysis.mechAction?.includes('LONG')) { actionTone = 'up'; trendColor = C.up; }
    if (derivAnalysis.mechAction?.includes('SHORT')) { actionTone = 'down'; trendColor = C.down; }

    buf.line(`  ${C.label('Score')}     ${renderGauge(derivAnalysis.score || 50, 22)}`)
        .line(`  ${C.label('Signal')}    ${badge(derivAnalysis.mechAction || 'N/A', actionTone)}`)
        .line(`  ${C.label('Trend')}     ${trendColor(derivAnalysis.mechTrend || 'N/A')}`)
        .blank();

    if (volumeProfile?.pocPrice) {
        buf.blank();
        renderVolumeProfile(volumeProfile.bins || [], volumeProfile.maxVol || 1, {
            width: Math.min(30, W - 30),
            pocPrice: volumeProfile.pocPrice,
            maxRows: 8,
        }).forEach(l => buf.line(l));
        buf.blank()
            .line(`  ${C.label('POC distance')}  ${C.accent(derivAnalysis.pocDistance || '—')}`)
            .blank();
    }

    buf.line(sectionTitle('Execution plan', C.accent, W)).blank();

    const planTable = new Table({
        head: [
            C.label('ENTRY'), C.downBold('STOP'),
            C.upBold('TP1'), C.upBold('TP2'),
            C.label('R:R'),
        ],
        colWidths: [16, 14, 14, 14, 12],
        style: { border: [], head: [], 'padding-left': 1, 'padding-right': 1 },
    });
    planTable.push([
        C.accentBold(String(derivRadar.vn30f1m || '---')),
        C.downBold(String(derivAnalysis.sl || '---')),
        C.upBold(String(derivAnalysis.tp1 || '---')),
        C.upBold(String(derivAnalysis.tp2 || '---')),
        C.white(String(derivAnalysis.rrRatio || '1:1.5')),
    ]);
    planTable.toString().split('\n').forEach(l => buf.line(l));

    buf.blank()
        .line('  ' + C.label('Structure'))
        .line('  ' + C.italic(derivAnalysis.mechReason || 'No analysis.'))
        .blank()
        .line(divider('─', W, C.muted))
        .line(C.muted('  Simulated / estimated. Not live trade advice.'))
        .line(divider('─', W, C.muted));

    return buf;
}

export function renderDerivativesMatrix(derivRadar, derivAnalysis, volumeProfile) {
    buildDerivBuffer(derivRadar, derivAnalysis, volumeProfile).lines.forEach(l => console.log(l));
}
