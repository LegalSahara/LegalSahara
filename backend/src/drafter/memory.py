# ── CELL 2: In-Session Memory ────────────────────────────────────────────────
USER_MEMORY = {}

def save_to_memory(user_id: str, state: dict):
    if user_id not in USER_MEMORY:
        USER_MEMORY[user_id] = {
            "past_petitions": [],
            "preferred_court": None,
            "citations_used":  [],
            "petition_types":  []
        }
    mem = USER_MEMORY[user_id]
    mem["past_petitions"].append({
        "story":       state.get("user_story", "")[:200],
        "type":        state.get("petition_type", ""),
        "court":       state.get("jurisdiction", ""),
        "citation":    state.get("primary_citation", ""),
        "draft_style": state.get("final_petition", "")[:300]
    })
    if state.get("jurisdiction"):
        mem["preferred_court"] = state["jurisdiction"]
    if state.get("primary_citation"):
        mem["citations_used"].append(state["primary_citation"])
    if state.get("petition_type"):
        mem["petition_types"].append(state["petition_type"])
    print(f"💾 Memory saved for user: {user_id}")

def get_memory_context(user_id: str) -> str:
    if user_id not in USER_MEMORY or not USER_MEMORY[user_id]["past_petitions"]:
        return "No previous petitions on record."
    mem = USER_MEMORY[user_id]
    return (
        f"User has filed {len(mem['past_petitions'])} previous petition(s).\n"
        f"Preferred court: {mem['preferred_court'] or 'Not set'}\n"
        f"Most used type: {max(set(mem['petition_types']), key=mem['petition_types'].count) if mem['petition_types'] else 'None'}\n"
        f"Recent citations: {', '.join(mem['citations_used'][-3:]) or 'None'}\n"
        f"Last draft sample: {mem['past_petitions'][-1]['draft_style'] if mem['past_petitions'] else 'None'}"
    )

print("✅ Memory system ready")