import mongoose from 'mongoose';

const NewsSchema = new mongoose.Schema({
    title: { type: String, required: true },
    link: { type: String, required: true },
    source: { type: String },
    content: { type: String },
    date: { type: String },
    isAiGenerated: { type: Boolean, default: false }
}, { _id: false }); 

const ReportSchema = new mongoose.Schema({
    user: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    content: { type: String, required: true }, 
    action: { type: String, default: 'QUAN SÁT' }, 
    price: { type: String, default: '0' },
    changePercent: { type: Number, default: 0 }
});

const StockSchema = new mongoose.Schema({
    symbol: { type: String, required: true, unique: true },
    companyName: { type: String, default: "N/A" },
    exchange: { type: String, default: "VNX" },
    cafeF: { type: mongoose.Schema.Types.Mixed, default: null },
    tcbs: { type: mongoose.Schema.Types.Mixed, default: null },
    deepNewsData: [NewsSchema], 
    reports: [ReportSchema],    
    lastUpdated: { type: Date, default: Date.now }
});

StockSchema.pre('save', function() {
    this.lastUpdated = new Date();
});

export default mongoose.model('Stock', StockSchema);