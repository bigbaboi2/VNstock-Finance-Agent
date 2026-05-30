import chalk from 'chalk';
import { generateWithAutoSwitch } from './aiService.js';
import { searchVnNewsDirectly, fetchRedditMacro, fetchFireAntSocial } from '../scrapers/vnNewsSearch.js';

// =========================================================
// OMNI DUCK — DEBATE PIPELINE
// =========================================================

export async function runDebatePipeline(ticker, data, emitProgress, onDebateChunk = () => {}) {
    const companyName = data?.companyProfile?.companyName || ticker;

    emitProgress({ step: 'DEBATE_INIT', message: 'Triệu tập Hội đồng Phân tích Độc lập...', progress: 60 });

    // =========================================================
    // CHUẨN BỊ DỮ LIỆU TIN TỨC
    // =========================================================
    emitProgress({ step: 'DEBATE_NEWS_FETCH', message: 'Đang thu thập thêm tin tức khác, Reddit và social sentiment...', progress: 62 });

    const [rawNews, redditMacro, fireAntSocial] = await Promise.all([
        searchVnNewsDirectly(ticker, 'balanced', 20).catch(() => []),
        fetchRedditMacro(ticker).catch(() => '[REDDIT] Không lấy được dữ liệu.'),
        fetchFireAntSocial(ticker).catch(() => '[FIREANT] Không lấy được dữ liệu.'),
    ]);

    const newsSummary = rawNews.length > 0
        ? rawNews.map((a, i) =>
            `${i + 1}. [${a.sentiment?.toUpperCase() || 'NEUTRAL'}] ${a.title} (${a.source} - ${a.date})`
          ).join('\n')
        : 'Không tìm thấy tin tức liên quan.';

    // =========================================================
    // PHASE 1: BA CHUYÊN GIA PHÂN TÍCH ĐỘC LẬP (SONG SONG)
    // =========================================================
    emitProgress({ step: 'DEBATE_PHASE1', message: 'Hội đồng chuyên gia đang phân tích kỹ thuật, cơ bản và tâm lý...', progress: 64 });

    // ==================== 1. KỸ THUẬT ====================
    const techPrompt = `
Bạn là Chuyên gia Phân tích Kỹ thuật cấp cao với 15 năm kinh nghiệm trên thị trường chứng khoán Việt Nam.
Cổ phiếu:
${ticker} (${companyName})
Dữ liệu:
- Technical Data: ${JSON.stringify(data.technicalData)}
- Market Context: ${JSON.stringify(data.marketContext)}
Nhiệm vụ:
Đánh giá xác suất biến động giá trong 1-8 tuần tới.
Phân tích theo thứ tự ưu tiên:
1. Cấu trúc xu hướng
- Uptrend / Downtrend / Sideway
- Độ mạnh xu hướng (Yếu / Trung bình / Mạnh)
- Giá đang ở giai đoạn nào của xu hướng
2. Dòng tiền
- Volume có xác nhận xu hướng không
- Dấu hiệu tích lũy hay phân phối
- Lực mua chủ động hay bán chủ động chiếm ưu thế
3. Vùng giá quan trọng
- Hỗ trợ gần nhất
- Kháng cự gần nhất
- Điểm breakout hoặc breakdown đáng chú ý
4. Tín hiệu rủi ro
- Phân kỳ RSI/MACD (nếu có)
- Bull trap / Bear trap
- Dấu hiệu suy yếu xu hướng
5. Kết luận
- Bias cuối cùng: Bullish / Neutral / Bearish
- Xác suất nhận định đúng (%)
Nếu dữ liệu tồn tại các indicator sau, hãy sử dụng để xác nhận nhận định:
- Phải sử dụng EMA20, EMA50, EMA200
- RSI
- MACD
- Bollinger Bands
để xác nhận nhận định.
Không được bỏ qua indicator nếu dữ liệu có sẵn.
Yêu cầu:
- Tối đa 180 từ.
- Ưu tiên dữ liệu quan trọng nhất.
- Không giải thích dài dòng.
- Không sử dụng các câu chung chung như "nhà đầu tư nên theo dõi thêm".
- Chỉ trả lời bằng tiếng Việt.
`;

    // ==================== 2. CƠ BẢN ====================
    const fundPrompt = `
Bạn là Senior Fundamental Analyst + Credit Risk Analyst của một quỹ đầu tư tổ chức.
Nhiệm vụ:
Phân tích doanh nghiệp ${ticker} (${companyName}) như thể bạn đang quyết định giải ngân 100 tỷ vào cổ phiếu này (giá trị chỉ mang hình thức làm động lực, giả thiết, nếu nó ảnh hưởng đến vốn, dòng tiền của doanh nghiệp thì điều số tiền vào).
${data.tcbsMarkdownData ? data.tcbsMarkdownData.substring(0, 12000) : 'Không có dữ liệu'}
Không được tóm tắt báo cáo.
Hãy tìm ra các tín hiệu QUAN TRỌNG NHẤT ảnh hưởng tới giá trị doanh nghiệp và khả năng tăng giá cổ phiếu.
Ưu tiên đánh giá theo thứ tự:
[1] CHẤT LƯỢNG TĂNG TRƯỞNG
Doanh thu tăng hay giảm?
Lợi nhuận tăng hay giảm?
Tăng trưởng đến từ hoạt động cốt lõi hay yếu tố bất thường?
Xu hướng hiện tại có bền vững không?
[2] CHẤT LƯỢNG DÒNG TIỀN
Dòng tiền hoạt động kinh doanh mạnh hay yếu?
Lợi nhuận có được hỗ trợ bởi dòng tiền thực không?
Có dấu hiệu lợi nhuận ảo không?
[3] SỨC KHỎE TÀI CHÍNH
Nợ vay đang cải thiện hay xấu đi?
Khả năng thanh toán ngắn hạn
Khả năng trả nợ dài hạn
Rủi ro thanh khoản
[4] HIỆU QUẢ SỬ DỤNG VỐN
ROE
ROA
Biên lợi nhuận
Hiệu quả tái đầu tư
Chất lượng quản trị vốn
[5] CẢNH BÁO QUAN TRỌNG
Tìm các tín hiệu rủi ro nếu có:
Nợ tăng nhanh
Dòng tiền âm kéo dài
Pha loãng cổ phiếu
Phải thu bất thường
Tồn kho bất thường
Biên lợi nhuận suy giảm
Chất lượng tài sản xấu đi
Dấu hiệu earnings manipulation
[6] ĐỊNH GIÁ
Đánh giá: Rẻ / Hợp lý / Đắt
Giải thích ngắn gọn dựa trên dữ liệu hiện có.
Chỉ sử dụng dữ liệu được cung cấp.
Ưu tiên số liệu cụ thể.
Không dùng các câu vô nghĩa như "doanh nghiệp có nền tảng tốt", "tiềm năng dài hạn", "triển vọng khả quan" nếu không có bằng chứng.
Nếu phát hiện tín hiệu xấu, phải nêu rõ.
Nếu dữ liệu không đủ để kết luận, phải nói rõ.
Fundamental Score: X/10
Bias: Bullish / Neutral / Bearish
Giới hạn: 250 từ.
`;

    // ==================== 3. TÂM LÝ & TIN TỨC, VĨ MÔ ====================
    const newsPrompt = `
Bạn là Chuyên gia Market Sentiment & Macro Strategy của một quỹ đầu tư.
Cổ phiếu:
${ticker} (${companyName})
========================
TIN TỨC & DỮ LIỆU
=================
Tin tức:
${newsSummary}
Reddit Macro:
${redditMacro}
Social Sentiment:
${fireAntSocial}
========================
NHIỆM VỤ
========
Phân tích các yếu tố có khả năng ảnh hưởng đến giá cổ phiếu trong 1-12 tuần tới.
Ưu tiên theo thứ tự:
[1] MARKET EXPECTATION
* Thị trường hiện đang kỳ vọng điều gì?
* Kỳ vọng đó quá lạc quan hay quá bi quan?
[2] CATALYST QUAN TRỌNG NHẤT
Liệt kê:
* Catalyst tích cực mạnh nhất
* Catalyst tiêu cực mạnh nhất
Chỉ chọn các yếu tố thực sự có thể làm thay đổi giá cổ phiếu.
[3] DÒNG TIỀN & TÂM LÝ
* Nhà đầu tư đang: Bullish / Neutral / Bearish
* Dòng tiền đang có xu hướng: Tích lũy / Quan sát / Phân phối
[4] TÁC ĐỘNG VĨ MÔ
Đánh giá tác động của:
* Lãi suất
* Tỷ giá
* Chính sách
* Kinh tế toàn cầu
* Ngành nghề liên quan
[5] RỦI RO TIN TỨC
Có xuất hiện:
* Tin đồn
* Narrative quá nóng
* FOMO
* Kỳ vọng quá mức
* Rủi ro truyền thông
========================
OUTPUT
======
## Catalyst tích cực
...
## Catalyst tiêu cực
...
## Sentiment thị trường
...
## Rủi ro tâm lý
...
## Kết luận
Sentiment Score: X/10
Bias: Bullish / Neutral / Bearish
Giới hạn: 180 từ.
`;

    const [techRes, fundRes, newsRes] = await Promise.all([
        generateWithAutoSwitch([{ text: techPrompt }]),
        generateWithAutoSwitch([{ text: fundPrompt }]),
        generateWithAutoSwitch([{ text: newsPrompt }], {}, true),
    ]);

    const techAnalysis = techRes.response.text();
    const fundAnalysis = fundRes.response.text();
    const newsAnalysis = newsRes.response.text();

    onDebateChunk({ type: 'tech', content: techAnalysis });
    onDebateChunk({ type: 'fund', content: fundAnalysis });
    onDebateChunk({ type: 'news', content: newsAnalysis });

    // =========================================================
    // PHASE 2: BULL vs BEAR DEBATE
    // =========================================================
    emitProgress({ step: 'DEBATE_PHASE2', message: 'Phe Bò và Phe Gấu đang tranh luận...', progress: 70 });

    const stateContext = `
=== BÁO CÁO TỪ CÁC CHUYÊN GIA ===
[Kỹ thuật]
${techAnalysis}
[Cơ bản]
${fundAnalysis}
[Tâm lý & Vĩ mô]
${newsAnalysis}
`;

    // ==================== BULL OPENING ====================
    const bullPrompt = `
Bạn là Bull Analyst của một Hedge Fund.
${stateContext}
Mục tiêu:
Tìm ra lý do thuyết phục nhất để MUA ${ticker}.
Quy tắc:
- Chỉ sử dụng dữ liệu được cung cấp.
- Chọn tối đa 3 luận điểm mạnh nhất.
- Mỗi luận điểm phải có bằng chứng cụ thể.
- Ưu tiên catalyst có thể khiến giá tăng trong 2-12 tháng tới.
- Nếu tồn tại rủi ro, giải thích tại sao thị trường đang đánh giá quá bi quan.
- Không sử dụng các câu chung chung như "tiềm năng tăng trưởng tốt", "doanh nghiệp đầu ngành", "triển vọng khả quan" nếu không có bằng chứng rõ.
- Hãy tập trung vào những gì thị trường CHƯA phản ánh vào giá.
Không nhắc lại tin tức đơn thuần.
Hãy đánh giá tác động tiềm năng của tin tức tới giá cổ phiếu.
Format:
# Luận điểm 1
- Bằng chứng:
- Ý nghĩa:
# Luận điểm 2
- Bằng chứng:
- Ý nghĩa:
# Luận điểm 3
- Bằng chứng:
- Ý nghĩa:
Kết luận:
- Vì sao nên MUA ngay lúc này.
Mức độ tự tin: X/10
Giới hạn 180 từ.
`;
    const bullRes = await generateWithAutoSwitch([{ text: bullPrompt }]);
    const bullCase = bullRes.response.text();
    onDebateChunk({ type: 'bull', content: bullCase }); // ✅

    // ==================== BEAR REBUTTAL ====================
    emitProgress({ step: 'DEBATE_BEAR', message: 'Phe Gấu đang phản biện...', progress: 74 });

    const bearPrompt = `
Bạn là Bear Analyst của một quỹ Short Selling.
${stateContext}
Đây là lập luận của Bull:
${bullCase}
Mục tiêu:
Chứng minh tại sao việc mua ${ticker} có thể là sai lầm.
Quy tắc:
- Phản biện trực tiếp từng luận điểm của Bull.
- Chỉ sử dụng dữ liệu được cung cấp.
- Chọn tối đa 3 rủi ro nghiêm trọng nhất.
- Ưu tiên các yếu tố có thể khiến giá giảm mạnh.
- Tìm dấu hiệu định giá sai, bẫy tăng trưởng hoặc kỳ vọng quá mức.
- Nếu Bull đúng ở điểm nào, hãy thừa nhận nhưng giải thích vì sao chưa đủ để mua.
Format:
# Phản biện 1
- Luận điểm Bull:
- Điểm yếu:
# Phản biện 2
- Luận điểm Bull:
- Điểm yếu:
# Phản biện 3
- Luận điểm Bull:
- Điểm yếu:
Kịch bản xấu nhất:
...
Khuyến nghị: BÁN hoặc ĐỨNG NGOÀI
Mức độ tự tin: X/10
Giới hạn 180 từ.
`;
    const bearRes = await generateWithAutoSwitch([{ text: bearPrompt }], {}, true);
    const bearCase = bearRes.response.text();
    onDebateChunk({ type: 'bear', content: bearCase }); // Call

    // ==================== BULL FINAL DEFENSE ====================
    emitProgress({ step: 'DEBATE_BULL_DEFENSE', message: 'Phe Bò đang phản công lần cuối...', progress: 77 });

    const bullDefensePrompt = `
Bạn là Bull Analyst.
${stateContext}
Lập luận ban đầu của bạn:
${bullCase}
Phản biện của Bear:
${bearCase}
Nhiệm vụ:
- Bác bỏ từng phản biện của Bear.
- Chỉ sử dụng dữ liệu thực tế được cung cấp.
- Nếu Bear đúng một phần, hãy giải thích vì sao rủi ro đó đã được phản ánh vào giá.
- Tập trung vào xác suất thắng cao nhất thay vì viễn cảnh hoàn hảo.
Format:
# Phản công 1
...
# Phản công 2
...
# Phản công 3
...
Kết luận cuối cùng:
Tại sao vẫn nên MUA hoặc xem xét MUA.
Mức độ tự tin: X/10
Giới hạn 180 từ.
`;
    const bullDefenseRes = await generateWithAutoSwitch([{ text: bullDefensePrompt }]);
    const bullDefense = bullDefenseRes.response.text();
    onDebateChunk({ type: 'def', content: bullDefense });

    // =========================================================
    // PHASE 3: PORTFOLIO MANAGER DECISION (KHÔNG STREAM)
    // =========================================================
    emitProgress({ step: 'DEBATE_PM', message: 'Portfolio Manager đang ra phán quyết cuối...', progress: 80 });

    const pmPrompt = `
Bạn là Chief Portfolio Manager của quỹ OMNI DUCK.
Nhiệm vụ:
Đưa ra quyết định đầu tư cuối cùng cho ${ticker}.
${stateContext}
Bull Opening
${bullCase}
Bear Rebuttal
${bearCase}
Bull Final Defense
${bullDefense}
Bạn KHÔNG được tóm tắt lại toàn bộ dữ liệu. 
Bạn phải:
Đánh giá độ tin cậy của: Technical, Fundamental, Sentiment
Xác định:
- Điều gì thị trường đang định giá đúng
- Điều gì thị trường có thể đang định giá sai
Chấm điểm:
- Chất lượng doanh nghiệp
- Chất lượng xu hướng giá
- Chất lượng catalyst
- Rủi ro
Ra quyết định như một Portfolio Manager thực thụ:
- Có giải ngân không?
- Nếu có thì mức độ conviction cao hay thấp?
- Nếu không thì lý do là gì?
Hãy liệt kê rõ sự khác biệt quan trọng nhất giữa luận điểm Phe Bò và Phe Gấu, sau đó giải thích tại sao bạn lại chọn luận điểm của phe này thay vì phe kia.
Không được trung lập nếu dữ liệu cho phép kết luận.

📊 Executive Summary
(Tóm tắt 3-5 câu quan trọng nhất)

🏢 Chất lượng doanh nghiệp
Điểm: X/10
...

📈 Chất lượng xu hướng & dòng tiền
Điểm: X/10
...

🌐 Catalyst & Sentiment
Điểm: X/10
...

⚔️ Phán quyết tranh luận
Bull đúng ở đâu: ...
Bear đúng ở đâu: ...
Kết luận của PM: ...

🎯 Quyết định đầu tư
RATING: MUA MẠNH / MUA / NẮM GIỮ / GIẢM / BÁN / TRÁNH
Conviction: Cao / Trung bình / Thấp
Xác suất kịch bản chính: XX%
Vùng mua lý tưởng: ...
Cắt lỗ: ...
Mục tiêu 1: ...
Mục tiêu 2: ...
Thời gian nắm giữ: Ngắn hạn / Trung hạn / Dài hạn

🧠 Lý do quyết định
(3-5 bullet quan trọng nhất)
Không viết lan man.
Không dùng câu sáo rỗng.
Ưu tiên dữ liệu thực tế.
Nếu dữ liệu mâu thuẫn, phải chỉ ra rõ.
Chỉ tô màu đỏ hoặc xanh tối đa 5 từ khóa quan trọng nhất.
Tổng độ dài dưới 700 từ.
`;

     const pmRes = await generateWithAutoSwitch([{ text: pmPrompt }]);
    const pmDecision = pmRes.response.text();
    onDebateChunk({ type: 'pm', content: pmDecision });

    // =========================================================
    // ACTION PANEL — TRÍCH XUẤT JSON TỪ PM DECISION
    // =========================================================
    emitProgress({ step: 'DEBATE_ACTION_PANEL', message: 'Đang trích xuất tín hiệu giao dịch từ phán quyết PM...', progress: 83 });

    const actionPanelPrompt = `Dựa trên báo cáo PM bên dưới, hãy trích xuất chính xác theo JSON sau (chỉ trả về JSON thuần, không thêm chữ nào khác):

{
  "action": "MUA MẠNH | MUA | NẮM GIỮ | GIẢM | BÁN | TRÁNH",
  "entry": "Mức giá cụ thể hoặc vùng",
  "stoploss": "Mức giá",
  "target1": "Mức chốt lời giai đoạn 1",
  "target2": "Mức chốt lời giai đoạn 2 (nếu có)",
  "horizon": "Ngắn hạn (1-4 tuần) | Trung hạn (1-3 tháng) | Dài hạn",
  "conviction": "Cao | Trung bình | Thấp",
  "reason": "Lý do ngắn gọn (1-2 câu)"
}

Báo cáo PM:
${pmDecision}`;

    let actionPanelData = {
        action: "QUAN SÁT",
        entry: "N/A",
        stoploss: "N/A",
        target1: "N/A",
        target2: "N/A",
        horizon: "N/A",
        conviction: "Thấp",
        reason: "Chờ xác nhận thị trường"
    };

    try {
        const jsonResult = await generateWithAutoSwitch([
            { text: actionPanelPrompt }
        ], {
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.1
            }
        }, true);

        const cleanJson = jsonResult.response.text()
            .replace(/```json|```/gi, '')
            .trim();

        actionPanelData = JSON.parse(cleanJson);
        console.log(chalk.greenBright(`[DEBATE] Action Panel trích xuất thành công: ${actionPanelData.action}`));
    } catch (e) {
        console.error(chalk.red("[DEBATE] JSON Parse Error khi trích xuất Action Panel:"), e.message);
    }

    emitProgress({ step: 'DEBATE_DONE', message: 'Hội đồng đã hoàn tất tranh luận. Đang tổng hợp báo cáo chính...', progress: 85 });

     return {
        techAnalysis,
        fundAnalysis,
        newsAnalysis,
        bullCase,
        bearCase,
        bullDefense,
        pmDecision,
        actionPanelData,
    };
}