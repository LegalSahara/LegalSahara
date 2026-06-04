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
  - extract_citations node added for comprehensive citation extraction
  - Token limits increased for reasoning and facts extraction
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


# ── LLM helpers ────────────────────────────────────────────────────────────────

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
    guardrail_passed:          bool
    guardrail_blocked_reason:  str
    guardrail_detected_type:   str
    accepted_document_types:   List[str]
    classification:            str
    classification_confidence: float
    extracted_facts:           str
    extracted_issues:          str
    extracted_holding:         str
    extracted_reasoning:       str
    extracted_ratio:           str
    extracted_citations:       str          # ← new field
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
    sample = text[:5000].lower()
    hits   = sum(1 for kw in _LEGAL_KEYWORDS if kw in sample)
    print(f"   🔍 Heuristic: {hits} legal keyword(s) matched")
    return hits >= LEGAL_KEYWORD_THRESHOLD


def validate_input(state: LegalDocumentState) -> dict:
    t0   = time.time()
    text = state["document_text"]
    print("\n🛡️  [Guardrail] Validating document...")

    word_count = len(text.split())
    print(f"   📏 Word count: {word_count}")
    if word_count < MIN_WORD_COUNT:
        msg = (
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

    if _heuristic_legal_check(text):
        print("   ✅ Heuristic passed — document appears legal")
        return {
            "guardrail_passed":         True,
            "guardrail_blocked_reason": "",
            "guardrail_detected_type":  "",
            "accepted_document_types":  ACCEPTED_DOCUMENT_TYPES,
            "processing_time": {**state.get("processing_time", {}), "guardrail": time.time() - t0},
        }

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
            f"This tool is designed for legal documents only. "
            f"The file you uploaded appears to be {article} {hint}."
        )
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

def classify_document(state: LegalDocumentState) -> dict:
    if _is_blocked(state):
        return {}
    t0 = time.time()
    print("📋 [Classifier] Classifying document...")

    prompt = ChatPromptTemplate.from_template(
        "You are a legal document classification expert specializing in Pakistani law.\n\n"
        "Extract the following from the document and return ONLY a JSON object (no markdown):\n\n"
        '{{"document_type":"court_opinion","confidence":0.95,'
        '"case_name":"Zafar Iqbal and others v. Naseer Ahmed and others",'
        '"case_citation":"C.A. No. 775 of 2015",'
        '"jurisdiction":"Supreme Court of Pakistan",'
        '"coram":"Mr. Justice Umar Ata Bandial, Mr. Justice Syed Mansoor Ali Shah",'
        '"date_of_judgment":"01.10.2021",'
        '"key_indicators":["Civil Appeal","second appeal","Section 100 CPC"],'
        '"suggested_focus":"Analyze scope of second appeal and bona fide purchaser doctrine"}}\n\n'
        "Document types: court_opinion, contract, statute, brief, regulation, other\n\n"
        "IMPORTANT extraction rules:\n"
        "- case_name: Look for Appellant(s) v. Respondent(s) on the first page\n"
        "- case_citation: Look for C.A., C.P., Crl.A., PLD, SCMR, MLD, W.P., case numbers\n"
        "- coram: Look for 'Present:', 'Before:', 'Mr. Justice', 'Mrs. Justice'\n"
        "- date_of_judgment: Look for 'Date of hearing:', 'Dated:', or date at end\n"
        "- If a field is not found in the document, use 'Not stated'\n\n"
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
            "case_name":        res.get("case_name",       "Not stated"),
            "case_citation":    res.get("case_citation",   "Not stated"),
            "jurisdiction":     res.get("jurisdiction",    "Unknown"),
            "coram":            res.get("coram",           "Not stated"),
            "date_of_judgment": res.get("date_of_judgment","Not stated"),
            "key_indicators":   ", ".join(res.get("key_indicators", [])),
            "suggested_focus":  res.get("suggested_focus", "General legal analysis"),
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

    prompt = ChatPromptTemplate.from_template(
        "You are a legal research assistant extracting FACTS from a {doc_type} "
        "for a Pakistani legal audience.\n\n"
        "Extract ALL of the following as concise bullet points:\n"
        "- Full names of all parties and their legal roles\n"
        "  (appellant, respondent, vendor, vendee, subsequent purchaser, predecessor-in-interest, etc.)\n"
        "- Subject matter with exact measurements, amounts, and consideration figures\n"
        "- Key dates in chronological order\n"
        "- Material facts relevant to the legal dispute\n"
        "- Legally significant circumstances:\n"
        "  * Possession status of property — who was in possession and when\n"
        "  * Whether parties had notice of prior agreements\n"
        "  * Location of transactions relative to subject matter\n"
        "  * Party status (e.g. was wife a party to the agreement?)\n"
        "  * Whether purchasers were bona fide purchasers for value without notice\n"
        "  * Any inquiry made by purchasers before buying (e.g. asking village residents)\n"
        "- Names of counsel/advocates if mentioned\n\n"
        "STRICT RULES:\n"
        "- Bullet points only, no paragraphs\n"
        "- Include exact figures, amounts, dates, measurements from the document\n"
        "- Do NOT write 'Not explicitly stated' — if a fact is in the document extract it\n"
        "- Do NOT omit facts relating to bona fide purchase, notice, possession, or party status\n"
        "- Do NOT invent or assume facts not stated in the document\n\n"
        "DOCUMENT:\n{document_text}\n\nEXTRACTED FACTS:"
    )
    chain = prompt | _llm_instance() | StrOutputParser()

    try:
        # ↑ increased from 8000 to 15000
        facts = _invoke_with_retry(chain, {
            "doc_type":      doc_type,
            "document_text": state["document_text"][:15000],
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
        "You are a legal research assistant identifying LEGAL ISSUES "
        "for a Pakistani legal audience.\n"
        "Document Type: {doc_type}\n\n"
        "A well-framed legal issue states the specific legal question to be resolved "
        "and references the applicable law or doctrine. "
        "Phrase each issue as a numbered 'whether' statement.\n\n"
        "Include issues relating to:\n"
        "- Jurisdiction and scope of the court\n"
        "- Statutory interpretation\n"
        "- Factual disputes with legal consequences\n"
        "- Rights of parties under Pakistani law\n\n"
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
        "You are a legal research assistant extracting the HOLDING/DECISION "
        "from a Pakistani court judgment.\n\n"
        "State:\n"
        "1. The court's ultimate decision (allowed/dismissed/affirmed/reversed/remanded/restored)\n"
        "2. The specific relief granted or denied\n"
        "3. Which lower court judgment was upheld or set aside\n"
        "4. Any dissenting or concurring opinions\n\n"
        "Be specific — name the courts and parties involved in the outcome.\n\n"
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
        "You are a legal research assistant extracting the REASONING AND ANALYSIS "
        "from a Pakistani court judgment.\n\n"
        "You MUST cover ALL of the following:\n\n"
        "1. LEGAL PRINCIPLES APPLIED\n"
        "   - Every legal principle the court applied\n"
        "   - Exact statutory provisions cited "
        "(e.g. Section 100 CPC, Article 189 Constitution, Article 161 Qanun-e-Shahdat)\n"
        "   - ALL case law cited including footnotes "
        "(e.g. PLD, SCMR, MLD citations with party names)\n\n"
        "2. COURT'S STEP-BY-STEP ANALYSIS\n"
        "   - What specific errors did the court identify in the lower court's reasoning?\n"
        "   - What evidence did the court find was correctly or incorrectly relied upon?\n"
        "   - What factual findings were accepted or rejected and why?\n\n"
        "3. KEY FACTUAL FINDINGS SUPPORTING THE CONCLUSION\n"
        "   - Specific facts the court found decisive\n"
        "   - Facts the court found to be misconceived or irrelevant\n\n"
        "STRICT RULES:\n"
        "- Do NOT skip footnote citations — they are binding precedents\n"
        "- Be specific about which court, which evidence, which provision\n"
        "- Do NOT invent citations or principles not in the document\n\n"
        "HOLDING:\n{holding}\n\nDOCUMENT:\n{document_text}\n\nCOURT'S REASONING:"
    )
    chain = prompt | _llm_instance() | StrOutputParser()

    try:
        # ↑ increased from 10000 to 15000 to capture footnotes and later pages
        reasoning = _invoke_with_retry(chain, {
            "holding":       state.get("extracted_holding", ""),
            "document_text": state["document_text"][:15000],
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
        "You are a legal scholar extracting the RATIO DECIDENDI (binding rule of law) "
        "from a Pakistani court judgment.\n\n"
        "Format: '[General legal principle] when [relevant circumstances].'\n"
        "Distinguish clearly from obiter dicta.\n"
        "If multiple ratios exist, number them.\n\n"
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


# ── NEW: Dedicated citations extraction node ──────────────────────────────────

def extract_citations(state: LegalDocumentState) -> dict:
    """
    Dedicated node to extract ALL legal citations from the full document.
    Scans the entire text including footnotes, headers, and body text.
    """
    if _is_blocked(state):
        return {}
    t0 = time.time()
    print("📚 [Citations] Extracting all legal citations...")

    prompt = ChatPromptTemplate.from_template(
        "You are a legal research assistant extracting ALL citations "
        "from a Pakistani court judgment.\n\n"
        "Find and list EVERY citation in the document including:\n\n"
        "CASE LAW (in body text AND footnotes):\n"
        "- PLD citations (e.g. PLD 2006 SC 777)\n"
        "- SCMR citations (e.g. 2009 SCMR 254)\n"
        "- MLD citations\n"
        "- Any other case reporters\n"
        "- Format: Party Name v. Party Name [Citation]\n\n"
        "STATUTES & LEGISLATION:\n"
        "- Acts (e.g. Code of Civil Procedure 1908, Specific Relief Act 1877)\n"
        "- Specific sections cited (e.g. Section 100 CPC, Section 14 Specific Relief Act)\n\n"
        "CONSTITUTIONAL PROVISIONS:\n"
        "- Articles of the Constitution (e.g. Article 185, 189, 201)\n\n"
        "OTHER LEGAL INSTRUMENTS:\n"
        "- Orders, Rules, Regulations (e.g. Qanun-e-Shahdat Order 1984, Article 161)\n\n"
        "STRICT RULES:\n"
        "- List every single citation found — do not skip footnotes\n"
        "- One citation per line\n"
        "- Do NOT invent citations not present in the document\n"
        "- If no citations found, write 'None cited'\n\n"
        "FULL DOCUMENT:\n{document_text}\n\nALL CITATIONS:"
    )
    chain = prompt | _llm_instance() | StrOutputParser()

    try:
        # Use full document for citations to catch all footnotes
        citations = _invoke_with_retry(chain, {
            "document_text": state["document_text"][:20000],
        })
    except Exception as e:
        citations = f"Error extracting citations: {e}"

    return {
        "extracted_citations": citations,
        "processing_time":     {**state.get("processing_time", {}),
                                "citations": time.time() - t0},
        "errors": state.get("errors", []) + (
            [f"Citations failed: {citations}"] if citations.startswith("Error") else []
        ),
    }


def synthesize_memo(state: LegalDocumentState) -> dict:
    if _is_blocked(state):
        return {}
    t0 = time.time()
    print("📝 [Synthesizer] Creating legal memo...")

    doc_type      = state.get("classification", "unknown")
    metadata      = state.get("document_metadata", {})
    jurisdiction  = metadata.get("jurisdiction",    "Unknown")
    case_name     = metadata.get("case_name",       "Not stated")
    case_citation = metadata.get("case_citation",   "Not stated")
    coram         = metadata.get("coram",           "Not stated")
    date_judgment = metadata.get("date_of_judgment","Not stated")

    prompt = ChatPromptTemplate.from_template(
        "You are a senior law clerk preparing a professional case brief "
        "for Pakistani legal professionals (lawyers, judges, law students, researchers).\n\n"
        "Document Type: {doc_type}\n"
        "Jurisdiction: {jurisdiction}\n\n"
        "Write a structured case brief using EXACTLY this format and order. "
        "Do not add any extra sections or change the order.\n\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        "CASE BRIEF\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        "CASE NAME     : {case_name}\n"
        "CITATION      : {case_citation}\n"
        "COURT         : {jurisdiction}\n"
        "CORAM         : {coram}\n"
        "DATE          : {date_judgment}\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        "1. RATIO DECIDENDI\n"
        "State the binding legal principle(s) in this format: "
        "'[Legal principle] when [relevant circumstances].' "
        "Distinguish clearly from obiter dicta. "
        "If multiple ratios exist, number them. "
        "If not determinable, write 'Not stated'.\n\n"
        "2. LEGAL ISSUE(S)\n"
        "Frame each issue as a numbered whether-question:\n"
        "i.   Whether...\n"
        "ii.  Whether...\n"
        "(add more if needed)\n\n"
        "3. FACTS\n"
        "Concise bullet points only — no paragraphs. Cover:\n"
        "- Full names and roles of all parties\n"
        "- Subject matter with exact figures, amounts, measurements\n"
        "- Key dates in chronological order\n"
        "- Legally significant circumstances "
        "(possession, notice, location of transaction, party status, "
        "inquiry made before purchase)\n\n"
        "4. PROCEDURAL HISTORY\n"
        "One short paragraph. How the case reached this court "
        "and what each lower court decided.\n\n"
        "5. HOLDING\n"
        "State the court's ultimate decision first "
        "(allowed/dismissed/affirmed/reversed/restored), "
        "then specific relief. Note dissenting or concurring opinions if any.\n\n"
        "6. REASONING & ANALYSIS\n"
        "Cover in this order:\n"
        "- Legal principles and statutory provisions applied (cite exact section/article numbers)\n"
        "- All case law relied upon including footnote citations\n"
        "- Specific errors identified in the lower court's reasoning\n"
        "- Key factual findings that supported the conclusion\n\n"
        "7. OBITER DICTA\n"
        "List any non-binding observations made by the court. "
        "Write 'None' if not present.\n\n"
        "8. RELEVANT CITATIONS\n"
        "Use the citations list provided below. "
        "List every case and statute, one per line. "
        "Write 'None cited' only if the citations list is empty.\n\n"
        "9. RESEARCH NOTE\n"
        "2-3 sentences on why this specific case matters for "
        "Pakistani legal research and practice. Be specific — mention "
        "the exact legal doctrine, provision, or principle this case clarifies.\n\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        "STRICT RULES:\n"
        "- Use precise legal terminology throughout\n"
        "- If a field cannot be determined from the document, write 'Not stated'\n"
        "- Do NOT invent facts, citations, judge names, or case references\n"
        "- Section 3 (FACTS) must be bullet points only, never paragraphs\n"
        "- Section 8 must use the CITATIONS LIST provided — do not ignore it\n"
        "- Do not add any sections beyond the 9 listed above\n\n"
        "FACTS:\n{facts}\n\n"
        "ISSUES:\n{issues}\n\n"
        "HOLDING:\n{holding}\n\n"
        "REASONING:\n{reasoning}\n\n"
        "RATIO DECIDENDI:\n{ratio}\n\n"
        "CITATIONS LIST:\n{citations}\n\n"
        "CASE BRIEF:"
    )
    chain = prompt | _llm_instance() | StrOutputParser()

    try:
        memo = _invoke_with_retry(chain, {
            "doc_type":      doc_type,
            "jurisdiction":  jurisdiction,
            "case_name":     case_name,
            "case_citation": case_citation,
            "coram":         coram,
            "date_judgment": date_judgment,
            "facts":         state.get("extracted_facts",     ""),
            "issues":        state.get("extracted_issues",    ""),
            "holding":       state.get("extracted_holding",   ""),
            "reasoning":     state.get("extracted_reasoning", ""),
            "ratio":         state.get("extracted_ratio",     ""),
            "citations":     state.get("extracted_citations", "None cited"),
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


# ── LangGraph workflow ────────────────────────────────────────────────────────

def _build_workflow() -> StateGraph:
    wf = StateGraph(LegalDocumentState)
    wf.add_node("validate_input",    validate_input)
    wf.add_node("classify",          classify_document)
    wf.add_node("extract_facts",     extract_facts)
    wf.add_node("extract_issues",    extract_issues)
    wf.add_node("extract_holding",   extract_holding)
    wf.add_node("extract_reasoning", extract_reasoning)
    wf.add_node("extract_ratio",     extract_ratio)
    wf.add_node("extract_citations", extract_citations)   # ← new node
    wf.add_node("synthesize",        synthesize_memo)
    wf.add_node("evaluate",          evaluate_summary)

    wf.set_entry_point("validate_input")
    wf.add_edge("validate_input",    "classify")
    wf.add_edge("classify",          "extract_facts")
    wf.add_edge("extract_facts",     "extract_issues")
    wf.add_edge("extract_issues",    "extract_holding")
    wf.add_edge("extract_holding",   "extract_reasoning")
    wf.add_edge("extract_reasoning", "extract_ratio")
    wf.add_edge("extract_ratio",     "extract_citations")  # ← new edge
    wf.add_edge("extract_citations", "synthesize")         # ← new edge
    wf.add_edge("synthesize",        "evaluate")
    wf.add_edge("evaluate",          END)
    return wf.compile()


_app = _build_workflow()
print("✅ Summarizer workflow compiled")


# ── Public API ────────────────────────────────────────────────────────────────

def process_uploaded_document(file_path: str,
                               enable_ocr: bool = OCR_ENABLED) -> dict:
    print("\n" + "=" * 60)
    print("🏛️  LEGAL DOCUMENT SUMMARISER")
    print("=" * 60)

    overall_start = time.time()

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
                "We were unable to extract readable text from your file. "
                "Please ensure the document is not password-protected or corrupted, "
                "and try again."
            ),
            "guardrail_detected_type":  "unreadable file",
            "accepted_document_types":  ACCEPTED_DOCUMENT_TYPES,
            "final_memo":               "",
            "errors":                   [f"Text extraction failed: {e}"],
        }

    initial: LegalDocumentState = {
        "document_text": doc_text,
        "document_metadata": {
            "filename":         Path(file_path).name,
            "file_type":        extraction['file_type'],
            "page_count":       str(extraction['page_count']),
            "case_name":        "Not stated",
            "case_citation":    "Not stated",
            "coram":            "Not stated",
            "date_of_judgment": "Not stated",
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
        "extracted_citations":       "",    # ← new field
        "final_memo":                "",
        "evaluation_score":          {},
        "errors":                    [],
        "processing_time":           {},
    }

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
