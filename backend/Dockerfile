FROM python:3.12-slim

RUN apt-get update && apt-get install -y --fix-missing \
    tesseract-ocr \
    poppler-utils \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir --timeout=1000 --retries=5 \
    torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu

RUN pip install --no-cache-dir --timeout=1000 --retries=5 -r requirements.txt

COPY . .

RUN mkdir -p /app/chromadb

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]