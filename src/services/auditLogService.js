import crypto from 'crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_LOG_DIR = process.env.AUTODUCK_AUDIT_LOG_DIR || 'logs/autoduck';
const ENABLED = process.env.AUTODUCK_AUDIT_ENABLED !== 'false';
const ENCRYPT_ENABLED = process.env.AUTODUCK_AUDIT_ENCRYPT === 'true';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

const allowedChannels = new Set([
    'pipeline',
    'funnel',
    'candidate',
    'live_execution',
    'broker',
    'security',
]);

const inMemoryTail = [];
const MAX_TAIL = 250;

const toIsoDate = (date = new Date()) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const safeJson = (obj) => {
    try {
        return JSON.stringify(obj);
    } catch {
        return JSON.stringify({ message: 'unserializable_payload' });
    }
};

const getAuditKey = () => {
    const hex = process.env.AUTODUCK_AUDIT_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
    if (!hex || hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
        throw new Error('[AUDIT] Missing valid AUDODUCK_AUDIT_ENCRYPTION_KEY/ENCRYPTION_KEY (64 hex chars).');
    }
    return Buffer.from(hex, 'hex');
};

const encryptLine = (plain) => {
    const key = getAuditKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return JSON.stringify({
        encrypted: true,
        alg: ALGORITHM,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        payload: encrypted.toString('base64'),
    });
};

const decryptLine = (line) => {
    const parsed = JSON.parse(line);
    if (!parsed?.encrypted) return JSON.parse(line);
    const key = getAuditKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(parsed.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(parsed.authTag, 'base64'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(parsed.payload, 'base64')),
        decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8'));
};

const resolveDailyPath = (channel, date = new Date()) => {
    const day = toIsoDate(date);
    const root = path.resolve(process.cwd(), DEFAULT_LOG_DIR, day);
    return {
        dir: root,
        file: path.resolve(root, `${channel}.jsonl`),
        day,
    };
};

const pushTail = (event) => {
    inMemoryTail.push(event);
    if (inMemoryTail.length > MAX_TAIL) inMemoryTail.shift();
};

export const appendAuditEvent = async (channel, payload = {}, meta = {}) => {
    if (!ENABLED) return null;
    const safeChannel = allowedChannels.has(channel) ? channel : 'security';
    const now = new Date();
    const event = {
        ts: now.toISOString(),
        channel: safeChannel,
        level: meta.level || 'info',
        event: meta.event || 'audit_event',
        source: meta.source || 'autoduck',
        payload,
    };
    pushTail(event);

    const { dir, file } = resolveDailyPath(safeChannel, now);
    const plain = safeJson(event);
    const line = ENCRYPT_ENABLED ? encryptLine(plain) : plain;

    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(file, `${line}\n`, 'utf8');
    return event;
};

export const getAuditTail = (limit = 50, channel = null) => {
    const n = Math.max(1, Math.min(500, Number(limit) || 50));
    const rows = channel
        ? inMemoryTail.filter((e) => e.channel === channel)
        : [...inMemoryTail];
    return rows.slice(-n);
};

export const readAuditFileTail = async ({ channel = 'funnel', date = null, limit = 100 }) => {
    const day = date || toIsoDate(new Date());
    const safeChannel = allowedChannels.has(channel) ? channel : 'security';
    const file = path.resolve(process.cwd(), DEFAULT_LOG_DIR, day, `${safeChannel}.jsonl`);
    const raw = await fs.readFile(file, 'utf8').catch(() => '');
    if (!raw) return [];
    const lines = raw.split('\n').filter(Boolean);
    const sliced = lines.slice(-Math.max(1, Math.min(1000, Number(limit) || 100)));
    const parsed = [];
    for (const line of sliced) {
        try {
            parsed.push(ENCRYPT_ENABLED ? decryptLine(line) : JSON.parse(line));
        } catch {
            parsed.push({ ts: new Date().toISOString(), channel: safeChannel, event: 'decode_error' });
        }
    }
    return parsed;
};

export const getAuditStatus = () => ({
    enabled: ENABLED,
    encrypted: ENCRYPT_ENABLED,
    logDir: DEFAULT_LOG_DIR,
    tailSize: inMemoryTail.length,
});
