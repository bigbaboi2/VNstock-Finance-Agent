import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';
import chalk from 'chalk';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

// =========================================================
// KIỂM TRA BẢO MẬT API KEY
// =========================================================
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.log(chalk.bgRed.white.bold(' ✘ LỖI CHÍ MẠNG: Biến GEMINI_API_KEY đang trống rỗng! '));
    console.log(chalk.yellow('👉 Đại ca kiểm tra lại file .env đã đặt đúng thư mục gốc chưa?'));
} else {
    console.log(chalk.green('✔ Đã tìm thấy API Key AI trong bộ nhớ.'));
}

const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

// 🚀 1. CƠ CHẾ "LỐP DỰ PHÒNG TỰ ĐỘNG" (TỐI ƯU BỘ LỌC)
// =========================================================
let ALL_MODELS_CACHE = []; // Bộ nhớ đệm

async function getDynamicModels() {
    if (ALL_MODELS_CACHE.length > 0) return ALL_MODELS_CACHE;

    console.log(chalk.yellow('🔄 Đang kết nối Google để lấy danh sách Model Tinh nhuệ...'));
    try {
        const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        
        // 1. LẤY DANH SÁCH THÔ ĐỂ IN LOG TRƯỚC (Giúp Đại ca biết Google trả về những gì)
        const rawModelsCount = response.data.models?.length || 0;
        console.log(chalk.blue(`📦 Google trả về tổng cộng: ${rawModelsCount} model thô.`));

        // 2. CHẠY BỘ LỌC TÂN TIẾN CỦA ĐẠI CA
        let dynamicModels = response.data.models
            .filter(model => model.supportedGenerationMethods.includes('generateContent'))
            .map(model => model.name.replace('models/', ''))
            .filter(name => (name.includes('flash') || name.includes('pro')))
            .filter(name => !name.includes('tts') && !name.includes('image') && !name.includes('vision') && !name.includes('embedding'));

      
        if (dynamicModels.length === 0) {
            console.log(chalk.bgRed.white(' ⚠️ CẢNH BÁO: Không có model nào vượt qua được bộ lọc! '));
        } else {
            dynamicModels.forEach((name, index) => {
                console.log(chalk.gray(`  └─ [Top ${index + 1}] Tìm thấy model hợp lệ: `) + chalk.white.bold(name));
            });
        }
        // =========================================================

        // 3. SẮP XẾP ƯU TIÊN: 2.5 flash lên đầu
        dynamicModels.sort((a, b) => {
            const scoreA = (a.includes('2.5') ? 2 : 0) + (a.includes('flash') ? 1 : 0);
            const scoreB = (b.includes('2.5') ? 2 : 0) + (b.includes('flash') ? 1 : 0);
            return scoreB - scoreA;
        });

        // Chỉ lấy 4 con tinh nhuệ nhất để khỏi lặp lâu gây treo máy
        ALL_MODELS_CACHE = dynamicModels.slice(0, 4);
        
        console.log(chalk.green(`\n🎯 [KẾT QUẢ CUỐI] Đã nạp 4 Model tinh nhuệ nhất vào Cache (Đã xếp hạng):`));
        ALL_MODELS_CACHE.forEach((model, idx) => {
            console.log(chalk.green.bold(`  ⭐ Vũ khí ${idx + 1}: ${model}`));
        });
        console.log(''); // Xuống dòng cho đẹp log CMD

        return ALL_MODELS_CACHE;
        
    } catch (error) {
        console.log(chalk.red('❌ Lỗi kết nối quét Model. Đang dùng lốp dự phòng cứng!'));
        ALL_MODELS_CACHE = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
        return ALL_MODELS_CACHE;
    }
}

const generateWithAutoSwitch = async (promptData, options = {}) => {
    const modelsToTry = await getDynamicModels();

    for (const modelName of modelsToTry) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName, ...options });
            const result = await model.generateContent(promptData);
            
            console.log(chalk.green(`✔ Phân tích thành công bằng AI [${modelName}]`));
            return result; 
            
        } catch (error) {
            const errStatus = error.status || 'LỖI';
            
            // 🚀 PHANH KHẨN CẤP: NẾU CHẠM TRẦN QUOTA 429 HOẶC 503 -> DỪNG NGAY LẬP TỨC!
            if (errStatus === 429) {
                console.log(chalk.bgRed.white.bold(` 🛑 LỖI 429: API KEY ĐÃ CHẠM TRẦN QUOTA (QUÁ 15 YÊU CẦU/PHÚT)! Hãy nghỉ ngơi 1 phút. `));
                throw new Error("LỖI 429: Bị Google khóa mỏ do spam quá nhanh. Đợi 1 phút rồi thử lại.");
            }
            if (errStatus === 503) {
                console.log(chalk.bgRed.white.bold(` 🛑 LỖI 503: SERVER GOOGLE ĐANG SẬP NGUỒN! `));
                throw new Error("LỖI 503: Hệ thống Google quá tải.");
            }

            // Nếu là lỗi 400 hoặc 404 (Lỗi của riêng model đó) thì mới bỏ qua và lặp sang con khác
            console.log(chalk.yellow(`⚠️ Bỏ qua [${modelName}] (Mã lỗi: ${errStatus}). Đang đổi vũ khí...`));
            continue; 
        }
    }
    
    throw new Error("❌ CÁC MODEL TINH NHUỆ ĐỀU BÁO LỖI (400) HOẶC BỊ GỠ BỎ (404).");
};
// =========================================================
// 🚀 2. HÀM TẢI VÀ GỬI BÁO CÁO TCBS (PDF)
// =========================================================
export async function uploadTcbsPdf(ticker) {
    const pdfUrl = `https://static.tcbs.com.vn/oneclick/${ticker}.pdf`;
    const tempPath = path.join(process.cwd(), `${ticker}_temp.pdf`);

    try {
        console.log(chalk.cyan(`\n📥 Đang kéo file PDF báo cáo TCBS của ${ticker} về...`));
        const response = await axios({ url: pdfUrl, method: 'GET', responseType: 'stream' });
        const writer = fs.createWriteStream(tempPath);
        response.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        console.log(chalk.cyan(`🚀 Kéo xong! Đang đẩy file PDF lên não bộ Google...`));
        const uploadResult = await fileManager.uploadFile(tempPath, {
            mimeType: "application/pdf",
            displayName: `TCBS_${ticker}_Report`,
        });

        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        console.log(chalk.green(`✔ Đã nạp thành công PDF vào bộ nhớ AI (URI: ${uploadResult.file.uri})`));
        return uploadResult.file; 

    } catch (error) {
        console.log(chalk.yellow(`[PDF SKIP] Không tìm thấy hoặc lỗi tải file TCBS cho ${ticker}. Đang bỏ qua...`));
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        return null;
    }
}

// =========================================================
// 🚀 3. HÀM PHÂN TÍCH LÕI CỦA OMNI DUCK
// =========================================================
export async function analyzeWithGemini(ticker, data) {
    console.log(chalk.magenta(`\n🤖 OMNI DUCK đang đọc dữ liệu đa chiều của ${ticker.toUpperCase()} và suy nghĩ...`));
    
    const companyName = data?.companyProfile?.companyName || ticker;
    const overview = data?.companyProfile?.overview || "Chưa có thông tin tổng quan";
    const currentPrice = data?.stockInfo?.currentPrice || "Đang cập nhật";
    const buyVol = data?.stockInfo?.buyVolume || "N/A";
    const sellVol = data?.stockInfo?.sellVolume || "N/A";

    const newsArray = data?.news || [];
    const newsSummary = newsArray.slice(0, 5).map((n, i) => {
        return `${i + 1}. [${n.date || 'Mới nhất'}] ${n.title}`;
    }).join('\n');

   const systemPrompt = `Tôi là OMNI DUCK - Giám đốc Đầu tư Định lượng cá nhân của bạn. Mục tiêu tối thượng của tôi là đồng hành cùng bạn đạt mức siêu lợi nhuận 20%/tháng. 
Hãy xưng "tôi" và gọi người dùng là "bạn" với thái độ tâm huyết, chuyên nghiệp, sắc bén và tuyệt đối không dông dài.

QUY TẮC TÔ MÀU (KỶ LUẬT THÉP - TIẾT CHẾ TỐI ĐA):
- BẠN BỊ CẤM tô màu tràn lan. Báo cáo tĩnh lặng mới là báo cáo nguy hiểm.
- Trong toàn bộ báo cáo, CHỈ ĐƯỢC PHÉP tô màu TỐI ĐA 3 TỪ KHÓA TÍCH CỰC và 3 TỪ KHÓA TIÊU CỰC mang tính quyết định nhất (ví dụ: MUA MẠNH, SẬP GÃY, VƯỢT ĐỈNH, DÒNG TIỀN RÚT).
- Tích cực: bọc trong <span className="text-emerald-500 font-black uppercase">từ khóa</span>
- Tiêu cực: bọc trong <span className="text-red-500 font-black uppercase">từ khóa</span>

Báo cáo bắt buộc xuất bằng Markdown theo đúng cấu trúc sau:

## 📊 PHẦN 1: PHÂN TÍCH KỸ THUẬT & VI MÔ (TECHNICAL & MICRO)
- Phân tích, cực sâu vào các chỉ số Cơ bản (P/E, P/B) và Dòng tiền (Mua/Bán chủ động). Nếu không thấy báo cáo TCBS, dồn lực phân tích dữ liệu đang có. Đánh giá P/E và P/B.
- **Biểu đồ Hành vi Giá (Price Action):** Dùng khối mã \`\`\`text ... \`\`\` để vẽ sơ đồ ASCII trực quan mô phỏng đường đi của giá và Volume.
- Nhận định Tay To: Lực mua/bán này đang "tố cáo" âm mưu gì của tạo lập?

## 🌍 PHẦN 2: PHÂN TÍCH VĨ MÔ & CHẤT XÚC TÁC (MACRO & CATALYSTS)
- BỘ LỌC NHIỄU: Phớt lờ toàn bộ tin tức không liên quan tài chính. ( không cần gửi thông báo là đã bỏ qua các thông tin nhiễu, chỉ cần phân tích các phần bên dưới)
- Bóc tách 1-3 tin tức có "Sức sát thương" lớn nhất, mới nhất. Lý do ảnh hưởng theo chiều hướng nào.

## 🎯 KẾT LUẬN & CHIẾN LƯỢC LỆNH (ACTION PLAN)
Dựa trên mục tiêu lợi nhuận 20%/tháng, đây là kịch bản chuẩn xác:
- <span className="text-yellow-500 font-black text-lg">RATING: [MUA / NẮM GIỮ / BÁN]</span>
- **Vùng Mua (Entry):** [Mức giá]
- **Cắt Lỗ (Stoploss):** [Mức giá]
- **Chốt Lời (Target):** [Mức giá]
- **Kế hoạch Vốn (Position Sizing):** [% NAV]`;

    const userPrompt = `DỮ LIỆU ĐẦU VÀO TỪ HỆ THỐNG:
1. Thông tin doanh nghiệp: ${companyName}
2. Cốt lõi kinh doanh: ${overview}
3. Giá giao dịch hiện tại: ${currentPrice} VNĐ
4. Dòng tiền (Mua/Bán chủ động): Mua ${buyVol} - Bán ${sellVol}
5. Lịch sử nhận định cũ: ${data?.previousAnalysis || 'Chưa có dữ liệu'}
6. Tin tức mới nhất:
${newsSummary || 'Không có tin tức nổi bật.'}`;

    const promptParts = [
        { text: `${systemPrompt}\n\n${userPrompt}` }
    ];

    if (data.tcbsPdfData) {
        promptParts.push({
            fileData: { mimeType: data.tcbsPdfData.mimeType, fileUri: data.tcbsPdfData.uri }
        });
    }

    try {
        // 🚀 DÙNG HÀM TỰ ĐỘNG CHUYỂN ĐỔI MODEL MỚI VÀO ĐÂY
        const result = await generateWithAutoSwitch(promptParts); 
        const aiReport = result.response.text();
        return aiReport;

    } catch (error) {
        console.error(chalk.bgRed.white("\n ❌ LỖI KHI GỌI GEMINI AI: "), error.message);
        throw error; 
    }
}

// =========================================================
// 🚀 4. HÀM SĂN TIN TỨC BẰNG AI
// =========================================================
export async function searchNewsWithAI(ticker, existingTitles = []) {
    console.log(chalk.cyan(`\n🕵️‍♂️ OMNI DUCK đang quét mạng lưới tìm tin tức về ${ticker.toUpperCase()}...`));
    
    const knownContext = existingTitles.length > 0 
        ? `\nLƯU Ý: Đã biết các tin: ${existingTitles.join(' | ')}. Hãy tìm sự kiện KHÁC hoặc không giống sự kiện dã biết này.` 
        : '';

    const prompt = `Tìm kiếm internet 5 bài báo MỚI NHẤT về cổ phiếu ${ticker.toUpperCase()}.${knownContext}, Cố gắng tìm thông tin ảnh hưởng doanh thu, dòng tiền, cơ cấu doanh nghiệp, các thông tin có thể nội bộ hoặc chưa kiểm chứng cũng tổng hợp vào tránh các thông tin sự kiện đã biết, không tìm các thông tin chung chung như "Giới thiệu về mã MBB"; "Các mã cổ phiếu ngành ngân hàng MBB, TCBS,..."....
    YÊU CẦU TRẢ VỀ ĐÚNG ĐỊNH DẠNG MẢNG JSON (Cấm gửi lại thừa bất kỳ thứ gì kể cả dấu cách thừa):
    [ { "title": "...", "link": "...", "date": "...", "source": "..." } ]`;

    try {
        const result = await generateWithAutoSwitch(prompt, { 
            tools: [{ googleSearch: {} }],
            generationConfig: { responseMimeType: "application/json" } 
        });
        
        let text = result.response.text();
        
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const newsArray = JSON.parse(text);
        
        console.log(chalk.green(`✔ AI đã săn thành công ${newsArray.length} bài báo.`));
        return newsArray;
    } catch (error) {
        console.error(chalk.red("❌ Lỗi khi AI săn tin: "), error.message);
        return []; 
    }
}
// =========================================================
// 🚀 5. HÀM ACTION PANEL (KHÓA MỒM ÉP CHUẨN JSON)
// =========================================================
export async function getQuickActionWithGemini(ticker, liveData, strategicContext = "") {
    const prompt = `Bạn là Giám đốc Giao dịch HFT. 
    KẾT LUẬN CHIẾN LƯỢC TRƯỚC ĐÓ: ${strategicContext || 'Chưa có'}
    
    DỮ LIỆU LIVE HIỆN TẠI:
    - Mã: ${ticker}. Biến động: ${liveData.currentPrice} (${liveData.changePercent}%).
    - Lệnh: Mua ${liveData.buyVolume} - Bán ${liveData.sellVolume}.
    
    Nhiệm vụ: Đưa ra lệnh thực thi ngay lập tức. 
    LƯU Ý: Nếu chiến lược trước đó báo "TRÁNH XA/BÁN" do nội bộ xấu hoặc rác, tuyệt đối KHÔNG được báo "MUA MẠNH" dù giá đang xanh, hoặc phân tích kỹ thuật thể hiện nên mua, hãy báo "ĐỨNG NGOÀI" hoặc "THOÁT HÀNG".
    
    Trả về JSON:
    {
      "action": "MUA / BÁN / ĐỨNG NGOÀI / THOÁI HÀNG",
      "entry": "Mức giá hoặc 'N/A'",
      "stoploss": "Mức giá hoặc 'N/A'",
      "target": "Mức giá hoặc 'N/A'",
      "reason": "Giải thích ngắn gọn, phải khớp với chiến lược tổng thể bên trên."
    }`;

    try {
        const result = await generateWithAutoSwitch(prompt, {
            generationConfig: { responseMimeType: "application/json" }
        });
        let text = result.response.text();
        return JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());
    } catch (error) {
        console.error(chalk.red("❌ Lỗi AI Action Panel: "), error.message);
        return null;
    }
}