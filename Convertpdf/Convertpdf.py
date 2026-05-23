from fastapi import FastAPI, UploadFile, File
from docling.document_converter import DocumentConverter
import tempfile
import os
import time

try:
    from colorama import init, Fore, Style
    init(autoreset=True)
except ImportError:
    os.system('pip install colorama')
    from colorama import init, Fore, Style
    init(autoreset=True)

app = FastAPI()
print(f"{Fore.CYAN}[SYSTEM]{Fore.YELLOW} Đang khởi tạo mô hình AI Docling (Quá trình này có thể mất vài giây)...")
converter = DocumentConverter()
print(f"{Fore.CYAN}[SYSTEM]{Fore.GREEN} Mô hình AI Docling đã sẵn sàng trực chiến!")

@app.post("/parse-pdf")
async def parse_pdf(file: UploadFile = File(...)):
    start_time = time.time()
    filename = file.filename
    
    print(f"\n{Fore.BLUE}=================== [NHẬN TÍN HIỆU PARSE PDF] ===================")
    print(f"{Fore.CYAN}[1/5] 📥 Đã tiếp nhận yêu cầu từ Node.js Server.")
    print(f"{Fore.CYAN}[•] Tên tệp gốc: {Fore.WHITE}{filename}")
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
        try:
            print(f"{Fore.CYAN}[2/5] 💾 Đang chuyển dữ liệu Stream Buffer xuống ổ đĩa cục bộ...")
            pdf_content = await file.read()
            temp_file.write(pdf_content)
            temp_file.flush()  
            temp_file_path = temp_file.name 
            print(f"{Fore.GREEN}[✔] Tạo file tạm thành công tại: {Fore.LIGHTBLACK_EX}{temp_file_path}")
            
            print(f"{Fore.YELLOW}[3/5] 🧠 Khởi động động cơ AI Docling. Đang bóc tách cấu trúc Layout, Bảng biểu & Biểu đồ...")
            print(f"{Fore.YELLOW}[•] Trạng thái: Đang cày cuốc nền (Local Processing)...")
            
            result = converter.convert(temp_file_path)
            
            print(f"{Fore.CYAN}[4/5] 📝 Đang biên dịch cấu trúc cây layout sang định dạng Siêu văn bản (Markdown)...")
            markdown_text = result.document.export_to_markdown()
            
            duration = round(time.time() - start_time, 2)
            print(f"{Fore.GREEN}[5/5] 🎉 Xử lý tệp thành công!")
            print(f"{Fore.GREEN}[✔] Tổng thời gian AI cày cuốc: {Fore.YELLOW}{duration} giây.")
            print(f"{Fore.BLUE}=================================================================\n")
            
            return {"success": True, "markdown": markdown_text}
            
        except Exception as e:
            duration = round(time.time() - start_time, 2)
            print(f"\n{Fore.RED}[❌ LỖI CHÍ MẠNG TẠI TRẠM PYTHON] (Thời gian đã chạy: {duration}s)")
            print(f"{Fore.RED}[•] Chi tiết lỗi: {Fore.WHITE}{str(e)}")
            print(f"{Fore.BLUE}=================================================================\n")
            return {"success": False, "error": str(e)}
            
        finally:
            temp_file.close()
            if os.path.exists(temp_file.name):
               os.unlink(temp_file.name)