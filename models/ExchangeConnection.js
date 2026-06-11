import mongoose from 'mongoose';

/**
 * EXCHANGE CONNECTION — Kết nối sàn giao dịch của từng user.
 * API key/secret/passphrase CHỈ lưu dạng đã mã hóa AES-256-GCM.
 * apiKeyMasked dùng để hiển thị frontend (abcd****wxyz) — không cần decrypt.
 */
const ExchangeConnectionSchema = new mongoose.Schema({
    username:            { type: String, required: true, index: true, trim: true },
    exchangeName:        { type: String, required: true, enum: ['BINANCE', 'OKX', 'BYBIT'] },
    label:               { type: String, required: true, trim: true, maxlength: 60 },

    apiKeyEncrypted:     { type: String, required: true },
    secretEncrypted:     { type: String, required: true },
    passphraseEncrypted: { type: String, default: null }, // OKX bắt buộc
    apiKeyMasked:        { type: String, required: true },

    environment:         { type: String, enum: ['TESTNET', 'LIVE'], default: 'TESTNET' },
    permissions:         { type: [String], default: ['READ'] }, // không bao giờ chứa WITHDRAW

    isActive:            { type: Boolean, default: true },

    lastTestedAt:        { type: Date, default: null },
    lastTestStatus:      { type: String, enum: ['OK', 'FAILED', 'UNTESTED'], default: 'UNTESTED' },
    lastTestMessage:     { type: String, default: '' },
    lastTestLatencyMs:   { type: Number, default: null },

    balanceSnapshot:     { type: mongoose.Schema.Types.Mixed, default: {} }, // { USDT: 1200.5, BTC: 0.05 }
    balanceUpdatedAt:    { type: Date, default: null },
}, { timestamps: true });

ExchangeConnectionSchema.index({ username: 1, exchangeName: 1 });

/** Trả về object an toàn cho HTTP response — KHÔNG bao giờ chứa encrypted fields */
ExchangeConnectionSchema.methods.toSafeJSON = function () {
    return {
        _id: this._id,
        username: this.username,
        exchangeName: this.exchangeName,
        label: this.label,
        apiKeyMasked: this.apiKeyMasked,
        environment: this.environment,
        permissions: this.permissions,
        isActive: this.isActive,
        lastTestedAt: this.lastTestedAt,
        lastTestStatus: this.lastTestStatus,
        lastTestMessage: this.lastTestMessage,
        lastTestLatencyMs: this.lastTestLatencyMs,
        balanceSnapshot: this.balanceSnapshot,
        balanceUpdatedAt: this.balanceUpdatedAt,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
    };
};

export default mongoose.models.ExchangeConnection
    || mongoose.model('ExchangeConnection', ExchangeConnectionSchema);
