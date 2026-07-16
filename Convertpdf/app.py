import gradio as gr
from Convertpdf import build_converter
import time
import os

_converters = {
    "turbo": build_converter("turbo"),
    "fast": None,
    "balanced": None,
    "full": None,
}

def parse_pdf(file_path: str, mode: str):
    start_time = time.time()
    if mode not in _converters:
        mode = "turbo"
        
    if _converters[mode] is None:
        _converters[mode] = build_converter(mode)
        
    converter = _converters[mode]
    
    # file_path is automatically provided by Gradio when a user uploads a file
    result = converter.convert(file_path)
    markdown_text = result.document.export_to_markdown()
    
    return markdown_text

# Create a Gradio interface
demo = gr.Interface(
    fn=parse_pdf,
    inputs=[
        gr.File(type="filepath", label="Upload PDF"),
        gr.Dropdown(choices=["turbo", "fast", "balanced", "full"], value="turbo", label="Mode")
    ],
    outputs=gr.Textbox(label="Markdown Output"),
    title="Omni Duck PDF API (Gradio)",
    description="A pure Gradio API for Docling PDF Conversion."
)

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)
