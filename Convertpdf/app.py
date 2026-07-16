import gradio as gr
from fastapi import FastAPI
from Convertpdf import app as fastapi_app

# Giao diện phụ để vượt qua Health Check của Hugging Face
demo = gr.Interface(
    fn=lambda: "Hệ thống Omni Duck PDF API đang hoạt động rất tốt trên Hugging Face!",
    inputs=None,
    outputs="text",
    title="Omni Duck PDF Converter"
)

# Ghép nối giao diện Gradio với FastAPI
app = gr.mount_gradio_app(fastapi_app, demo, path="/")
