import os
import json
import shutil
from datetime import timedelta, datetime, timezone
from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import io

from src.rag.graph import run_agentic_system
from src.drafter.graph import run_legal_assistant
from src.summarizer.graph import process_uploaded_document
from src.drafter.pdf_generator import generate_petition_pdf
from src.shared.database import get_db, init_db, UserSession
from src.shared.auth import (
    authenticate_user,
    create_access_token,
    get_user_from_token,
    create_user,
    get_user_by_email,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
from sqlalchemy.orm import Session

app = FastAPI(title="Legal Sahara AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    init_db()


async def get_current_user(
    authorization: str = Header(None),
    db: Session = Depends(get_db),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Invalid authentication scheme")
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

    user = get_user_from_token(token, db)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"message": "Backend is running"}

@app.get("/health")
async def health():
    return {"status": "ok"}


# ── AUTH ──────────────────────────────────────────────────────────────────────
@app.post("/auth/login")
async def login(
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    user = authenticate_user(db, email, password)
    if not user:
        return {"status": "error", "message": "Invalid email or password"}

    access_token = create_access_token(
        data={"sub": user["email"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {
        "status": "ok",
        "access_token": access_token,
        "token_type": "bearer",
        "user": user,
    }


@app.post("/auth/signup")
async def signup(
    email: str = Form(...),
    password: str = Form(...),
    full_name: str = Form(...),
    db: Session = Depends(get_db),
):
    if len(password) < 6:
        return {"status": "error", "message": "Password must be at least 6 characters."}

    existing = get_user_by_email(db, email)
    if existing:
        return {"status": "error", "message": "An account with this email already exists."}

    user = create_user(db, email=email, password=password, full_name=full_name)

    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {
        "status": "ok",
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id":           user.id,
            "email":        user.email,
            "full_name":    user.full_name,
            "license_type": user.license_type,
        },
    }


@app.get("/auth/verify")
async def verify_token_endpoint(current_user: dict = Depends(get_current_user)):
    return {"status": "ok", "user": current_user}


# ── SESSIONS ──────────────────────────────────────────────────────────────────

@app.get("/sessions")
async def get_sessions(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all sessions for the logged-in user, ordered oldest→newest."""
    rows = (
        db.query(UserSession)
        .filter(UserSession.user_id == current_user["id"])
        .order_by(UserSession.created_at.asc())
        .all()
    )
    return {
        "status": "ok",
        "sessions": [
            {
                "id":         r.id,
                "feature":    r.feature,
                "label":      r.label,
                "data":       json.loads(r.data),
                "created_at": r.created_at.isoformat(),
                "updated_at": r.updated_at.isoformat() if r.updated_at else r.created_at.isoformat(),
            }
            for r in rows
        ],
    }


@app.post("/sessions")
async def create_session(
    feature: str = Form(...),
    label: str = Form(...),
    data: str = Form(...),          # JSON string
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new session. Returns the new session id."""
    # Validate JSON
    try:
        json.loads(data)
    except Exception:
        raise HTTPException(status_code=400, detail="data must be valid JSON")

    if feature not in ("drafter", "rag", "summarizer"):
        raise HTTPException(status_code=400, detail="Invalid feature")

    s = UserSession(
        user_id=current_user["id"],
        feature=feature,
        label=label[:120],
        data=data,
    )
    db.add(s)
    db.commit()
    db.refresh(s)

    return {
        "status": "ok",
        "id":         s.id,
        "created_at": s.created_at.isoformat(),
    }


@app.patch("/sessions/{session_id}")
async def update_session(
    session_id: str,
    label: str = Form(None),
    data: str = Form(None),         # JSON string
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an existing session's label and/or data."""
    s = db.query(UserSession).filter(
        UserSession.id == session_id,
        UserSession.user_id == current_user["id"],
    ).first()

    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    if label is not None:
        s.label = label[:120]
    if data is not None:
        try:
            json.loads(data)
        except Exception:
            raise HTTPException(status_code=400, detail="data must be valid JSON")
        s.data = data

    s.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"status": "ok"}


@app.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a session."""
    s = db.query(UserSession).filter(
        UserSession.id == session_id,
        UserSession.user_id == current_user["id"],
    ).first()

    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    db.delete(s)
    db.commit()
    return {"status": "ok"}


# ── RAG ───────────────────────────────────────────────────────────────────────
from src.rag.guardrails import (
    run_input_guardrails,
    run_output_guardrails,
    summarise_guardrail_results,
)

@app.post("/rag")
async def rag_query(
    query: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]

    input_results = run_input_guardrails(query, user_id=user_id)
    input_summary = summarise_guardrail_results(input_results)

    if input_summary["is_blocked"]:
        return {
            "status":  "blocked",
            "result":  input_summary["block_reason"],
            "guardrail_summary": input_summary,
        }

    if len(query) > 1000:
        query = query[:1000]

    try:
        agent_type = "case_search" if any(
            w in query.lower() for w in
            ["find", "search", "show me", "cases about", "cases by", "cases from"]
        ) else "qa"

        result = run_agentic_system(query)

        result_text = result["final_result"]

        output_results = run_output_guardrails(result_text, agent_type=agent_type)
        output_summary = summarise_guardrail_results(output_results)

        return {
            "status":  "ok",
            "result":  result_text,
            "eval_scores": result.get("eval_scores", {}),
            "guardrail_warnings": output_summary.get("warnings", []),
            "guardrail_summary":  {
                "input":  input_summary,
                "output": output_summary,
                "all_warnings": input_summary.get("warnings", []) + output_summary.get("warnings", []),
            },
        }

    except Exception as e:
        return {"status": "error", "result": str(e)}


# ── DRAFTER ───────────────────────────────────────────────────────────────────
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


@app.post("/draft/pdf")
async def draft_pdf(
    petition_text: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
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


# ── SUMMARIZER ────────────────────────────────────────────────────────────────
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
