import mongoose from 'mongoose';

/**
 * EXCHANGE ORDER — Log lệnh THỰC đã gửi ra sàn ngoài.
 * Tách biệt hoàn toàn với AutoTrade (lệnh nội bộ/simulated).
 * Mọi lệnh live đều được ghi log, KỂ CẢ khi FAILED.
 */
const ExchangeOrderSchema = new mongoose.Schema({
    autoTradeId:          { type: mongoose.Schema.Types.ObjectId, ref: 'AutoTrade', default: null },
    userOrderId:          { type: mongoose.Schema.Types.ObjectId, ref: 'UserOrder', default: null },
    exchangeConnectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeConnection', required: true },
    username:             { type: String, required: true, index: true },
    exchangeName:         { type: String, required: true },
    environment:          { type: String, enum: ['TESTNET', 'LIVE'], default: 'TESTNET' },

    externalOrderId:      { type: String, default: null }, // ID sàn trả về
    symbol:               { type: String, required: true, uppercase: true },
    side:                 { type: String, required: true, enum: ['BUY', 'SELL'] },
    orderType:            { type: String, enum: ['MARKET', 'LIMIT'], default: 'MARKET' },
    purpose:              { type: String, enum: ['ENTRY', 'EXIT', 'MANUAL'], default: 'ENTRY' },

    quantity:             { type: Number, required: true },
    price:                { type: Number, default: null },   // giá limit (null nếu MARKET)
    filledPrice:          { type: Number, default: null },
    filledQuantity:       { type: Number, default: 0 },
    notionalUSDT:         { type: Number, default: 0 },

    status:               { type: String, default: 'PENDING', enum: ['PENDING', 'FILLED', 'PARTIAL', 'CANCELLED', 'FAILED'] },
    errorMessage:         { type: String, default: null },

    sentAt:               { type: Date, default: Date.now },
    filledAt:             { type: Date, default: null },
    rawResponse:          { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

ExchangeOrderSchema.index({ username: 1, sentAt: -1 });
ExchangeOrderSchema.index({ autoTradeId: 1 });

export default mongoose.models.ExchangeOrder
    || mongoose.model('ExchangeOrder', ExchangeOrderSchema);
