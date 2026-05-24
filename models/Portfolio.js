import mongoose from 'mongoose';

// Lịch sử lệnh đã khớp
const TradeHistorySchema = new mongoose.Schema({
    assetType: { type: String, required: true },
    symbol: { type: String, required: true },
    type: { type: String, enum: ['BUY', 'SELL'], required: true },
    volume: { type: Number, required: true },
    price: { type: Number, required: true },
    totalValue: { type: Number, required: true },
    realizedPnL: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

// Tài sản đang nắm giữ
const HoldingSchema = new mongoose.Schema({
    assetType: { type: String, required: true },
    symbol: { type: String, required: true },
    volume: { type: Number, required: true },
    avgPrice: { type: Number, required: true },
}, { _id: false });

// SỔ LỆNH CHỜ  
const PendingOrderSchema = new mongoose.Schema({
    assetType: { type: String, required: true },
    symbol: { type: String, required: true },
    type: { type: String, enum: ['BUY', 'SELL'], required: true },
    orderType: { type: String, enum: ['LO', 'ATO', 'ATC'], required: true },
    volume: { type: Number, required: true },
    targetPrice: { type: Number, required: true }, 
    status: { type: String, enum: ['PENDING', 'CANCELLED'], default: 'PENDING' },
    createdAt: { type: Date, default: Date.now }
});

const PortfolioSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    balance: { type: Number, default: 10000000000 },
    holdings: [HoldingSchema],
    pendingOrders: [PendingOrderSchema],  
    history: [TradeHistorySchema]
}, { timestamps: true });

PortfolioSchema.index({
    "pendingOrders.status": 1
});

PortfolioSchema.index({
    "holdings.symbol": 1
});

PortfolioSchema.index({
    createdAt: -1
});
export default mongoose.model('Portfolio', PortfolioSchema);