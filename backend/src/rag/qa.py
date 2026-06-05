
import re
import json
from typing import List, Dict, Optional
import google.generativeai as genai
from groq import Groq
from config import GROQ_API_KEY, GOOGLE_API_KEY
from src.rag.retrieval import _normalize_filter_values, _format_chroma_filter
import google.generativeai as genai


groq_client = Groq(api_key=GROQ_API_KEY)
genai.configure(api_key=GOOGLE_API_KEY)
gemini_model = genai.GenerativeModel("gemini-2.5-flash")

# ============================================
# FORMATTERS
# ============================================

def _format_context_for_llm(chunks: List[Dict]) -> str:
    context = ""
    for i, ch in enumerate(chunks):
        m = ch["metadata"]
        context += (
            f"### DATA_BLOCK_{i}\n"
            f"CASE_ID: {m.get('case_id')}\n"
            f"TEXT:\n{ch['text']}\n"
            f"### END_BLOCK_{i}\n\n"
        )
    return context

def _format_context_for_verifier(chunks: List[Dict]) -> str:
    context = ""
    for i, ch in enumerate(chunks):
        context += f"""
[CONTEXT_BLOCK_{i}]
CASE_ID: {ch['metadata'].get('case_id')}
TEXT:
{ch['text']}
[END_CONTEXT_BLOCK_{i}]
"""
    return context

# ============================================
# LLM CALLS
# ============================================
def _call_groq_json(prompt: str, system: str = None) -> dict:
    """Call Groq and parse JSON response reliably."""
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    
    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        response_format={"type": "json_object"},
        temperature=0
    )
    return json.loads(response.choices[0].message.content)

def _call_groq_text(prompt: str, system: str = None) -> str:
    """Call Groq and return plain text response."""
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    
    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        temperature=0
    )
    return response.choices[0].message.content.strip()

def _parse_legal_query(user_query: str) -> dict:
    system = """You are a Pakistan Legal Research Assistant. Convert user queries into a JSON object for a hybrid search system.

CLASSIFICATION RULES:
1. PURE METADATA: If the user searches for a specific person (Justice/Judge), use metadata_filter and keep semantic_query brief.
2. HYBRID: If the user specifies a topic AND a year/judge/party, use both fields.
3. PURE SEMANTIC: For legal concepts, leave metadata_filter as null and expand semantic_query with legal synonyms.

DATA FORMATS:
- Years: Must be strings ending in .0 (e.g. 2023.0)
- Judges: Use formal titles (e.g. MR. JUSTICE YAHYA AFRIDI)
- Case Types: Crl.A (Criminal Appeal), C.A (Civil Appeal), C.P (Constitutional Petition)

METADATA FILTER FIELDS:
- year: e.g. "2023.0"
- judges: e.g. "YAHYA AFRIDI"
- case_type: e.g. "C.A", "Crl.A"
- petitioner: ONLY if query explicitly names the party filing the case (e.g. "Dawood Investment Bank", "Sardar Khan")
- respondent: ONLY if query explicitly names the opposing party

STRICT RULES:
- DO NOT include case_id in metadata_filter
- DO NOT invent or assume party names not explicitly stated in the query
- DO NOT add petitioner/respondent unless the query contains a specific person or organization name as a party
- If a name appears in the query but you are unsure if they are petitioner or respondent, put them in petitioner only

EXAMPLES:
Query: "Section 302 PPC murder cases"
Response: {"semantic_query": "Section 302 PPC murder qatl-i-amd homicide conviction", "metadata_filter": null}

Query: "Recent tax cases from 2023"
Response: {"semantic_query": "tax taxation revenue FBR customs", "metadata_filter": {"year": "2023.0"}}

Query: "Cases by Justice Munib Akhtar"
Response: {"semantic_query": "Justice Munib Akhtar", "metadata_filter": {"judges": "MR. JUSTICE MUNIB AKHTAR"}}

Query: "Cases involving Dawood Investment Bank"
Response: {"semantic_query": "Dawood Investment Bank financial institution case", "metadata_filter": {"petitioner": "Dawood Investment Bank"}}

Query: "Cases where Sardar Khan was acquitted"
Response: {"semantic_query": "acquittal conviction overturned jail petition", "metadata_filter": {"petitioner": "Sardar Khan"}}

Query: "What did the court rule about property rights in 2022?"
Response: {"semantic_query": "property rights ownership title inheritance dispute 2022", "metadata_filter": {"year": "2022.0"}}

Return ONLY a JSON object with keys: semantic_query, metadata_filter"""

    result = _call_groq_json(
        f"Query: {user_query}",
        system=system
    )
    print(f"  🔍 Parsed intent: {result}")

    raw_filter = result.get("metadata_filter")
    normalized_filter = _normalize_filter_values(raw_filter)
    chroma_filter = _format_chroma_filter(normalized_filter)

    print(f"  normalized_filter: {normalized_filter}")
    print(f"  chroma_filter: {chroma_filter}")
    print(f"  bm25_filter: {normalized_filter}")

    return {
        "semantic_query": result.get("semantic_query", user_query),
        "metadata_filter": chroma_filter,
        "bm25_filter": normalized_filter
    }

def _detect_case_reference(query: str) -> Optional[str]:
    prompt = f"""You are analyzing a legal query to detect case number references.

Query: {query}

Does this query mention a SPECIFIC case number?

Common formats to recognize:
- "Civil Appeal No. 875 of 2017" → C.A.875_2017
- "Criminal Appeal No. 456 of 2018" → Crl.A.456_2018
- "C.A.123-2020" → C.A.123_2020
- "Crl.P.L.A.645-L_2025" → Crl.P.L.A.645-L_2025 (preserve -L, -K, -P suffixes)
- "Civil Petition No. 123 of 2019" → C.P.L.A.123_2019

IMPORTANT: Preserve any suffixes like -L (Lahore), -K (Karachi), -P (Peshawar) exactly as written.
Normalized format: [TYPE].[NUMBER]_[YEAR] or [TYPE].[NUMBER]-[SUFFIX]_[YEAR]

Respond with ONLY this JSON:
{{"has_case_id": true, "case_id": "Crl.P.L.A.645-L_2025"}}
OR
{{"has_case_id": false, "case_id": null}}"""

    try:
        response = gemini_model.generate_content(
            prompt,
            generation_config={"temperature": 0}
        )
        cleaned = re.sub(r"```json|```", "", response.text).strip()
        result = json.loads(cleaned)
        return result.get("case_id") if result.get("has_case_id") else None
    except Exception as e:
        print(f"  ⚠️ detect_case_reference failed: {e}, returning None")
        return None

def _rewrite_query(query: str) -> str:
    system = """You are a legal research expert. Rewrite queries to improve retrieval from a Pakistani Supreme Court case database.

RULES:
1. PRESERVE EXACTLY: Any case numbers (e.g. C.A.875_2017)
2. PRESERVE: Question format (What/Why/How/Did/When)
3. PRESERVE: Specific names, judges, locations, parties
4. ADD: English legal synonyms and related terms only
5. ADD: Expanded abbreviations (PPC → Pakistan Penal Code, ECP → Election Commission of Pakistan)
6. DO NOT: Add Urdu translations
7. DO NOT: Make it a keyword dump
8. Keep rewritten query under 30 words if possible

Return ONLY the rewritten query as plain text, no explanation."""

    return _call_groq_text(
        f"Original query: {query}",
        system=system
    )

def _generate_answer(query: str, chunks: List[Dict]) -> str:
    context = _format_context_for_llm(chunks)

    # Truncate context if too large
    max_context_chars = 8000
    if len(context) > max_context_chars:
        context = context[:max_context_chars]
        print(f"  ⚠️ Context truncated to {max_context_chars} chars")

    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": """You are an Expert Legal Research Assistant answering questions about Pakistani Supreme Court case law.

STRICT PROCEDURE (MANDATORY):
1. Identify which CASE_ID is most relevant to the question.
2. If no block from any single case answers the query output Context insufficient.
3. Answer using ONLY blocks that belong to that ONE case_id.
   You may combine information from multiple blocks of the same case if needed.

IMPORTANT:
- Do NOT use blocks from different cases.
- Do NOT make up information not present in the blocks.
- Legal implication is sufficient, verbatim wording not required.

MANDATORY RESPONSE FORMAT (NO DEVIATION):

Selected Case: [CASE_ID]

Answer: [Clear legal answer in your own words]

Case Id: [CASE_ID]

Relevant chunks: [Exact sentence(s) from the selected blocks supporting the answer]

FAILURE CONDITION:
- If you cannot find a relevant case respond exactly with:
Answer: Context insufficient
Case Id: NONE
Relevant chunks: NONE"""
            },
            {
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion: {query}"
            }
        ],
        temperature=0
    )
    return response.choices[0].message.content.strip()
def _generate_answer(query: str, chunks: List[Dict]) -> str:
    context = _format_context_for_llm(chunks)

    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": """You are an Expert Legal Research Assistant answering questions about Pakistani Supreme Court case law.

STRICT PROCEDURE (MANDATORY):
1. Identify which CASE_ID is most relevant to the question.
2. If no block from any single case answers the query → output "Context insufficient".
3. Answer using ONLY blocks that belong to that ONE case_id.
   You may combine information from multiple blocks of the same case if needed.

IMPORTANT:
- Do NOT use blocks from different cases.
- Do NOT make up information not present in the blocks.
- Legal implication is sufficient — verbatim wording not required.

MANDATORY RESPONSE FORMAT (NO DEVIATION):

Selected Case: [CASE_ID]

Answer: [Clear legal answer in your own words]

Case Id: [CASE_ID]

Relevant chunks: [Exact sentence(s) from the selected blocks supporting the answer]

FAILURE CONDITION:
- If you cannot find a relevant case, respond exactly with:
Answer: Context insufficient
Case Id: NONE
Relevant chunks: NONE"""
            },
            {
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion: {query}"
            }
        ],
        temperature=0
    )
    return response.choices[0].message.content.strip()

def _verify_with_gemini(query: str, answer: str, chunks: List[Dict]) -> bool:
    try:
        ans_part = answer.split("Answer:", 1)[1].split("Case Id:", 1)[0].strip()
    except:
        print("❌ Could not parse answer format")
        return False

    full_context_text = _format_context_for_verifier(chunks)

    verification_prompt = f"""You are verifying if a legal answer is grounded in the provided case law context.

QUESTION:
{query}

PROPOSED ANSWER:
{ans_part}

CONTEXT BLOCKS (all from the SAME case):
{full_context_text}

VERIFICATION STEPS (follow in strict order):

STEP 1 — CASE RELEVANCE CHECK (mandatory gate):
- Extract ALL specific entities from the QUESTION: people, judges, organizations, case numbers
- Check if these entities appear anywhere in the context blocks
- If ANY key entity from the question is missing from ALL blocks → verdict is NO, STOP

STEP 2 — ANSWER GROUNDING CHECK (only if Step 1 passes):
- Check if the proposed answer is supported by the context blocks
- Paraphrasing is acceptable — look for substance, not exact wording
- The answer is NOT supported if:
  * The blocks contradict the answer
  * The answer makes specific claims not found anywhere in the blocks

CRITICAL RULES:
- These are blocks from ONE case only — if the question is about a different case, verdict is NO
- A legally correct answer from the wrong case is WRONG — verdict is NO
- Both steps must pass for verdict to be YES

Respond with ONLY this JSON (no explanation):
{{"verdict": "YES"}} or {{"verdict": "NO"}}"""

    try:
        response = gemini_model.generate_content(
            verification_prompt,
            generation_config={"temperature": 0}
        )
        cleaned = re.sub(r"```json|```", "", response.text).strip()
        result = json.loads(cleaned)
        verdict = result.get("verdict", "NO")
        print(f"  ✅ VERDICT: {verdict}")
        return verdict == "YES"
    except Exception as e:
        print(f"  ❌ Verification error: {e}")
        return False

print("✅ Retrieval & QA functions ready")

def _evaluate_answer(query: str, answer: str, chunks: List[Dict], rrf_score: float, sources_matched: list) -> dict:
    """
    Evaluate a verified QA answer on faithfulness, relevance, completeness.
    Single Groq call. Only called after verification passes.
    """
    context = _format_context_for_llm(chunks)
    max_context_chars = 6000
    if len(context) > max_context_chars:
        context = context[:max_context_chars]

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": """You are evaluating a legal QA answer. Score each dimension 0-10.

faithfulness: Is every claim in the answer directly supported by the context chunks? Penalise any claim not traceable to the chunks.
relevance: Does the answer directly address what the question is asking? Penalise off-topic content.
completeness: Does the answer cover all aspects of the question given the available context?

Return ONLY valid JSON with exactly these keys:
{"faithfulness": 0, "relevance": 0, "completeness": 0}"""
                },
                {
                    "role": "user",
                    "content": f"QUESTION:\n{query}\n\nANSWER:\n{answer}\n\nCONTEXT:\n{context}"
                }
            ],
            response_format={"type": "json_object"},
            temperature=0
        )
        scores = json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"  ⚠️ Evaluation call failed: {e}")
        scores = {"faithfulness": 0, "relevance": 0, "completeness": 0}

    # Retrieval score — convert RRF score to percentage
    # RRF scores typically range 0.01–0.06, cap at 0.06 for 100%
    retrieval_pct = min(round((rrf_score / 0.06) * 100), 100)

    try:
        retrieval_pct = min(round((rrf_score / 0.06) * 100), 100)
        print('rreturing scoresssss')
        return {
            "retrieval_score":  retrieval_pct,
            "sources_matched":  "BOTH" if len(sources_matched) == 2 else (sources_matched[0] if sources_matched else "UNKNOWN"),
            "faithfulness":     int(scores.get("faithfulness", 0)),
            "relevance":        int(scores.get("relevance", 0)),
            "completeness":     int(scores.get("completeness", 0)),
        }
    except Exception as e:
        print(f"DEBUG return block crashed: {e}")
        import traceback; traceback.print_exc()
        return {}
