import os
import asyncio
import sys

# Suppress Hugging Face / Gradio 5 false-positive ValueError in Python 3.12
try:
    original_del = asyncio.base_events.BaseEventLoop.__del__
    def safe_del(self):
        try:
            original_del(self)
        except Exception:
            pass
    asyncio.base_events.BaseEventLoop.__del__ = safe_del
except Exception:
    pass

os.environ["GRADIO_SSR_MODE"] = "False"
import gradio as gr
import spaces
from Convertpdf import build_converter
import time
import os

_converters = {}

@spaces.GPU
def parse_pdf(file_path: str, mode: str):
    start_time = time.time()
    valid_modes = ["turbo", "fast", "balanced", "full"]
    if mode not in valid_modes:
        mode = "turbo"
        
    if mode not in _converters:
        # Lazy load to prevent Hugging Face timeout during startup
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

