import gradio as gr
from Convertpdf import app as fastapi_app

# 1. Thêm route trang chủ để Hugging Face "Khám sức khỏe" (BẮT BUỘC)
@fastapi_app.get("/")
def read_root():
    return {"status": "ok", "message": "Omni Duck PDF API is running on Hugging Face"}

# 2. Tạo một giao diện Gradio giả để qua mặt SDK của HF
demo = gr.Interface(
    fn=lambda: "Hệ thống Omni Duck PDF API đang hoạt động rất tốt trên Hugging Face!",
    inputs=None,
    outputs="text",
    title="Omni Duck PDF Converter"
)

# 3. Ghép Gradio vào FastAPI. 
# QUAN TRỌNG: KHÔNG ĐƯỢC để path="/" vì sẽ gây lỗi xung đột (Runtime Error). Phải để "/ui"
app = gr.mount_gradio_app(fastapi_app, demo, path="/ui")
