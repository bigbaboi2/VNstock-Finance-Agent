import mongoose from 'mongoose';

const AiProviderOutageSchema = new mongoose.Schema({
    role: { type: String, required: true, unique: true, index: true },
    active: { type: Boolean, default: false, index: true },
    startedAt: { type: Date, default: null },
    recoveredAt: { type: Date, default: null },
    lastFailureAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    candidateCount: { type: Number, default: 0 },
    providerAttempts: { type: mongoose.Schema.Types.Mixed, default: [] },
}, { timestamps: true });

export default mongoose.models.AiProviderOutage
    || mongoose.model('AiProviderOutage', AiProviderOutageSchema);
