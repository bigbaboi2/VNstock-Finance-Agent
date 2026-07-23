/** Human-readable AutoDuck TXT log (logs/autoduck/YYYY-MM-DD/autoduck.txt). */
import fs from 'node:fs/promises';
import path from 'node:path';
import { getAutoDuckBoolean } from './autoDuckConfigService.js';

const DEFAULT_LOG_DIR = process.env.AUTODUCK_AUDIT_LOG_DIR || 'logs/autoduck';
const ICT_TZ = 'Asia/Ho_Chi_Minh';
const isAuditEnabled = () => getAutoDuckBoolean('AUTODUCK_AUDIT_ENABLED');

const formatIctTimestamp = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: ICT_TZ,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value || '00';
    return `${get('hour')}:${get('minute')}:${get('second')} ICT`;
};

const formatDuration = (ms) => {
    const n = Number(ms);
    if (!Number.isFinite(n) || n < 0) return '0s';
    if (n < 1000) return `${Math.round(n)}ms`;
    const sec = n / 1000;
    if (sec < 60) return `${sec.toFixed(1)}s`;
    const min = Math.floor(sec / 60);
    const rem = sec - min * 60;
    return `${min}m ${rem.toFixed(1)}s`;
};

const toIsoDate = (date = new Date()) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const resolveTxtPath = (date = new Date()) => {
    const day = toIsoDate(date);
    const dir = path.resolve(process.cwd(), DEFAULT_LOG_DIR, day);
    return {
        dir,
        file: path.resolve(dir, 'autoduck.txt'),
        day,
    };
};

const indentBlock = (text, indent = '  ') =>
    String(text || '')
        .split('\n')
        .map((line) => (line.trim() ? `${indent}${line}` : ''))
        .filter(Boolean)
        .join('\n');

const fmtKv = (obj = {}) => {
    const parts = [];
    for (const [k, v] of Object.entries(obj)) {
        if (v == null || v === '') continue;
        if (typeof v === 'object') continue;
        parts.push(`${k}=${v}`);
    }
    return parts.join('  ');
};

/**
 * Turn structured audit payload into readable lines (no raw JSON dump).
 */
export const formatAuditPayloadLines = (channel, eventName, payload = {}, meta = {}) => {
    const p = payload && typeof payload === 'object' ? payload : { message: String(payload) };
    const event = eventName || meta.event || 'event';
    const lines = [];

    switch (channel) {
        case 'pipeline': {
            if (event === 'pipeline_cycle_start') {
                lines.push(`CYCLE START`);
                lines.push(indentBlock(fmtKv({
                    asset: p.forcedAssetType,
                    mode: p.schedulerMode,
                    liveOnly: p.liveOnlyMode,
                    dryRun: p.dryRun,
                    thresholdRelax: p.thresholdRelax,
                    minOpenTarget: p.minOpenTarget,
                })));
            } else if (event === 'pipeline_cycle_end') {
                lines.push(`CYCLE END`);
                if (p.totalMs != null) lines.push(indentBlock(`total=${formatDuration(p.totalMs)}`));
                if (p.laps && typeof p.laps === 'object') {
                    const lapStr = Object.entries(p.laps)
                        .map(([k, ms]) => `${k}=${formatDuration(ms)}`)
                        .join('  ');
                    if (lapStr) lines.push(indentBlock(`laps: ${lapStr}`));
                }
                if (p.forcedAssetType) lines.push(indentBlock(`asset=${p.forcedAssetType}`));
            } else if (event === 'pipeline_cycle_error') {
                lines.push(`CYCLE ERROR`);
                lines.push(indentBlock(p.reason || p.message || 'unknown'));
            } else if (event === 'pipeline_log' || p.message) {
                lines.push(String(p.message));
                if (p.durationMs != null) lines.push(indentBlock(`duration=${formatDuration(p.durationMs)}`));
            } else {
                lines.push(event);
                const kv = fmtKv(p);
                if (kv) lines.push(indentBlock(kv));
            }
            break;
        }
        case 'candidate': {
            const stage = p.stage || 'reject';
            const verb = String(event).includes('reject') || stage ? 'REJECT' : 'CANDIDATE';
            lines.push(`${verb}  stage=${stage}  ${p.symbol || '?'}  score=${p.score ?? '-'}  setup=${p.setup || '-'}`);
            if (p.reason) lines.push(indentBlock(`reason: ${p.reason}`));
            if (p.asset) lines.push(indentBlock(`asset=${p.asset}  liveThreshold=${p.liveScoreThreshold ?? '-'}`));
            const bias = p.biasLedger;
            if (bias?.context?.reasons?.length) {
                lines.push(indentBlock(`bias: ${(bias.context.reasons || []).slice(0, 5).join(', ')}`));
            }
            break;
        }
        case 'funnel': {
            lines.push(`FUNNEL SUMMARY  ${p.asset || ''}`);
            lines.push(indentBlock(
                `scanned=${p.scanned ?? 0}  weak=${p.weak ?? 0}  vol=${p.vol ?? 0}  setup=${p.setup ?? 0}  ` +
                `sim_ok=${p.simOk ?? 0}  live_gate=${p.liveGate ?? 0}  ai_veto=${p.aiVeto ?? 0}  ` +
                `testnet=${p.testnet ?? 0}  matched_live=${p.matchedLive ?? 0}  matched_sim=${p.matchedSim ?? 0}`
            ));
            const setupReasons = p.setupReasons && Object.keys(p.setupReasons).length
                ? Object.entries(p.setupReasons).map(([k, v]) => `${k}=${v}`).join(', ')
                : '';
            if (setupReasons) lines.push(indentBlock(`setup_reasons: ${setupReasons}`));
            const liveReasons = p.liveGateReasons && Object.keys(p.liveGateReasons).length
                ? Object.entries(p.liveGateReasons).map(([k, v]) => `${k}=${v}`).join(', ')
                : '';
            if (liveReasons) lines.push(indentBlock(`live_gate_reasons: ${liveReasons}`));
            if (Array.isArray(p.topCandidates) && p.topCandidates.length) {
                lines.push(indentBlock('top_candidates:'));
                for (const t of p.topCandidates.slice(0, 8)) {
                    lines.push(indentBlock(
                        `• ${t.symbol}  score=${t.score ?? '-'}  setup=${t.setup || '-'}  fail=${t.fail || '-'}`,
                        '    '
                    ));
                }
            }
            break;
        }
        case 'live_execution': {
            const ok = String(event).includes('ok') || String(event).includes('success');
            lines.push(`${ok ? 'LIVE OK' : 'LIVE FAIL'}  ${event}`);
            lines.push(indentBlock(fmtKv({
                symbol: p.symbol,
                user: p.username,
                direction: p.direction,
                setup: p.setup,
                score: p.score,
                fillQty: p.fillQty,
                fillPrice: p.fillPrice,
                externalOrderId: p.externalOrderId,
            })));
            if (p.reason) lines.push(indentBlock(`reason: ${p.reason}`));
            if (p.message) lines.push(indentBlock(`message: ${p.message}`));
            break;
        }
        case 'broker': {
            lines.push(`BROKER  ${event}  ${p.symbol || ''}  status=${p.status || '-'}`);
            lines.push(indentBlock(fmtKv({
                exchange: p.exchange,
                env: p.environment,
                externalOrderId: p.externalOrderId,
                filledQty: p.filledQty,
            })));
            if (p.reason || p.errorMessage || p.message) {
                lines.push(indentBlock(`detail: ${p.reason || p.errorMessage || p.message}`));
            }
            break;
        }
        case 'security': {
            lines.push(`SECURITY  ${event}`);
            lines.push(indentBlock(p.reason || p.message || fmtKv(p)));
            break;
        }
        case 'system': {
            if (event === 'server_start') {
                lines.push('SERVER START');
                lines.push(indentBlock(fmtKv({
                    port: p.port,
                    pid: p.pid,
                    node: p.node,
                    cwd: p.cwd,
                })));
            } else if (event === 'server_stop') {
                lines.push('SERVER STOP');
                lines.push(indentBlock(fmtKv({
                    signal: p.signal,
                    uptimeSec: p.uptimeSec != null ? Math.round(p.uptimeSec) : undefined,
                    pid: p.pid,
                })));
            } else {
                lines.push(`SYSTEM  ${event}`);
                const kv = fmtKv(p);
                if (kv) lines.push(indentBlock(kv));
            }
            break;
        }
        case 'volatility': {
            if (event === 'volatility_queued') {
                lines.push(`QUEUE  ${p.symbol || '?'}  (${p.asset || '-'})  ${p.changePct != null ? `${Number(p.changePct).toFixed(2)}%` : ''}`);
                if (p.note) lines.push(indentBlock(`note: ${p.note}`));
                if (p.price != null) lines.push(indentBlock(`price=${p.price}  tf=${p.timeFrame || '-'}`));
            } else if (event === 'volatility_digest') {
                lines.push(`DIGEST SENT  ${p.count ?? 0}/${p.batchSize ?? 0} mã`);
                if (Array.isArray(p.items) && p.items.length) {
                    for (const it of p.items.slice(0, 12)) {
                        lines.push(indentBlock(
                            `• ${it.symbol}  ${Number(it.changePct || 0).toFixed(2)}%  ${it.note || ''}`
                        ));
                    }
                }
            } else {
                lines.push(`VOLATILITY  ${event}`);
                const kv = fmtKv(p);
                if (kv) lines.push(indentBlock(kv));
            }
            break;
        }
        case 'news': {
            const src = p.source || p.mode || '';
            lines.push(`${(p.status || 'NEWS').toUpperCase()}  ${p.symbol || '?'}  (${p.asset || '-'})  ${src}`);
            lines.push(indentBlock(fmtKv({
                count: p.count,
                bias: p.bias,
                score: p.sentimentScore,
                cacheMinLeft: p.cacheMinLeft,
            })));
            if (p.summary) lines.push(indentBlock(`summary: ${p.summary}`));
            if (p.reason || p.message) lines.push(indentBlock(`detail: ${p.reason || p.message}`));
            if (Array.isArray(p.titles) && p.titles.length) {
                for (const t of p.titles.slice(0, 3)) {
                    lines.push(indentBlock(`• ${t}`));
                }
            }
            break;
        }
        default: {
            lines.push(`${String(channel).toUpperCase()}  ${event}`);
            const kv = fmtKv(p);
            if (kv) lines.push(indentBlock(kv));
            else if (p.message) lines.push(indentBlock(p.message));
            break;
        }
    }

    return lines.filter(Boolean);
};

const writeQueue = Promise.resolve();
let queueTail = writeQueue;

/**
 * Append one or more plain-text lines to the daily autoduck.txt
 */
export const appendHumanLog = (channel, messageOrLines, opts = {}) => {
    if (!isAuditEnabled()) return Promise.resolve(null);

    const channelTag = String(channel || 'info').toUpperCase();
    const ts = formatIctTimestamp(opts.at || new Date());
    const rawLines = Array.isArray(messageOrLines)
        ? messageOrLines
        : String(messageOrLines || '').split('\n');

    const body = rawLines
        .map((line, idx) => {
            const text = String(line);
            if (idx === 0) return `[${ts}] [${channelTag}] ${text}`;
            // continuation lines already indented by formatter
            return text.startsWith(' ') ? `[${ts}] [${channelTag}]${text}` : `[${ts}] [${channelTag}]   ${text}`;
        })
        .join('\n');

    const block = opts.separatorBefore
        ? `\n${'─'.repeat(72)}\n${body}\n`
        : `${body}\n`;

    const job = async () => {
        const { dir, file } = resolveTxtPath(opts.at || new Date());
        await fs.mkdir(dir, { recursive: true });
        await fs.appendFile(file, block, 'utf8');
        return file;
    };

    queueTail = queueTail.then(job, job);
    return queueTail.catch((err) => {
        console.error(`[HUMAN-LOG] write failed: ${err.message}`);
        return null;
    });
};

/**
 * Mirror a structured audit event into autoduck.txt
 */
export const appendHumanLogFromAudit = (channel, payload, meta = {}) => {
    const lines = formatAuditPayloadLines(channel, meta.event, payload, meta);
    const separatorBefore = [
        'pipeline_cycle_start',
        'pipeline_cycle_end',
        'funnel_cycle_summary',
        'server_start',
        'server_stop',
        'volatility_digest',
    ].includes(meta.event);
    return appendHumanLog(channel, lines, { separatorBefore });
};

/** Wait until pending TXT writes finish (e.g. before process.exit). */
export const flushHumanLogQueue = () => queueTail.catch(() => null);

export const getHumanLogPath = (date = new Date()) => resolveTxtPath(date).file;
