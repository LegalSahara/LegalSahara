import os
import shutil
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
import io

from src.rag.graph import run_agentic_system
from src.drafter.graph import run_legal_assistant
from src.summarizer.graph import process_uploaded_document
from src.drafter.pdf_generator import generate_petition_pdf

app = FastAPI(title="Legal Sahara AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve React frontend
# app.mount("/static", StaticFiles(directory="frontend"), name="static")


@app.get("/")
async def root():
    return FileResponse("frontend/index.html")


# ── RAG: Precedent Search ─────────────────────────────────────────────────────

@app.post("/rag")
async def rag_query(query: str = Form(...)):
    try:
        result = run_agentic_system(query)
        return {"status": "ok", "result": result}
    except Exception as e:
        return {"status": "error", "result": str(e)}


# ── Drafter: Generate Petition Text ──────────────────────────────────────────

@app.post("/draft")
async def draft_petition(
    story:   str = Form(...),
    user_id: str = Form(default="default"),
):
    try:
        result = run_legal_assistant(story, user_id=user_id)
        return {
            "status": "ok",
            "result": result.get("final_petition", ""),
            "petition_type":       result.get("petition_type", ""),
            "jurisdiction":        result.get("jurisdiction", ""),
            "primary_citation":    result.get("primary_citation", ""),
            "supporting_citation": result.get("supporting_citation", ""),
            "eval_overall_score":  result.get("eval_overall_score", 0),
            "red_flags":           result.get("red_flags", []),
        }
    except Exception as e:
        return {"status": "error", "result": str(e)}


# ── Drafter: Generate Professional PDF ───────────────────────────────────────

@app.post("/draft/pdf")
async def draft_pdf(petition_text: str = Form(...)):
    """
    Accept petition plain-text and return a court-ready PDF file.
    The frontend sends the current (possibly edited) text from the editor.
    """
    try:
        pdf_bytes = generate_petition_pdf(petition_text)
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": 'attachment; filename="legal_petition.pdf"',
                "Content-Length": str(len(pdf_bytes)),
            },
        )
    except Exception as e:
        return {"status": "error", "result": str(e)}


# ── Summarizer: Case File Briefing ───────────────────────────────────────────

@app.post("/summarize")
async def summarize(file: UploadFile = File(...)):
    try:
        # 1. Use a local Windows-friendly directory instead of Linux /tmp/
        temp_dir = "temp"
        
        # 2. Create the temp folder if it doesn't exist yet
        if not os.path.exists(temp_dir):
            os.makedirs(temp_dir)
            
        # 3. Safely join the folder and filename (handles Windows backslashes)
        tmp_path = os.path.join(temp_dir, file.filename)
        
        # 4. Save the uploaded file
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
            
        # 5. Process it with your LangGraph summarizer
        result = process_uploaded_document(tmp_path)
        
        # 6. Delete the file to keep your folder clean
        os.remove(tmp_path)
        
        return {"status": "ok", "result": result.get("final_memo", "")}
        
    except Exception as e:
        return {"status": "error", "result": str(e)}

# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}