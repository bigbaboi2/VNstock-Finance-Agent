from Convertpdf import app

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Omni Duck PDF API is running on Hugging Face"}
