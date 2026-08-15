/**
 * Adaptive Eligibility band — dynamic quality floor within absolute min/max.
 * Never replaces hard safety (HTF, soft-block, RISK_OFF veto).
 */
import { getAutoDuckNumber } from './autoDuckConfigService.js';
import { resolveExpectancyAdj } from './symbolExpectancyService.js';
import {
    getLiveQualityMin,
    getLiveQualityMinForSetup,
    getLiveEdgeMinForSetup,
    resolveRegimeAdjustments,
} from './entrySetupEngine.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const getQualityFloorAbs = () => getAutoDuckNumber('AUTODUCK_QUALITY_FLOOR_ABS') || 78;
export const getQualityCeilingRef = () => getAutoDuckNumber('AUTODUCK_QUALITY_CEILING_REF') || 88;
export const getEdgeFloorAbs = () => getAutoDuckNumber('AUTODUCK_EDGE_FLOOR_ABS') || 22;
export const getEdgeSoftRef = () => getAutoDuckNumber('AUTODUCK_EDGE_SOFT_REF') || 28;

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
    direction = 'LONG',
    marketCondition = '',
    idleFloorRelax = 0,
} = {}) => {
    const baseFloor = getLiveQualityMinForSetup(setupType) || getLiveQualityMin();
    const floorAbs = getQualityFloorAbs();
    const ceilingRef = getQualityCeilingRef();
    const baseEdge = getLiveEdgeMinForSetup(setupType);
    const edgeAbs = getEdgeFloorAbs();
    const edgeRef = getEdgeSoftRef();

    const regime = resolveRegimeAdjustments({ marketCondition, direction });
    const { symbolAdj, setupAdj, edgeAdj, sizeMult, symbolStats, setupStats } = resolveExpectancyAdj(
        assetType,
        symbol,
        setupType
    );

    // Idle hunger: nới tối đa -2, không thủng FLOOR_ABS
    const idleAdj = -Math.min(2, Math.max(0, Number(idleFloorRelax) || 0));

    const raw = baseFloor + regime.qualityAdj + symbolAdj + setupAdj + idleAdj;
    const effectiveQualityFloor = clamp(raw, floorAbs, baseFloor + regime.qualityAdj + 4);

    // Edge: nhẹ theo regime; sàn tuyệt đối edgeAbs
    const edgeRaw = baseEdge + regime.edgeAdj + edgeAdj + idleAdj;
    const effectiveEdgeFloor = clamp(edgeRaw, edgeAbs, baseEdge + regime.edgeAdj + 4);

    return {
        effectiveQualityFloor,
        effectiveEdgeFloor,
        sizeMult,
        adj: {
            baseFloor,
            regime: regime.regime,
            regimeQualityAdj: regime.qualityAdj,
            regimeEdgeAdj: regime.edgeAdj,
            regimeVolumeAdj: regime.volumeAdj,
            symbolAdj,
            setupAdj,
            edgeAdj,
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
