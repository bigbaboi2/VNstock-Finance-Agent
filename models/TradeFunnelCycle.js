import mongoose from 'mongoose';

/**
 * Persisted AutoDuck scan-funnel summary (Phase 0).
 * One document per asset scan cycle — queryable reject reasons.
 */
const tradeFunnelCycleSchema = new mongoose.Schema({
    asset: { type: String, required: true, index: true },
    ts: { type: Date, default: Date.now, index: true },
    scanned: { type: Number, default: 0 },
    weak: { type: Number, default: 0 },
    vol: { type: Number, default: 0 },
    setup: { type: Number, default: 0 },
    simOk: { type: Number, default: 0 },
    liveGate: { type: Number, default: 0 },
    aiVeto: { type: Number, default: 0 },
    testnet: { type: Number, default: 0 },
    risk: { type: Number, default: 0 },
    limit: { type: Number, default: 0 },
    matchedSim: { type: Number, default: 0 },
    matchedLive: { type: Number, default: 0 },
    coreEligible: { type: Number, default: 0 },
    researchEligible: { type: Number, default: 0 },
    coreMatched: { type: Number, default: 0 },
    researchMatched: { type: Number, default: 0 },
    longEligible: { type: Number, default: 0 },
    shortEligible: { type: Number, default: 0 },
    longMatched: { type: Number, default: 0 },
    shortMatched: { type: Number, default: 0 },
    shortDisabled: { type: Number, default: 0 },
    shortUnsupported: { type: Number, default: 0 },
    quoteBlocked: { type: Number, default: 0 },
    quotaBlocked: { type: Number, default: 0 },
    aiConfirmed: { type: Number, default: 0 },
    aiSoftVeto: { type: Number, default: 0 },
    aiHardVeto: { type: Number, default: 0 },
    aiOutageQueued: { type: Number, default: 0 },
    aiOutageWaiting: { type: Number, default: 0 },
    aiRetryDeferred: { type: Number, default: 0 },
    aiRetryInvalidated: { type: Number, default: 0 },
    aiRetryExpired: { type: Number, default: 0 },
    setupReasons: { type: mongoose.Schema.Types.Mixed, default: {} },
    liveGateReasons: { type: mongoose.Schema.Types.Mixed, default: {} },
    aiVetoReasons: { type: mongoose.Schema.Types.Mixed, default: {} },
    topCandidates: { type: [mongoose.Schema.Types.Mixed], default: [] },
    rejects: { type: [mongoose.Schema.Types.Mixed], default: [] },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

tradeFunnelCycleSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 3600 }); // ~60d TTL

export default mongoose.model('TradeFunnelCycle', tradeFunnelCycleSchema);
