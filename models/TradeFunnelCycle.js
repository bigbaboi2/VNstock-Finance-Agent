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
    setupReasons: { type: mongoose.Schema.Types.Mixed, default: {} },
    liveGateReasons: { type: mongoose.Schema.Types.Mixed, default: {} },
    aiVetoReasons: { type: mongoose.Schema.Types.Mixed, default: {} },
    topCandidates: { type: [mongoose.Schema.Types.Mixed], default: [] },
    rejects: { type: [mongoose.Schema.Types.Mixed], default: [] },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

tradeFunnelCycleSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 3600 }); // ~60d TTL

export default mongoose.model('TradeFunnelCycle', tradeFunnelCycleSchema);
