import mongoose from 'mongoose';

const NewsSchema = new mongoose.Schema({
    title:         { type: String, required: true },
    link:          { type: String, required: true },
    source:        { type: String },
    content:       { type: String },
    date:          { type: String },
    publishedAt:   { type: Date, default: Date.now },  
    sentiment:     { type: String, enum: ['positive', 'negative', 'neutral'], default: 'neutral' },
    mode:          { type: String, enum: ['official', 'balanced', 'negative', 'rumor'], default: 'balanced' },
    isAiGenerated: { type: Boolean, default: false }
}, { _id: false });

const ReportSchema = new mongoose.Schema({
    user: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    content: { type: String, required: true }, 
    action: { type: String, default: 'QUAN SÁT' },
    actionData: { type: mongoose.Schema.Types.Mixed, default: null },
    inputHash: { type: String, default: null }, 
    price: { type: String, default: '0' },
    changePercent: { type: Number, default: 0 }
});

const StockSchema = new mongoose.Schema({
    symbol: { type: String, required: true, unique: true },
    companyName: { type: String, default: "N/A" },
    exchange: { type: String, default: "VNX" },
    sector: { type: String, default: "KH%C3%81C" },
    cafeF: { type: mongoose.Schema.Types.Mixed, default: null },
    tcbs: { type: mongoose.Schema.Types.Mixed, default: null },
    deepNewsData: [NewsSchema], 
    reports: [ReportSchema],    
    lastUpdated: { type: Date, default: Date.now }
});

StockSchema.pre('save', function() {
    this.lastUpdated = new Date();
});
StockSchema.index({ companyName: 1 });

StockSchema.index({ exchange: 1 });

StockSchema.index({
    "reports.user": 1
});

StockSchema.index({
    lastUpdated: -1
});
export default mongoose.model('Stock', StockSchema);
