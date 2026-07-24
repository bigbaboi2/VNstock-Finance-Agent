import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    preferences: {
        theme: { type: String, enum: ['dark', 'light'], default: 'dark' },
        clock3d: { type: Boolean, default: true },
        uiStyle: { type: String, enum: ['classic', 'minimal', 'book'], default: 'classic' },
    },
}, { timestamps: true });

export default mongoose.model('User', userSchema);
