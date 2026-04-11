FROM python:3.12-slim

# System deps for OCR and PDF
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# ChromaDB data
RUN mkdir -p /app/chromadb

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]