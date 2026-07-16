FROM python:3.10-slim

# Install system dependencies for Docling, OpenCV, etc.
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port (Hugging Face Spaces uses 7860 by default)
EXPOSE 7860

# Run FastAPI with uvicorn on port 7860
CMD ["uvicorn", "Convertpdf:app", "--host", "0.0.0.0", "--port", "7860"]
