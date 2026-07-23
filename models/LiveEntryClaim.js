import mongoose from 'mongoose';

/** Max 1 active LIVE position per (userOrderId, symbol). */
const LiveEntryClaimSchema = new mongoose.Schema({
    userOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserOrder', required: true },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    direction: { type: String, default: '' },
    autoTradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AutoTrade', default: null },
    exchangeConnectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeConnection', default: null },
    status: {
        type: String,
        enum: ['CLAIMED', 'OPEN', 'RELEASED'],
        default: 'CLAIMED',
        index: true,
    },
    claimedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
}, { timestamps: true });

LiveEntryClaimSchema.index(
    { userOrderId: 1, symbol: 1 },
    {
        unique: true,
        partialFilterExpression: { status: { $in: ['CLAIMED', 'OPEN'] } },
        name: 'uniq_active_live_entry_per_symbol',
    }
);

LiveEntryClaimSchema.index({ autoTradeId: 1 });
LiveEntryClaimSchema.index({ exchangeConnectionId: 1, status: 1 });
LiveEntryClaimSchema.index({ expiresAt: 1 }, { sparse: true });

export default mongoose.models.LiveEntryClaim
    || mongoose.model('LiveEntryClaim', LiveEntryClaimSchema);
