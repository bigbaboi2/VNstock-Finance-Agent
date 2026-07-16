import gradio as gr
from Convertpdf import app as fastapi_app

@fastapi_app.get("/")
def read_root():
    return {"status": "ok"}

demo = gr.Interface(
    fn=lambda: "System Online",
    inputs=None,
    outputs="text",
    title="Service"
)

app = gr.mount_gradio_app(fastapi_app, demo, path="/ui")
