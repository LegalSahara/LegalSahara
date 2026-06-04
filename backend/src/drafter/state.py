from typing import TypedDict, List, Optional, Any


class LegalGenState(TypedDict):
    # ── Core input ────────────────────────────────────────────────────────────
    user_story:          str
    user_id:             str

    # ── Jurisdiction / court ──────────────────────────────────────────────────
    jurisdiction:        str
    target_court:        str

    # ── Info-check ────────────────────────────────────────────────────────────
    is_complete:         bool
    missing_info:        List[str]

    # ── Classification ────────────────────────────────────────────────────────
    petition_type:       str
    next_step:           str

    # ── RAG retrieval ─────────────────────────────────────────────────────────
    primary_context:     str
    primary_citation:    str
    supporting_context:  str
    supporting_citation: str
    rag_attempts:        int

    # ── Red-flag & strategy ───────────────────────────────────────────────────
    red_flags:           List[str]
    legal_strategy:      str
    citation_tier:       str

    # ── Extracted petition fields ─────────────────────────────────────────────
    petitioner:          str
    detenu:              str
    facts_text:          str
    grounds_text:        str
    prayer:              str
    interim_relief:      str

    # ── Validation ────────────────────────────────────────────────────────────
    is_valid:            bool
    validation_notes:    str
    validation_score:    int
    revision_count:      int

    # ── Output ───────────────────────────────────────────────────────────────
    final_petition:      str

    # ── Memory ───────────────────────────────────────────────────────────────
    memory_context:      str

    # ── Evaluation metrics ───────────────────────────────────────────────────
    eval_structure_score:   int
    eval_citation_score:    int
    eval_grounds_count:     int
    eval_redundancy_score:  int
    eval_tone_score:        int
    eval_overall_score:     float
    eval_issues:            List[str]
    eval_timestamp:         str