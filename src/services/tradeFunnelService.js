import chalk from 'chalk';
import { appendAuditEvent } from './auditLogService.js';

const MAX_BUFFER = 40;
const MAX_TOP_CANDIDATES = 8;

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
    };
    const setupReasons = {};
    const liveGateReasons = {};
    const topCandidates = [];

    const bump = (map, key) => {
        if (!key) return;
        map[key] = (map[key] || 0) + 1;
    };

    const recordCandidate = (row) => {
        topCandidates.push(row);
        topCandidates.sort((a, b) => (b.score || 0) - (a.score || 0));
        if (topCandidates.length > MAX_TOP_CANDIDATES) topCandidates.length = MAX_TOP_CANDIDATES;
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
                    break;
                case 'setup':
                    counts.setup++;
                    bump(setupReasons, detail.reason || detail.type || 'unknown');
                    break;
                case 'sim_ok':
                    counts.simOk++;
                    break;
                case 'live_gate':
                    counts.liveGate++;
                    bump(liveGateReasons, detail.reason || 'unknown');
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
                topCandidates: [...topCandidates],
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
        `[${c.asset} FUNNEL] scanned=${c.scanned} | weak=${c.weak} | vol=${c.vol} | setup=${c.setup} | sim_ok=${c.simOk} | live_gate=${c.liveGate} | ai_veto=${c.aiVeto} | testnet=${c.testnet} | matched_live=${c.matchedLive} | matched_sim=${c.matchedSim}`,
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

export const pushFunnelSummary = (summary) => {
    const lines = formatFunnelLogLines(summary);
    for (const line of lines) {
        console.log(chalk.gray(`[AUTODUCK] ${line}`));
    }
    appendAuditEvent('funnel', summary, {
        event: 'funnel_cycle_summary',
        source: 'tradeFunnelService',
    }).catch(() => {});
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
