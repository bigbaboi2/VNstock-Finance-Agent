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
    // ── PARTIAL SCALE-OUT (Policy E) ──
    // Chốt `tp1Fraction` vị thế ở takeProfit1Price, dời SL phần còn lại về breakeven,
    // để phần còn lại chạy theo chandelier ATR. Bằng chứng backtest: expectancy ÂM→DƯƠNG.
    entryAtr: { type: Number, default: null },           // ATR tại lúc vào (cho chandelier trailing)
    peakPrice: { type: Number, default: null },          // giá thuận lợi nhất đạt được (cho chandelier)
    takeProfit1Price: { type: Number, default: null },   // mốc chốt lời từng phần (TP1)
    tp1Fraction: { type: Number, default: 0 },           // tỷ lệ vị thế chốt ở TP1 (0 = không partial)
    tp1Filled: { type: Boolean, default: false },        // đã chốt phần TP1 chưa
    tp1FillPrice: { type: Number, default: null },       // giá thực tế chốt TP1
    realizedPartialPnl: { type: Number, default: 0 },    // PnL (VND) đã hiện thực hoá từ TP1
    executionMeta: {
        priceSource: { type: String, default: null },
        contextSource: { type: String, default: null },
        fetchedAt: { type: Date, default: null }
    },
    // ── LIVE EXECUTION (kết nối sàn thực) ──
    executionMode: { type: String, enum: ['SIMULATED', 'LIVE'], default: 'SIMULATED' },
    marketType: { type: String, enum: ['SPOT', 'FUTURES'], default: 'SPOT' },
    leverage: { type: Number, default: 1 },
    exchangeConnectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeConnection', default: null },
    externalOrderId: { type: String, default: null },
    status: { type: String, default: 'OPEN', enum: ['OPEN', 'PENDING', 'CLOSED', 'WATCH', 'SKIP'] },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    exitReason: { type: String, default: null },
    exitTag: { type: String, default: null },
    marketCondition: { type: String, default: 'NORMAL' },
    riskLevel: { type: Number, default: 2 }
}, { timestamps: true });

AutoTradeSchema.index({ symbol: 1, status: 1 });
AutoTradeSchema.index({ openedAt: -1 });

export default mongoose.models.AutoTrade || mongoose.model('AutoTrade', AutoTradeSchema);
