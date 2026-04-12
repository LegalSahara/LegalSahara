import os
from src.drafter.state import LegalGenState
from langgraph.graph import StateGraph, START, END
from src.drafter.templates import COURT_FORMATS
from src.drafter.nodes import (
    check_missing_info_node, orchestrator_node,
    red_flag_node, strategy_node, citation_ranker_node,
    rag_primary_node, rag_secondary_node, extract_fields_node,
    drafter_node, validator_node, revision_node, interim_relief_node,
)
from src.drafter.memory import get_memory_context, save_to_memory, USER_MEMORY

# ── Output directory ──────────────────────────────────────────────────────────
OUTPUT_DIR = "generated_petitions"
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ── Routing helpers ───────────────────────────────────────────────────────────
def route_after_info(state):      return state.get("next_step", "ask_user")
def route_after_rag(state):       return state.get("next_step", "rag_secondary")
def route_after_validator(state): return state.get("next_step", "done")


# ── Graph Assembly ────────────────────────────────────────────────────────────
builder = StateGraph(LegalGenState)

builder.add_node("info_check",      check_missing_info_node)
builder.add_node("orchestrator",    orchestrator_node)
builder.add_node("red_flag",        red_flag_node)
builder.add_node("strategy",        strategy_node)
builder.add_node("citation_ranker", citation_ranker_node)
builder.add_node("rag_primary",     rag_primary_node)
builder.add_node("rag_secondary",   rag_secondary_node)
builder.add_node("extractor",       extract_fields_node)
builder.add_node("interim_node",    interim_relief_node)
builder.add_node("drafter",         drafter_node)
builder.add_node("validator",       validator_node)
builder.add_node("revision",        revision_node)

builder.add_edge(START, "info_check")
builder.add_conditional_edges("info_check", route_after_info,
    {"ask_user": END, "proceed": "orchestrator"})
builder.add_edge("orchestrator",    "red_flag")
builder.add_edge("red_flag",        "strategy")
builder.add_edge("strategy",        "rag_primary")
builder.add_conditional_edges("rag_primary", route_after_rag,
    {"rag_retry": "rag_primary", "rag_secondary": "rag_secondary"})
builder.add_edge("rag_secondary",   "citation_ranker")
builder.add_edge("citation_ranker", "extractor")
builder.add_edge("extractor",       "interim_node")
builder.add_edge("interim_node",    "drafter")
builder.add_edge("drafter",         "validator")
builder.add_conditional_edges("validator", route_after_validator,
    {"revise": "revision", "done": END})
builder.add_edge("revision", END)

legal_gen_app = builder.compile()
print("✅ Full graph compiled")
print("   Flow: InfoCheck → Orchestrator → RedFlag → Strategy → RAG(x2)")
print("         → CitationRanker → Extractor → InterimNode → Drafter → Validator → [Revision] → END")


# ── Runner ────────────────────────────────────────────────────────────────────
def run_legal_assistant(messages, user_id: str = "default"):
    """
    Entry point for the frontend.

    `messages` is either:
      - a list of dicts: [{"role": "user"/"assistant", "text": "..."}]
      - a plain string

    Returns a dict with keys:
      status, needs_info, agent_reply, final_petition
    """
    # ── Normalise input ───────────────────────────────────────────────────────
    # Supports four calling conventions:
    #   1. run_legal_assistant(("user_id", "story string"))        ← tuple shorthand
    #   2. run_legal_assistant([{"role": "user", "text": "..."}])  ← chat list (text key)
    #   3. run_legal_assistant([{"role": "user", "content": "..."}]) ← chat list (content key)
    #   4. run_legal_assistant("plain story string", user_id)      ← plain string

    def _extract_text(msg) -> str:
        """Pull message body from a dict, Pydantic model, or plain string."""
        if isinstance(msg, dict):
            return msg.get("text") or msg.get("content") or ""
        # Pydantic model or any object with attributes
        return getattr(msg, "text", None) or getattr(msg, "content", None) or str(msg)

    def _get_role(msg) -> str:
        """Get role from a dict or Pydantic model."""
        if isinstance(msg, dict):
            return msg.get("role", "user")
        return getattr(msg, "role", "user")

    if isinstance(messages, tuple) and len(messages) == 2:
        # Convention 1 — unpack (user_id, story_string)
        user_id       = str(messages[0])
        story         = str(messages[1])
        current_input = story

    elif isinstance(messages, list):
        # Convention 2/3 — chat list of dicts OR Pydantic ChatMessage objects
        # Keep USER turns only so assistant preamble doesn't pollute the story
        last_msg      = messages[-1] if messages else {}
        current_input = _extract_text(last_msg)
        story = "\n".join(
            _extract_text(m)
            for m in messages
            if _get_role(m) == "user"
        )

    else:
        # Convention 4 — plain string
        current_input = str(messages)
        story         = str(messages)

    if not isinstance(story, str):
        story = str(story)

    # ── Debug: log exactly what we parsed so issues are easy to spot ─────────
    print(f"🔍 [Runner] user_id={user_id!r} | story_len={len(story)} | preview={story[:120]!r}")

    # ── Build initial state ───────────────────────────────────────────────────
    mem_ctx = get_memory_context(user_id)
    state = {
        "user_story":   story,
        "user_id":      user_id,
        "jurisdiction": "",          # orchestrator will set this
        "is_complete":  False,
        "missing_info": [],
        "petition_type":    "",
        "target_court":     "",
        "next_step":        "",
        "primary_context":  "",
        "primary_citation": "",
        "supporting_context":  "",
        "supporting_citation": "",
        "rag_attempts":     0,
        "petitioner":       "",
        "detenu":           "",
        "facts_text":       "",
        "grounds_text":     "",
        "prayer":           "",
        "is_valid":         False,
        "validation_notes": "",
        "validation_score": 0,
        "revision_count":   0,
        "final_petition":   "",
        "memory_context":   mem_ctx,
        # enriched fields
        "red_flags":        [],
        "legal_strategy":   "",
        "citation_tier":    "UNKNOWN",
        "interim_relief":   "",
        # eval fields
        "eval_structure_score":  0,
        "eval_citation_score":   0,
        "eval_grounds_count":    0,
        "eval_redundancy_score": 0,
        "eval_tone_score":       0,
        "eval_overall_score":    0.0,
        "eval_issues":           [],
        "eval_timestamp":        "",
    }

    # ── Run the compiled graph (handles info-check → full pipeline internally) ─
    output = legal_gen_app.invoke(state)
    state.update(output)

    # ── Graph terminated at info_check (incomplete) ───────────────────────────
    if not state.get("is_complete"):
        missing = state.get("missing_info", [])
        if missing:
            missing_str = ", ".join(missing)
            reply = (
                f"📋 To proceed I still need: **{missing_str}**.\n"
                f"Please provide these details and I will draft the petition immediately."
            )
        else:
            reply = (
                "📋 Could you please describe the situation in a bit more detail — "
                "include the names of the parties involved, where the incident took place, "
                "and the nature of the legal issue."
            )
        return {
            "status":         "ok",
            "needs_info":     True,
            "agent_reply":    reply,
            "final_petition": None,
        }

    # ── Save memory and return result ─────────────────────────────────────────
    save_to_memory(user_id, state)

    if state.get("final_petition"):
        # Print summary
        sep = "=" * 65
        print(f"\n{sep}")
        print(f"⚖️  {state.get('petition_type', '').upper()}")
        print(f"🏛️  {state.get('jurisdiction', '')}")
        print(f"📌 Primary:    {state.get('primary_citation', 'N/A')} [{state.get('citation_tier', '?')}]")
        print(f"📌 Supporting: {state.get('supporting_citation', 'N/A')}")
        if state.get("red_flags"):
            print(f"🚨 Red flags: {len(state['red_flags'])}")
            for f in state["red_flags"]:
                print(f"   → {f}")
        print(f"✅ Valid: {state.get('is_valid')} | Score: {state.get('eval_overall_score', 0):.1f}/10")
        print(f"📊 Struct:{state['eval_structure_score']} Cite:{state['eval_citation_score']} "
              f"Redun:{state['eval_redundancy_score']} Tone:{state['eval_tone_score']} "
              f"Grounds:{state['eval_grounds_count']}")
        print(sep)

        # Save to file
        p_type_safe = state.get("petition_type", "petition").replace(" ", "_")
        fname    = f"{user_id}_{p_type_safe}.txt"
        filepath = os.path.join(OUTPUT_DIR, fname)
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(state["final_petition"])
            print(f"\n💾 Saved to: {filepath}")
        except Exception as e:
            print(f"⚠️ Error saving file: {e}")

        print(f"\n{state['final_petition']}")
    else:
        print("⚠️ No petition generated.")

    return state


print("✅ Runner ready")
