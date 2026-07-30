import mongoose from 'mongoose';

const AiSignalCandidateSchema = new mongoose.Schema({
    assetType: { type: String, required: true, enum: ['CRYPTO', 'VN_STOCK', 'DERIVATIVES'], index: true },
    symbol: { type: String, required: true, uppercase: true, trim: true, index: true },
    direction: { type: String, required: true, enum: ['LONG', 'SHORT', 'MUA', 'BÁN'] },
    setup: { type: String, required: true },
    cohort: { type: String, required: true, enum: ['CORE', 'RESEARCH'], default: 'CORE' },
    role: { type: String, required: true },
    status: {
        type: String,
        enum: ['PENDING', 'CONFIRMED', 'VETOED', 'INVALIDATED', 'EXPIRED'],
        default: 'PENDING',
        index: true,
    },
    technicalSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    contextSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    firstQualifiedAt: { type: Date, required: true, default: Date.now },
    lastQualifiedAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    nextAttemptAt: { type: Date, required: true, index: true },
    attemptCount: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    claimOwner: { type: String, default: null },
    claimUntil: { type: Date, default: null, index: true },
    lastError: { type: mongoose.Schema.Types.Mixed, default: {} },
    resolution: { type: mongoose.Schema.Types.Mixed, default: {} },
    resolvedAt: { type: Date, default: null },
}, { timestamps: true });

AiSignalCandidateSchema.index(
    { assetType: 1, symbol: 1, direction: 1, setup: 1 },
    { unique: true, partialFilterExpression: { status: 'PENDING' } },
);
AiSignalCandidateSchema.index({ resolvedAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

export default mongoose.models.AiSignalCandidate
    || mongoose.model('AiSignalCandidate', AiSignalCandidateSchema);
