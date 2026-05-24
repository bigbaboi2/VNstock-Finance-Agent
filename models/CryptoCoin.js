import mongoose from 'mongoose';

const CryptoCoinSchema = new mongoose.Schema({
    symbol: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    image: String,
    marketCap: Number,
    currentPrice: Number,
    change24h: Number,
    lastUpdated: { type: Date, default: Date.now }
});

export default mongoose.model('CryptoCoin', CryptoCoinSchema);