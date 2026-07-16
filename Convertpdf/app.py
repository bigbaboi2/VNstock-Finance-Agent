import gradio as gr
from Convertpdf import app as fastapi_app

@fastapi_app.get("/")
def read_root():
    return {"status": "ok"}

def check_status():
    return "System Online"

demo = gr.Interface(
    fn=check_status,
    inputs=None,
    outputs="text",
    title="Service"
)

app = gr.mount_gradio_app(fastapi_app, demo, path="/ui")
