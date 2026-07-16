import uvicorn
from Convertpdf import app

if __name__ == "__main__":
    uvicorn.run("Convertpdf:app", host="0.0.0.0", port=7860)
