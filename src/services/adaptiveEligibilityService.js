/**
 * Adaptive Eligibility band — dynamic quality floor within absolute min/max.
 * Never replaces hard safety (HTF, soft-block, RISK_OFF veto).
 */
import { getAutoDuckNumber } from './autoDuckConfigService.js';
import { resolveExpectancyAdj } from './symbolExpectancyService.js';
import { getLiveQualityMin, getLiveQualityMinForSetup, getLiveEdgeMin } from './entrySetupEngine.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const getQualityFloorAbs = () => getAutoDuckNumber('AUTODUCK_QUALITY_FLOOR_ABS') || 78;
export const getQualityCeilingRef = () => getAutoDuckNumber('AUTODUCK_QUALITY_CEILING_REF') || 88;
export const getEdgeFloorAbs = () => getAutoDuckNumber('AUTODUCK_EDGE_FLOOR_ABS') || 22;
export const getEdgeSoftRef = () => getAutoDuckNumber('AUTODUCK_EDGE_SOFT_REF') || 28;

const regimeAdjFromMarket = (marketCondition = '') => {
    const s = String(marketCondition || '').toUpperCase();
    if (s.includes('RISK-OFF')) return 2;
    if (s.includes('RISK-ON')) return -1;
    return 0;
};

/**
 * @returns {{
 *   effectiveQualityFloor: number,
 *   effectiveEdgeFloor: number,
 *   sizeMult: number,
 *   adj: object,
 *   band: object
 * }}
 */
export const resolveAdaptiveEligibility = ({
    assetType = 'CRYPTO',
    symbol,
    setupType,
    marketCondition = '',
    idleFloorRelax = 0,
} = {}) => {
    const baseFloor = getLiveQualityMinForSetup(setupType) || getLiveQualityMin();
    const floorAbs = getQualityFloorAbs();
    const ceilingRef = getQualityCeilingRef();
    const baseEdge = getLiveEdgeMin();
    const edgeAbs = getEdgeFloorAbs();
    const edgeRef = getEdgeSoftRef();

    const regimeAdj = regimeAdjFromMarket(marketCondition);
    const { symbolAdj, setupAdj, sizeMult, symbolStats, setupStats } = resolveExpectancyAdj(
        assetType,
        symbol,
        setupType
    );

    // Idle hunger: nới tối đa -2, không thủng FLOOR_ABS
    const idleAdj = -Math.min(2, Math.max(0, Number(idleFloorRelax) || 0));

    const raw = baseFloor + regimeAdj + symbolAdj + setupAdj + idleAdj;
    const effectiveQualityFloor = clamp(raw, floorAbs, baseFloor + 4);

    // Edge: nhẹ theo regime; sàn tuyệt đối edgeAbs
    const edgeRaw = baseEdge + (regimeAdj > 0 ? 1 : regimeAdj < 0 ? -1 : 0) + idleAdj;
    const effectiveEdgeFloor = clamp(edgeRaw, edgeAbs, Math.max(edgeRef, baseEdge));

    return {
        effectiveQualityFloor,
        effectiveEdgeFloor,
        sizeMult,
        adj: {
            baseFloor,
            regimeAdj,
            symbolAdj,
            setupAdj,
            idleAdj,
            symbolStats,
            setupStats,
        },
        band: {
            floorAbs,
            ceilingRef,
            edgeAbs,
            edgeRef,
        },
    };
};

/** Size boost when quality above ceiling ref (priority/size, not harder gate). */
export const convictionSizeBoostFromCeiling = (qualityScore, sizeMult = 1) => {
    const ceiling = getQualityCeilingRef();
    const q = Number(qualityScore) || 0;
    if (q < ceiling) return sizeMult;
    const extra = Math.min(0.15, (q - ceiling) * 0.02);
    return sizeMult * (1 + extra);
};
