/**
 * PriorityScore — ranking among eligible candidates (does not replace Eligibility gates).
 */
import { getAutoDuckNumber } from './autoDuckConfigService.js';
import { symbolExpectancyToScore } from './symbolExpectancyService.js';

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

const weights = () => ({
    quality: getAutoDuckNumber('AUTODUCK_PRIORITY_W_QUALITY') || 0.45,
    expectancy: getAutoDuckNumber('AUTODUCK_PRIORITY_W_EXPECTANCY') || 0.25,
    breakout: getAutoDuckNumber('AUTODUCK_PRIORITY_W_BREAKOUT') || 0.15,
    context: getAutoDuckNumber('AUTODUCK_PRIORITY_W_CONTEXT') || 0.10,
    idle: getAutoDuckNumber('AUTODUCK_PRIORITY_W_IDLE') || 0.05,
});

const contextBiasToScore = (biasLedger, direction) => {
    if (!biasLedger) return 50;
    const isLong = direction === 'LONG' || direction === 'MUA';
    const delta = isLong
        ? Number(biasLedger.totalDeltaLong) || 0
        : Number(biasLedger.totalDeltaShort) || 0;
    // Context bias typically ±6 → map to 30–70
    return clamp(50 + delta * 3, 20, 85);
};

/**
 * @param {object} args
 * @param {number} args.qualityScore
 * @param {object} args.symbolExpectancy - from getSymbolExpectancy
 * @param {number} [args.breakoutAffinityScore] - 0–100, default 50
 * @param {object} [args.biasLedger]
 * @param {string} args.direction
 * @param {boolean} [args.idleHungry]
 * @returns {{ priorityScore: number, components: object }}
 */
export const computePriorityScore = ({
    qualityScore = 50,
    symbolExpectancy = null,
    breakoutAffinityScore = 50,
    biasLedger = null,
    direction = 'LONG',
    idleHungry = false,
} = {}) => {
    const w = weights();
    const q = clamp(Number(qualityScore) || 50);
    const exp = symbolExpectancyToScore(symbolExpectancy);
    // Cap breakout contribution: map 50± → keep within ±4 equivalent on final via weight;
    // additionally clamp breakout score toward 50 by at most 27 pts (≈ +4 final with w=0.15)
    const boRaw = clamp(Number(breakoutAffinityScore) || 50);
    const bo = clamp(50 + clamp(boRaw - 50, -27, 27));
    const ctx = contextBiasToScore(biasLedger, direction);
    const idle = idleHungry ? 70 : 50;

    const totalW = w.quality + w.expectancy + w.breakout + w.context + w.idle;
    const priorityScore = Math.round(
        (q * w.quality
            + exp * w.expectancy
            + bo * w.breakout
            + ctx * w.context
            + idle * w.idle) / (totalW || 1)
    );

    return {
        priorityScore: clamp(priorityScore),
        components: {
            quality: q,
            symbolExpectancy: exp,
            breakoutAffinity: bo,
            contextBias: ctx,
            idleHunger: idle,
            weights: w,
        },
    };
};

export const sortCandidatesByPriority = (candidates = []) =>
    [...candidates].sort((a, b) => {
        const pd = (b.priorityScore || 0) - (a.priorityScore || 0);
        if (pd !== 0) return pd;
        return (b.qualityScore || b.score || 0) - (a.qualityScore || a.score || 0);
    });
