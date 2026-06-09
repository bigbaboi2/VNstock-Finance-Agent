import Table from 'cli-table3';
import chalk from 'chalk';
import { ScreenBuffer, getTermSize } from './screenManager.js';

function scoreBar(score, width = 20) {
    const filled = Math.round((score / 100) * width);
    const empty  = width - filled;
    let barColor = chalk.yellow;
    if (score >= 65) barColor = chalk.green;
    if (score <= 35) barColor = chalk.red;
    return barColor('█'.repeat(filled)) + chalk.dim('░'.repeat(empty)) + ` ${score}/100`;
}

export function buildDerivBuffer(derivRadar, derivAnalysis, volumeProfile) {
    const buf      = new ScreenBuffer();
    const { cols } = getTermSize();
    const W        = Math.min(cols - 2, 100);

    if (!derivRadar || !derivAnalysis) {
        buf.blank().line(chalk.yellow('⚠  Không có dữ liệu phái sinh realtime.'));
        return buf;
    }

    // ── Header ────────────────────────────────────────────────────────────────
    buf.sectionHeader('⚡', 'QUANT ENGINE — PHÁI SINH VN30F1M REALTIME', chalk.magenta, W).blank();

    // ── Core Metrics ──────────────────────────────────────────────────────────
    buf.line(chalk.bold.white('  ══ CHỈ SỐ THỊ TRƯỜNG PHÁI SINH ══'));

    const basisNum      = parseFloat(derivRadar.basis || 0);
    const basisColor    = basisNum >= 0 ? chalk.green.bold : chalk.red.bold;
    const basisArrow    = basisNum >= 0 ? '▲' : '▼';
    const basisSpeedNum = parseFloat(derivRadar.basisSpeed || 0);
    const speedColor    = basisSpeedNum >= 0 ? chalk.green : chalk.red;
    const foreignNetNum = parseFloat(derivRadar.foreignNet || 0);
    const foreignColor  = foreignNetNum >= 0 ? chalk.green : chalk.red;
    const foreignArrow  = foreignNetNum >= 0 ? '▲' : '▼';

    const flowTable = new Table({
        head: [
            chalk.cyan.bold('Giá F1M'), chalk.cyan.bold('VN30 INDEX'),
            chalk.cyan.bold('Basis (độ lệch)'), chalk.cyan.bold('Tốc độ Basis'),
            chalk.cyan.bold('KN Khối Ngoại'),
        ],
        colWidths: [14, 14, 18, 16, 16],
        style: { border: ['magenta'], head: [] },
    });
    flowTable.push([
        chalk.yellow.bold(derivRadar.vn30f1m || '---'),
        chalk.white(derivRadar.vn30 || '---'),
        basisColor(`${basisArrow} ${derivRadar.basis || '---'}`),
        speedColor(`${basisSpeedNum >= 0 ? '+' : ''}${derivRadar.basisSpeed || '---'} đ/nhịp`),
        foreignColor(`${foreignArrow} ${derivRadar.foreignNet || '---'} HĐ`),
    ]);
    flowTable.toString().split('\n').forEach(l => buf.line(l));

    // ── OI / Volume ───────────────────────────────────────────────────────────
    if (derivRadar.openInterest || derivRadar.totalVolume || derivRadar.sessionVolume) {
        const extraTable = new Table({
            head: [chalk.cyan.bold('Open Interest (OI)'), chalk.cyan.bold('KL Phiên'), chalk.cyan.bold('KL Tổng')],
            colWidths: [25, 24, 24],
            style: { border: ['dim'], head: [] },
        });
        extraTable.push([
            chalk.white(derivRadar.openInterest ? parseInt(derivRadar.openInterest).toLocaleString('vi-VN') + ' HĐ' : '---'),
            chalk.white(derivRadar.sessionVolume ? parseInt(derivRadar.sessionVolume).toLocaleString('vi-VN') + ' HĐ' : '---'),
            chalk.white(derivRadar.totalVolume   ? parseInt(derivRadar.totalVolume).toLocaleString('vi-VN')   + ' HĐ' : '---'),
        ]);
        extraTable.toString().split('\n').forEach(l => buf.line(l));
    }

    // ── Confluence Score ──────────────────────────────────────────────────────
    buf.blank().line(chalk.bold.white('  ══ CONFLUENCE ANALYSIS SCORE ══')).blank();

    let actionBg    = chalk.bgYellow.black;
    let trendColor  = chalk.yellow;
    if (derivAnalysis.mechAction?.includes('LONG'))  { actionBg = chalk.bgGreen.black; trendColor = chalk.green; }
    if (derivAnalysis.mechAction?.includes('SHORT')) { actionBg = chalk.bgRed.white;   trendColor = chalk.red;   }

    buf.line(`  Điểm Hợp Lưu:     ${scoreBar(derivAnalysis.score || 50)}`)
       .line(`  Đề xuất hệ thống: ${actionBg.bold(` ${derivAnalysis.mechAction || 'N/A'} `)}`)
       .line(`  Xu hướng:         ${trendColor.bold(derivAnalysis.mechTrend || 'N/A')}`)
       .blank();

    // ── Volume Profile POC ────────────────────────────────────────────────────
    if (volumeProfile?.pocPrice) {
        buf.line(chalk.bold.white('  ══ VOLUME PROFILE — VÙNG KẸT LỆNH ══'));
        buf.blank()
           .line(`  📍 ${chalk.dim('POC (Point of Control):')} ${chalk.yellow.bold(volumeProfile.pocPrice)}  ${chalk.dim('|  Khoảng cách:')} ${chalk.cyan(derivAnalysis.pocDistance)}`)
           .blank();

        const maxVol = volumeProfile.maxVol || 1;
        volumeProfile.bins?.slice(0, 8).forEach(b => {
            const isPoc  = b.priceCenter == volumeProfile.pocPrice;
            const barLen = Math.max(1, Math.round((b.volume / maxVol) * 25));
            const bar    = '█'.repeat(barLen);
            const vol    = parseInt(b.volume || 0).toLocaleString('vi-VN');

            if (isPoc) {
                buf.line(`  ${chalk.yellow.bold(String(b.priceCenter).padStart(8))}  ${chalk.yellow.bold(bar.padEnd(26))} ${chalk.yellow.bold('[POC] ' + vol)}`);
            } else {
                buf.line(`  ${chalk.dim(String(b.priceCenter).padStart(8))}  ${chalk.dim(bar.padEnd(26))} ${chalk.dim(vol)}`);
            }
        });
        buf.blank();
    }

    // ── Trade Plan ────────────────────────────────────────────────────────────
    buf.line(chalk.bold.white('  ══ 🎯 KẾ HOẠCH THỰC THI LỆNH ══'));

    const planTable = new Table({
        head: [
            chalk.cyan.bold('Entry (Vào lệnh)'), chalk.red.bold('Stop Loss (SL)'),
            chalk.green.bold('Take Profit 1 (TP1)'), chalk.green.bold('Take Profit 2 (TP2)'),
            chalk.white.bold('Risk:Reward'),
        ],
        colWidths: [19, 16, 21, 21, 14],
        style: { border: ['yellow'], head: [] },
    });
    planTable.push([
        chalk.yellow.bold(String(derivRadar.vn30f1m || '---')),
        chalk.red.bold(String(derivAnalysis.sl || '---')),
        chalk.green.bold(String(derivAnalysis.tp1 || '---')),
        chalk.green.bold(String(derivAnalysis.tp2 || '---')),
        chalk.white(String(derivAnalysis.rrRatio || '1:1.5')),
    ]);
    planTable.toString().split('\n').forEach(l => buf.line(l));

    // ── Reasoning ─────────────────────────────────────────────────────────────
    buf.blank()
       .line('  ' + chalk.dim('Phân tích cấu trúc:'))
       .line('  ' + chalk.italic.gray(derivAnalysis.mechReason || 'Chưa có phân tích.'))
       .blank()
       .divider('─', W, chalk.dim)
       .line(chalk.dim('  ⚠  Dữ liệu mô phỏng/ước tính. Không phải khuyến nghị giao dịch thực tế.'))
       .divider('─', W, chalk.dim);

    return buf;
}

export function renderDerivativesMatrix(derivRadar, derivAnalysis, volumeProfile) {
    buildDerivBuffer(derivRadar, derivAnalysis, volumeProfile).lines.forEach(l => console.log(l));
}