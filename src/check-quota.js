import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import 'dotenv/config';

// ==========================================
// 1. HÀM CỦA ĐẠI CA (Đã tinh chỉnh để Return mảng)
// ==========================================
async function getAvailableModels() {
    const apiKey = process.env.GEMINI_API_KEY; 

    if (!apiKey) {
        console.log('❌ LỖI: Không tìm thấy GEMINI_API_KEY trong file .env');
        return [];
    }

    console.log('🔍 Đang quét trạm kiểm soát của Google...');
    console.log('🔑 API Key đang dùng: ****' + apiKey.slice(-6));

    try {
        const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            
        // Lọc và đóng gói thành một mảng (Array) để ném xuống hàm Test
        const modelsArray = response.data.models
            .filter(model => model.supportedGenerationMethods.includes('generateContent'))
            .map(model => model.name.replace('models/', ''));
        
        console.log(`✅ Đã tìm thấy ${modelsArray.length} model hỗ trợ tạo văn bản!\n`);
        return modelsArray;

    } catch (error) {
        console.error('❌ LỖI KHI QUÉT MODEL:', error.response?.data?.error?.message || error.message);
        return [];
    }
}

// ==========================================
// 2. HÀM TEST QUOTA KẾT HỢP
// ==========================================
async function testModelQuota() {
    // 🚀 LẤY DANH SÁCH TỪ HÀM CỦA ĐẠI CA
    const modelsToTest = await getAvailableModels();

    if (modelsToTest.length === 0) {
        console.log("⚠️ Không có model nào để test! Vui lòng kiểm tra lại mạng hoặc API Key.");
        return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);

    console.log("--------------------------------------------------");
    console.log("🚀 BẮT ĐẦU TEST SỨC CHỊU ĐỰNG QUOTA...");
    console.log("--------------------------------------------------");

    for (const modelName of modelsToTest) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            process.stdout.write(`Đang bắn Ping thử vào [${modelName}]... `);
            
            // Gửi một lệnh cực ngắn để ít tốn Token nhất có thể
            await model.generateContent("Trả lời duy nhất 1 chữ: OK");
            
            console.log("✅ NGON LÀNH!");
        } catch (error) {
            // Bắt lỗi rớt Quota hoặc Nghẽn mạng
            if (error.status === 429) {
                console.log("❌ TOANG! Cạn Quota (429)");
            } else if (error.status === 503) {
                console.log("⚠️ NGHẼN MẠNG! (503)");
            } else {
                console.log(`❌ LỖI KHÁC: ${error.message}`);
            }
        }
    }
    
    console.log("--------------------------------------------------");
    console.log("🏁 HOÀN TẤT BÀI KIỂM TRA TOÀN DIỆN.");
}

// Chạy luôn
testModelQuota();