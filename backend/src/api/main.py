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

@app.get("/")
async def root():
    return {"message": "Backend is running"}

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

        # ── Hard-blocked by guardrails ────────────────────────────────────────
        if result.get("status") == "blocked":
            return {
                "status":            "blocked",
                "result":            "",
                "agent_reply":       result.get("agent_reply", "Request blocked."),
                "guardrail_summary": result.get("guardrail_summary", {}),
            }

        # ── Successful draft ──────────────────────────────────────────────────
        guardrail_summary = result.get("guardrail_summary", {})
        all_warnings      = guardrail_summary.get("all_warnings", [])

        return {
            "status":              "ok",
            "result":              result.get("final_petition", ""),
            "petition_type":       result.get("petition_type", ""),
            "jurisdiction":        result.get("jurisdiction", ""),
            "primary_citation":    result.get("primary_citation", ""),
            "supporting_citation": result.get("supporting_citation", ""),
            "eval_overall_score":  result.get("eval_overall_score", 0),
            "red_flags":           result.get("red_flags", []),
            # ── New guardrail fields ──────────────────────────────────────────
            "guardrail_warnings":  all_warnings,        # list of warning strings
            "guardrail_summary":   guardrail_summary,   # full nested summary
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
        temp_dir = "temp"
        if not os.path.exists(temp_dir):
            os.makedirs(temp_dir)

        tmp_path = os.path.join(temp_dir, file.filename)
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        result = process_uploaded_document(tmp_path)
        os.remove(tmp_path)

        return {"status": "ok", "result": result.get("final_memo", "")}

    except Exception as e:
        return {"status": "error", "result": str(e)}


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}