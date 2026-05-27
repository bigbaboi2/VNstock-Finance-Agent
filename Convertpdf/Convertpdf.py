from fastapi import FastAPI, UploadFile, File, Query
from docling.document_converter import DocumentConverter
from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
from docling.datamodel.base_models import InputFormat
from docling.document_converter import PdfFormatOption
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

# =========================================================
# CẤU HÌNH PIPELINE
# =========================================================
# TURBO  : Tắt OCR + Tắt Table ML hoàn toàn → ~3-8s  ← MẶC ĐỊNH
# FAST   : Tắt OCR + Table ML nhẹ (FAST mode) → ~20-40s
# BALANCED: Tắt OCR + Table ML đầy đủ → ~60-90s
# FULL   : Bật mọi thứ (cho PDF scan) → ~150-200s
# =========================================================

def build_converter(mode: str) -> DocumentConverter:
    pipeline_options = PdfPipelineOptions()

    if mode == "turbo":
        # Tắt hoàn toàn OCR và Table Structure ML
        # Docling chỉ dùng pdfminer/pypdf để extract text thuần
        # Đủ dùng cho 99% báo cáo tài chính text-based (TCBS, SSI, VPS...)
        pipeline_options.do_ocr = False
        pipeline_options.do_table_structure = False

    elif mode == "fast":
        # Tắt OCR, Table ML nhẹ hơn
        pipeline_options.do_ocr = False
        pipeline_options.do_table_structure = True
        pipeline_options.table_structure_options.mode = TableFormerMode.FAST
        pipeline_options.table_structure_options.do_cell_matching = False

    elif mode == "balanced":
        # Tắt OCR, Table ML đầy đủ
        pipeline_options.do_ocr = False
        pipeline_options.do_table_structure = True
        pipeline_options.table_structure_options.mode = TableFormerMode.ACCURATE
        pipeline_options.table_structure_options.do_cell_matching = True

    else:  # "full" - PDF scan/ảnh
        pipeline_options.do_ocr = True
        pipeline_options.do_table_structure = True
        pipeline_options.table_structure_options.mode = TableFormerMode.ACCURATE

    return DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        }
    )

# =========================================================
# KHỞI ĐỘNG - Chỉ tải converter cần thiết lúc start
# =========================================================
print(f"{Fore.CYAN}[SYSTEM]{Fore.YELLOW} Đang khởi tạo Docling converter (TURBO mode)...")

converter_turbo = build_converter("turbo")
print(f"{Fore.GREEN}[SYSTEM] ✔ Converter TURBO sẵn sàng (không có Table ML → khởi động nhanh)")

# FAST và BALANCED được tạo lazy khi có request để không delay startup
_converters = {
    "turbo": converter_turbo,
    "fast": None,
    "balanced": None,
    "full": None,
}

print(f"{Fore.CYAN}[SYSTEM]{Fore.GREEN} FastAPI sẵn sàng nhận request!\n")

# =========================================================
# ENDPOINT PARSE PDF
# =========================================================
@app.post("/parse-pdf")
async def parse_pdf(
    file: UploadFile = File(...),
    mode: str = Query(default="turbo", description="Chế độ: turbo | fast | balanced | full")
):
    start_time = time.time()
    filename = file.filename

    # Lấy hoặc tạo converter theo mode (lazy init)
    if mode not in _converters:
        mode = "turbo"

    if _converters[mode] is None:
        print(f"{Fore.YELLOW}[SYSTEM] Lần đầu dùng [{mode.upper()}], đang khởi tạo converter...")
        _converters[mode] = build_converter(mode)
        print(f"{Fore.GREEN}[SYSTEM] ✔ Converter [{mode.upper()}] đã sẵn sàng")

    converter = _converters[mode]

    print(f"\n{Fore.BLUE}=================== [NHẬN TÍN HIỆU PARSE PDF] ===================")
    print(f"{Fore.CYAN}[PDF Markdown - 1/5] Đã tiếp nhận yêu cầu từ Node.js Server.")
    print(f"{Fore.CYAN}[•] Tên tệp: {Fore.WHITE}{filename} | Chế độ: {Fore.YELLOW}{mode.upper()}")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
        try:
            print(f"{Fore.CYAN}[PDF Markdown - 2/5] Đang ghi buffer xuống ổ đĩa...")
            pdf_content = await file.read()
            temp_file.write(pdf_content)
            temp_file.flush()
            temp_file_path = temp_file.name
            print(f"{Fore.GREEN}[✔] File tạm tại: {Fore.LIGHTBLACK_EX}{temp_file_path}")

            print(f"{Fore.YELLOW}[PDF Markdown - 3/5] Docling [{mode.upper()}] đang xử lý...")

            result = converter.convert(temp_file_path)

            print(f"{Fore.CYAN}[PDF Markdown - 4/5] Đang xuất Markdown...")
            markdown_text = result.document.export_to_markdown()

            duration = round(time.time() - start_time, 2)
            print(f"{Fore.GREEN}[PDF Markdown - 5/5] Xử lý thành công!")
            print(f"{Fore.GREEN}[✔] Tổng thời gian: {Fore.YELLOW}{duration} giây {get_speed_label(duration)}")
            print(f"{Fore.BLUE}=================================================================\n")

            return {
                "success": True,
                "markdown": markdown_text,
                "mode": mode,
                "duration_seconds": duration
            }

        except Exception as e:
            duration = round(time.time() - start_time, 2)
            print(f"\n{Fore.RED}[LỖI] (Thời gian đã chạy: {duration}s)")
            print(f"{Fore.RED}[•] Chi tiết: {Fore.WHITE}{str(e)}")
            print(f"{Fore.BLUE}=================================================================\n")
            return {"success": False, "error": str(e)}

        finally:
            temp_file.close()
            if os.path.exists(temp_file.name):
                os.unlink(temp_file.name)


def get_speed_label(duration: float) -> str:
    if duration < 10:
        return "⚡ (Cực nhanh)"
    elif duration < 45:
        return "✅ (Nhanh)"
    elif duration < 90:
        return "🐢 (Trung bình)"
    else:
        return "🐌 (Chậm)"


if __name__ == "__main__":
    import uvicorn
    print(f"{Fore.CYAN}[SYSTEM]{Fore.WHITE} Khởi động FastAPI tại http://0.0.0.0:8000 ...")
    uvicorn.run("Convertpdf:app", host="0.0.0.0", port=8000, reload=False)