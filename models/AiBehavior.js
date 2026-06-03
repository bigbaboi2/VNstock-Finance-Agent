import mongoose from 'mongoose';

const AiBehaviorSchema = new mongoose.Schema({
    symbol: { type: String, required: true, uppercase: true },
    assetType: { type: String, required: true },
    date: { type: Date, default: Date.now },
    action: { type: String, required: true },
    predictedScore: { type: Number, required: true }, 
    actualPnl: { type: Number, required: true }, 
    marketCondition: { type: String, required: true }, 
    newsContext: { type: String, default: '' }, 
    lesson: { type: String, required: true }, 
    tags: [{ type: String }] 
}, { timestamps: true });

export default mongoose.models.AiBehavior || mongoose.model('AiBehavior', AiBehaviorSchema);