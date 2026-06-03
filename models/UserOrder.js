import mongoose from 'mongoose';

const UserOrderSchema = new mongoose.Schema({
    username: { type: String, required: true, index: true },
    capital: { type: Number, required: true }, 
    targetPct: { type: Number, required: true }, 
    stopLossPct: { type: Number, required: true },  
    assetType: { type: String, required: true, enum: ['ALL', 'VN_STOCK', 'DERIVATIVES', 'CRYPTO'], default: 'ALL' },
    assignedTrade: { type: mongoose.Schema.Types.ObjectId, ref: 'AutoTrade', default: null },  
    status: { 
        type: String, 
        default: 'PENDING', 
        enum: ['PENDING', 'MATCHED', 'COMPLETED', 'FAILED', 'REJECTED'] 
    },
    result: {
        finalPnl: { type: Number, default: 0 },
        message: { type: String, default: 'Đang đợi hệ thống chấm điểm và khớp lệnh tối ưu...' }
    }
}, { timestamps: true });

export default mongoose.models.UserOrder || mongoose.model('UserOrder', UserOrderSchema);