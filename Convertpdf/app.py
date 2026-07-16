import uvicorn
from Convertpdf import app

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Omni Duck PDF API is running on Hugging Face"}

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=7860)
