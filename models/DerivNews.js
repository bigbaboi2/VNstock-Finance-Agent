import mongoose from 'mongoose';

const derivNewsSchema = new mongoose.Schema({
    title: { type: String, required: true },
    link: { type: String, required: true },
    source: { type: String, default: 'Internet' },
    content: { type: String },
    sentiment: { type: String, enum: ['positive', 'negative', 'neutral'], default: 'neutral' },
    timestamp: { type: Date, default: Date.now }
});

export default mongoose.model('DerivNews', derivNewsSchema);