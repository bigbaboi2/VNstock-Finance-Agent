import AiSignalCandidate from '../../models/AiSignalCandidate.js';
import AiProviderOutage from '../../models/AiProviderOutage.js';
import { sendTelegramMessage } from './telegramService.js';
import { appendAuditEvent } from './auditLogService.js';
import { getAutoDuckNumber } from './autoDuckConfigService.js';
import { randomUUID } from 'node:crypto';

const MIN_RETRY_MS = 30_000;
const DEFAULT_RETRY_MS = 60_000;
const MAX_RETRY_MS = 5 * 60_000;
const WORKER_ID = `${process.pid}-${randomUUID()}`;
const CLAIM_TTL_MS = 10 * 60_000;

export const aiCandidateKey = ({ assetType, asset, symbol, direction, setup }) => [
    assetType || asset,
    String(symbol || '').toUpperCase(),
    String(direction || '').toUpperCase(),
    String(setup || ''),
].join('|');

const ttlMs = () => Math.max(1, getAutoDuckNumber('AUTODUCK_AI_CANDIDATE_TTL_MINUTES') || 30) * 60_000;
const retryBatchSize = () => Math.max(1, Math.floor(getAutoDuckNumber('AUTODUCK_AI_RETRY_BATCH_SIZE') || 3));

export const resolveRetryAfterMs = (error, attemptCount = 1) => {
    const direct = Number(error?.retryAfterMs);
    if (Number.isFinite(direct) && direct > 0) return Math.min(MAX_RETRY_MS, Math.max(MIN_RETRY_MS, direct));
    const fallback = DEFAULT_RETRY_MS * Math.pow(1.5, Math.max(0, attemptCount - 1));
    return Math.min(MAX_RETRY_MS, Math.max(MIN_RETRY_MS, fallback));
};

export const expireAiCandidates = async (now = new Date()) => {
    const rows = await AiSignalCandidate.find({ status: 'PENDING', expiresAt: { $lte: now } })
        .select('_id assetType symbol setup').lean();
    if (!rows.length) return [];
    await AiSignalCandidate.updateMany(
        { _id: { $in: rows.map((row) => row._id) }, status: 'PENDING' },
        { $set: { status: 'EXPIRED', resolvedAt: now, resolution: { reason: 'TTL_EXPIRED' } } },
    );
    appendAuditEvent('candidate', { count: rows.length, candidates: rows }, {
        event: 'ai_retry_candidates_expired', level: 'warn', source: 'aiSignalCandidateService',
    }).catch(() => {});
    return rows;
};

export const loadAiCandidateQueue = async (now = new Date()) => {
    const expired = await expireAiCandidates(now);
    const pending = await AiSignalCandidate.find({ status: 'PENDING' }).sort({ nextAttemptAt: 1 }).lean();
    const due = [];
    for (let index = 0; index < retryBatchSize(); index += 1) {
        const claimed = await AiSignalCandidate.findOneAndUpdate(
            {
                status: 'PENDING',
                nextAttemptAt: { $lte: now },
                $or: [
                    { claimUntil: null },
                    { claimUntil: { $exists: false } },
                    { claimUntil: { $lte: now } },
                ],
            },
            { $set: { claimOwner: WORKER_ID, claimUntil: new Date(now.getTime() + CLAIM_TTL_MS) } },
            { sort: { nextAttemptAt: 1 }, new: true },
        ).lean();
        if (!claimed) break;
        due.push(claimed);
    }
    const pendingMap = new Map(pending.map((row) => [String(row._id), row]));
    for (const row of due) pendingMap.set(String(row._id), row);
    const allPending = [...pendingMap.values()];
    return {
        pending: allPending,
        due,
        pendingByKey: new Map(allPending.map((row) => [aiCandidateKey(row), row])),
        dueIds: new Set(due.map((row) => String(row._id))),
        expired,
    };
};

export const queueAiCandidate = async ({
    assetType,
    symbol,
    direction,
    setup,
    cohort,
    role,
    technicalSnapshot,
    contextSnapshot,
    error,
    now = new Date(),
}) => {
    const attemptCount = Math.max(1, Number(error?.attemptCount) || 1);
    const retryAfterMs = resolveRetryAfterMs(error, attemptCount);
    const filter = { assetType, symbol: String(symbol).toUpperCase(), direction, setup, status: 'PENDING' };
    const update = {
        $set: {
            cohort,
            role,
            technicalSnapshot,
            contextSnapshot,
            lastQualifiedAt: now,
            nextAttemptAt: new Date(now.getTime() + retryAfterMs),
            lastAttemptAt: now,
            lastError: {
                code: error?.code || 'AI_CHAIN_EXHAUSTED',
                message: error?.message || 'AI provider chain unavailable',
                retryAfterMs,
                providerAttempts: error?.providerAttempts || [],
            },
            claimOwner: null,
            claimUntil: null,
        },
        $setOnInsert: {
            firstQualifiedAt: now,
            expiresAt: new Date(now.getTime() + ttlMs()),
        },
        $inc: { attemptCount: 1 },
    };
    let row;
    try {
        row = await AiSignalCandidate.findOneAndUpdate(filter, update, { upsert: true, new: true, setDefaultsOnInsert: false });
    } catch (err) {
        if (err?.code !== 11000) throw err;
        row = await AiSignalCandidate.findOneAndUpdate(filter, update, { new: true });
    }
    appendAuditEvent('candidate', {
        candidateId: String(row?._id || ''), assetType, symbol, direction, setup, cohort, role, retryAfterMs,
    }, { event: 'ai_outage_candidate_queued', level: 'warn', source: 'aiSignalCandidateService' }).catch(() => {});
    return row;
};

export const markAiCandidateAttempt = async (id, now = new Date()) => AiSignalCandidate.findByIdAndUpdate(
    id,
    { $set: { lastAttemptAt: now }, $inc: { attemptCount: 1 } },
    { new: true },
);

export const deferAiCandidate = async (id, error, now = new Date()) => {
    const row = await AiSignalCandidate.findById(id).lean();
    if (!row || row.status !== 'PENDING') return null;
    const attemptCount = Math.max(1, Number(row.attemptCount) || 1);
    const retryAfterMs = resolveRetryAfterMs(error, attemptCount);
    return AiSignalCandidate.findByIdAndUpdate(id, {
        $set: {
            nextAttemptAt: new Date(now.getTime() + retryAfterMs),
            claimOwner: null,
            claimUntil: null,
            lastError: {
                code: error?.code || 'RETRY_DEFERRED',
                message: error?.message || 'Retry deferred',
                retryAfterMs,
                providerAttempts: error?.providerAttempts || row.lastError?.providerAttempts || [],
            },
        },
        $inc: { attemptCount: 1 },
    }, { new: true });
};

export const resolveAiCandidate = async (id, status, resolution = {}, now = new Date()) => {
    if (!id) return null;
    return AiSignalCandidate.findOneAndUpdate(
        { _id: id, status: 'PENDING' },
        { $set: { status, resolution, resolvedAt: now, claimOwner: null, claimUntil: null } },
        { new: true },
    );
};

export const getNextAiCandidateAttemptAt = async (now = new Date()) => {
    const available = await AiSignalCandidate.findOne({
        status: 'PENDING',
        $or: [
            { claimUntil: null },
            { claimUntil: { $exists: false } },
            { claimUntil: { $lte: now } },
        ],
    }).sort({ nextAttemptAt: 1 }).select('nextAttemptAt').lean();
    if (available?.nextAttemptAt) return available.nextAttemptAt;

    const claimed = await AiSignalCandidate.findOne({
        status: 'PENDING',
        claimUntil: { $gt: now },
    }).sort({ claimUntil: 1 }).select('claimUntil').lean();
    return claimed?.claimUntil || null;
};

export const listAiCandidates = async ({ status = 'PENDING', limit = 50 } = {}) => {
    const query = status ? { status } : {};
    return AiSignalCandidate.find(query).sort({ createdAt: -1 }).limit(Math.min(200, Math.max(1, limit))).lean();
};

export const markAiRoleOutage = async ({ role, providerAttempts = [] }) => {
    try {
        await AiProviderOutage.updateOne({ role }, { $setOnInsert: { role, active: false } }, { upsert: true });
    } catch (err) {
        if (err?.code !== 11000) throw err;
    }
    const now = new Date();
    const activated = await AiProviderOutage.findOneAndUpdate(
        { role, active: { $ne: true } },
        {
            $set: { active: true, startedAt: now, lastFailureAt: now, providerAttempts, candidateCount: 1 },
        },
        { new: true },
    );
    if (activated) {
        const providers = providerAttempts.map((row) => row.provider).filter(Boolean).join(', ') || 'unknown';
        await sendTelegramMessage(`🚨 <b>AutoTrade AI outage</b>\nRole: ${role}\nProviders: ${providers}\nCandidate đạt gate sẽ được lưu SEEMS_GOOD và retry theo cooldown.`, { parseMode: 'HTML' }).catch(() => {});
    } else {
        await AiProviderOutage.updateOne(
            { role, active: true },
            { $set: { lastFailureAt: now, providerAttempts }, $inc: { candidateCount: 1 } },
        );
    }
    return activated;
};

export const markAiRoleRecovered = async ({ role, provider }) => {
    const now = new Date();
    const recovered = await AiProviderOutage.findOneAndUpdate(
        { role, active: true },
        { $set: { active: false, recoveredAt: now, lastSuccessAt: now } },
        { new: false },
    );
    if (recovered) {
        const durationSec = recovered.startedAt ? Math.round((now - new Date(recovered.startedAt)) / 1000) : 0;
        await sendTelegramMessage(`✅ <b>AutoTrade AI recovered</b>\nRole: ${role}\nProvider: ${provider || 'unknown'}\nOutage: ${durationSec}s\nCandidates queued: ${recovered.candidateCount || 0}\nSEEMS_GOOD sẽ được đánh giá lại theo lịch.`, { parseMode: 'HTML' }).catch(() => {});
    }
    return recovered;
};
