import { exec } from 'child_process';
import path from 'path';

export async function getCompanyProfile(ticker) {
    const cleanTicker = ticker.toUpperCase();
    console.log(`\n=========================================`);
    console.log(`🚀 [VNSTOCK] ĐANG ĐIỀU ĐỘNG PYTHON LẤY DATA MÃ: ${cleanTicker}`);
    console.log(`=========================================`);

    return new Promise((resolve, reject) => {
        // Trỏ đường dẫn tới file fetcher.py vừa tạo
        const pythonScriptPath = path.join(process.cwd(), 'fetcher.py');
        
        // Lệnh kích hoạt python trên terminal
        const command = `python "${pythonScriptPath}" ${cleanTicker}`;

        exec(command, (error, stdout, stderr) => {
            let finalData = {
                ticker: cleanTicker,
                fullName: `Mã cổ phiếu ${cleanTicker}`,
                industry: "Đang cập nhật...",
                overview: "Hệ thống đang thu thập dữ liệu...",
                marketCap: "---",
                peRatio: "---",
                establishedDate: "---"
            };

            if (error) {
                console.log(`🔴 [PYTHON LỖI HỆ THỐNG]: ${error.message}`);
                return resolve(finalData); // Vẫn trả về data mặc định để App không sập
            }

            try {
                // Tự động quét và loại bỏ bảng thông báo quảng cáo của vnstock
                // Chỉ lấy đúng phần văn bản nằm giữa dấu { và }
                const jsonStartIndex = stdout.indexOf('{');
                const jsonEndIndex = stdout.lastIndexOf('}') + 1;

                if (jsonStartIndex === -1 || jsonEndIndex === 0) {
                    console.log(`🔴 [LỖI DỮ LIỆU]: Không tìm thấy chuỗi JSON từ kết quả trả về.`);
                    return resolve(finalData);
                }

                // Trích xuất chuỗi sạch
                const cleanJsonString = stdout.substring(jsonStartIndex, jsonEndIndex);
                const parsedData = JSON.parse(cleanJsonString);
                
                if (parsedData.error) {
                    console.log(`🔴 [VNSTOCK BÁO LỖI]: ${parsedData.error}`);
                    return resolve(finalData);
                }

                console.log(`✅ [VNSTOCK] Hút dữ liệu thành công!`);
                console.log(`   👉 Tên cty: ${parsedData.fullName}`);
                console.log(`   👉 Ngành: ${parsedData.industry}`);
                console.log(`   👉 Vốn hóa: ${parsedData.marketCap}`);
                console.log(`   👉 P/E: ${parsedData.peRatio}`);
                
                resolve(parsedData);
            } catch (parseError) {
                console.log(`🔴 [LỖI ĐỌC DỮ LIỆU]: Cấu trúc JSON bị hỏng.`);
                console.log(`[RAW STDOUT]: \n${stdout}`);
                resolve(finalData);
            }
        });
    });
}