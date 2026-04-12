import re
import time
import json
from langchain_core.prompts import ChatPromptTemplate
from src.drafter.state import LegalGenState
from src.rag.retrieval import _dense_search, _bm25_search_filtered, _aggregate_rrf, _expand_case
from src.drafter.templates import (
    CITATION_TIER_MAP, COURT_FORMATS, STRATEGY_TEMPLATES,
    INTERIM_RELIEF_MAP, SECTION_SEVERITY, BAIL_STRATEGY_MAP
)
from src.drafter.memory import USER_MEMORY, save_to_memory, get_memory_context
from groq import Groq
from langchain_core.output_parsers import StrOutputParser
from langchain_groq import ChatGroq
from config import GROQ_API_KEY

llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    temperature=0,
    api_key=GROQ_API_KEY
)

groq_client = Groq(api_key=GROQ_API_KEY)


def _get_collection():
    from src.shared.db import get_collection
    return get_collection()[0]


# ── CELL 3: Info Check Node ───────────────────────────────────────────────────
def check_missing_info_node(state: LegalGenState) -> dict:
    """
    Uses an LLM to robustly determine whether the user's story contains:
      1. A filer identity (name or relationship to the affected person)
      2. A name for the detained/accused person
      3. A location, police station, or authority name

    Falls back to regex only for a fast pre-check to avoid unnecessary LLM calls
    when the story is obviously complete.
    """
    print("📋 [InfoCheck] Scanning for missing details...")
    text = state["user_story"]
    tl   = text.lower()

    # ── Fast regex pre-check (if ALL three pass, skip LLM entirely) ──────────
    has_filer_fast = bool(
        re.search(r'my name is', tl) or
        re.search(r"\bi am\b|\bi'm\b", tl) or
        re.search(r'\b(lawyer|advocate|counsel|sister|brother|wife|husband|'
                  r'father|mother|son|daughter|client|relative|uncle|aunt|'
                  r'nephew|niece|friend|colleague)\b', tl)
    )
    has_person_fast = bool(
        re.search(r'\b(brother|sister|son|daughter|husband|wife|father|mother|'
                  r'client|accused|detenu|applicant|suspect|employee|worker)\b', tl) or
        re.search(r'\b(mr|mrs|ms|dr|ch|ch\.|chaudhry)\.?\s+\w+', tl) or
        len(re.findall(r'[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+', text)) >= 1
    )
    has_location_fast = bool(
        re.search(r'police\s*station', tl) or
        re.search(r'\b(karachi|lahore|islamabad|peshawar|quetta|multan|'
                  r'faisalabad|rawalpindi|hyderabad|sukkur|gujranwala|sialkot)\b', tl) or
        re.search(r'\b(gulshan|clifton|defence|dha|saddar|korangi|malir|'
                  r'orangi|landhi|johar|nazimabad|pechs|gulberg|bahria|'
                  r'fcarea|f-\d|g-\d|i-\d|e-\d|dha\s*phase)\b', tl) or
        re.search(r'\b(kbca|sbca|kmc|nha|wasa|court|authority|agency|tribunal|'
                  r'nab|fia|asi|ranger|intelligence|army|para\s*military)\b', tl) or
        re.search(r'\b(sector|block|town|district|area|road|colony|phase|'
                  r'avenue|street|thana|ps\b)\b', tl)
    )

    if has_filer_fast and has_person_fast and has_location_fast:
        print("   → Complete (fast-path): all fields found via regex")
        return {"missing_info": [], "is_complete": True, "next_step": "proceed"}

    # ── LLM-backed extraction for ambiguous / conversational text ─────────────
    resp = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": f"""
You are a Pakistani legal intake clerk. Read the user's message and decide what information
has been provided (even implicitly or conversationally).

USER MESSAGE:
\"\"\"{text}\"\"\"

Determine:
1. has_filer_identity: Has the user identified themselves by name OR stated their relationship
   to the affected person (e.g. "my brother", "I am his wife", "I am an advocate")?
   Accept ANY of: a proper name, a relational noun (brother/sister/wife/mother/father/son/
   daughter/client/lawyer/advocate/counsel/relative/friend).

2. has_affected_person: Is there a name OR relational reference for the detained/accused
   person (e.g. "my brother Hassan", "the accused Ali Khan", "my client", "him")?
   Accept a first name, full name, OR a clear relational reference like "my brother".

3. has_location: Is there ANY location, city, neighbourhood, area, police station, authority,
   or agency name mentioned? Accept city names, area names (DHA, Gulshan, Clifton, etc.),
   police station names, agency names (FIA, NAB, Rangers, Army, intelligence agencies),
   or phrases like "unknown persons suspected to be law enforcement".

Return ONLY valid JSON:
{{
  "has_filer_identity": true/false,
  "has_affected_person": true/false,
  "has_location": true/false,
  "notes": "one short line explaining your decisions"
}}
"""}],
        response_format={"type": "json_object"},
        temperature=0
    )

    result = json.loads(resp.choices[0].message.content)
    print(f"   → LLM extraction: {result.get('notes', '')}")

    missing = []
    if not result.get("has_filer_identity"):
        missing.append("your name or relationship to the affected person")
    if not result.get("has_affected_person"):
        missing.append("name of the detained or accused person")
    if not result.get("has_location"):
        missing.append("location, police station, or authority involved")

    is_complete = len(missing) == 0
    print(f"   → Complete: {is_complete} | Missing: {missing}")
    return {
        "missing_info": missing,
        "is_complete":  is_complete,
        "next_step":    "proceed" if is_complete else "ask_user",
    }


print("✅ Info check ready")


# ── Jurisdiction Selector ─────────────────────────────────────────────────────
def select_jurisdiction(petition_type: str, user_story: str, user_id: str) -> str:
    text = user_story.lower()
    mem  = USER_MEMORY.get(user_id, {})

    if any(w in text for w in ["karachi", "sindh", "gulshan", "clifton", "defence",
                                "dha karachi", "saddar", "dha", "pechs", "korangi",
                                "malir", "orangi", "landhi", "johar", "nazimabad"]):
        return "Sindh HC" if petition_type in [
            "Habeas Corpus", "Quashment", "Property/Encroachment"
        ] else "Sessions Court Karachi"

    if any(w in text for w in ["lahore", "punjab", "dha lahore", "gulberg",
                                "faisalabad", "multan", "gujranwala", "sialkot"]):
        return "Lahore HC" if petition_type in [
            "Habeas Corpus", "Quashment", "Property/Encroachment"
        ] else "Sessions Court Lahore"

    if any(w in text for w in ["islamabad", "ict", "rawalpindi", "pindi",
                                "f-6", "f-7", "g-9", "i-8", "bahria islamabad"]):
        return "Islamabad HC"

    if mem.get("preferred_court"):
        return mem["preferred_court"]

    return "Sessions Court Karachi" if petition_type in [
        "Pre-Arrest Bail", "Post-Arrest Bail"
    ] else "Sindh HC"


print("✅ Jurisdiction selector ready")


# ── Orchestrator Node ─────────────────────────────────────────────────────────
def orchestrator_node(state: LegalGenState) -> dict:
    print("🧠 [Orchestrator] Classifying case...")
    resp = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": f"""
You are a Pakistani legal classifier. Follow this STRICT decision tree:

SITUATION: "{state['user_story']}"

STEP 1: Property, shop, land, sealing, demolition, KBCA, SBCA, KMC, encroachment mentioned?
  → YES = "Property/Encroachment"

STEP 2: FIR exists AND person is already in custody/arrested?
  → YES = "Post-Arrest Bail"

STEP 3: FIR exists but person NOT yet arrested?
  → YES = "Pre-Arrest Bail"

STEP 4: Person detained/missing/picked up with NO FIR mentioned, OR whereabouts unknown,
        OR "enforced disappearance", OR picked up by unknown persons / law enforcement?
  → YES = "Habeas Corpus"

STEP 5: Want to cancel/quash an existing FIR itself?
  → YES = "Quashment"

Return ONLY JSON:
{{"petition_type": "<one of 5 above>", "reasoning": "<which step matched>"}}
"""}],
        response_format={"type": "json_object"},
        temperature=0
    )
    result = json.loads(resp.choices[0].message.content)
    p_type = result.get("petition_type", "Habeas Corpus")

    # Respect manual jurisdiction override from earlier in pipeline
    jurisdiction = state.get("jurisdiction") or select_jurisdiction(
        p_type, state["user_story"], state.get("user_id", "default")
    )

    print(f"   → Type: {p_type} | Jurisdiction: {jurisdiction}")
    return {
        "petition_type": p_type,
        "jurisdiction":  jurisdiction,
        "target_court":  COURT_FORMATS[jurisdiction]["full_name"],
        "next_step":     "rag",
    }


print("✅ Orchestrator ready")


# ── Red Flag Detector ─────────────────────────────────────────────────────────
def detect_red_flags(petition_type: str, user_story: str) -> tuple[list, str, str]:
    """Returns: (red_flags_list, severity, bail_strategy_memo)"""
    flags    = []
    severity = "LOW"
    text     = user_story.upper()

    for sec, (bail_type, description, sev) in SECTION_SEVERITY.items():
        if re.search(rf'\b{re.escape(sec)}\b', text):
            flags.append(
                f"Section {sec} PPC ({description}) is {bail_type.upper()} "
                f"— severity: {sev}. Do NOT argue it is minor."
            )
            if sev == "HIGH":
                severity = "HIGH"
            elif sev == "MEDIUM" and severity != "HIGH":
                severity = "MEDIUM"

    if petition_type == "Pre-Arrest Bail" and severity == "HIGH":
        flags.append(
            "PRE-ARREST BAIL with HIGH-severity section: "
            "must argue extraordinary circumstances + mala fide intent of complainant. "
            "Mention 'concession not right' doctrine."
        )

    if petition_type == "Post-Arrest Bail" and severity == "HIGH":
        flags.append(
            "POST-ARREST BAIL (non-bailable): invoke Section 497(2) CrPC "
            "'further inquiry' — not mere Section 497(1) twin test."
        )

    if "FIR" in text and not re.search(r'FIR\s*(NO\.?|NUMBER)?\s*\d+', text):
        flags.append("FIR mentioned but no FIR number extracted — drafter will use placeholder.")

    strategy_notes = BAIL_STRATEGY_MAP.get(severity, BAIL_STRATEGY_MAP["LOW"])
    return flags, severity, strategy_notes


def red_flag_node(state: LegalGenState) -> dict:
    print("🚨 [RedFlag] Scanning for legal landmines...")
    flags, severity, strategy = detect_red_flags(
        state.get("petition_type", ""), state.get("user_story", "")
    )
    if flags:
        print(f"   ⚠️  {len(flags)} flag(s) — severity: {severity}")
        for f in flags:
            print(f"      → {f}")
    else:
        print("   ✅ No red flags detected")
    return {
        "red_flags":      flags,
        "legal_strategy": json.dumps(strategy, ensure_ascii=False),
    }


print("✅ Red flag detector ready")


# ── Strategy Node ─────────────────────────────────────────────────────────────
def strategy_node(state: LegalGenState) -> dict:
    print("🧠 [Strategy] Generating legal strategy memo...")
    p_type    = state.get("petition_type", "Habeas Corpus")
    red_flags = state.get("red_flags", [])
    base      = STRATEGY_TEMPLATES.get(p_type, STRATEGY_TEMPLATES["Habeas Corpus"])
    full      = base + (
        "\n\nRED FLAGS TO INCORPORATE:\n" + "\n".join(f"- {f}" for f in red_flags)
        if red_flags else ""
    )
    print(f"   → Strategy loaded for: {p_type}")
    return {"legal_strategy": full}


print("✅ Strategy engine ready")


# ── Citation Helpers ──────────────────────────────────────────────────────────
def get_citation_tier(citation_str: str) -> tuple[str, int]:
    c = citation_str.upper()
    for tier, rank in CITATION_TIER_MAP.items():
        if tier in c:
            return tier, rank
    return "UNKNOWN", 99


def citation_ranker_node(state: LegalGenState) -> dict:
    print("📚 [CitationRanker] Evaluating citation authority...")
    primary   = state.get("primary_citation", "")
    secondary = state.get("supporting_citation", "")
    p_tier, p_rank = get_citation_tier(primary)
    s_tier, s_rank = get_citation_tier(secondary)
    issues = []

    if p_rank >= 5:
        issues.append(
            f"Primary citation '{primary}' is {p_tier} (rank {p_rank}/5) — "
            f"CPLA is a petition for leave, NOT a judgment. Replace with PLD or SCMR."
        )
    if s_rank >= 5:
        issues.append(
            f"Supporting citation '{secondary}' is {s_tier} — weak. Prefer PLD/SCMR."
        )
    if p_tier == s_tier and p_tier != "UNKNOWN":
        issues.append(
            f"Both citations are {p_tier} — diversify with one SCMR + one PLD."
        )

    if issues:
        print(f"   ⚠️  Citation issues:")
        for i in issues:
            print(f"      → {i}")
    else:
        print(f"   ✅ Primary: {p_tier} (rank {p_rank}) | Supporting: {s_tier} (rank {s_rank})")

    warning = "\n".join(issues)
    return {
        "citation_tier":    p_tier,
        "validation_notes": state.get("validation_notes", "") + (
            "\n" + warning if warning else ""
        ),
    }


print("✅ Citation ranker ready")


# ── RAG Nodes ─────────────────────────────────────────────────────────────────
def rag_primary_node(state: LegalGenState) -> dict:
    collection = _get_collection()
    attempts   = state.get("rag_attempts", 0)
    print(f"🔎 [RAG Primary] Attempt {attempts + 1}...")
    p_type = state.get("petition_type", "")

    if attempts == 0:
        query = state["user_story"]
    elif attempts == 1:
        query = f"{p_type} illegal arrest without warrant Pakistan Supreme Court"
    else:
        query = "fundamental rights Article 9 10A Constitution Pakistan detention"

    results = collection.query(query_texts=[query], n_results=3)

    if not results["documents"] or not results["documents"][0]:
        return {
            "primary_context":  "No precedent found.",
            "primary_citation": "Articles 9 & 10A Constitution of Pakistan 1973",
            "rag_attempts":     attempts + 1,
            "next_step":        "rag_secondary",
        }

    best_doc  = results["documents"][0][0]
    best_meta = results["metadatas"][0][0]
    citation  = best_meta.get("case_id", "Unknown")

    rel_resp = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": f"""
Is this case relevant to the user's situation?
USER: {state['user_story'][:300]}
CASE SUMMARY: {best_doc[:400]}
PETITION TYPE: {p_type}
Return ONLY JSON: {{"is_relevant": true/false, "reason": "one line"}}
"""}],
        response_format={"type": "json_object"},
        temperature=0
    )
    rel = json.loads(rel_resp.choices[0].message.content)

    if not rel.get("is_relevant") and attempts < 2:
        print(f"   ⚠️ Not relevant ({rel.get('reason')}) — retrying...")
        return {
            "primary_context":  "",
            "primary_citation": "",
            "rag_attempts":     attempts + 1,
            "next_step":        "rag_retry",
        }

    print(f"   → Primary: {citation}")
    return {
        "primary_context":  best_doc,
        "primary_citation": citation,
        "rag_attempts":     attempts + 1,
        "next_step":        "rag_secondary",
    }


def rag_secondary_node(state: LegalGenState) -> dict:
    collection = _get_collection()
    print("🔎 [RAG Secondary] Finding supporting authority...")
    p_type = state.get("petition_type", "")
    secondary_queries = {
        "Habeas Corpus":         "Article 9 liberty illegal detention writ habeas corpus warrant",
        "Post-Arrest Bail":      "Section 497 CrPC bail grant factors surety investigation incomplete",
        "Pre-Arrest Bail":       "Section 498 CrPC pre-arrest bail anticipatory mala fide FIR",
        "Quashment":             "Article 199 quashment FIR mala fide abuse process court",
        "Property/Encroachment": "Article 10A 23 natural justice notice hearing sealing property rights",
    }
    query   = secondary_queries.get(p_type, "fundamental rights Constitution Pakistan")
    results = collection.query(query_texts=[query], n_results=5)

    if not results["documents"] or not results["documents"][0]:
        return {
            "supporting_context":  "General constitutional principles apply.",
            "supporting_citation": "Constitution of Pakistan 1973",
        }

    primary_cit = state.get("primary_citation", "")
    for i in range(len(results["documents"][0])):
        cit = results["metadatas"][0][i].get("case_id", "")
        if cit != primary_cit:
            print(f"   → Supporting: {cit}")
            return {
                "supporting_context":  results["documents"][0][i],
                "supporting_citation": cit,
            }

    # Fallback to first result
    cit = results["metadatas"][0][0].get("case_id", "Constitution of Pakistan")
    return {
        "supporting_context":  results["documents"][0][0],
        "supporting_citation": cit,
    }


print("✅ RAG nodes ready")


# ── Extractor Node ────────────────────────────────────────────────────────────
def extract_fields_node(state: LegalGenState) -> dict:
    print("📝 [Extractor] Pulling structured fields...")
    resp = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": f"""
You are a Pakistani legal drafter. Extract and generate structured petition fields.

STORY: {state['user_story']}
PETITION TYPE: {state.get('petition_type', '')}
PRIMARY CITATION: {state.get('primary_citation', '')}
SUPPORTING CITATION: {state.get('supporting_citation', '')}

RULES:
- Extract ONLY names that appear in the STORY. Do not invent names.
- facts: 3-4 short factual paragraphs starting with "That". Pure facts only, no law.
- grounds: 6+ lettered grounds (A. Because...). Each must cite a law, article, or case.
  Reference PRIMARY CITATION explicitly in at least 2 grounds.
- prayer: specific numbered prayers matching the petition type.
- No repetition between facts and grounds.

Return ONLY valid JSON with these exact keys:
{{
  "petitioner_name": "...",
  "detenu_name": "...",
  "facts": ["That ...", "That ...", "That ..."],
  "grounds": ["A. Because ...", "B. Because ...", "C. Because ...", ...],
  "prayer": "..."
}}
"""}],
        response_format={"type": "json_object"},
        temperature=0
    )
    result       = json.loads(resp.choices[0].message.content)
    facts_list   = result.get("facts", [])
    grounds_list = result.get("grounds", [])
    return {
        "petitioner":   result.get("petitioner_name", "The Petitioner"),
        "detenu":       result.get("detenu_name",     "The Affected Person"),
        "facts_text":   "\n\n".join(facts_list),
        "grounds_text": "\n\n".join(grounds_list),
        "prayer":       result.get("prayer", "Grant the relief prayed for."),
    }


print("✅ Extractor updated — FACTS and GROUNDS now separate")


# ── Interim Relief Node ───────────────────────────────────────────────────────
def interim_relief_node(state: LegalGenState) -> dict:
    print("⚡ [InterimRelief] Injecting urgency prayers...")
    p_type = state.get("petition_type", "Habeas Corpus")
    relief = INTERIM_RELIEF_MAP.get(p_type, INTERIM_RELIEF_MAP["Habeas Corpus"])
    print(f"   → Interim relief injected for: {p_type}")
    return {"interim_relief": relief}


print("✅ Interim relief injector ready")


# ── Drafter Node ──────────────────────────────────────────────────────────────
def drafter_node(state: LegalGenState) -> dict:
    p_type       = state.get("petition_type", "Habeas Corpus")
    jurisdiction = state.get("jurisdiction", "Sindh HC")
    court_info   = COURT_FORMATS.get(jurisdiction, COURT_FORMATS["Sindh HC"])

    print(f"✍️ [Drafter] Writing {p_type} — {jurisdiction}...")

    petitioner     = state.get("petitioner")     or "The Petitioner"
    detenu         = state.get("detenu")          or "The Affected Person"
    facts_text     = state.get("facts_text")      or "That the detention is illegal and without lawful authority."
    grounds_text   = state.get("grounds_text")    or "A. Because the detention is in violation of Article 9 of the Constitution."
    prayer         = state.get("prayer")          or "Grant the relief prayed for."
    primary_cit    = state.get("primary_citation")    or "the Supreme Court"
    supporting_cit = state.get("supporting_citation") or "the Supreme Court"
    court_header   = court_info["full_name"]
    home_sec       = court_info["home_sec"]
    ag             = court_info["ag"]
    user_story     = state.get("user_story", "")
    legal_strategy = state.get("legal_strategy", "")
    red_flags      = state.get("red_flags", [])
    interim_relief = state.get("interim_relief", "")
    citation_tier  = state.get("citation_tier", "UNKNOWN")

    loc_match = re.search(r'([\w\-\s]+ police station)', user_story, re.IGNORECASE)
    location  = loc_match.group(0).strip() if loc_match else "the concerned Police Station"

    story_lower = user_story.lower()
    if "kbca" in story_lower or "sbca" in story_lower:
        authority = "Sindh Building Control Authority (SBCA)"
    elif "kmc" in story_lower:
        authority = "Karachi Metropolitan Corporation (KMC)"
    else:
        authority = "The Concerned Authority"

    header_map = {
        "Habeas Corpus": f"""{court_header}

Writ Petition No. ___/2026 (Habeas Corpus)
Under Article 199(1)(b)(i) of the Constitution of Pakistan, 1973

{petitioner}                                       ...Petitioner
Versus
1. Station House Officer, {location}
2. {home_sec}
3. {ag}                                            ...Respondents

HABEAS CORPUS PETITION""",

        "Post-Arrest Bail": f"""{court_header}

Crl. Misc. Application No. ___/2026
Under Section 497, Code of Criminal Procedure, 1898
[Section 497(2) CrPC — Further Inquiry]

{detenu} (Applicant/Accused)                       ...Applicant
Versus
The State                                          ...Respondent

APPLICATION FOR POST-ARREST BAIL""",

        "Pre-Arrest Bail": f"""{court_header}

Crl. Misc. Application No. ___/2026
Under Section 498, Code of Criminal Procedure, 1898

{petitioner} (Applicant/Accused)                   ...Applicant
Versus
The State                                          ...Respondent

APPLICATION FOR PRE-ARREST BAIL
[Extraordinary Relief — Concession Not Right]""",

        "Quashment": f"""{court_header}

Writ Petition No. ___/2026
Under Article 199 of the Constitution of Pakistan, 1973

{petitioner}                                       ...Petitioner
Versus
1. Station House Officer, {location}
2. The State
3. The Complainant                                 ...Respondents

CONSTITUTIONAL PETITION (QUASHMENT OF FIR)""",

        "Property/Encroachment": f"""{court_header}

Writ Petition No. ___/2026
Under Articles 199, 23 & 10A of the Constitution of Pakistan, 1973
Read with Sindh Building Control Ordinance, 1979

{petitioner}                                       ...Petitioner
Versus
1. {authority}
2. Province of Sindh                               ...Respondents

CONSTITUTIONAL PETITION
[Impugned: Sealing/Demolition Order — Stay Urgently Sought]""",
    }

    header = header_map.get(p_type, header_map["Habeas Corpus"])

    extra_map = {
        "Habeas Corpus": f"""G. Because Article 9 of the Constitution categorically provides that no person shall be deprived of life or liberty save in accordance with law. The detention herein is mala fide and without lawful authority — a patent violation.

H. Because Article 10 of the Constitution and Section 61 Cr.P.C. mandate that every arrested person be produced before a Magistrate within 24 hours. No such production has taken place, rendering the continued detention wholly illegal.

I. Because the arresting officers were plain-clothes personnel whose identity, rank, and legal authority to arrest have not been disclosed — an additional badge of illegality attaching to the impugned detention.

J. Because this Honourable Court, in exercise of its constitutional jurisdiction under Article 199, is not only empowered but duty-bound to protect fundamental rights and issue a writ of Habeas Corpus. Reliance is placed on {supporting_cit}. The Respondents must be directed to produce the detenu, submit para-wise comments, and intimate this Court of the place of detention forthwith.""",

        "Post-Arrest Bail": f"""G. Because the instant case requires "further inquiry" within the meaning of Section 497(2) CrPC — the evidence on record is contradictory, the role of the Applicant is not specifically established, and a deeper examination of the material is imperative before any adverse conclusion can be drawn.

H. Because as held consistently by the Supreme Court, including in {supporting_cit}, bail is the rule and jail is the exception, and punitive incarceration before conviction strikes at the root of Article 10A of the Constitution which guarantees the right to a fair trial.

I. Because the Applicant has no previous criminal antecedents, has deep family roots in the community, and is not a flight risk — satisfying both limbs of the conventional twin-test for bail under Section 497(1) CrPC.

J. Because no direct incriminating evidence has been placed on record. The Applicant's continued detention is causing irreparable harm to his family, livelihood, and is serving no investigative purpose at this stage.""",

        "Pre-Arrest Bail": f"""G. Because the FIR was registered with an inordinate and unexplained delay, which in itself is a strong inference of mala fide intent and an afterthought designed to harass, coerce, and humiliate the Applicant in a dispute that is civil and personal in nature.

H. Because pre-arrest bail is an extraordinary concession — not a right — and is warranted where, as here, the complainant has an ulterior motive, the FIR is an abuse of the criminal process, and the Applicant is willing to fully cooperate with investigation.

I. Because arrest at this stage would cause irreparable reputational harm, financial loss, and emotional trauma to the Applicant and his family, with no corresponding benefit to the investigation whatsoever.

J. Because as held in {supporting_cit}, this Honourable Court grants pre-arrest bail where the risk of abuse of process and misuse of criminal law in a personal or commercial dispute is apparent on the face of the record.""",

        "Quashment": f"""G. Because this Honourable Court exercises plenary jurisdiction under Article 199 of the Constitution to quash any FIR that, on its face, does not disclose the essential ingredients of the alleged offence, or has been lodged with mala fide intent as an abuse of the process of law.

H. Because the facts alleged in the impugned FIR, even if taken at their highest and accepted in entirety, do not disclose the commission of the offence set out therein. No cognizable offence is made out on the face of the FIR.

I. Because the complainant and the Petitioner are involved in an ongoing civil/personal dispute, and the FIR is a transparent attempt to convert a civil matter into a criminal complaint and to use police machinery as a tool of coercion.

J. Because permitting the impugned FIR to continue would cause irreparable prejudice and stigma, and as held in {supporting_cit}, the Supreme Court has consistently held that mala fide FIRs must be quashed at the earliest stage to prevent further abuse of the criminal justice system.""",

        "Property/Encroachment": f"""G. Because Article 23 of the Constitution of Pakistan, 1973, guarantees every citizen the right to acquire, hold, and dispose of property — a right being arbitrarily, illegally, and forcibly violated by the Respondents without any lawful authority.

H. Because Article 10A of the Constitution guarantees the right to a fair trial and due process, including the right to be heard and given notice before any adverse action is taken. The Respondents issued the impugned order without any prior notice or opportunity to be heard — a flagrant violation of the audi alteram partem principle.

I. Because the Sindh Building Control Ordinance, 1979 prescribes a mandatory statutory procedure — including show-cause notice, inquiry, and order — before any sealing or demolition can be effected. No such procedure was followed, rendering the impugned order void ab initio.

J. Because as held in {supporting_cit}, regulatory authorities cannot act in excess of their statutory mandate, and any order made in violation of mandatory procedural requirements and without hearing the affected party is void and of no legal effect whatsoever.""",
    }

    extra = extra_map.get(p_type, "")

    red_flag_block = ""
    if red_flags:
        red_flag_block = (
            f"\nCRITICAL RED FLAGS — STRICTLY OBSERVE:\n"
            + "\n".join(f"  ⚠️ {f}" for f in red_flags)
            + f"\n\nCITATION AUTHORITY WARNING:\nPrimary citation tier: {citation_tier}\n"
            + ("⚠️ CPLA citations are petitions for leave — NOT judgments. Use PLD/SCMR."
               if citation_tier == "CPLA" else "✅ Citation tier is acceptable.")
        )

    verification = f"""VERIFICATION

I, {petitioner}, do hereby solemnly affirm and declare that the contents of this petition are true and correct to the best of my knowledge and belief, that nothing material has been concealed, and that the petition is filed bona fide.

Sworn at {court_info['city']} on this _____ day of __________, 2026.

                                         _______________________
                                         {petitioner}
                                         Deponent

Through Counsel:
_______________________
Advocate, {court_info['short']}
Enrollment No.: _______
Cell: _________________"""

    prompt = f"""
You are a Senior Advocate of the {court_info['short']} with 20 years of experience.

Write a complete, court-ready petition using EXACTLY the structure below.
Do NOT add disclaimers. Do NOT write "sample" or "draft". Do NOT change names or citations.
Use sharp, urgent, formal Pakistani court language. This is a live writ court.

═══════════════════════════════════════════════════════
{header}

Most Respectfully Sheweth:

FACTS

{facts_text}

GROUNDS

{grounds_text}

{extra}

PRAYER

It is therefore most respectfully prayed that this Honourable Court may be pleased to:

{prayer}

INTERIM/URGENT PRAYER

It is further prayed that in the interim, pending final adjudication:

{interim_relief}

{verification}
═══════════════════════════════════════════════════════

LEGAL STRATEGY MEMO (follow this — do not reproduce in petition):
{legal_strategy}

{red_flag_block}

CRITICAL DRAFTING RULES:
1. FACTS and GROUNDS must be clearly separated — never merge them.
2. Use ONLY names: petitioner = "{petitioner}", detenu/accused = "{detenu}".
3. Reference "{primary_cit}" by name in AT LEAST 2 grounds with a specific proposition.
4. "{primary_cit}" is {citation_tier} — {"NOTE: argue from principle, not just from the CPLA number. State the legal proposition the court held." if citation_tier == "CPLA" else "use it as authority for a specific legal proposition."}
5. Grounds follow lettered format: A. Because... B. Because... etc. (minimum 8 grounds).
6. Tone must be urgent and forceful — "mala fide", "without lawful authority", "patent violation".
7. No repetition — each ground makes a DISTINCT legal point.
8. Include the INTERIM/URGENT PRAYER section verbatim as drafted above.
9. The Property petition must cite Sindh Building Control Ordinance 1979 + SBCA (not KBCA).
10. Write the complete petition now:
"""
    chain = ChatPromptTemplate.from_template("{text}") | llm | StrOutputParser()
    draft = chain.invoke({"text": prompt})
    return {"final_petition": draft}


print("✅ Drafter ready")


# ── Validator Node ────────────────────────────────────────────────────────────
def validator_node(state: LegalGenState) -> dict:
    print("✅ [Validator] Checking petition quality...")
    p_type   = state.get("petition_type", "")
    citation = state.get("primary_citation", "")
    petition = state.get("final_petition", "")[:3000]
    story    = state.get("user_story", "")
    names_in_story = re.findall(r'[A-Z][a-z]+ [A-Z][a-z]+', story)

    resp = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": f"""
You are a senior judge's clerk reviewing a Pakistani court petition.

PETITION TYPE: {p_type}
PRIMARY CITATION: {citation}
NAMES FROM STORY: {names_in_story}

PETITION TEXT:
{petition}

Score each dimension 0-10:
1. structure_score: Are FACTS, GROUNDS, and PRAYER clearly separated as distinct sections?
2. citation_score: Is "{citation}" named in GROUNDS and tied to a specific legal proposition?
3. grounds_count: How many lettered grounds exist (A., B., C., ...)? Return the COUNT as integer.
4. redundancy_score: Is each ground making a DISTINCT point with NO repetition? (10 = fully distinct)
5. tone_score: Is the language sharp, urgent, formal Pakistani court language? (10 = excellent)
6. no_hallucinated_names: Are all person names in petition found in NAMES FROM STORY or standard titles? true/false

is_valid: true if structure_score >= 7 AND citation_score >= 6 AND grounds_count >= 5
overall: weighted average (structure 30% + citation 25% + redundancy 25% + tone 20%)
issues: list ONLY real problems, empty array if none

Return ONLY valid JSON:
{{
  "structure_score": 0,
  "citation_score": 0,
  "grounds_count": 0,
  "redundancy_score": 0,
  "tone_score": 0,
  "no_hallucinated_names": true,
  "is_valid": false,
  "overall": 0.0,
  "issues": [],
  "notes": "one line"
}}
"""}],
        response_format={"type": "json_object"},
        temperature=0
    )

    result         = json.loads(resp.choices[0].message.content)
    is_valid       = result.get("is_valid", False)
    revision_count = state.get("revision_count", 0)
    issues         = [i for i in result.get("issues", []) if i]

    print(f"   → Valid: {is_valid} | Overall: {result.get('overall', 0):.1f}/10")
    if issues:
        print(f"   → Issues: {issues}")

    base = {
        "validation_score":      int(result.get("overall", 0) * 10),
        "eval_structure_score":  result.get("structure_score", 0),
        "eval_citation_score":   result.get("citation_score", 0),
        "eval_grounds_count":    result.get("grounds_count", 0),
        "eval_redundancy_score": result.get("redundancy_score", 0),
        "eval_tone_score":       result.get("tone_score", 0),
        "eval_overall_score":    result.get("overall", 0.0),
        "eval_issues":           issues,
        "eval_timestamp":        time.strftime("%Y-%m-%d %H:%M:%S"),
    }

    if not is_valid and revision_count < 1:
        print("   ⚠️ Sending for revision...")
        return {
            **base,
            "is_valid":         False,
            "validation_notes": "\n".join(issues),
            "revision_count":   revision_count + 1,
            "next_step":        "revise",
        }

    return {
        **base,
        "is_valid":         True,
        "validation_notes": result.get("notes", "Approved."),
        "revision_count":   revision_count,
        "next_step":        "done",
    }


print("✅ Validator ready")


# ── Revision Node ─────────────────────────────────────────────────────────────
def revision_node(state: LegalGenState) -> dict:
    print("🔧 [Revision] Fixing validator issues...")
    issues = state.get("validation_notes", "No specific issues noted.")
    prompt = f"""
You are a Senior Pakistani Advocate. Revise this petition to fix the issues noted below.

ISSUES TO FIX:
{issues}

STRUCTURE REQUIREMENT — the petition MUST have these three clearly labelled sections:
FACTS      → factual paragraphs starting with "That", no legal argument
GROUNDS    → lettered grounds A. Because... B. Because... citing articles and cases
PRAYER     → numbered reliefs sought

ORIGINAL PETITION:
{state.get('final_petition', '')}

RULES:
- Fix ONLY the listed issues
- Keep all citations and article references
- Ensure FACTS / GROUNDS / PRAYER are clearly separated
- Do NOT add disclaimers
- Return the complete revised petition only
"""
    chain   = ChatPromptTemplate.from_template("{text}") | llm | StrOutputParser()
    revised = chain.invoke({"text": prompt})
    return {"final_petition": revised}


print("✅ Revision node ready")
