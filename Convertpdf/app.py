import gradio as gr
import uvicorn
from Convertpdf import app as fastapi_app

def check_status():
    return "Omni Duck PDF API is Online"

demo = gr.Interface(
    fn=check_status,
    inputs=None,
    outputs="text",
    title="Omni Duck Service"
)

app = gr.mount_gradio_app(fastapi_app, demo, path="/")

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=7860)
