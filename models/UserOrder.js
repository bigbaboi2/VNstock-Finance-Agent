import mongoose from 'mongoose';

const UserOrderSchema = new mongoose.Schema({
    username: { type: String, required: true, index: true },
    capital: { type: Number, required: true }, 
    targetPct: { type: Number, required: true }, 
    stopLossPct: { type: Number, required: true },  
    assetType: { type: String, required: true, enum: ['ALL', 'VN_STOCK', 'DERIVATIVES', 'CRYPTO'], default: 'ALL' },
    assignedTrade: { type: mongoose.Schema.Types.ObjectId, ref: 'AutoTrade', default: null },  
    // ── LIVE EXECUTION ──
    executionMode: { type: String, enum: ['SIMULATED', 'LIVE'], default: 'SIMULATED' },
    exchangeConnectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeConnection', default: null },
    // ── PORTFOLIO ALLOCATION (bot tự quản lý & chia vốn) ──
    allocationMode: { type: String, enum: ['FIXED', 'PORTFOLIO'], default: 'FIXED' },
    totalCapital: { type: Number, default: 0 },          // Tổng quỹ ủy thác (PORTFOLIO)
    allocationPercent: { type: Number, default: 10 },    // % quỹ tối đa cho 1 lệnh (PORTFOLIO)
    maxConcurrentOrders: { type: Number, default: 5 },   // Số lệnh mở đồng thời tối đa (PORTFOLIO)
    dynamicSizing: { type: Boolean, default: true },     // Bot tự điều chỉnh size theo score/risk
    usedCapital: { type: Number, default: 0 },           // Vốn đang triển khai trong các lệnh mở
    realizedPnl: { type: Number, default: 0 },           // Lãi/lỗ đã thực hiện tích lũy của gói
    tradeAllocations: [{                                  // Lịch sử phân bổ vốn cho từng lệnh
        trade: { type: mongoose.Schema.Types.ObjectId, ref: 'AutoTrade' },
        symbol: { type: String, default: '' },
        direction: { type: String, default: '' },
        entryPrice: { type: Number, default: 0 },
        executionMode: { type: String, default: 'SIMULATED' },
        matchStatus: { type: String, enum: ['MATCHED', 'UNMATCHED'], default: 'MATCHED' },
        matchMessage: { type: String, default: '' },
        amount: { type: Number, default: 0 },
        openedAt: { type: Date, default: Date.now },
        closedAt: { type: Date, default: null },
        pnl: { type: Number, default: 0 },
        pnlPercent: { type: Number, default: 0 },
    }],
    status: { 
        type: String, 
        default: 'PENDING', 
        enum: ['PENDING', 'MATCHED', 'COMPLETED', 'FAILED', 'REJECTED', 'ACTIVE', 'STOPPED'] 
    },
    result: {
        finalPnl: { type: Number, default: 0 },
        message: { type: String, default: 'Đang đợi hệ thống chấm điểm và khớp lệnh tối ưu...' }
    }
}, { timestamps: true });

export default mongoose.models.UserOrder || mongoose.model('UserOrder', UserOrderSchema);
