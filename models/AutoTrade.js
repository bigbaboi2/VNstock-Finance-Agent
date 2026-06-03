import mongoose from 'mongoose';

const AutoTradeSchema = new mongoose.Schema({
    symbol: { type: String, required: true, uppercase: true, trim: true },
    assetType: { type: String, required: true, enum: ['VN_STOCK', 'DERIVATIVES', 'CRYPTO'] },
    direction: { type: String, required: true, enum: ['LONG', 'SHORT', 'MUA', 'BÁN'] },
    entryPrice: { type: Number, required: true },
    exitPrice: { type: Number, default: null },
    volume: { type: Number, required: true },
    takeProfitPrice: { type: Number, default: 0 }, 
    stopLossPrice: { type: Number, default: 0 },   
    investedAmount: { type: Number, default: 0 },
    pnl: { type: Number, default: 0 },  
    pnlPercent: { type: Number, default: 0 },  
    aiScore: { type: Number, required: true },  
    confidence: { type: Number, required: true }, 
    reason: { type: String, required: true },  
    aiReportSnapshot: { type: String },  
    signalBreakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
    executionMeta: {
        priceSource: { type: String, default: null },
        contextSource: { type: String, default: null },
        fetchedAt: { type: Date, default: null }
    },
    status: { type: String, default: 'OPEN', enum: ['OPEN', 'CLOSED', 'WATCH', 'SKIP'] },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    marketCondition: { type: String, default: 'NORMAL' }
}, { timestamps: true });

AutoTradeSchema.index({ symbol: 1, status: 1 });
AutoTradeSchema.index({ openedAt: -1 });

export default mongoose.models.AutoTrade || mongoose.model('AutoTrade', AutoTradeSchema);
