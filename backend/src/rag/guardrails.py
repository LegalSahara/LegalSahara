"""
rag/guardrails.py
=================
Input and output guardrails for the Legal Sahara RAG pipeline.

Input guardrails  — run before the query hits the planner
Output guardrails — run before the answer is returned to the API

All guardrails return GuardrailResult and never raise exceptions.
Failures are surfaced as structured results — fail-open on errors.
"""

from __future__ import annotations

import re
import json
import time
from dataclasses import dataclass, field
from typing import List, Optional

from groq import Groq
from config import GROQ_API_KEY

_groq       = Groq(api_key=GROQ_API_KEY)
_FAST_MODEL = "llama-3.1-8b-instant"

# ─────────────────────────────────────────────────────────────────────────────
# RESULT DATACLASS
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class GuardrailResult:
    passed:   bool
    category: str
    severity: str = "LOW"
    message:  str = ""
    details:  dict = field(default_factory=dict)
    blocked:  bool = False


# ─────────────────────────────────────────────────────────────────────────────
# 1. INPUT GUARDRAILS
# ─────────────────────────────────────────────────────────────────────────────

# ── 1a. Query length ──────────────────────────────────────────────────────────

def check_query_length(query: str) -> GuardrailResult:
    stripped   = query.strip()
    word_count = len(stripped.split())

    if not stripped:
        return GuardrailResult(
            passed=False, category="QUERY_EMPTY",
            severity="HIGH", blocked=True,
            message="Query is empty. Please enter a legal question or search term."
        )

    if word_count < 2:
        return GuardrailResult(
            passed=False, category="QUERY_TOO_SHORT",
            severity="MEDIUM", blocked=True,
            message="Query is too short. Please provide more detail."
        )

    if len(stripped) > 1000:
        return GuardrailResult(
            passed=False, category="QUERY_TOO_LONG",
            severity="LOW", blocked=False,
            message=(
                f"Query is very long ({len(stripped)} chars). "
                "Consider shortening for better results. Query will be truncated at 1000 chars."
            ),
            details={"truncated_at": 1000}
        )

    return GuardrailResult(
        passed=True, category="QUERY_LENGTH",
        message=f"Length OK ({word_count} words)."
    )


# ── 1b. Rate limiting ─────────────────────────────────────────────────────────

_USER_CALL_LOG: dict[str, list[float]] = {}
_RATE_LIMIT_WINDOW = 3600   # 1 hour
_RATE_LIMIT_MAX    = 50     # max queries per user per hour


def check_rate_limit(user_id: str) -> GuardrailResult:
    now = time.time()
    log = _USER_CALL_LOG.setdefault(user_id, [])
    log[:] = [t for t in log if now - t < _RATE_LIMIT_WINDOW]

    if len(log) >= _RATE_LIMIT_MAX:
        return GuardrailResult(
            passed=False, category="RATE_LIMIT",
            severity="HIGH", blocked=True,
            message=(
                f"Rate limit reached: {_RATE_LIMIT_MAX} queries per hour. "
                "Please wait before submitting another query."
            ),
            details={"calls_in_window": len(log), "window_seconds": _RATE_LIMIT_WINDOW}
        )

    log.append(now)
    return GuardrailResult(
        passed=True, category="RATE_LIMIT",
        message=f"Rate limit OK ({len(log)}/{_RATE_LIMIT_MAX} in window)."
    )


# ── 1c. Content safety ────────────────────────────────────────────────────────

_HARMFUL_PATTERNS = [
    r'\b(how\s+to\s+(kill|bomb|shoot|poison|hack|exploit))\b',
    r'\b(make\s+(a\s+)?(bomb|weapon|explosive|poison))\b',
    r'\b(child\s+(abuse|pornography|grooming))\b',
    r'\b(drug\s+(trafficking|smuggling|synthesis))\b',
]

_LEGAL_SIGNALS = [
    'section', 'article', 'ppc', 'crpc', 'court', 'judge', 'justice',
    'bail', 'petition', 'fir', 'appeal', 'case', 'judgment', 'ruling',
    'arrest', 'detention', 'constitution', 'ordinance', 'act', 'law',
    'plaintiff', 'defendant', 'petitioner', 'respondent', 'advocate',
    'supreme court', 'high court', 'sessions', 'tribunal', 'cases',
    'find', 'search', 'what', 'why', 'how', 'when', 'who', 'did',
]


def check_content_safety(query: str) -> GuardrailResult:
    text_lower = query.lower()

    # Fast pass — strong legal signals present
    legal_hits = sum(1 for sig in _LEGAL_SIGNALS if sig in text_lower)
    if legal_hits >= 2:
        return GuardrailResult(
            passed=True, category="CONTENT_SAFETY",
            message=f"Legal signals detected ({legal_hits}), content safe."
        )

    # Hard block on harmful patterns
    for pat in _HARMFUL_PATTERNS:
        if re.search(pat, text_lower):
            return GuardrailResult(
                passed=False, category="CONTENT_SAFETY",
                severity="CRITICAL", blocked=True,
                message=(
                    "This query has been flagged as potentially harmful and cannot be processed. "
                    "Legal Sahara is designed for legitimate legal research only."
                )
            )

    # LLM check for ambiguous queries with no legal signals
    if legal_hits == 0:
        try:
            resp = _groq.chat.completions.create(
                model=_FAST_MODEL,
                messages=[{"role": "user", "content": f"""
Is this a legitimate Pakistani legal research query (case law, statutes, court judgments, legal principles)?
Or is it harmful, irrelevant, or unrelated to legal research?

QUERY: "{query[:300]}"

Return ONLY JSON: {{"is_legal_query": true/false, "reason": "one line"}}
"""}],
                response_format={"type": "json_object"},
                temperature=0,
                timeout=8,
            )
            result = json.loads(resp.choices[0].message.content)
            if not result.get("is_legal_query", True):
                return GuardrailResult(
                    passed=False, category="CONTENT_SAFETY",
                    severity="HIGH", blocked=True,
                    message=(
                        "This does not appear to be a legal research query. "
                        f"Reason: {result.get('reason', 'Non-legal content detected.')} "
                        "Please search for Pakistani Supreme Court cases, legal principles, or statutes."
                    )
                )
        except Exception as e:
            print(f"   ⚠️ Content safety LLM check failed (fail-open): {e}")

    return GuardrailResult(
        passed=True, category="CONTENT_SAFETY",
        message="Content safety check passed."
    )


# ── 1d. Language check ────────────────────────────────────────────────────────

def check_query_language(query: str) -> GuardrailResult:
    arabic_ratio = len(re.findall(r'[\u0600-\u06FF]', query)) / max(len(query), 1)
    if arabic_ratio > 0.5:
        return GuardrailResult(
            passed=True, category="QUERY_LANGUAGE",
            severity="LOW", blocked=False,
            message=(
                "Query appears to be in Arabic/Urdu script. "
                "The RAG system works best with English queries. "
                "Results will still be returned but may be less accurate."
            )
        )
    return GuardrailResult(
        passed=True, category="QUERY_LANGUAGE",
        message="Language check OK."
    )


# ─────────────────────────────────────────────────────────────────────────────
# 2. OUTPUT GUARDRAILS
# ─────────────────────────────────────────────────────────────────────────────

# ── 2a. Context insufficient check ───────────────────────────────────────────

def check_context_insufficient(result: str) -> GuardrailResult:
    if not result or not result.strip():
        return GuardrailResult(
            passed=False, category="EMPTY_RESULT",
            severity="HIGH", blocked=False,
            message="No result was generated. Please try rephrasing your query."
        )

    if "Context insufficient" in result and "Case Id: NONE" in result:
        return GuardrailResult(
            passed=False, category="CONTEXT_INSUFFICIENT",
            severity="MEDIUM", blocked=False,
            message=(
                "No relevant case was found for your query. "
                "Try rephrasing with more specific legal terms, "
                "case numbers, or judge names."
            )
        )

    return GuardrailResult(
        passed=True, category="CONTEXT_INSUFFICIENT",
        message="Result contains an answer."
    )


# ── 2b. Answer format check ───────────────────────────────────────────────────

def check_answer_format(result: str, agent_type: str) -> GuardrailResult:
    if agent_type != "qa":
        return GuardrailResult(
            passed=True, category="ANSWER_FORMAT",
            message="Case search result — format check skipped."
        )

    required = ["Selected Case:", "Answer:", "Case Id:"]
    missing  = [r for r in required if r not in result]

    if missing:
        return GuardrailResult(
            passed=False, category="ANSWER_FORMAT",
            severity="LOW", blocked=False,
            message=f"Answer format incomplete — missing: {', '.join(missing)}.",
            details={"missing_fields": missing}
        )

    return GuardrailResult(
        passed=True, category="ANSWER_FORMAT",
        message="Answer format OK."
    )


# ── 2c. Hallucination signal check ────────────────────────────────────────────

_HALLUCINATION_SIGNALS = [
    r'\bI cannot\b',
    r'\bI\'m unable\b',
    r'\bAs an AI\b',
    r'\bI don\'t have access\b',
    r'\bI apologize\b',
    r'\bmy knowledge cutoff\b',
]


def check_hallucination_signals(result: str) -> GuardrailResult:
    for pat in _HALLUCINATION_SIGNALS:
        if re.search(pat, result, re.IGNORECASE):
            return GuardrailResult(
                passed=False, category="HALLUCINATION_SIGNAL",
                severity="MEDIUM", blocked=False,
                message=(
                    "The answer contains LLM meta-commentary which may indicate "
                    "the model did not answer from the retrieved context. "
                    "Please verify this answer carefully."
                )
            )

    return GuardrailResult(
        passed=True, category="HALLUCINATION_SIGNAL",
        message="No hallucination signals detected."
    )


# ─────────────────────────────────────────────────────────────────────────────
# 3. AGGREGATED ENTRY POINTS
# ─────────────────────────────────────────────────────────────────────────────

def run_input_guardrails(query: str,
                          user_id: str = "default") -> List[GuardrailResult]:
    print("🛡️  [RAG Guardrails] Running input checks...")
    results: List[GuardrailResult] = []

    checks = [
        ("rate_limit",     lambda: check_rate_limit(user_id)),
        ("query_length",   lambda: check_query_length(query)),
        ("language",       lambda: check_query_language(query)),
        ("content_safety", lambda: check_content_safety(query)),
    ]

    for name, fn in checks:
        try:
            r = fn()
            results.append(r)
            status = "✅" if r.passed else ("🚫" if r.blocked else "⚠️")
            print(f"   {status} [{r.category}] {r.message[:80]}")
            if r.blocked:
                print(f"   ⛔ BLOCKED at {name} — halting.")
                break
        except Exception as e:
            print(f"   ⚠️  Guardrail '{name}' error (fail-open): {e}")
            results.append(GuardrailResult(
                passed=True, category=f"{name.upper()}_ERROR",
                severity="LOW", message=f"Guardrail error (skipped): {e}"
            ))

    return results


def run_output_guardrails(result: str,
                           agent_type: str = "qa") -> List[GuardrailResult]:
    print("🛡️  [RAG Guardrails] Running output checks...")
    results: List[GuardrailResult] = []

    checks = [
        ("context_insufficient", lambda: check_context_insufficient(result)),
        ("answer_format",        lambda: check_answer_format(result, agent_type)),
        ("hallucination",        lambda: check_hallucination_signals(result)),
    ]

    for name, fn in checks:
        try:
            r = fn()
            results.append(r)
            status = "✅" if r.passed else ("🚫" if r.blocked else "⚠️")
            print(f"   {status} [{r.category}] {r.message[:80]}")
        except Exception as e:
            print(f"   ⚠️  Output guardrail '{name}' error (fail-open): {e}")
            results.append(GuardrailResult(
                passed=True, category=f"{name.upper()}_ERROR",
                severity="LOW", message=f"Guardrail error (skipped): {e}"
            ))

    return results


def summarise_guardrail_results(results: List[GuardrailResult]) -> dict:
    blocked  = [r for r in results if r.blocked]
    warnings = [r for r in results if not r.passed and not r.blocked]
    passed   = [r for r in results if r.passed]

    return {
        "guardrails_passed":   len(passed),
        "guardrails_warnings": len(warnings),
        "guardrails_blocked":  len(blocked),
        "is_blocked":          bool(blocked),
        "block_reason":        blocked[0].message if blocked else None,
        "warnings":            [r.message for r in warnings],
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


print("✅ RAG guardrails ready")