import chalk from 'chalk';
import { appendAuditEvent } from './auditLogService.js';
import TradeFunnelCycle from '../../models/TradeFunnelCycle.js';

const MAX_BUFFER = 40;
const MAX_TOP_CANDIDATES = 8;
const MAX_REJECTS = 40;

let nextId = 1;
const buffer = [];

/**
 * Per-cycle reject funnel for AutoDuck scan loops.
 */
export const createFunnelTracker = (asset) => {
    const counts = {
        scanned: 0,
        weak: 0,
        vol: 0,
        setup: 0,
        simOk: 0,
        liveGate: 0,
        aiVeto: 0,
        testnet: 0,
        risk: 0,
        limit: 0,
        matchedSim: 0,
        matchedLive: 0,
        coreEligible: 0,
        researchEligible: 0,
        coreMatched: 0,
        researchMatched: 0,
        longEligible: 0,
        shortEligible: 0,
        longMatched: 0,
        shortMatched: 0,
        shortDisabled: 0,
        shortUnsupported: 0,
        quoteBlocked: 0,
        quotaBlocked: 0,
    };
    const setupReasons = {};
    const liveGateReasons = {};
    const aiVetoReasons = {};
    const topCandidates = [];
    const rejects = [];

    const bump = (map, key) => {
        if (!key) return;
        map[key] = (map[key] || 0) + 1;
    };

    const recordCandidate = (row) => {
        topCandidates.push(row);
        topCandidates.sort((a, b) => (b.score || 0) - (a.score || 0));
        if (topCandidates.length > MAX_TOP_CANDIDATES) topCandidates.length = MAX_TOP_CANDIDATES;
    };

    const pushReject = (stage, detail = {}) => {
        if (rejects.length >= MAX_REJECTS) return;
        rejects.push({
            stage,
            symbol: detail.symbol || null,
            score: detail.score ?? null,
            setup: detail.setup || detail.type || null,
            reason: detail.reason || null,
            ts: new Date().toISOString(),
        });
    };

    return {
        counts,
        record(event, detail = {}) {
            switch (event) {
                case 'scanned':
                    counts.scanned++;
                    break;
                case 'weak':
                    counts.weak++;
                    break;
                case 'vol':
                    counts.vol++;
                    pushReject('vol', detail);
                    break;
                case 'setup':
                    counts.setup++;
                    bump(setupReasons, detail.reason || detail.type || 'unknown');
                    pushReject('setup', detail);
                    break;
                case 'sim_ok':
                    counts.simOk++;
                    break;
                case 'live_gate':
                    counts.liveGate++;
                    bump(liveGateReasons, detail.reason || 'unknown');
                    pushReject('live_gate', detail);
                    if (detail.symbol) {
                        recordCandidate({
                            symbol: detail.symbol,
                            score: detail.score,
                            setup: detail.setup,
                            fail: detail.reason,
                        });
                    }
                    break;
                case 'ai_veto':
                    counts.aiVeto++;
                    bump(aiVetoReasons, String(detail.reason || 'unknown').slice(0, 80));
                    pushReject('ai_veto', detail);
                    if (detail.symbol) {
                        recordCandidate({
                            symbol: detail.symbol,
                            score: detail.score,
                            setup: detail.setup,
                            fail: `ai_veto: ${detail.reason || ''}`,
                        });
                    }
                    break;
                case 'testnet':
                    counts.testnet++;
                    pushReject('testnet', detail);
                    break;
                case 'risk':
                    counts.risk++;
                    break;
                case 'limit':
                    counts.limit++;
                    break;
                case 'matched_sim':
                    counts.matchedSim++;
                    break;
                case 'matched_live':
                    counts.matchedLive++;
                    break;
                case 'core_eligible': counts.coreEligible++; break;
                case 'research_eligible': counts.researchEligible++; break;
                case 'core_matched': counts.coreMatched++; break;
                case 'research_matched': counts.researchMatched++; break;
                case 'long_eligible': counts.longEligible++; break;
                case 'short_eligible': counts.shortEligible++; break;
                case 'long_matched': counts.longMatched++; break;
                case 'short_matched': counts.shortMatched++; break;
                case 'short_disabled': counts.shortDisabled++; pushReject('short_disabled', detail); break;
                case 'short_unsupported': counts.shortUnsupported++; pushReject('short_unsupported', detail); break;
                case 'quote_blocked': counts.quoteBlocked++; pushReject('quote_blocked', detail); break;
                case 'quota_blocked': counts.quotaBlocked++; pushReject('quota_blocked', detail); break;
                case 'near_live':
                    if (detail.symbol) recordCandidate(detail);
                    break;
                default:
                    break;
            }
        },
        finalize(meta = {}) {
            const summary = {
                id: nextId++,
                ts: new Date().toISOString(),
                asset,
                ...counts,
                setupReasons: { ...setupReasons },
                liveGateReasons: { ...liveGateReasons },
                aiVetoReasons: { ...aiVetoReasons },
                topCandidates: [...topCandidates],
                rejects: [...rejects],
                ...meta,
            };
            buffer.push(summary);
            if (buffer.length > MAX_BUFFER) buffer.shift();
            return summary;
        },
    };
};

const formatReasonMap = (map) => {
    const entries = Object.entries(map || {});
    if (!entries.length) return '';
    return entries.map(([k, v]) => `${k}=${v}`).join(', ');
};

export const formatFunnelLogLines = (summary) => {
    if (!summary) return [];
    const c = summary;
    const lines = [
        `[${c.asset} FUNNEL] scanned=${c.scanned} | weak=${c.weak} | vol=${c.vol} | setup=${c.setup} | core=${c.coreEligible}/${c.coreMatched} | research=${c.researchEligible}/${c.researchMatched} | long=${c.longEligible}/${c.longMatched} | short=${c.shortEligible}/${c.shortMatched} | short_off=${c.shortDisabled} | quote=${c.quoteBlocked} | quota=${c.quotaBlocked} | matched_live=${c.matchedLive}`,
    ];
    const setupStr = formatReasonMap(c.setupReasons);
    if (setupStr) lines.push(`  setup: ${setupStr}`);
    const liveStr = formatReasonMap(c.liveGateReasons);
    if (liveStr) lines.push(`  live_gate: ${liveStr}`);
    if (c.topCandidates?.length) {
        const tops = c.topCandidates
            .slice(0, 5)
            .map((t) => `${t.symbol} score=${t.score} setup=${t.setup || '-'} fail=${t.fail || '-'}`)
            .join(' | ');
        lines.push(`  top_candidates: ${tops}`);
    }
    return lines;
};

const persistFunnelCycle = async (summary) => {
    if (!summary) return;
    try {
        const {
            asset,
            scanned,
            weak,
            vol,
            setup,
            simOk,
            liveGate,
            aiVeto,
            testnet,
            risk,
            limit,
            matchedSim,
            matchedLive,
            coreEligible,
            researchEligible,
            coreMatched,
            researchMatched,
            longEligible,
            shortEligible,
            longMatched,
            shortMatched,
            shortDisabled,
            shortUnsupported,
            quoteBlocked,
            quotaBlocked,
            setupReasons,
            liveGateReasons,
            aiVetoReasons,
            topCandidates,
            rejects,
            id,
            ts,
            ...meta
        } = summary;
        await TradeFunnelCycle.create({
            asset,
            ts: ts ? new Date(ts) : new Date(),
            scanned,
            weak,
            vol,
            setup,
            simOk,
            liveGate,
            aiVeto,
            testnet,
            risk,
            limit,
            matchedSim,
            matchedLive,
            coreEligible,
            researchEligible,
            coreMatched,
            researchMatched,
            longEligible,
            shortEligible,
            longMatched,
            shortMatched,
            shortDisabled,
            shortUnsupported,
            quoteBlocked,
            quotaBlocked,
            setupReasons,
            liveGateReasons,
            aiVetoReasons,
            topCandidates,
            rejects,
            meta: { funnelId: id, ...meta },
        });
    } catch (err) {
        console.log(chalk.yellow(`[FUNNEL] Persist Mongo lỗi: ${err.message}`));
    }
};

export const pushFunnelSummary = (summary) => {
    const lines = formatFunnelLogLines(summary);
    for (const line of lines) {
        console.log(chalk.gray(`[AUTODUCK] ${line}`));
    }
    appendAuditEvent('funnel', summary, {
        event: 'funnel_cycle_summary',
        source: 'tradeFunnelService',
    }).catch(() => {});
    persistFunnelCycle(summary).catch(() => {});
    return summary;
};

export const getFunnelLogs = (sinceId = 0, asset = null) => {
    const since = Number(sinceId) || 0;
    let logs = since > 0 ? buffer.filter((e) => e.id > since) : [...buffer];
    if (asset) logs = logs.filter((e) => e.asset === asset);
    return {
        logs,
        lastId: buffer.length ? buffer[buffer.length - 1].id : 0,
    };
};

export const getLatestFunnel = (asset = 'CRYPTO') => {
    for (let i = buffer.length - 1; i >= 0; i--) {
        if (buffer[i].asset === asset) return buffer[i];
    }
    return null;
};

/** Query recent persisted funnel cycles from Mongo. */
export const getPersistedFunnelCycles = async ({ days = 3, asset = null, limit = 50 } = {}) => {
    const since = new Date(Date.now() - days * 24 * 3600_000);
    const q = { ts: { $gte: since } };
    if (asset) q.asset = asset;
    return TradeFunnelCycle.find(q).sort({ ts: -1 }).limit(limit).lean();
};
