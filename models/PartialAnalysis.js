import mongoose from 'mongoose';

const PartialAnalysisSchema = new mongoose.Schema({
    symbol: { type: String, required: true, uppercase: true },
    user: { type: String, required: true },
    fullData: { type: mongoose.Schema.Types.Mixed, default: null },
    debateResult: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, expires: 21600 } // 6 hours TTL
});

PartialAnalysisSchema.index({ symbol: 1, user: 1 }, { unique: true });

export default mongoose.model('PartialAnalysis', PartialAnalysisSchema);
