"""
summarizer/graph.py
Legal Document Summarizer — LangGraph pipeline
Fixes applied:
  - LLM and helpers defined BEFORE functions that use them
  - Lazy initialization to prevent import-time crashes
  - TypedDict uses proper typing.Any
  - Node functions return update dicts (LangGraph best practice)
  - evaluate_summary uses fallback LLM to avoid rate-limit crashes
  - validate_input guardrail node added (hard block on non-legal docs)
  - Guardrail rejection now includes accepted document types for user guidance
"""
import os
import time
import json
from pathlib import Path
from datetime import datetime
from typing import TypedDict, Dict, List, Any, Optional

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, END

# Document processing
from pypdf import PdfReader
from docx import Document as DocxDocument
from PIL import Image
import pytesseract
from pdf2image import convert_from_path

from config import GROQ_API_KEY

# ── Model config ──────────────────────────────────────────────────────────────
PRIMARY_MODEL  = "llama-3.3-70b-versatile"
FALLBACK_MODEL = "llama-3.1-8b-instant"
MAX_RETRIES    = 3
RETRY_DELAY    = 2
OCR_ENABLED    = True
OCR_LANGUAGE   = "eng"

BASE_DIR       = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER  = os.path.join(BASE_DIR, "uploads")
OUTPUT_FOLDER  = os.path.join(BASE_DIR, "outputs")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# ── Guardrail config ──────────────────────────────────────────────────────────
LEGAL_CONFIDENCE_THRESHOLD = 0.50
MIN_WORD_COUNT             = 200
LEGAL_KEYWORD_THRESHOLD    = 3

ACCEPTED_DOCUMENT_TYPES = [
    "Court opinions & judgments",
    "Petitions & appeals",
    "Contracts & agreements",
    "Statutes & regulations",
    "Affidavits & sworn statements",
    "Supreme Court filings",
]

_LEGAL_KEYWORDS = [
    "plaintiff", "defendant", "appellant", "respondent", "petitioner",
    "court", "tribunal", "judge", "justice", "judgment", "judgement",
    "verdict", "ruling", "order", "decree", "statute", "section",
    "whereas", "hereinafter", "indemnify", "liability", "damages",
    "injunction", "affidavit", "sworn", "notarized", "counsel",
    "attorney", "solicitor", "barrister", "advocate", "prosecution",
    "acquittal", "conviction", "bail", "warrant", "subpoena",
    "contract", "clause", "agreement", "legislation", "regulation",
    "ordinance", "precedent", "ratio", "obiter", "per curiam",
    "appeal", "bench", "bar", "petition", "writ", "habeas",
]


# ── LLM helpers (defined FIRST so all functions below can use them) ────────────

def _get_llm(use_fallback: bool = False, temperature: float = 0) -> ChatGroq:
    model = FALLBACK_MODEL if use_fallback else PRIMARY_MODEL
    return ChatGroq(
        model=model,
        temperature=temperature,
        max_retries=MAX_RETRIES,
        timeout=90,
        api_key=GROQ_API_KEY,
    )


def _invoke_with_retry(chain, inputs: dict, max_retries: int = MAX_RETRIES):
    """Invoke a LangChain chain with exponential back-off on rate limits."""
    for attempt in range(max_retries):
        try:
            return chain.invoke(inputs)
        except Exception as e:
            msg = str(e).lower()
            if "rate_limit" in msg or "429" in msg:
                if attempt < max_retries - 1:
                    wait = RETRY_DELAY * (2 ** attempt)
                    print(f"   ⏳ Rate limit — waiting {wait}s (attempt {attempt+1})")
                    time.sleep(wait)
                    continue
                raise RuntimeError(f"Rate limit after {max_retries} attempts") from e
            raise


_llm: Optional[ChatGroq] = None


def _llm_instance() -> ChatGroq:
    global _llm
    if _llm is None:
        _llm = _get_llm(temperature=0)
    return _llm


# ── State ─────────────────────────────────────────────────────────────────────

class LegalDocumentState(TypedDict):
    document_text:             str
    document_metadata:         Dict[str, str]
    extraction_info:           Dict[str, Any]
    # ── guardrail fields (new) ────────────────────────────────────────────────
    guardrail_passed:          bool   # False = hard block, skip all pipeline nodes
    guardrail_blocked_reason:  str    # user-facing message shown on the frontend
    guardrail_detected_type:   str    # e.g. "recipe", "news article"
    accepted_document_types:   List[str]  # list of accepted types for user guidance
    # ─────────────────────────────────────────────────────────────────────────
    classification:            str
    classification_confidence: float
    extracted_facts:           str
    extracted_issues:          str
    extracted_holding:         str
    extracted_reasoning:       str
    extracted_ratio:           str
    final_memo:                str
    evaluation_score:          Dict[str, Any]
    errors:                    List[str]
    processing_time:           Dict[str, float]


# ── Text extraction helpers ───────────────────────────────────────────────────

def _is_scanned_pdf(pdf_path: str, sample_pages: int = 3) -> bool:
    try:
        reader = PdfReader(pdf_path)
        pages  = min(sample_pages, len(reader.pages))
        total  = sum(len(reader.pages[i].extract_text().strip()) for i in range(pages))
        return total / pages < 100
    except Exception:
        return True


def _ocr_image(image) -> tuple[str, float]:
    data = pytesseract.image_to_data(image, lang=OCR_LANGUAGE,
                                     output_type=pytesseract.Output.DICT)
    text = pytesseract.image_to_string(image, lang=OCR_LANGUAGE)
    confs = [float(c) for c in data['conf'] if c != '-1']
    conf  = (sum(confs) / len(confs)) / 100 if confs else 0.0
    return text, conf


def extract_text_from_file(file_path: str,
                            enable_ocr: bool = OCR_ENABLED) -> dict:
    """
    Extract text from PDF / DOCX / TXT / image.
    Returns dict: {text, method, file_type, page_count, confidence, warnings}
    """
    path    = Path(file_path)
    ext     = path.suffix.lower()
    result  = dict(text='', method='unknown', file_type=ext,
                   page_count=0, confidence=1.0, warnings=[])

    print(f"\n📄 Extracting: {path.name}  [{ext}]")

    if ext == '.txt':
        result['text']   = path.read_text(encoding='utf-8', errors='ignore')
        result['method'] = 'text'
        result['page_count'] = 1

    elif ext == '.pdf':
        reader = PdfReader(str(path))
        result['page_count'] = len(reader.pages)
        if _is_scanned_pdf(str(path)) and enable_ocr:
            print("   📸 Scanned PDF detected — running OCR...")
            images = convert_from_path(str(path), dpi=300)
            parts, confs = [], []
            for i, img in enumerate(images):
                print(f"   Page {i+1}/{len(images)}...")
                t, c = _ocr_image(img)
                parts.append(t); confs.append(c)
            result['text']       = '\n\n'.join(parts)
            result['method']     = 'ocr'
            result['confidence'] = sum(confs) / len(confs) if confs else 0.0
            if result['confidence'] < 0.7:
                result['warnings'].append(
                    f"Low OCR confidence: {result['confidence']:.1%}")
        else:
            result['text']   = '\n\n'.join(
                p.extract_text() or '' for p in reader.pages)
            result['method'] = 'text'

    elif ext in ('.doc', '.docx'):
        doc = DocxDocument(str(path))
        result['text']      = '\n'.join(p.text for p in doc.paragraphs)
        result['method']    = 'text'
        result['page_count'] = len(doc.sections)

    elif ext in ('.png', '.jpg', '.jpeg', '.tiff', '.bmp'):
        if not enable_ocr:
            raise ValueError("OCR disabled — cannot extract text from image.")
        print("   📸 OCR on image...")
        result['text'], result['confidence'] = _ocr_image(Image.open(str(path)))
        result['method']    = 'ocr'
        result['page_count'] = 1
        if result['confidence'] < 0.7:
            result['warnings'].append(
                f"Low OCR confidence: {result['confidence']:.1%}")
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    if len(result['text'].strip()) < 50:
        result['warnings'].append("Very little text extracted — file may be empty.")

    for w in result['warnings']:
        print(f"   ⚠️  {w}")

    print(f"   ✅ {len(result['text'])} chars via {result['method']}")
    return result


# ── GUARDRAIL NODE ────────────────────────────────────────────────────────────

def _heuristic_legal_check(text: str) -> bool:
    """Fast keyword scan — if enough legal terms found, skip the LLM call."""
    sample = text[:5000].lower()
    hits   = sum(1 for kw in _LEGAL_KEYWORDS if kw in sample)
    print(f"   🔍 Heuristic: {hits} legal keyword(s) matched")
    return hits >= LEGAL_KEYWORD_THRESHOLD


def validate_input(state: LegalDocumentState) -> dict:
    """
    Hard-block guardrail node — runs before all analysis nodes.
    If any check fails, guardrail_passed = False and every downstream
    node will no-op via _is_blocked(), returning immediately without
    making any LLM calls.
    """
    t0   = time.time()
    text = state["document_text"]
    print("\n🛡️  [Guardrail] Validating document...")

    # Check 1: minimum word count
    word_count = len(text.split())
    print(f"   📏 Word count: {word_count}")
    if word_count < MIN_WORD_COUNT:
        msg = (
            f"This document cannot be processed.\n\n"
            f"The document you uploaded is too short to analyse ({word_count} words). "
            f"Please upload a complete legal document of at least {MIN_WORD_COUNT} words."
        )
        print("   🚨 BLOCKED — too short")
        return {
            "guardrail_passed":         False,
            "guardrail_blocked_reason": msg,
            "guardrail_detected_type":  "too short",
            "accepted_document_types":  ACCEPTED_DOCUMENT_TYPES,
            "processing_time": {**state.get("processing_time", {}), "guardrail": time.time() - t0},
        }

    # Check 2: heuristic keyword fast-path — skip LLM if clearly legal
    if _heuristic_legal_check(text):
        print("   ✅ Heuristic passed — document appears legal")
        return {
            "guardrail_passed":         True,
            "guardrail_blocked_reason": "",
            "guardrail_detected_type":  "",
            "accepted_document_types":  ACCEPTED_DOCUMENT_TYPES,
            "processing_time": {**state.get("processing_time", {}), "guardrail": time.time() - t0},
        }

    # Check 3: LLM classification for ambiguous documents
    guard_llm = _get_llm(use_fallback=True, temperature=0)
    prompt = ChatPromptTemplate.from_template(
        "You are a document-type classifier. Decide whether the text is a legal document.\n\n"
        "Legal documents: court opinions, contracts, statutes, regulations, briefs, "
        "affidavits, petitions, writs, judgments, deeds, powers of attorney.\n\n"
        "Non-legal: news articles, recipes, fiction, academic papers (non-law), "
        "medical records, manuals, social media, emails, reports.\n\n"
        "Return ONLY JSON — no markdown, no backticks:\n"
        '{{"is_legal":true,"confidence":0.92,"document_hint":"contract",'
        '"reason":"One sentence reason."}}\n\n'
        "DOCUMENT (first 2000 chars):\n{document_text}"
    )
    chain = prompt | guard_llm | StrOutputParser()

    is_legal   = True
    confidence = 0.5
    hint       = "unknown"

    try:
        raw = _invoke_with_retry(chain, {"document_text": text[:2000]}, max_retries=2)
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        res        = json.loads(raw)
        is_legal   = bool(res.get("is_legal", True))
        confidence = float(res.get("confidence", 0.5))
        hint       = res.get("document_hint", "unknown")
        print(f"   🤖 LLM: is_legal={is_legal}, confidence={confidence:.2f}, hint='{hint}'")
    except Exception as e:
        print(f"   ⚠️  LLM check failed (defaulting to pass): {e}")

    blocked = (not is_legal) or (confidence < LEGAL_CONFIDENCE_THRESHOLD)

    if blocked:
        article = "an" if hint and hint[0].lower() in "aeiou" else "a"
        msg = (
            f"This document cannot be processed.\n\n"
            f"This tool is designed for legal documents only. "
            f"The file you uploaded appears to be {article} {hint}.\n\n"
            f"Accepted document types:\n"
        )
        for doc_type in ACCEPTED_DOCUMENT_TYPES:
            msg += f"• {doc_type}\n"
        msg += f"\nPlease upload a valid legal document to continue."
        
        print(f"   🚨 BLOCKED — not a legal document (hint: {hint})")
        return {
            "guardrail_passed":         False,
            "guardrail_blocked_reason": msg,
            "guardrail_detected_type":  hint,
            "accepted_document_types":  ACCEPTED_DOCUMENT_TYPES,
            "processing_time": {**state.get("processing_time", {}), "guardrail": time.time() - t0},
        }

    print("   ✅ All guardrail checks passed")
    return {
        "guardrail_passed":         True,
        "guardrail_blocked_reason": "",
        "guardrail_detected_type":  "",
        "accepted_document_types":  ACCEPTED_DOCUMENT_TYPES,
        "processing_time": {**state.get("processing_time", {}), "guardrail": time.time() - t0},
    }


def _is_blocked(state: LegalDocumentState) -> bool:
    return not state.get("guardrail_passed", True)


# ── LangGraph node functions ──────────────────────────────────────────────────
# Each function returns a dict of ONLY the keys it wants to update (best practice).

def classify_document(state: LegalDocumentState) -> dict:
    if _is_blocked(state):
        return {}
    t0 = time.time()
    print("📋 [Classifier] Classifying document...")

    prompt = ChatPromptTemplate.from_template(
        "You are a legal document classification expert.\n\n"
        "Return ONLY a JSON object (no markdown) with these exact fields:\n"
        '{{"document_type":"court_opinion","confidence":0.85,'
        '"jurisdiction":"Pakistan Supreme Court",'
        '"key_indicators":["Civil Appeal","judgment"],'
        '"suggested_focus":"Analyze reasoning and legal principles"}}\n\n'
        "Document types: court_opinion, contract, statute, brief, regulation, other\n\n"
        "DOCUMENT TEXT (first 3000 chars):\n{document_text}"
    )
    chain = prompt | _llm_instance() | StrOutputParser()

    try:
        raw = _invoke_with_retry(chain,
                                 {"document_text": state["document_text"][:3000]})
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        res = json.loads(raw)
    except Exception as e:
        print(f"   ⚠️  Classification error: {e}")
        res = {}

    return {
        "classification":            res.get("document_type", "unknown"),
        "classification_confidence": float(res.get("confidence", 0.0)),
        "document_metadata": {
            **state.get("document_metadata", {}),
            "jurisdiction":    res.get("jurisdiction", "Unknown"),
            "key_indicators":  ", ".join(res.get("key_indicators", [])),
            "suggested_focus": res.get("suggested_focus", "General legal analysis"),
        },
        "processing_time": {
            **state.get("processing_time", {}),
            "classification": time.time() - t0,
        },
    }


def extract_facts(state: LegalDocumentState) -> dict:
    if _is_blocked(state):
        return {}
    t0 = time.time()
    print("📝 [Facts] Extracting key facts...")

    doc_type = state.get("classification", "unknown")
    focus = (
        "Focus on: parties, procedural history, factual background, material facts, timeline."
        if doc_type == "court_opinion" else
        "Focus on: key factual elements relevant to the legal context."
    )

    prompt = ChatPromptTemplate.from_template(
        "You are a legal research assistant extracting FACTS from a {doc_type}.\n"
        "{focus}\n"
        "Be concise, use legal terminology, cite dates/amounts.\n\n"
        "DOCUMENT:\n{document_text}\n\nEXTRACTED FACTS:"
    )
    chain = prompt | _llm_instance() | StrOutputParser()

    try:
        facts = _invoke_with_retry(chain, {
            "doc_type":      doc_type,
            "focus":         focus,
            "document_text": state["document_text"][:8000],
        })
    except Exception as e:
        facts = f"Error extracting facts: {e}"

    return {
        "extracted_facts": facts,
        "processing_time": {**state.get("processing_time", {}),
                            "facts": time.time() - t0},
        "errors": state.get("errors", []) + (
            [f"Facts failed: {facts}"] if facts.startswith("Error") else []
        ),
    }


def extract_issues(state: LegalDocumentState) -> dict:
    if _is_blocked(state):
        return {}
    t0 = time.time()
    print("⚖️  [Issues] Identifying legal issues...")

    prompt = ChatPromptTemplate.from_template(
        "You are a legal research assistant identifying LEGAL ISSUES.\n"
        "Document Type: {doc_type}\n"
        "A well-framed legal issue states the specific legal question to be resolved "
        "and references applicable law/doctrine. Phrase as a 'whether' statement.\n\n"
        "FACTS:\n{facts}\n\nFULL DOCUMENT:\n{document_text}\n\nLEGAL ISSUES:"
    )
    chain = prompt | _llm_instance() | StrOutputParser()

    try:
        issues = _invoke_with_retry(chain, {
            "doc_type":      state.get("classification", "unknown"),
            "facts":         state.get("extracted_facts", ""),
            "document_text": state["document_text"][:8000],
        })
    except Exception as e:
        issues = f"Error extracting issues: {e}"

    return {
        "extracted_issues": issues,
        "processing_time":  {**state.get("processing_time", {}),
                             "issues": time.time() - t0},
        "errors": state.get("errors", []) + (
            [f"Issues failed: {issues}"] if issues.startswith("Error") else []
        ),
    }


def extract_holding(state: LegalDocumentState) -> dict:
    if _is_blocked(state):
        return {}
    t0 = time.time()
    print("🔨 [Holding] Extracting court decision...")

    prompt = ChatPromptTemplate.from_template(
        "You are a legal research assistant extracting the HOLDING/DECISION.\n"
        "State the court's ultimate decision (affirmed/reversed/remanded), specific relief, "
        "and note any dissenting opinions if present.\n\n"
        "LEGAL ISSUES:\n{issues}\n\nDOCUMENT:\n{document_text}\n\nHOLDING/DECISION:"
    )
    chain = prompt | _llm_instance() | StrOutputParser()

    try:
        holding = _invoke_with_retry(chain, {
            "issues":        state.get("extracted_issues", ""),
            "document_text": state["document_text"][:8000],
        })
    except Exception as e:
        holding = f"Error extracting holding: {e}"

    return {
        "extracted_holding": holding,
        "processing_time":   {**state.get("processing_time", {}),
                              "holding": time.time() - t0},
        "errors": state.get("errors", []) + (
            [f"Holding failed: {holding}"] if holding.startswith("Error") else []
        ),
    }


def extract_reasoning(state: LegalDocumentState) -> dict:
    if _is_blocked(state):
        return {}
    t0 = time.time()
    print("🧠 [Reasoning] Analyzing legal reasoning...")

    prompt = ChatPromptTemplate.from_template(
        "You are a legal research assistant extracting REASONING/ANALYSIS.\n"
        "Explain HOW and WHY the decision was reached:\n"
        "- Legal principles applied\n"
        "- Statutes or precedents cited\n"
        "- Logical steps in the analysis\n"
        "- Factual findings that supported the conclusion\n\n"
        "HOLDING:\n{holding}\n\nDOCUMENT:\n{document_text}\n\nCOURT'S REASONING:"
    )
    chain = prompt | _llm_instance() | StrOutputParser()

    try:
        reasoning = _invoke_with_retry(chain, {
            "holding":       state.get("extracted_holding", ""),
            "document_text": state["document_text"][:10000],
        })
    except Exception as e:
        reasoning = f"Error extracting reasoning: {e}"

    return {
        "extracted_reasoning": reasoning,
        "processing_time":     {**state.get("processing_time", {}),
                                "reasoning": time.time() - t0},
        "errors": state.get("errors", []) + (
            [f"Reasoning failed: {reasoning}"] if reasoning.startswith("Error") else []
        ),
    }


def extract_ratio(state: LegalDocumentState) -> dict:
    if _is_blocked(state):
        return {}
    t0 = time.time()
    print("📜 [Ratio] Identifying ratio decidendi...")

    prompt = ChatPromptTemplate.from_template(
        "You are a legal scholar extracting the RATIO DECIDENDI (binding rule of law).\n"
        "Format: '[General legal principle] when [relevant circumstances].'\n"
        "Distinguish from obiter dicta.\n\n"
        "REASONING:\n{reasoning}\n\nHOLDING:\n{holding}\n\nRATIO DECIDENDI:"
    )
    chain = prompt | _llm_instance() | StrOutputParser()

    try:
        ratio = _invoke_with_retry(chain, {
            "reasoning": state.get("extracted_reasoning", ""),
            "holding":   state.get("extracted_holding",  ""),
        })
    except Exception as e:
        ratio = f"Error extracting ratio: {e}"

    return {
        "extracted_ratio": ratio,
        "processing_time": {**state.get("processing_time", {}),
                            "ratio": time.time() - t0},
        "errors": state.get("errors", []) + (
            [f"Ratio failed: {ratio}"] if ratio.startswith("Error") else []
        ),
    }


def synthesize_memo(state: LegalDocumentState) -> dict:
    if _is_blocked(state):
        return {}
    t0 = time.time()
    print("📝 [Synthesizer] Creating legal memo...")

    doc_type     = state.get("classification", "unknown")
    jurisdiction = state.get("document_metadata", {}).get("jurisdiction", "Unknown")

    prompt = ChatPromptTemplate.from_template(
        "You are a senior law clerk preparing a professional case brief.\n"
        "Document Type: {doc_type}\nJurisdiction: {jurisdiction}\n\n"
        "Write a structured legal memo using this format:\n"
        "1. FACTS — concise summary\n"
        "2. PROCEDURAL HISTORY — how case reached this court\n"
        "3. LEGAL ISSUE(S) — question(s) before the court\n"
        "4. HOLDING — court's decision\n"
        "5. REASONING — court's analysis\n"
        "6. RATIO DECIDENDI — binding legal principle\n"
        "7. SIGNIFICANCE — why this matters for legal research\n\n"
        "Use precise legal language. Cite any case names mentioned.\n\n"
        "FACTS:\n{facts}\n\nISSUES:\n{issues}\n\nHOLDING:\n{holding}\n\n"
        "REASONING:\n{reasoning}\n\nRATIO DECIDENDI:\n{ratio}\n\nLEGAL MEMO:"
    )
    chain = prompt | _llm_instance() | StrOutputParser()

    try:
        memo = _invoke_with_retry(chain, {
            "doc_type":    doc_type,
            "jurisdiction": jurisdiction,
            "facts":       state.get("extracted_facts",    ""),
            "issues":      state.get("extracted_issues",   ""),
            "holding":     state.get("extracted_holding",  ""),
            "reasoning":   state.get("extracted_reasoning",""),
            "ratio":       state.get("extracted_ratio",    ""),
        })
    except Exception as e:
        memo = f"Error synthesizing memo: {e}"

    return {
        "final_memo":      memo,
        "processing_time": {**state.get("processing_time", {}),
                            "synthesis": time.time() - t0},
        "errors": state.get("errors", []) + (
            [f"Synthesis failed: {memo}"] if memo.startswith("Error") else []
        ),
    }


def evaluate_summary(state: LegalDocumentState) -> dict:
    if _is_blocked(state):
        return {}
    t0 = time.time()
    print("⚖️  [Judge] Evaluating memo quality...")

    eval_llm = _get_llm(use_fallback=True, temperature=0.1)

    prompt = ChatPromptTemplate.from_template(
        "You are a senior judge evaluating a law clerk's brief.\n\n"
        "Grade on 4 dimensions (0-25 each):\n"
        "1. faithfulness_score — no hallucinations vs original\n"
        "2. coverage_score     — captured main issues, ratio, holding\n"
        "3. precision_score    — correct legal framing and terminology\n"
        "4. clarity_score      — professional structure, citations\n\n"
        "Return ONLY this JSON (no markdown, no backticks):\n"
        '{{"faithfulness_score":0,"coverage_score":0,"precision_score":0,'
        '"clarity_score":0,"total_score":0,'
        '"strengths":["specific strength"],"weaknesses":["specific weakness"],'
        '"judge_feedback":"2 sentences about THIS document"}}\n\n'
        "ORIGINAL DOCUMENT (first 12000 chars):\n{original_text}\n\n"
        "CLERK\'S MEMO:\n{generated_memo}"
    )
    chain = prompt | eval_llm | StrOutputParser()

    try:
        raw = _invoke_with_retry(chain, {
            "original_text":  state["document_text"][:12000],
            "generated_memo": state.get("final_memo", ""),
        }, max_retries=2)

        raw = (raw.strip()
                  .removeprefix("```json")
                  .removeprefix("```")
                  .removesuffix("```")
                  .strip())
        res = json.loads(raw)

        scores = {
            "faithfulness_score": int(res.get("faithfulness_score", 0)),
            "coverage_score":     int(res.get("coverage_score",     0)),
            "precision_score":    int(res.get("precision_score",    0)),
            "clarity_score":      int(res.get("clarity_score",      0)),
            "total_score":        int(res.get("total_score",        0)),
            "strengths":          res.get("strengths",   []),
            "weaknesses":         res.get("weaknesses",  []),
            "judge_feedback":     res.get("judge_feedback", ""),
        }
    except Exception as e:
        print(f"   ⚠️  Evaluation error: {e}")
        scores = {
            "faithfulness_score": 0, "coverage_score": 0,
            "precision_score": 0,   "clarity_score":   0,
            "total_score": 0,
            "strengths": [], "weaknesses": [],
            "judge_feedback": f"Evaluation failed: {e}",
        }

    print(f"   → Total score: {scores['total_score']}/100")
    return {
        "evaluation_score": scores,
        "processing_time":  {**state.get("processing_time", {}),
                             "evaluation": time.time() - t0},
    }


#    ─ LangGraph workflow ────────────────────────────────────────────────────────

def _build_workflow() -> StateGraph:
    wf = StateGraph(LegalDocumentState)
    wf.add_node("validate_input",    validate_input)      # ← new guardrail entry point
    wf.add_node("classify",          classify_document)
    wf.add_node("extract_facts",     extract_facts)
    wf.add_node("extract_issues",    extract_issues)
    wf.add_node("extract_holding",   extract_holding)
    wf.add_node("extract_reasoning", extract_reasoning)
    wf.add_node("extract_ratio",     extract_ratio)
    wf.add_node("synthesize",        synthesize_memo)
    wf.add_node("evaluate",          evaluate_summary)

    wf.set_entry_point("validate_input")           # ← was "classify"
    wf.add_edge("validate_input",    "classify")   # ← new edge
    wf.add_edge("classify",          "extract_facts")
    wf.add_edge("extract_facts",     "extract_issues")
    wf.add_edge("extract_issues",    "extract_holding")
    wf.add_edge("extract_holding",   "extract_reasoning")
    wf.add_edge("extract_reasoning", "extract_ratio")
    wf.add_edge("extract_ratio",     "synthesize")
    wf.add_edge("synthesize",        "evaluate")
    wf.add_edge("evaluate",          END)
    return wf.compile()


_app = _build_workflow()
print("✅ Summarizer workflow compiled")


# ── Public API ────────────────────────────────────────────────────────────────

def process_uploaded_document(file_path: str,
                               enable_ocr: bool = OCR_ENABLED) -> dict:
    """
    Extract text from a legal document file and run the full
    summarisation pipeline. Returns the final state dict.

    Key fields in the returned dict:
      guardrail_passed         (bool) — False = blocked, frontend shows error
      guardrail_blocked_reason (str)  — user-facing message when blocked
      accepted_document_types  (list) — accepted document types for user guidance
      final_memo               (str)  — structured memo (only when passed)
      document_metadata        (dict) — filename, jurisdiction, page_count
    """
    print("\n" + "=" * 60)
    print("🏛️  LEGAL DOCUMENT SUMMARISER")
    print("=" * 60)

    overall_start = time.time()

    # 1. Extract text
    try:
        extraction = extract_text_from_file(file_path, enable_ocr)
        doc_text   = extraction['text']
        if len(doc_text.strip()) < 50:
            raise ValueError("Insufficient text extracted from document.")
    except Exception as e:
        print(f"\n❌ Extraction failed: {e}")
        return {
            "guardrail_passed":         False,
            "guardrail_blocked_reason": (
                "This document cannot be processed.\n\n"
                "We were unable to extract readable text from your file. "
                "Please ensure the document is not password-protected or corrupted, "
                "and try again."
            ),
            "guardrail_detected_type":  "unreadable file",
            "accepted_document_types":  ACCEPTED_DOCUMENT_TYPES,
            "final_memo":               "",
            "errors":                   [f"Text extraction failed: {e}"],
        }

    # 2. Build initial state
    initial: LegalDocumentState = {
        "document_text": doc_text,
        "document_metadata": {
            "filename":   Path(file_path).name,
            "file_type":  extraction['file_type'],
            "page_count": str(extraction['page_count']),
        },
        "extraction_info": {
            "method":     extraction['method'],
            "confidence": extraction['confidence'],
            "warnings":   extraction['warnings'],
        },
        "guardrail_passed":          True,
        "guardrail_blocked_reason":  "",
        "guardrail_detected_type":   "",
        "accepted_document_types":   ACCEPTED_DOCUMENT_TYPES,
        "classification":            "",
        "classification_confidence": 0.0,
        "extracted_facts":           "",
        "extracted_issues":          "",
        "extracted_holding":         "",
        "extracted_reasoning":       "",
        "extracted_ratio":           "",
        "final_memo":                "",
        "evaluation_score":          {},
        "errors":                    [],
        "processing_time":           {},
    }

    # 3. Run workflow
    try:
        print("\n🔄 Starting analysis pipeline...\n")
        result = _app.invoke(initial)
        result["processing_time"]["total"] = time.time() - overall_start

        if not result.get("guardrail_passed", True):
            print(f"\n🚫 Pipeline blocked: {result['guardrail_blocked_reason']}")

        return result
    except Exception as e:
        print(f"\n❌ Workflow error: {e}")
        initial["errors"].append(f"Workflow failed: {e}")
        return initial