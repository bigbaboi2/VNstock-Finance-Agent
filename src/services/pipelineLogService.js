import chalk from 'chalk';
import { performance } from 'node:perf_hooks';
import { appendAuditEvent } from './auditLogService.js';

const ICT_TZ = 'Asia/Ho_Chi_Minh';
const MAX_BUFFER = 80;

let nextId = 1;
const buffer = [];

export const ASSET_LABELS = {
    VN_STOCK: 'Chứng khoán VN',
    DERIVATIVES: 'Phái sinh',
    CRYPTO: 'Crypto',
};

export const formatIctTimestamp = (date = new Date()) => {
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

export const formatDuration = (ms) => {
    const n = Number(ms);
    if (!Number.isFinite(n) || n < 0) return '0s';
    if (n < 1000) return `${Math.round(n)}ms`;
    const sec = n / 1000;
    if (sec < 60) return `${sec.toFixed(1)}s`;
    const min = Math.floor(sec / 60);
    const rem = sec - min * 60;
    return `${min}m ${rem.toFixed(1)}s`;
};

export const createPipelineTimer = (label = '') => {
    const startedAt = performance.now();
    let lastLap = startedAt;
    const laps = {};

    return {
        lap(phase) {
            const now = performance.now();
            const ms = now - lastLap;
            lastLap = now;
            if (phase) laps[phase] = ms;
            return ms;
        },
        end() {
            const totalMs = performance.now() - startedAt;
            return { label, totalMs, laps };
        },
        get laps() {
            return { ...laps };
        },
    };
};

const levelStyles = {
    info: (msg) => chalk.cyan(msg),
    success: (msg) => chalk.green(msg),
    warn: (msg) => chalk.yellow(msg),
    gray: (msg) => chalk.gray(msg),
    highlight: (msg) => chalk.bold.cyan(msg),
};

export const pushPipelineLog = (message, level = 'info') => {
    const entry = {
        id: nextId++,
        ts: new Date().toISOString(),
        message: String(message),
    };
    buffer.push(entry);
    if (buffer.length > MAX_BUFFER) buffer.shift();

    const paint = levelStyles[level] || levelStyles.info;
    console.log(paint(`[AUTODUCK] ${message}`));
    appendAuditEvent('pipeline', { message: entry.message }, {
        event: 'pipeline_log',
        level,
        source: 'pipelineLogService',
    }).catch(() => {});
    return entry;
};

export const getPipelineLogs = (sinceId = 0) => {
    const since = Number(sinceId) || 0;
    const logs = since > 0 ? buffer.filter((e) => e.id > since) : [...buffer];
    return {
        logs,
        lastId: buffer.length ? buffer[buffer.length - 1].id : 0,
    };
};
