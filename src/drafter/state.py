from typing import TypedDict, List, Optional

class LegalGenState(TypedDict):
    user_story:          str
    user_id:             str
    jurisdiction:        str
    is_complete:         bool
    missing_info:        List[str]
    petition_type:       str
    target_court:        str
    next_step:           str
    primary_context:     str
    primary_citation:    str
    supporting_context:  str
    supporting_citation: str
    rag_attempts:        int
    petitioner:          str
    detenu:              str
    facts_text:          str
    grounds_text:        str
    prayer:              str
    is_valid:            bool
    validation_notes:    str
    validation_score:    int
    revision_count:      int
    final_petition:      str
    memory_context:      str