import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    preferences: {
        theme: { type: String, enum: ['dark', 'light'], default: 'dark' },
        clock3d: { type: Boolean, default: true },
    },
}, { timestamps: true });

export default mongoose.model('User', userSchema);
