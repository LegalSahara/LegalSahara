"""
guardrails.py
=============
Legal Drafter Guardrails — drop-in safety layer for Legal Sahara AI.

Provides:
  1. INPUT GUARDRAILS   — validate/sanitise user story before the pipeline runs
  2. OUTPUT GUARDRAILS  — validate generated petition before it is returned
  3. CITATION GUARDRAILS — detect hallucinated / fabricated case citations
  4. PII GUARDRAILS      — warn if sensitive PII appears unexpectedly
  5. CONTENT GUARDRAILS  — block non-legal / harmful requests

All guardrails return a GuardrailResult so callers can decide how to handle failures
without crashing. Nothing here raises exceptions — failures are surfaced as structured
results with human-readable messages.

Usage (in graph.py / nodes.py):
    from src.drafter.guardrails import (
        run_input_guardrails, run_output_guardrails
    )
"""

from __future__ import annotations

import re
import json
import time
from dataclasses import dataclass, field
from typing import List, Optional

from groq import Groq
from config import GROQ_API_KEY

# ── Shared Groq client (re-uses the fast model for all guardrail checks) ──────
_groq = Groq(api_key=GROQ_API_KEY)
_FAST_MODEL  = "llama-3.1-8b-instant"
_SMART_MODEL = "llama-3.3-70b-versatile"


# ─────────────────────────────────────────────────────────────────────────────
# RESULT DATACLASS
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class GuardrailResult:
    passed:   bool
    category: str                       # which guardrail fired
    severity: str = "LOW"               # LOW | MEDIUM | HIGH | CRITICAL
    message:  str = ""                  # human-readable explanation
    details:  dict = field(default_factory=dict)
    blocked:  bool = False              # True = hard-block, False = soft-warn


# ─────────────────────────────────────────────────────────────────────────────
# 1. INPUT GUARDRAILS
# ─────────────────────────────────────────────────────────────────────────────

# ── 1a. Length / Empty check ──────────────────────────────────────────────────

def check_input_length(story: str) -> GuardrailResult:
    """Reject empty, absurdly short, or suspiciously long inputs."""
    stripped = story.strip()

    if not stripped:
        return GuardrailResult(
            passed=False, category="INPUT_EMPTY",
            severity="HIGH", blocked=True,
            message="Story is empty. Please describe the legal situation."
        )

    word_count = len(stripped.split())

    if word_count < 8:
        return GuardrailResult(
            passed=False, category="INPUT_TOO_SHORT",
            severity="MEDIUM", blocked=False,
            message=(
                f"Story is too short ({word_count} words). "
                "Please provide more detail about the situation, parties involved, "
                "and the legal issue."
            )
        )

    if len(stripped) > 15_000:
        return GuardrailResult(
            passed=False, category="INPUT_TOO_LONG",
            severity="LOW", blocked=False,
            message=(
                f"Story is very long ({len(stripped)} characters). "
                "Consider trimming to the key facts. The pipeline will truncate at 15 000 chars."
            ),
            details={"truncated_at": 15_000}
        )

    return GuardrailResult(passed=True, category="INPUT_LENGTH",
                           message=f"Length OK ({word_count} words).")


# ── 1b. Language / Script check ───────────────────────────────────────────────

def check_input_language(story: str) -> GuardrailResult:
    """
    Soft-warn if the input does not appear to be in English or Roman Urdu.
    We do NOT hard-block (Urdu in Roman script is common).
    """
    # Detect Arabic-script Urdu (not Roman Urdu)
    arabic_script_ratio = len(re.findall(r'[\u0600-\u06FF]', story)) / max(len(story), 1)
    if arabic_script_ratio > 0.4:
        return GuardrailResult(
            passed=True,   # pass but warn
            category="INPUT_LANGUAGE",
            severity="LOW",
            blocked=False,
            message=(
                "Input appears to contain significant Arabic/Urdu script. "
                "The drafter works best with English or Roman Urdu. "
                "Output will still be generated in English."
            )
        )
    return GuardrailResult(passed=True, category="INPUT_LANGUAGE",
                           message="Language check OK.")


# ── 1c. Content safety — non-legal / harmful request ─────────────────────────

# Patterns that signal clearly non-legal or harmful intent
_HARMFUL_PATTERNS = [
    r'\b(how\s+to\s+(kill|bomb|shoot|poison|hack|exploit))\b',
    r'\b(make\s+(a\s+)?(bomb|weapon|explosive|poison))\b',
    r'\b(drug\s+(trafficking|smuggling|synthesis))\b',
    r'\b(child\s+(abuse|pornography|grooming))\b',
    r'\b(money\s+laundering\s+scheme)\b',
]

# Signals that this IS a genuine legal request (prevent over-blocking)
_LEGAL_SIGNALS = [
    'arrested', 'bail', 'fir', 'petition', 'court', 'police', 'detention',
    'habeas', 'corpus', 'advocate', 'lawyer', 'accused', 'detenu', 'writ',
    'section', 'crpc', 'ppc', 'article', 'constitution', 'magistrate',
    'sealed', 'property', 'encroachment', 'cheque', 'fir no', 'station',
    'judge', 'session', 'high court', 'supreme court', 'respondent',
    'petitioner', 'challan', 'custody', 'remand', 'surety', 'acquit',
    'quash', 'appeal', 'contempt', 'injunction', 'stay', 'writ',
]


def check_input_content_safety(story: str) -> GuardrailResult:
    """
    Block clearly harmful requests. Never block genuine legal queries.
    Uses regex first; falls back to LLM for ambiguous cases.
    """
    text_lower = story.lower()

    # Fast pass: if strong legal signals exist, skip heavy checks
    legal_hits = sum(1 for sig in _LEGAL_SIGNALS if sig in text_lower)
    if legal_hits >= 2:
        return GuardrailResult(passed=True, category="CONTENT_SAFETY",
                               message=f"Legal signals detected ({legal_hits}), content safe.")

    # Regex hard-block patterns
    for pat in _HARMFUL_PATTERNS:
        if re.search(pat, text_lower):
            return GuardrailResult(
                passed=False, category="CONTENT_SAFETY",
                severity="CRITICAL", blocked=True,
                message=(
                    "This request has been flagged as potentially harmful and cannot be processed. "
                    "Legal Sahara is designed for legitimate legal assistance only."
                )
            )

    # LLM check for ambiguous cases (only when no legal signals and no regex hit)
    if legal_hits == 0:
        try:
            resp = _groq.chat.completions.create(
                model=_FAST_MODEL,
                messages=[{"role": "user", "content": f"""
Is this a legitimate request for Pakistani legal assistance (bail, habeas corpus, FIR, property rights, etc.)?
Or is it a harmful/irrelevant request?

TEXT: "{story[:500]}"

Respond ONLY with JSON: {{"is_legal_request": true/false, "reason": "one line"}}
"""}],
                response_format={"type": "json_object"},
                temperature=0,
                timeout=8,
            )
            result = json.loads(resp.choices[0].message.content)
            if not result.get("is_legal_request", True):
                return GuardrailResult(
                    passed=False, category="CONTENT_SAFETY",
                    severity="HIGH", blocked=True,
                    message=(
                        "This does not appear to be a legal assistance request. "
                        f"Reason: {result.get('reason', 'Non-legal content detected.')} "
                        "Please describe a genuine legal situation."
                    )
                )
        except Exception as e:
            # Never block on LLM timeout — fail open
            print(f"   ⚠️ Content safety LLM check failed (fail-open): {e}")

    return GuardrailResult(passed=True, category="CONTENT_SAFETY",
                           message="Content safety check passed.")


# ── 1d. Jurisdiction sanity check ─────────────────────────────────────────────

_PAKISTAN_SIGNALS = [
    'pakistan', 'karachi', 'lahore', 'islamabad', 'peshawar', 'quetta',
    'multan', 'sindh', 'punjab', 'kpk', 'balochistan', 'ppc', 'crpc',
    'fir', 'dha', 'gulshan', 'clifton', 'rangers', 'fia', 'nab',
    'section 302', 'section 489', 'article 9', 'article 10',
    'sessions court', 'high court', 'supreme court',
    'rs.', 'rupees', 'lakh', 'crore',
]


def check_jurisdiction_relevance(story: str) -> GuardrailResult:
    """
    Soft-warn if the story seems to be about a non-Pakistani jurisdiction.
    Does NOT block — the drafter will still run.
    """
    text_lower = story.lower()
    pak_hits = sum(1 for sig in _PAKISTAN_SIGNALS if sig in text_lower)

    # Foreign jurisdiction keywords
    foreign_signals = [
        'united states', 'uk court', 'english law', 'indian court',
        'supreme court of india', 'high court of india', 'ipc ', 'crpc india',
        'california', 'new york court', 'federal court usa',
    ]
    foreign_hits = sum(1 for sig in foreign_signals if sig in text_lower)

    if foreign_hits > 0 and pak_hits == 0:
        return GuardrailResult(
            passed=True,   # warn only
            category="JURISDICTION",
            severity="MEDIUM",
            blocked=False,
            message=(
                "This story may involve a non-Pakistani jurisdiction. "
                "Legal Sahara drafts petitions for Pakistani courts only. "
                "The petition will be generated under Pakistani law."
            )
        )

    return GuardrailResult(passed=True, category="JURISDICTION",
                           message="Jurisdiction check OK.")


# ─────────────────────────────────────────────────────────────────────────────
# 2. CITATION GUARDRAILS
# ─────────────────────────────────────────────────────────────────────────────

# Known-good citation prefixes in the Pakistani legal corpus
_VALID_CITATION_PREFIXES = [
    r'PLD\s+\d{4}',
    r'SCMR\s+\d{4}',
    r'YLR\s+\d{4}',
    r'CLC\s+\d{4}',
    r'MLD\s+\d{4}',
    r'(?:Crl\.P\.L\.A|C\.P\.L\.A|C\.A|Crl\.A|C\.P)\.\d+[-\w]*_\d{4}',
    r'(?:Crl\.P\.L\.A|C\.P\.L\.A)\.\d+[-\w]+_\d{4}',
    # Constitutional articles (always valid)
    r'Article\s+\d+[A-Z]?\s+(?:of\s+the\s+)?Constitution',
    r'Section\s+\d+\s+(?:Cr\.?P\.?C|PPC|CrPC)',
]

# Patterns that look like citations but are almost certainly hallucinated
_SUSPICIOUS_CITATION_PATTERNS = [
    r'\b(?:AIR|SCC|SCR)\s+\d{4}\b',          # Indian citations
    r'\b\d{4}\s+(?:WL|LEXIS)\s+\d+\b',       # Westlaw / LexisNexis (USA)
    r'\bCase\s+No\.?\s+[A-Z]{2,}-\d{4}\b',   # Generic invented format
    r'\bJudgment\s+dated\s+\d{1,2}/\d{1,2}/\d{2,4}\b',  # Date-only "citation"
]


def check_citation_validity(petition_text: str,
                             primary_citation: str = "",
                             supporting_citation: str = "") -> GuardrailResult:
    """
    Scan the petition for suspicious / foreign / fabricated citations.
    Soft-warn — does NOT block final output.
    """
    issues = []

    # Check for suspicious patterns in the full petition
    for pat in _SUSPICIOUS_CITATION_PATTERNS:
        hits = re.findall(pat, petition_text, re.IGNORECASE)
        if hits:
            issues.append(f"Suspicious citation pattern detected: {hits[:3]}")

    # Check if primary citation looks valid
    if primary_citation and primary_citation not in ("", "N/A", "Unknown"):
        is_valid = any(
            re.search(pfx, primary_citation, re.IGNORECASE)
            for pfx in _VALID_CITATION_PREFIXES
        )
        if not is_valid:
            issues.append(
                f"Primary citation '{primary_citation}' does not match any known "
                "Pakistani legal citation format. Verify before filing."
            )

    # Check CPLA misuse (CPLA is a petition for leave, not a judgment)
    cpla_in_grounds = re.findall(
        r'(?:held|ruled|decided|judgment|judgement)\s+in\s+(?:the\s+)?'
        r'((?:Crl\.P\.L\.A|C\.P\.L\.A)\.[^\s,]+)',
        petition_text, re.IGNORECASE
    )
    if cpla_in_grounds:
        issues.append(
            f"CPLA citation(s) {cpla_in_grounds[:2]} used as if they are judgments. "
            "CPLA = petition for leave, NOT a judgment. State the legal principle instead."
        )

    if issues:
        return GuardrailResult(
            passed=False, category="CITATION_VALIDITY",
            severity="MEDIUM", blocked=False,
            message="Citation issues detected (petition still generated):\n" + "\n".join(f"  • {i}" for i in issues),
            details={"issues": issues}
        )

    return GuardrailResult(passed=True, category="CITATION_VALIDITY",
                           message="Citation check passed.")


# ─────────────────────────────────────────────────────────────────────────────
# 3. OUTPUT GUARDRAILS
# ─────────────────────────────────────────────────────────────────────────────

# Required structural sections every petition must contain
_REQUIRED_SECTIONS = {
    "FACTS":         r'\bFACTS\b',
    "GROUNDS":       r'\bGROUNDS\b',
    "PRAYER":        r'\bPRAYER\b',
    "VERIFICATION":  r'\bVERIFICATION\b',
    "SHEWETH":       r'RESPECTFULLY\s+SHEWETH',
}

# Minimum acceptable grounds (lettered A. B. C. ...)
_GROUNDS_PATTERN = re.compile(r'^[A-Z]\.\s+Because', re.MULTILINE)

# Patterns that indicate the LLM added a disclaimer or refused
_DISCLAIMER_PATTERNS = [
    r'\bI cannot\b',
    r'\bI\'m unable\b',
    r'\bAs an AI\b',
    r'\bThis is a sample\b',
    r'\bThis is a draft\b',
    r'\bPlease consult\b',
    r'\bDisclaimer\b',
    r'\bNote:\s+This\b',
    r'I must emphasize that this is',
    r'This petition is for educational purposes',
]


def check_output_structure(petition_text: str,
                            petition_type: str = "") -> GuardrailResult:
    """
    Verify the generated petition has all required sections and minimum content.
    """
    issues = []
    text_upper = petition_text.upper()

    # Check required sections
    missing_sections = [
        sec for sec, pat in _REQUIRED_SECTIONS.items()
        if not re.search(pat, petition_text, re.IGNORECASE)
    ]
    if missing_sections:
        issues.append(f"Missing required sections: {', '.join(missing_sections)}")

    # Check minimum grounds count
    grounds_count = len(_GROUNDS_PATTERN.findall(petition_text))
    if grounds_count < 4:
        issues.append(
            f"Only {grounds_count} lettered ground(s) found. "
            "A strong petition needs at least 6 grounds."
        )

    # Check for LLM disclaimers / refusal language
    for pat in _DISCLAIMER_PATTERNS:
        if re.search(pat, petition_text, re.IGNORECASE):
            issues.append(
                f"LLM disclaimer detected matching '{pat}'. "
                "The petition contains meta-commentary that must be removed."
            )
            break   # one warning is enough

    # Check minimum length
    if len(petition_text.strip()) < 500:
        issues.append(
            f"Petition is suspiciously short ({len(petition_text)} chars). "
            "It may not have been fully generated."
        )

    # Check court header presence
    court_patterns = [
        r'IN THE (?:HIGH COURT|COURT OF SESSIONS)',
        r'IN THE COURT OF',
    ]
    if not any(re.search(p, petition_text, re.IGNORECASE) for p in court_patterns):
        issues.append("No recognisable court header found in petition.")

    if issues:
        return GuardrailResult(
            passed=False, category="OUTPUT_STRUCTURE",
            severity="HIGH", blocked=False,
            message="Structural issues in generated petition:\n" + "\n".join(f"  • {i}" for i in issues),
            details={"issues": issues, "grounds_found": grounds_count}
        )

    return GuardrailResult(
        passed=True, category="OUTPUT_STRUCTURE",
        message=f"Structure OK — {grounds_count} grounds found.",
        details={"grounds_found": grounds_count}
    )


def check_output_name_consistency(petition_text: str,
                                   petitioner: str,
                                   detenu: str) -> GuardrailResult:
    """
    Warn if names used in the petition body do not match extracted names.
    Catches hallucinated / swapped names.
    """
    issues = []
    PLACEHOLDERS = {"The Petitioner", "The Affected Person", "The Applicant",
                    "Petitioner", "Applicant", "Detenu"}

    def _first_name(full: str) -> str:
        """Return the first token of a name for fuzzy matching."""
        return full.strip().split()[0] if full.strip() else ""

    for name_label, name_val in [("petitioner", petitioner), ("detenu/accused", detenu)]:
        if not name_val or name_val in PLACEHOLDERS:
            continue
        first = _first_name(name_val)
        if first and first not in petition_text:
            issues.append(
                f"Name '{name_val}' ({name_label}) not found in petition body. "
                "Check for name substitution or hallucination."
            )

    if issues:
        return GuardrailResult(
            passed=False, category="NAME_CONSISTENCY",
            severity="MEDIUM", blocked=False,
            message="Name consistency issues:\n" + "\n".join(f"  • {i}" for i in issues),
            details={"petitioner": petitioner, "detenu": detenu}
        )

    return GuardrailResult(passed=True, category="NAME_CONSISTENCY",
                           message="Name consistency check passed.")


def check_output_no_hallucinated_facts(petition_text: str,
                                        user_story: str) -> GuardrailResult:
    """
    LLM-based check: did the drafter invent facts not present in the user story?
    Soft-warn only.
    """
    try:
        resp = _groq.chat.completions.create(
            model=_FAST_MODEL,
            messages=[{"role": "user", "content": f"""
You are auditing a generated legal petition for hallucinated facts.

USER STORY (ground truth):
\"\"\"{user_story[:600]}\"\"\"

PETITION FACTS SECTION (check this):
\"\"\"{petition_text[:1200]}\"\"\"

Does the FACTS section of the petition contain any specific details (dates, FIR numbers,
police station names, amounts, names) that are NOT present in the user story and could NOT
be reasonably inferred from it?

Return ONLY JSON:
{{
  "has_hallucinated_facts": true/false,
  "examples": ["specific invented detail 1", "..."],
  "confidence": "HIGH/MEDIUM/LOW"
}}
"""}],
            response_format={"type": "json_object"},
            temperature=0,
            timeout=10,
        )
        result = json.loads(resp.choices[0].message.content)
        if result.get("has_hallucinated_facts") and result.get("confidence") != "LOW":
            examples = result.get("examples", [])
            return GuardrailResult(
                passed=False, category="HALLUCINATION_CHECK",
                severity="MEDIUM", blocked=False,
                message=(
                    "Possible hallucinated facts detected in petition:\n"
                    + "\n".join(f"  • {e}" for e in examples[:3])
                    + "\nPlease review before filing."
                ),
                details={"examples": examples, "confidence": result.get("confidence")}
            )
    except Exception as e:
        print(f"   ⚠️ Hallucination check failed (fail-open): {e}")

    return GuardrailResult(passed=True, category="HALLUCINATION_CHECK",
                           message="Hallucination check passed.")


# ─────────────────────────────────────────────────────────────────────────────
# 4. PII GUARDRAILS
# ─────────────────────────────────────────────────────────────────────────────

_PII_PATTERNS = {
    "CNIC":         r'\b\d{5}-\d{7}-\d\b',
    "Phone":        r'\b(?:03\d{2}|0092\s*3\d{2})[-\s]?\d{7}\b',
    "Email":        r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
    "Bank Account": r'\bPK\d{2}[A-Z]{4}\d{16}\b',   # IBAN format
    "Passport":     r'\b[A-Z]{2}\d{7}\b',
}


def check_pii_exposure(text: str, context: str = "input") -> GuardrailResult:
    """
    Detect sensitive PII in input or output.
    Soft-warn — never block (PII can be legitimately needed for petitions).
    """
    found = {}
    for pii_type, pattern in _PII_PATTERNS.items():
        matches = re.findall(pattern, text)
        if matches:
            # Redact for the warning message
            found[pii_type] = [m[:4] + "***" for m in matches[:2]]

    if found:
        return GuardrailResult(
            passed=True,   # warn only — PII is sometimes needed
            category="PII_EXPOSURE",
            severity="LOW",
            blocked=False,
            message=(
                f"PII detected in {context}: {list(found.keys())}. "
                "Ensure this is intentional and the petitioner consents to its inclusion."
            ),
            details={"pii_types": found}
        )

    return GuardrailResult(passed=True, category="PII_EXPOSURE",
                           message="No unexpected PII detected.")


# ─────────────────────────────────────────────────────────────────────────────
# 5. RATE LIMITING / ABUSE GUARDRAILS (in-process, resets on restart)
# ─────────────────────────────────────────────────────────────────────────────

_USER_CALL_LOG: dict[str, list[float]] = {}
_RATE_LIMIT_WINDOW  = 3600   # 1 hour window (seconds)
_RATE_LIMIT_MAX     = 20     # max petitions per user per hour


def check_rate_limit(user_id: str) -> GuardrailResult:
    """
    Simple in-memory rate limiter per user_id.
    Resets on server restart — use Redis for production.
    """
    now = time.time()
    log = _USER_CALL_LOG.setdefault(user_id, [])

    # Prune old entries outside the window
    log[:] = [t for t in log if now - t < _RATE_LIMIT_WINDOW]

    if len(log) >= _RATE_LIMIT_MAX:
        return GuardrailResult(
            passed=False, category="RATE_LIMIT",
            severity="HIGH", blocked=True,
            message=(
                f"Rate limit reached: {_RATE_LIMIT_MAX} petitions per hour. "
                "Please wait before submitting another request."
            ),
            details={"calls_in_window": len(log), "window_seconds": _RATE_LIMIT_WINDOW}
        )

    log.append(now)
    return GuardrailResult(
        passed=True, category="RATE_LIMIT",
        message=f"Rate limit OK ({len(log)}/{_RATE_LIMIT_MAX} in window)."
    )


# ─────────────────────────────────────────────────────────────────────────────
# 6. AGGREGATED ENTRY POINTS
# ─────────────────────────────────────────────────────────────────────────────

def run_input_guardrails(story: str,
                          user_id: str = "default") -> list[GuardrailResult]:
    """
    Run all input guardrails in order.
    Returns a list of GuardrailResult objects.
    The FIRST result with blocked=True should halt the pipeline.
    """
    print("🛡️  [Guardrails] Running input checks...")
    results: list[GuardrailResult] = []

    checks = [
        ("rate_limit",    lambda: check_rate_limit(user_id)),
        ("length",        lambda: check_input_length(story)),
        ("language",      lambda: check_input_language(story)),
        ("content_safety",lambda: check_input_content_safety(story)),
        ("jurisdiction",  lambda: check_jurisdiction_relevance(story)),
        ("pii_input",     lambda: check_pii_exposure(story, context="user input")),
    ]

    for name, fn in checks:
        try:
            r = fn()
            results.append(r)
            status = "✅" if r.passed else ("🚫" if r.blocked else "⚠️")
            print(f"   {status} [{r.category}] {r.message[:80]}")
            if r.blocked:
                print(f"   ⛔ BLOCKED at {name} — halting pipeline.")
                break   # stop on first hard block
        except Exception as e:
            print(f"   ⚠️  Guardrail '{name}' raised an unexpected error (fail-open): {e}")
            results.append(GuardrailResult(
                passed=True, category=f"{name.upper()}_ERROR",
                severity="LOW", message=f"Guardrail error (skipped): {e}"
            ))

    return results


def run_output_guardrails(petition_text: str,
                           user_story: str,
                           petitioner: str = "",
                           detenu: str = "",
                           primary_citation: str = "",
                           supporting_citation: str = "") -> list[GuardrailResult]:
    """
    Run all output guardrails on the generated petition.
    Returns a list of GuardrailResult objects.
    None of these hard-block (blocked=True) — they produce warnings only.
    """
    print("🛡️  [Guardrails] Running output checks...")
    results: list[GuardrailResult] = []

    checks = [
        ("structure",     lambda: check_output_structure(petition_text)),
        ("name_consistency", lambda: check_output_name_consistency(
                                        petition_text, petitioner, detenu)),
        ("citations",     lambda: check_citation_validity(
                                        petition_text, primary_citation, supporting_citation)),
        ("hallucination", lambda: check_output_no_hallucinated_facts(
                                        petition_text, user_story)),
        ("pii_output",    lambda: check_pii_exposure(petition_text, context="petition output")),
    ]

    for name, fn in checks:
        try:
            r = fn()
            results.append(r)
            status = "✅" if r.passed else ("🚫" if r.blocked else "⚠️")
            print(f"   {status} [{r.category}] {r.message[:80]}")
        except Exception as e:
            print(f"   ⚠️  Output guardrail '{name}' raised an unexpected error (fail-open): {e}")
            results.append(GuardrailResult(
                passed=True, category=f"{name.upper()}_ERROR",
                severity="LOW", message=f"Guardrail error (skipped): {e}"
            ))

    return results


def summarise_guardrail_results(results: list[GuardrailResult]) -> dict:
    """
    Produce a clean summary dict for logging / API response metadata.
    """
    blocked      = [r for r in results if r.blocked]
    warnings     = [r for r in results if not r.passed and not r.blocked]
    passed       = [r for r in results if r.passed]
    red_flags    = [r.message for r in warnings]

    return {
        "guardrails_passed":   len(passed),
        "guardrails_warnings": len(warnings),
        "guardrails_blocked":  len(blocked),
        "is_blocked":          bool(blocked),
        "block_reason":        blocked[0].message if blocked else None,
        "warnings":            red_flags,
        "details": [
            {
                "category": r.category,
                "severity": r.severity,
                "passed":   r.passed,
                "blocked":  r.blocked,
                "message":  r.message,
            }
            for r in results
        ],
    }


print("✅ Guardrails module loaded")
