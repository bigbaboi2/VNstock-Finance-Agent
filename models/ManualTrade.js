import mongoose from 'mongoose';

/**
 * MANUAL TRADE — Lệnh người dùng yêu cầu khớp THẲNG ra sàn LIVE qua /trade.
 * TÁCH BIỆT hoàn toàn với AutoTrade (engine tự động) để dễ quản lý.
 * Entry đặt LIMIT trên sàn; TP/SL quản lý theo kiểu "synthetic" bởi monitor
 * (khi giá chạm mức → gửi MARKET sell phần tương ứng).
 */
const TpFillSchema = new mongoose.Schema({
    level: Number,          // index TP (1-based)
    targetPrice: Number,
    filledPrice: Number,
    qty: Number,
    orderId: String,
    at: Date,
}, { _id: false });

const ManualTradeSchema = new mongoose.Schema({
    // ── Tag người yêu cầu (phân biệt với lệnh tự động) ──
    requestedBy:   { type: String, required: true, index: true }, // telegram username
    source:        { type: String, default: 'TELEGRAM_MANUAL' },
    rawCommand:    { type: String, default: '' },

    // ── Sàn ──
    exchangeConnectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeConnection', required: true },
    exchangeName:  { type: String, default: '' },
    environment:   { type: String, default: 'LIVE' },

    // ── Thị trường / đòn bẩy ──
    marketType:    { type: String, enum: ['SPOT', 'FUTURES'], default: 'SPOT' },
    leverage:      { type: Number, default: 1 },
    marginType:    { type: String, enum: ['ISOLATED', 'CROSSED'], default: 'ISOLATED' },

    // ── Thông số lệnh ──
    symbol:        { type: String, required: true, uppercase: true }, // đã normalize: BTCUSDT
    side:          { type: String, enum: ['BUY', 'SELL'], default: 'BUY' }, // mở vị thế: LONG=BUY, SHORT=SELL
    direction:     { type: String, default: 'LONG' },
    entryPrice:    { type: Number, required: true },
    tpLevels:      { type: [Number], default: [] },   // [5.609, 5.715, 6.115]
    slPrice:       { type: Number, required: true },
    slOriginal:    { type: Number, required: true },  // SL gốc (để biết đã dời chưa)

    // ── Vốn ──
    useAllBalance: { type: Boolean, default: false },
    amountUSDT:    { type: Number, default: 0 },

    // ── Options ──
    options:       { type: [String], default: [] },   // ['tp1', 'allbal', ...]
    moveSlAfterTp: { type: Number, default: 0 },       // 0 = không; n = sau TPn dời SL về entry

    // ── Trạng thái thực thi ──
    status:        { type: String, enum: ['PENDING_ENTRY', 'OPEN', 'CLOSED', 'CANCELLED', 'FAILED'], default: 'PENDING_ENTRY', index: true },
    entryOrderId:  { type: String, default: null },
    filledQty:     { type: Number, default: 0 },
    filledPrice:   { type: Number, default: 0 },
    remainingQty:  { type: Number, default: 0 },
    tpFills:       { type: [TpFillSchema], default: [] },

    // ── Kết quả ──
    realizedPnlUsdt: { type: Number, default: 0 },
    pnlPercent:      { type: Number, default: 0 },
    closeReason:     { type: String, default: '' },
    errorMessage:    { type: String, default: '' },

    openedAt:      { type: Date, default: Date.now },
    filledAt:      { type: Date, default: null },
    closedAt:      { type: Date, default: null },
}, { timestamps: true });

ManualTradeSchema.index({ status: 1, symbol: 1 });

export default mongoose.models.ManualTrade || mongoose.model('ManualTrade', ManualTradeSchema);
