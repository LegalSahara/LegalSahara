FROM python:3.12-slim

# System deps for OCR and PDF
RUN apt-get update && apt-get install -y --fix-missing \
    tesseract-ocr \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Install torch (CPU-only, much smaller ~200MB vs 766MB) first from PyTorch CDN
RUN pip install --no-cache-dir --timeout=1000 --retries=5 \
    torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu

# Install remaining dependencies with extended timeout
RUN pip install --no-cache-dir --timeout=1000 --retries=5 -r requirements.txt

COPY . .

# ChromaDB data
RUN mkdir -p /app/chromadb

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]