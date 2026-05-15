// models/Stock.js
import mongoose from 'mongoose';

const StockSchema = new mongoose.Schema({
    symbol: { type: String, required: true, unique: true },
    companyName: { type: String, default: "N/A" },
    exchange: { type: String, default: "VNX" },
    cafeF: { type: Object, default: null },
    tcbs: { type: Object, default: null },
    deepNewsData: { type: Array, default: [] },
    reports: { type: Array, default: [] }, 
    lastUpdated: { type: Date, default: Date.now }
});

export default mongoose.model('Stock', StockSchema);