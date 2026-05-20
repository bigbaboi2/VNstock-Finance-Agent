import mongoose from 'mongoose';
 
const CacheSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },  
    data: { type: mongoose.Schema.Types.Mixed, required: true },  
    timestamp: { type: Number, default: Date.now }  
});

 const CacheModel = mongoose.models.SystemCache || mongoose.model('SystemCache', CacheSchema);

 const CACHE_TTL = 4 * 60 * 60 * 1000; 

 
export async function getCachedData(ticker) {
    try {
         const record = await CacheModel.findOne({ key: ticker.toUpperCase() });
        
        if (record) {
            const dataAge = Date.now() - record.timestamp;
             if (dataAge < CACHE_TTL) {
                return record.data;
            }
        }
        return null;  
    } catch (error) {
        console.error("❌ Lỗi lấy Cache từ MongoDB:", error.message);
        return null; 
    }
}

 
export async function saveToCache(ticker, data) {
    try {
         await CacheModel.findOneAndUpdate(
            { key: ticker.toUpperCase() },
            { 
                data: data,
                timestamp: Date.now() 
            },
            { upsert: true, new: true }
        );
    } catch (error) {
        console.error("❌ Lỗi lưu Cache lên MongoDB:", error.message);
    }
}