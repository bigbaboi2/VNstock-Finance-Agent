import axios from 'axios';
import 'dotenv/config';

async function checkAvailableModels() {
    // Tự động lấy Key từ file .env của Đại ca
    const apiKey = process.env.GEMINI_API_KEY; 

    if (!apiKey) {
        console.log('❌ LỖI: Không tìm thấy GEMINI_API_KEY trong file .env');
        return;
    }

    console.log('🔍 Đang quét trạm kiểm soát của Google...');
    console.log('🔑 API Key đang dùng: ****' + apiKey.slice(-6)); // In ra 6 số cuối để check xem có lấy nhầm key không

    try {
        const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        
        console.log('\n✅ DANH SÁCH CÁC MODEL MÀ ĐẠI CA ĐƯỢC PHÉP SỬ DỤNG:');
        console.log('--------------------------------------------------');
        
        response.data.models.forEach(model => {
            // Chỉ lọc ra những con AI biết tạo văn bản (generateContent)
            if (model.supportedGenerationMethods.includes('generateContent')) {
                const modelName = model.name.replace('models/', '');
                console.log(` 👉 ${modelName}`);
            }
        });
        
        console.log('--------------------------------------------------\n');
    } catch (error) {
        console.error('❌ LỖI KHI QUÉT MODEL:', error.response?.data?.error?.message || error.message);
    }
}

checkAvailableModels();