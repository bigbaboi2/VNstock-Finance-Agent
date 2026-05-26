import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env'), override: true });

const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

if (!apiKey) {    
    console.log(chalk.bgRed.white.bold('[LỖI CHÍ MẠNG] Biến GEMINI_API_KEY đang trống rỗng!'));
} 
else {}

const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

let ALL_MODELS_CACHE = []; 

async function getDynamicModels() {
    if (ALL_MODELS_CACHE.length > 0) return ALL_MODELS_CACHE;

    console.log(chalk.yellow('[HỆ THỐNG] Đang kết nối Google để đồng bộ danh sách Model...'));
    try {
        const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        
        const rawModelsCount = response.data.models?.length || 0;
        console.log(chalk.blue(`[HỆ THỐNG] Google trả về tổng cộng: ${rawModelsCount} model thô.`));

        let dynamicModels = response.data.models
            .filter(model => model.supportedGenerationMethods.includes('generateContent'))
            .map(model => model.name.replace('models/', ''))
            .filter(name => (name.includes('flash') || name.includes('pro')))
            .filter(name => !name.includes('tts') && !name.includes('image') && !name.includes('vision') && !name.includes('embedding'));

      
        if (dynamicModels.length === 0) {
            console.log(chalk.bgRed.white('[CẢNH BÁO] Không có model nào vượt qua được bộ lọc!'));
        } else {
            dynamicModels.forEach((name, index) => {
                console.log(chalk.gray(`[HỆ THỐNG] Tùy chọn ${index + 1}: `) + chalk.white.bold(name));
            });
        }
        // =========================================================

        dynamicModels.sort((a, b) => {
            const getVersion = (name) => {
                const match = name.match(/gemini-(\d+\.?\d*)/);
                return match ? parseFloat(match[1]) : 1.5;
            };
            
            const scoreA = getVersion(a) * 10 + (a.includes('flash') ? 1 : 2); 
            const scoreB = getVersion(b) * 10 + (b.includes('flash') ? 1 : 2);
            return scoreB - scoreA;
        });

        ALL_MODELS_CACHE = dynamicModels.slice(0, 4);
        
        console.log(chalk.green(`[HỆ THỐNG] Đã nạp 4 Model tinh nhuệ nhất vào Cache (Đã xếp hạng):`));
        ALL_MODELS_CACHE.forEach((model, idx) => {
            console.log(chalk.green.bold(`[HỆ THỐNG] Model ${idx + 1}: ${model}`));
        });
        console.log('');

        return ALL_MODELS_CACHE;
        
    } catch (error) {
        console.log(chalk.red('[LỖI] Mất kết nối quét Model động. Kích hoạt models dự phòng!'));
        ALL_MODELS_CACHE = [
            "gemini-3.5-flash", 
            "gemini-3.1-flash-lite", 
            "gemini-2.5-flash", 
            "gemini-2.5-pro"
        ];
        return ALL_MODELS_CACHE;
    }
}

const generateWithAutoSwitch = async (promptData, options = {}) => {
    const modelsToTry = await getDynamicModels();

    for (const modelName of modelsToTry) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName, ...options });
            const result = await model.generateContent(promptData);
            
            console.log(chalk.green(`[AI CORE] Phân tích thành công bằng AI [${modelName}]`));
            return result; 
            
        } catch (error) {
            const errStatus = error.status || 'LỖI';
            
            if (errStatus === 429) {
                console.log(chalk.bgRed.white.bold(`[LỖI 429] Quá giới hạn request! Hệ thống cần nghỉ ngơi.`));
                throw new Error("[Lỗi 429] Bị Google block do spam quá nhanh.");
            }
            
            if (errStatus === 503) {
                console.log(chalk.yellow(`[LỖI 503] Máy chủ Google [${modelName}] đang quá tải. Đang chuyển mạch...`));
                continue;  
            }

            console.log(chalk.yellow(`[CẢNH BÁO] Bỏ qua [${modelName}] (Mã lỗi: ${errStatus}). Đang đổi model...`));
            continue; 
        }
    }
    
    throw new Error("[LỖI] Các model khả dụng đều báo lỗi (400) hoặc bị gỡ bỏ (404).");
};

// =========================================================
// KHUNG LƯU TRỮ PDF TRÊN MONGODB
// =========================================================
const PdfCacheSchema = new mongoose.Schema({
    ticker: { type: String, required: true, unique: true },
    pdfBuffer: { type: Buffer, required: true }, 
    timestamp: { type: Date, default: Date.now, expires: 86400 }  
});
const PdfCacheModel = mongoose.models.TcbsPdfCache || mongoose.model('TcbsPdfCache', PdfCacheSchema);

// =========================================================
// 2. HÀM TẢI VÀ DỊCH BÁO CÁO TCBS  
// =========================================================
const _tcbsPdfCache = new Map(); 
const TCBS_PDF_TTL = 4 * 60 * 60 * 1000; 

export async function getMarkdownFromTcbsPdf(ticker) {
    const tickerUpper = ticker.toUpperCase();

    const cached = _tcbsPdfCache.get(tickerUpper);
    if (cached && (Date.now() - cached.ts) < TCBS_PDF_TTL) {
        console.log(chalk.green(`[HỆ THỐNG] Dùng cache TCBS PDF cho ${tickerUpper} (còn ${Math.round((TCBS_PDF_TTL - (Date.now() - cached.ts)) / 60000)} phút)`));
        return cached.markdown;
    }

    const pdfUrl = `https://static.tcbs.com.vn/oneclick/${tickerUpper}.pdf`;
    
    try {
        console.log(chalk.cyan(`[HỆ THỐNG] Đang tải PDF ${tickerUpper} từ TCBS...`));
        
        const response = await axios.get(pdfUrl, { responseType: 'arraybuffer', timeout: 15000 });
        const pdfBuffer = Buffer.from(response.data);

        console.log(chalk.yellow(`[HỆ THỐNG] Đang chuyển tệp sang Trạm Python Docling để làm sạch...`));
        
        const formData = new FormData();
        formData.append('file', pdfBuffer, { 
            filename: `${tickerUpper}_Report.pdf`, 
            contentType: 'application/pdf' 
        });

        const doclingResponse = await axios.post('http://localhost:8000/parse-pdf', formData, {
            headers: formData.getHeaders(),
            timeout: 300000 
        });

        if (doclingResponse.data.success) {
            let rawMarkdown = doclingResponse.data.markdown;

            let cleanMarkdown = rawMarkdown
                .replace(/Techcom Securities/g, '')
                .replace(/Hotline: 1800 588 826; cskh@tcbs\.com\.vn/g, '')
                .replace(/Giải thích các chỉ tiêu tài chính/g, '')
                .replace(/\n{3,}/g, '\n\n')
                .trim();

            _tcbsPdfCache.set(tickerUpper, { markdown: cleanMarkdown, ts: Date.now() });
            console.log(chalk.green(`[THÀNH CÔNG] Docling xử lý xong! Dữ liệu TCBS đã được lưu cache.`));
            return cleanMarkdown; 
        } else {
            console.log(chalk.red(`[LỖI] Trạm Docling báo lỗi: ${doclingResponse.data.error}`));
            return null;
        }

    } catch (error) {
        console.log(chalk.red(`[LỖI] Luồng TCBS PDF thất bại: ${error.message}`));
        return null;
    }
}

// =========================================================
// 3. HÀM PHÂN TÍCH LÕI CỦA OMNI DUCK
// =========================================================
export async function analyzeWithGemini(ticker, data) {
    console.log(chalk.magenta(`[AI CORE] Bắt đầu đọc dữ liệu đa chiều cho ${ticker.toUpperCase()}...`));
    
    const companyName = data?.companyProfile?.companyName || ticker;
    const overview = data?.companyProfile?.overview || "Chưa có thông tin tổng quan";
    const currentPrice = data?.stockInfo?.currentPrice || "Đang cập nhật";
    const buyVol = data?.stockInfo?.buyVolume || "N/A";
    const sellVol = data?.stockInfo?.sellVolume || "N/A";

    const newsArray = data?.news || [];
    const newsSummary = newsArray.slice(0, 5).map((n, i) => {
        return `${i + 1}. [${n.date || 'Mới nhất'}] ${n.title}`;
    }).join('\n');

   const systemPrompt = `Bạn là Giám đốc Nghiên cứu Chiến lược Phân tích Định lượng của hệ thống OMNI DUCK. 
Nhiệm vụ của bạn là tổng hợp toàn bộ dữ liệu thị trường thực tế (Cafef, Entrade) kết hợp với SIÊU VĂN BẢN KHÁCH QUAN TRÍCH XUẤT TỪ FILE PDF mặc định (Xử lý bởi Docling).

BẠN PHẢI ĐỌC HIỂU TOÀN BỘ CÁC BẢNG SỐ LIỆU TÀI CHÍNH MÀU SẮC MÀ DOCLING ĐÃ CHUYỂN ĐỔI THÀNH DẠNG MARKDOWN (|).

YÊU CẦU PHÂN TÍCH FILE PDF ĐẦU VÀO CỰC KỲ CHI TIẾT:
1. Rút ra các chỉ số tài chính cốt lõi: Biên lãi thuần (NIM), Hiệu quả vốn (ROE, ROA), Tăng trưởng LNST. Đối chiếu số liệu quá khứ và dự phóng tương lai có trong văn bản.
2. Bóc tách chất lượng tài sản: Tỷ lệ nợ xấu (NPL), Tỷ lệ bao phủ nợ xấu. Đánh giá bộ đệm rủi ro của doanh nghiệp tăng hay giảm qua các quý.
3. Tìm kiếm xung đột số liệu: Đối chiếu giữa nhận định định tính (văn bản báo cáo) và dữ liệu định lượng (các con số thực tế trong bảng số liệu). Chỉ ra điểm sáng và góc tối ngầm.

Xưng "tôi" và gọi người dùng là "bạn" với thái độ phục vụ tuyệt đối trung thành, sắc bén, chuyên nghiệp, ngôn phong thực chiến, không lý thuyết suông.

BÁO CÁO PHẢI XUẤT RA THEO ĐÚNG CẤU TRÚC MARKDOWN SAU:
## 📊 [1] BÁO CÁO TÀI CHÍNH VÀ PHÂN TÍCH KỸ THUẬT, VI MÔ
(Thông báo về trạng thái đọc báo cáo file pdf xem có dữ liệu chưa, nếu chưa có thì dựa vào thông tin bctc thị trường - ví dụ: đọc BCTC từ TCBS thất bại, dựa vào kết quả thị trường thực tế hoặc Đọc BCTC thành công, dưới đây là phân tích...)
- **Tóm tắt luận điểm từ tài liệu:** [Nêu rõ tài liệu này cung cấp góc nhìn gì mới?]
- **Bóc tách bảng dữ liệu tài chính:** [Liệt kê chính xác các con số ROE, NIM, Nợ xấu trích xuất từ bảng Markdown. Đánh giá xu hướng tăng trưởng rõ ràng qua từng giai đoạn]
- **Tác động ngầm của tài liệu:** [Tài liệu này cho thấy doanh nghiệp đang tốt lên thực sự hay chỉ là bánh vẽ tài chính?]
- Phân tích, cực sâu vào các chỉ số Cơ bản (P/E, P/B) và Dòng tiền (Mua/Bán chủ động). Nếu không thấy báo cáo TCBS, dồn lực phân tích dữ liệu đang có. Đánh giá P/E và P/B.
- **Biểu đồ Hành vi Giá (Price Action):** Dùng khối mã \`\`\`text ... \`\`\` để vẽ sơ đồ ASCII trực quan mô phỏng đường đi của giá và Volume.
- Nhận định Tay To: Lực mua/bán này đang "tố cáo" âm mưu gì của tạo lập?

## 🌐 PHẦN 2: PHÂN TÍCH VĨ MÔ & CHẤT XÚC TÁC (MACRO & CATALYSTS)
- BỘ LỌC NHIỄU: Phớt lờ toàn bộ tin tức không liên quan tài chính. ( không cần gửi thông báo là: "đã bỏ qua các thông tin nhiễu" hoặc tương tự, chỉ cần phân tích các phần bên dưới)
- Bóc tách 1-3 tin tức có "Sức sát thương" lớn nhất, mới nhất. Lý do ảnh hưởng theo chiều hướng nào.

## 🎯 [3] NHẬN ĐỊNH TOÀN DIỆN VÀ KHUYẾN NGHỊ CHIẾN LƯỢC
[Kết hợp dữ liệu PDF và giá thực tế để đưa ra kết luận cốt lõi, đưa ra dự đoán biến động giá, trong ngắn hạn, dài hạn] 
QUY TẮC TÔ MÀU (KỶ LUẬT THÉP - TIẾT CHẾ TỐI ĐA):
- BẠN BỊ CẤM tô màu tràn lan. Báo cáo tĩnh lặng mới là báo cáo nguy hiểm.
- Trong toàn bộ báo cáo, CHỈ ĐƯỢC PHÉP tô màu TỐI ĐA 3 TỪ KHÓA TÍCH CỰC và 3 TỪ KHÓA TIÊU CỰC mang tính quyết định nhất (ví dụ: MUA MẠNH, SẬP GÃY, VƯỢT ĐỈNH, DÒNG TIỀN RÚT).
- Tích cực: bọc trong <span className="text-emerald-500 font-black uppercase">từ khóa</span>
- Tiêu cực: bọc trong <span className="text-red-500 font-black uppercase">từ khóa</span>
 
## 🎯 KẾT LUẬN & CHIẾN LƯỢC LỆNH (ACTION PLAN)
Dựa trên mục tiêu lợi nhuận, đây là kịch bản chuẩn xác:
- <span className="text-yellow-500 font-black text-lg">RATING: [MUA / NẮM GIỮ / BÁN]</span>
- **Vùng Mua (Entry):** [Mức giá]
- **Cắt Lỗ (Stoploss):** [Mức giá]
- **Chốt Lời Ngắn Hạn (Target):** [Mức giá]
- **Thời Gian Ngắn Hạn:** [Dự kiến bao lâu đạt Target, VD: 3-5 phiên, 1-2 tuần]
- **Mục Tiêu Dài Hạn:** [Mức giá mục tiêu 6-12 tháng tới]
- **Thời Gian Dài Hạn:** [Dự kiến bao lâu đạt mốc Dài Hạn, VD: 2 quý, năm 2026]
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

    if (data.tcbsMarkdownData) {
        promptParts.push({
            text: `\n\n--- DỮ LIỆU TỪ BÁO CÁO TÀI CHÍNH TCBS (Trích xuất bởi Docling) ---\n${data.tcbsMarkdownData}\n-------------------`
        });
    }

    try {
        const result = await generateWithAutoSwitch(promptParts); 
        const aiReport = result.response.text();
        return aiReport;

    } catch (error) {
        console.error(chalk.bgRed.white("[LỖI] Gọi Gemini AI thất bại: "), error.message);
        throw error; 
    }
}

// =========================================================
// 4. HÀM SĂN TIN TỨC BẰNG AI
// =========================================================
export async function searchNewsWithAI(ticker, existingTitles = []) {
    console.log(chalk.cyan(`[AI CORE] Đang rà quét mạng lưới tìm tin tức về ${ticker.toUpperCase()}...`));
    
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
        
        console.log(chalk.green(`[THÀNH CÔNG] AI đã săn thành công ${newsArray.length} bài báo.`));
        return newsArray;
    } catch (error) {
        console.error(chalk.red("[LỖI] AI săn tin thất bại: "), error.message);
        return []; 
    }
}

// =========================================================
// 5. HÀM ACTION PANEL (Bản nâng cấp khung thời gian)
// =========================================================
export async function getQuickActionWithGemini(ticker, liveData, strategicContext = "") {
    const prompt = `Bạn là Giám đốc Giao dịch HFT chuyên nghiệp.
    KẾT LUẬN CHIẾN LƯỢC TỔNG THỂ TRƯỚC ĐÓ: ${strategicContext || 'Chưa có'}
    
    DỮ LIỆU LIVE HIỆN TẠI:
    - Mã: ${ticker}. Biến động: ${liveData.currentPrice} (${liveData.changePercent}%).
    - Lệnh: Mua ${liveData.buyVolume} - Bán ${liveData.sellVolume}.
    
    Nhiệm vụ: Đưa ra lệnh thực thi ngay lập tức, kèm theo dự báo chính xác về khung thời gian kỳ vọng.
    LƯU Ý: Nếu chiến lược trước đó báo "TRÁNH XA/BÁN" do nội bộ xấu hoặc rác, tuyệt đối KHÔNG được báo "MUA MẠNH" dù giá đang xanh, hãy báo "ĐỨNG NGOÀI" hoặc "THOÁT HÀNG".
    
    BẮT BUỘC TRẢ VỀ ĐỊNH DẠNG JSON KHỚP 100% MẪU SAU (Cấm kèm chữ thừa ngoài JSON):
    {
      "action": "MUA / BÁN / ĐỨNG NGOÀI / THOÁI HÀNG",
      "entry": "Mức giá hoặc 'N/A'",
      "stoploss": "Mức giá hoặc 'N/A'",
      "target": "Mức giá hoặc 'N/A'",
      "shortTermHorizon": "Dự kiến đạt Target ngắn hạn trong vòng bao lâu? (Ví dụ: 3-5 phiên, 1-2 tuần)",
      "longTermTarget": "Mức giá mục tiêu dài hạn (Khung 6-12 tháng) hoặc 'N/A'",
      "longTermHorizon": "Dự kiến đạt Target dài hạn trong vòng bao lâu? (Ví dụ: 2 quý, cuối năm 2026)",
      "reason": "Giải thích ngắn gọn, phải lột tả được yếu tố thời gian và khớp chiến lược tổng thể."
    }`;

    try {
        const result = await generateWithAutoSwitch(prompt, {
            generationConfig: { responseMimeType: "application/json" }
        });
        let text = result.response.text();
        return JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());
    } catch (error) {
        console.error(chalk.red("[LỖI] AI Action Panel thất bại: "), error.message);
        return null;
    }
}

// =========================================================
// 5B. AI PHÂN TÍCH PHÁI SINH CHUYÊN SÂU (QUANT MCP LOGIC)
// =========================================================
export async function analyzeDerivativesWithGemini(derivData) {
    console.log(chalk.magenta(`[AI CORE] Đang chạy thuật toán Quant MCP cho VN30F1M...`));

    const prompt = `
Bạn là OMNI DUCK - Hệ thống Giao dịch Định lượng (Quant Hedge Fund AI).
Bạn đang phân tích dữ liệu Phái sinh VN30F1M (Thị trường Việt Nam) dựa trên thuật toán đọc Chart tự động.

[DỮ LIỆU ĐẦU VÀO REALTIME]
- Giá VN30F1M hiện tại: ${derivData.currentF1M} | VN30 INDEX: ${derivData.vn30}
- Độ lệch (Basis): ${derivData.basis} | Tốc độ xé Basis: ${derivData.speed} điểm/nhịp
- Vùng kẹt lệnh (POC): ${derivData.poc} | Khoảng cách đến POC: ${derivData.pocDistance}%
- Khối lượng mở (OI): ${derivData.oi} HĐ | Xu thái OI: ${derivData.oiTrend}
- Khối ngoại ròng (Net): ${derivData.fNet} HĐ
- Đường xu hướng EMA (3 vs 8): EMA3=${derivData.ema3}, EMA8=${derivData.ema8}
- Biến động (ATR): ${derivData.atr} | Tổng lực 10 Trụ dẫn dắt: ${derivData.totalImpact} điểm
- Điểm hợp lưu hệ thống (Confluence Score): ${derivData.score}/100
- Đề xuất Máy móc: ${derivData.mechTrend} -> ${derivData.mechAction}
- Thông số Risk/Reward (R:R) hệ thống đề xuất: 1:${derivData.rrRatio} (SL: ${derivData.sl}, TP1: ${derivData.tp1}, TP2: ${derivData.tp2})
${derivData.newsHeadlines ? `\n[TIN TỨC VĨ MÔ GẦN NHẤT]\n${derivData.newsHeadlines}` : ''}

[QUY TẮC TƯ DUY RÀNG BUỘC - CHAIN OF THOUGHT]
Bạn PHẢI phân tích theo đúng trình tự 4 bước sau trước khi đưa ra kết luận:
1. ĐỌC ORDERFLOW & THANH KHOẢN (Liquidity): Đối chiếu độ lệch Basis, vị thế Khối ngoại và khối lượng OI để xem phe nào đang bị kẹp hàng (Trapped), Đối chiếu thêm với tin tức vĩ mô gần nhất nếu có.
2. KIỂM TRA VÙNG POC (Point of Control): Giá đang ở trên hay dưới POC? Lực hút về POC có mạnh không?
3. ĐÁNH GIÁ SỨC MẠNH TRỤ (Influencers): Lực của 10 mã vốn hóa lớn nhất đang thuận hay nghịch với Basis?
4. ĐỐI CHIẾU MICRO-STRUCTURE: Tốc độ xé Basis và EMA3/EMA8 có ủng hộ điểm đảo chiều ngắn hạn (Scalp/Day Trade) không?

[YÊU CẦU ĐẦU RA - CHỈ XUẤT MARKDOWN]
Viết báo cáo chuyên nghiệp, ngắn gọn, sắc bén theo đúng format sau. KHÔNG dùng những từ ngữ sáo rỗng. Tô đậm các con số quan trọng.

## 📡 1. GIẢI MÃ DÒNG TIỀN (ORDERFLOW & BASIS)
- [Bóc tách Basis, OI và Khối ngoại. Chỉ ra phe Long hay Short đang nắm quyền kiểm soát hoặc đang bị sập bẫy]

## 🎯 2. ĐỘNG LỰC NGẮN HẠN & VÙNG KẸT LỆNH (MICRO-STRUCTURE)
- [Đánh giá lực của Trụ, sự giao cắt EMA và vị thế giá so với vùng kẹt lệnh POC]

## ⚡ 3. KỊCH BẢN HÀNH ĐỘNG (ACTION PLAN)
- **Tín hiệu chủ đạo:** [Tên tín hiệu rõ ràng: CANH LONG / CANH SHORT / ĐỨNG NGOÀI]
- **Tỷ lệ thắng dự kiến (Confidence):** [Ví dụ: 75%]
- **Kịch bản vào lệnh (Entry):** [Vùng giá cụ thể. KHÔNG báo giá chung chung]
- **Vùng vô hiệu (Stoploss):** [Mức giá cắt lỗ, giải thích ngắn gọn tại sao chọn mức này]
- **Mục tiêu (Take Profit):** [Mức giá chốt lời 1 và 2]
- **Lưu ý nguy hiểm:** [Cảnh báo rủi ro bẻ kèo (Ví dụ: "Hủy lệnh nếu Trụ VIC, VHM bị bán tháo")]
`;

    try {
        const result = await generateWithAutoSwitch([prompt]);
        return result.response.text();
    } catch (error) {
        console.error(chalk.red("[LỖI] AI Phái sinh thất bại: "), error.message);
        throw error;
    }
}

// =========================================================
// 6. AI PHÂN TÍCH TÍN HIỆU CRYPTO & PHÁI SINH CRYPTO
// =========================================================
export async function analyzeCryptoSignalWithGemini(symbol, liveData) {
    const newsContext = liveData.newsList?.slice(0, 10).map(n => `- [${n.sentiment}] ${n.title}`).join('\n') || 'Không có tin tức.';

    const prompt = `Bạn là Giám đốc Quỹ Đầu tư Định lượng OMNI DUCK.
    Hãy phân tích đồng ${symbol} dựa trên dữ liệu realtime:

    --- THÔNG SỐ KỸ THUẬT ---
    - Giá: ${liveData.currentPrice} | Score: ${liveData.technicalScore}/100
    - RSI: ${liveData.techDetails?.rsi} | MACD: ${liveData.techDetails?.macdLine}
    - ATR: ${liveData.techDetails?.atr} | CVD: ${liveData.techDetails?.cvd}

    --- DỮ LIỆU PHÁI SINH ---
    - Funding Rate: ${liveData.derivatives?.fundingRate}%
    - Long/Short Ratio: ${liveData.derivatives?.longPercent}% / ${liveData.derivatives?.shortPercent}%

    --- TIN TỨC & VĨ MÔ ---
    ${newsContext}

    YÊU CẦU TRẢ VỀ JSON CHUẨN (CẤM CHỮ THỪA):
    {
      "signal": "LONG / SHORT / WAIT",
      "confidence": "0-100%",
      "tech_analysis": "Phân tích ngắn gọn về đồ thị và chỉ báo.",
      "macro_analysis": "Phân tích về tin tức và dòng tiền phái sinh.",
      "entry": "Giá vào lệnh",
      "sl": "Giá cắt lỗ",
      "tp": "Giá chốt lời",
      "horizon": "Thời gian nắm giữ dự kiến",
      "risk_reward": "Tỷ lệ R:R",
      "advice": "Lời khuyên chiến thuật cuối cùng."
    }`;

    try {
        const result = await generateWithAutoSwitch([prompt], {
            generationConfig: { responseMimeType: "application/json" }
        });
        return JSON.parse(result.response.text().replace(/```json/gi, '').replace(/```/g, '').trim());
    } catch (error) {
        return { signal: "WAIT", confidence: "0%", advice: "Lỗi AI: " + error.message };
    }
}

// =========================================================
// 7. HÀM CHAT VỚI AI — ĐỌC BÁO CÁO ĐÃ LƯU
// =========================================================
export async function chatWithStockAI(ticker, question, history = [], aiReport = null) {
    console.log(chalk.cyan(`[CHAT] Câu hỏi về ${ticker}: "${question.substring(0, 60)}..."`));
 
     const reportContext = aiReport
        ? `\n\n[BÁO CÁO PHÂN TÍCH ĐÃ LƯU — ${ticker.toUpperCase()}]\n${aiReport}\n[HẾT BÁO CÁO]`
        : `\n\n[CẢNH BÁO: Chưa có báo cáo lưu cho ${ticker}. Trả lời dựa trên kiến thức chung về TTCK Việt Nam.]`;
 
     const historyText = history.length > 0
        ? '\n\n[LỊCH SỬ CHAT GẦN ĐÂY]\n' +
          history.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n')
        : '';
 
    const prompt = `Bạn là OMNI DUCK — Trợ lý phân tích tài chính cho TTCK Việt Nam.
Nhiệm vụ: Trả lời câu hỏi về mã ${ticker.toUpperCase()} dựa trên báo cáo phân tích đã lưu bên dưới.
 
NGUYÊN TẮC:
1. Ưu tiên tuyệt đối thông tin từ BÁO CÁO ĐÃ LƯU.
2. Trả lời trực tiếp, súc tích, dùng số liệu cụ thể.
3. Nếu báo cáo chưa đề cập → nói rõ "Báo cáo hiện tại chưa đề cập điểm này."
4. Dùng **bold** cho số liệu quan trọng, bullet points khi liệt kê.
5. KHÔNG bịa số liệu. KHÔNG đưa lời khuyên đầu tư tuyệt đối.
6. Tối đa 300 từ (trừ khi câu hỏi yêu cầu chi tiết hơn).
${reportContext}${historyText}
 
[CÂU HỎI]
${question}
 
Trả lời bằng tiếng Việt, chuyên nghiệp, đi thẳng vào vấn đề:`;
 
    try {
        const result = await generateWithAutoSwitch([prompt]);
        const answer = result.response.text();
        console.log(chalk.green(`[THÀNH CÔNG] Đã trả lời Chat cho ${ticker} (${answer.length} ký tự)`));
        return answer;
    } catch (error) {
        console.error(chalk.red(`[LỖI] Trả lời Chat ${ticker} thất bại:`), error.message);
        throw error;
    }
}