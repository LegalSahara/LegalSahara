import os
import shutil
from datetime import timedelta
from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
import io

from src.rag.graph import run_agentic_system
from src.drafter.graph import run_legal_assistant
from src.summarizer.graph import process_uploaded_document
from src.drafter.pdf_generator import generate_petition_pdf
from src.shared.auth import (
    authenticate_user,
    create_access_token,
    get_user_from_token,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)

app = FastAPI(title="Legal Sahara AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Authentication Dependency ────────────────────────────────────────────────
async def get_current_user(authorization: str = Header(None)):
    """Extract and validate JWT token from Authorization header"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Invalid authentication scheme")
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid authorization header format")
    
    user = get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    return user

# ── Health Check ─   ────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"message": "Backend is running"}

@app.get("/health")
async def health():
    return {"status": "ok"}

# ── AUTH: Login ───────────────────────────────────────────────────────────────
@app.post("/auth/login")
async def login(email: str = Form(...), password: str = Form(...)):
    """
    Login endpoint - returns JWT token if credentials are valid.
    
    Test Account:
    - Email: advocate@legal-sahara.com
    - Password: demo123
    """
    user = authenticate_user(email, password)
    
    if not user:
        return {
            "status": "error",
            "message": "Invalid email or password"
        }
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["email"]},
        expires_delta=access_token_expires
    )
    
    return {
        "status": "ok",
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "license_type": user["license_type"],
        }
    }

# ── AUTH: Signup (Disabled - test account only) ────────────────────────────
@app.post("/auth/signup")
async def signup(email: str = Form(...), password: str = Form(...), full_name: str = Form(...)):
    """
    Signup endpoint - currently disabled.
    Only test account is available.
    """
    return {
        "status": "error",
        "message": "Signup is currently disabled. Use the test account to login.",
        "test_account": {
            "email": "advocate@legal-sahara.com",
            "password": "demo123"
        }
    }

# ── AUTH: Verify Token ────────────────────────────────────────────────────────
@app.get("/auth/verify")
async def verify_token(current_user: dict = Depends(get_current_user)):
    """Verify if token is valid and return user info"""
    return {
        "status": "ok",
        "user": current_user
    }

# ── RAG: Precedent Search ─────────────────────────────────────────────────────
@app.post("/rag")
async def rag_query(
    query: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    try:
        result = run_agentic_system(query)
        return {"status": "ok", "result": result}
    except Exception as e:
        return {"status": "error", "result": str(e)}

# ── Drafter: Generate Petition Text ──────────────────────────────────────────
@app.post("/draft")
async def draft_petition(
    story: str = Form(...),
    user_id: str = Form(default="default"),
    current_user: dict = Depends(get_current_user)
):
    try:
        result = run_legal_assistant(story, user_id=current_user["id"])

        if result.get("status") == "blocked":
            return {
                "status": "blocked",
                "result": "",
                "agent_reply": result.get("agent_reply", "Request blocked."),
                "guardrail_summary": result.get("guardrail_summary", {}),
            }

        guardrail_summary = result.get("guardrail_summary", {})
        all_warnings = guardrail_summary.get("all_warnings", [])

        return {
            "status": "ok",
            "result": result.get("final_petition", ""),
            "petition_type": result.get("petition_type", ""),
            "jurisdiction": result.get("jurisdiction", ""),
            "primary_citation": result.get("primary_citation", ""),
            "supporting_citation": result.get("supporting_citation", ""),
            "eval_overall_score": result.get("eval_overall_score", 0),
            "red_flags": result.get("red_flags", []),
            "guardrail_warnings": all_warnings,
            "guardrail_summary": guardrail_summary,
        }
    except Exception as e:
        return {"status": "error", "result": str(e)}

# ── Drafter: Generate Professional PDF ───────────────────────────────────────
@app.post("/draft/pdf")
async def draft_pdf(
    petition_text: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """Generate court-ready PDF from petition text"""
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
async def summarize(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    try:
        temp_dir = "temp"
        if not os.path.exists(temp_dir):
            os.makedirs(temp_dir)

        tmp_path = os.path.join(temp_dir, file.filename)
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        result = process_uploaded_document(tmp_path)
        os.remove(tmp_path)

        if not result.get("guardrail_passed", True):
            return {
                "status": "blocked",
                "guardrail_passed": False,
                "guardrail_blocked_reason": result.get("guardrail_blocked_reason", "Document could not be processed."),
                "guardrail_detected_type": result.get("guardrail_detected_type", "unknown"),
                "accepted_document_types": result.get("accepted_document_types", []),
                "result": "",
            }

        return {
            "status": "ok",
            "guardrail_passed": True,
            "result": result.get("final_memo", ""),
            "evaluation_score": result.get("evaluation_score", {}),
            "document_metadata": result.get("document_metadata", {}),
            "extraction_info": result.get("extraction_info", {}),
            "accepted_document_types": result.get("accepted_document_types", []),
            "errors": result.get("errors", []),
        }

    except Exception as e:
        return {
            "status": "error",
            "result": str(e),
            "guardrail_passed": False,
            "accepted_document_types": [
                "Court opinions & judgments",
                "Petitions & appeals",
                "Contracts & agreements",
                "Statutes & regulations",
                "Affidavits & sworn statements",
                "Supreme Court filings",
            ],
        }