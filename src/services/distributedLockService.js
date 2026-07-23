/**
 * MongoDB Setting locks: pipeline cycle + AutoDuck scheduler leader.
 */
import os from 'os';
import Setting from '../../models/Setting.js';

const INSTANCE_ID = `${os.hostname()}:${process.pid}`;

export const AUTODUCK_SCHEDULER_LEADER_KEY = 'autoDuckSchedulerLeader';

const ensureLockDoc = async (key) => {
    await Setting.updateOne(
        { key },
        { $setOnInsert: { value: { owner: null, expiresAt: 0, acquiredAt: 0 } } },
        { upsert: true }
    );
};

export const acquireDistributedLock = async (key, ttlMs = 15 * 60 * 1000) => {
    const now = Date.now();
    const owner = `${INSTANCE_ID}:${now}:${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = now + Math.max(5_000, Number(ttlMs) || 15 * 60 * 1000);

    await ensureLockDoc(key);

    const claimed = await Setting.findOneAndUpdate(
        {
            key,
            $or: [
                { 'value.owner': null },
                { 'value.expiresAt': { $lte: now } },
                { 'value.expiresAt': { $exists: false } },
            ],
        },
        {
            $set: {
                value: {
                    owner,
                    acquiredAt: now,
                    expiresAt,
                    instanceId: INSTANCE_ID,
                },
            },
        },
        { returnDocument: 'after' }
    );

    if (claimed?.value?.owner === owner) {
        return { acquired: true, owner };
    }

    const current = await Setting.findOne({ key }).lean();
    return {
        acquired: false,
        owner: null,
        reason: `held_by:${current?.value?.owner || 'unknown'};expiresAt:${current?.value?.expiresAt || 0}`,
    };
};

export const renewDistributedLock = async (key, owner, ttlMs = 45_000) => {
    if (!owner) return false;
    const now = Date.now();
    const expiresAt = now + Math.max(5_000, Number(ttlMs) || 45_000);
    const result = await Setting.findOneAndUpdate(
        { key, 'value.owner': owner },
        {
            $set: {
                'value.expiresAt': expiresAt,
                'value.heartbeatAt': now,
                'value.instanceId': INSTANCE_ID,
            },
        },
        { returnDocument: 'after' }
    );
    return Boolean(result);
};

export const releaseDistributedLock = async (key, owner) => {
    if (!owner) return false;
    const result = await Setting.findOneAndUpdate(
        { key, 'value.owner': owner },
        {
            $set: {
                value: {
                    owner: null,
                    expiresAt: 0,
                    acquiredAt: 0,
                    releasedAt: Date.now(),
                    releasedBy: INSTANCE_ID,
                },
            },
        },
        { returnDocument: 'after' }
    );
    return Boolean(result);
};

export const peekDistributedLock = async (key) => {
    const doc = await Setting.findOne({ key }).lean();
    const v = doc?.value || {};
    const now = Date.now();
    const held = Boolean(v.owner) && Number(v.expiresAt || 0) > now;
    return {
        held,
        owner: v.owner || null,
        expiresAt: v.expiresAt || 0,
        acquiredAt: v.acquiredAt || 0,
        instanceId: v.instanceId || null,
        heartbeatAt: v.heartbeatAt || 0,
        stale: Boolean(v.owner) && Number(v.expiresAt || 0) <= now,
    };
};

/** Clear orphan lock: same instance idle, or same-host dead PID. */
export const reclaimOrphanDistributedLock = async (key, { localRunning = false } = {}) => {
    if (localRunning) return { reclaimed: false, reason: 'local_running' };
    const peek = await peekDistributedLock(key);
    if (!peek.held || !peek.owner) return { reclaimed: false, reason: 'not_held' };

    const owner = String(peek.owner);
    const idFromPeek = peek.instanceId || owner;
    const parts = String(idFromPeek).split(':');
    const lockHost = parts[0] || '';
    const lockPid = Number(parts[1]);
    const thisHost = os.hostname();

    const sameInstance =
        (peek.instanceId && peek.instanceId === INSTANCE_ID)
        || owner.startsWith(`${INSTANCE_ID}:`);

    let orphanReason = null;
    if (sameInstance) {
        orphanReason = 'orphan_same_instance';
    } else if (lockHost && lockHost === thisHost && Number.isFinite(lockPid) && lockPid > 0) {
        let pidAlive = false;
        try {
            process.kill(lockPid, 0);
            pidAlive = true;
        } catch {
            pidAlive = false;
        }
        if (!pidAlive) {
            orphanReason = 'orphan_dead_pid_same_host';
        } else {
            return {
                reclaimed: false,
                reason: 'live_peer_same_host',
                expiresAt: peek.expiresAt,
                owner: peek.owner,
            };
        }
    } else {
        return {
            reclaimed: false,
            reason: 'other_instance',
            expiresAt: peek.expiresAt,
            owner: peek.owner,
        };
    }

    const result = await Setting.findOneAndUpdate(
        { key, 'value.owner': peek.owner },
        {
            $set: {
                value: {
                    owner: null,
                    expiresAt: 0,
                    acquiredAt: 0,
                    releasedAt: Date.now(),
                    releasedBy: INSTANCE_ID,
                    reclaimReason: orphanReason,
                },
            },
        },
        { returnDocument: 'after' }
    );
    if (result) {
        return {
            reclaimed: true,
            reason: orphanReason,
            previousOwner: peek.owner,
        };
    }
    return { reclaimed: false, reason: 'race' };
};

/**
 * Process-lifetime AutoDuck scheduler leader (heartbeat).
 * Opt-out: AUTODUCK_SCHEDULER_LEADER=0 or AUTODUCK_ALLOW_MULTI_SCHEDULER=1
 */
export const ensureAutoDuckLeader = async ({
    key = AUTODUCK_SCHEDULER_LEADER_KEY,
    ttlMs = 45_000,
    heartbeatMs = 15_000,
} = {}) => {
    const disabled =
        process.env.AUTODUCK_SCHEDULER_LEADER === '0'
        || process.env.AUTODUCK_ALLOW_MULTI_SCHEDULER === '1';

    const noopRelease = async () => false;
    if (disabled) {
        return {
            isLeader: true,
            owner: null,
            reason: 'leader_check_disabled',
            release: noopRelease,
        };
    }

    const lockResult = await acquireDistributedLock(key, ttlMs);
    if (!lockResult.acquired) {
        return {
            isLeader: false,
            owner: null,
            reason: lockResult.reason || 'not_leader',
            release: noopRelease,
        };
    }

    let stopped = false;
    const timer = setInterval(() => {
        if (stopped) return;
        renewDistributedLock(key, lockResult.owner, ttlMs).catch(() => {});
    }, Math.max(5_000, Number(heartbeatMs) || 15_000));
    if (typeof timer.unref === 'function') timer.unref();

    const release = async () => {
        stopped = true;
        clearInterval(timer);
        return releaseDistributedLock(key, lockResult.owner);
    };

    return {
        isLeader: true,
        owner: lockResult.owner,
        reason: 'elected',
        release,
    };
};
