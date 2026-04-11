import os
import shutil
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from src.rag.graph import run_agentic_system
from src.drafter.graph import run_legal_assistant
from src.summarizer.graph import process_uploaded_document

app = FastAPI(title="Legal AI System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# Serve frontend
app.mount("/static", StaticFiles(directory="frontend"), name="static")

@app.get("/")
async def root():
    return FileResponse("frontend/index.html")

@app.post("/rag")
async def rag_query(query: str = Form(...)):
    try:
        result = run_agentic_system(query)
        return {"status": "ok", "result": result}
    except Exception as e:
        return {"status": "error", "result": str(e)}

@app.post("/draft")
async def draft_petition(story: str = Form(...), user_id: str = Form(default="default")):
    try:
        result = run_legal_assistant(story, user_id=user_id)
        return {"status": "ok", "result": result.get("final_petition", "")}
    except Exception as e:
        return {"status": "error", "result": str(e)}

@app.post("/summarize")
async def summarize(file: UploadFile = File(...)):
    try:
        tmp_path = f"/tmp/{file.filename}"
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        result = process_uploaded_document(tmp_path)
        os.remove(tmp_path)
        return {"status": "ok", "result": result.get("final_memo", "")}
    except Exception as e:
        return {"status": "error", "result": str(e)}

@app.get("/health")
async def health():
    return {"status": "ok"}