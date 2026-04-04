
from src.drafter.state import LegalGenState
from langgraph.graph import StateGraph, START, END
from src.drafter.templates import COURT_FORMATS
from src.drafter.nodes import (check_missing_info_node, orchestrator_node, 
    red_flag_node, strategy_node, citation_ranker_node, rag_primary_node,
    rag_secondary_node, extract_fields_node, drafter_node, validator_node, revision_node, interim_relief_node)
from src.drafter.memory import get_memory_context, save_to_memory, USER_MEMORY

# ── CELL 12: Graph Assembly ───────────────────────────────────────────────────
def route_after_info(state):      return state.get("next_step", "ask_user")
def route_after_rag(state):       return state.get("next_step", "rag_secondary")
def route_after_validator(state): return state.get("next_step", "done")
builder = StateGraph(LegalGenState)

# Register all nodes
builder.add_node("info_check",      check_missing_info_node)
builder.add_node("orchestrator",    orchestrator_node)
builder.add_node("red_flag",        red_flag_node)          # NEW
builder.add_node("strategy",        strategy_node)          # NEW
builder.add_node("citation_ranker", citation_ranker_node)   # NEW
builder.add_node("rag_primary",     rag_primary_node)
builder.add_node("rag_secondary",   rag_secondary_node)
builder.add_node("extractor",       extract_fields_node)
builder.add_node("interim_relief",  interim_relief_node)    # NEW
builder.add_node("drafter",         drafter_node)
builder.add_node("validator",       validator_node)
builder.add_node("revision",        revision_node)

# Wire the graph
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
builder.add_edge("extractor",       "interim_relief")
builder.add_edge("interim_relief",  "drafter")
builder.add_edge("drafter",         "validator")
builder.add_conditional_edges("validator", route_after_validator,
    {"revise": "revision", "done": END})
builder.add_edge("revision", END)

legal_gen_app = builder.compile()
print("✅ Full graph compiled")
print("   Flow: InfoCheck → Orchestrator → RedFlag → Strategy → RAG(x2)")
print("         → CitationRanker → Extractor → InterimRelief → Drafter → Validator → [Revision] → END")


# ── CELL 13: Runner ───────────────────────────────────────────────────────────
def run_legal_assistant(story: str, user_id: str = "default"):
    mem_ctx = get_memory_context(user_id)
    if USER_MEMORY.get(user_id, {}).get("past_petitions"):
        print(f"💾 Memory loaded — {len(USER_MEMORY[user_id]['past_petitions'])} past petition(s)")

    state = {
        "user_story": story, "user_id": user_id, "jurisdiction": "",
        "is_complete": False, "missing_info": [], "petition_type": "",
        "target_court": "", "next_step": "", "primary_context": "",
        "primary_citation": "", "supporting_context": "", "supporting_citation": "",
        "rag_attempts": 0, "petitioner": "", "detenu": "", "facts_text": "",
        "grounds_text": "", "prayer": "", "is_valid": False,
        "validation_notes": "", "validation_score": 0, "revision_count": 0,
        "final_petition": "", "memory_context": mem_ctx,
        # new fields
        "red_flags": [], "legal_strategy": "", "citation_tier": "UNKNOWN",
        "interim_relief": "",
        # eval
        "eval_structure_score": 0, "eval_citation_score": 0,
        "eval_grounds_count": 0, "eval_redundancy_score": 0,
        "eval_tone_score": 0, "eval_overall_score": 0.0,
        "eval_issues": [], "eval_timestamp": "",
    }

    # Step 1: Info check
    info_result = check_missing_info_node(state)
    state.update(info_result)
    if not state["is_complete"]:
        print(f"\n📋 Missing: {', '.join(state['missing_info'])}")
        reply = input("👤 Please provide these details: ")
        state["user_story"] += f"\nAdditional details: {reply}"
        state["is_complete"] = True
        state["next_step"]   = "proceed"

    # Step 2: Optional jurisdiction override
    print("\n🏛️  Jurisdiction (Enter to auto-detect, or type one):")
    print("   Options: Sindh HC | Lahore HC | Islamabad HC | Sessions Court Karachi | Sessions Court Lahore")
    jur_input = input("   → ").strip()
    if jur_input in COURT_FORMATS:
        state["jurisdiction"] = jur_input
        print(f"   Using: {jur_input}")
    else:
        print("   Auto-detecting from story...")

    # Step 3: Run pipeline (all nodes)
    builder2 = StateGraph(LegalGenState)
    for name, fn in [
        ("orchestrator",    orchestrator_node),
        ("red_flag",        red_flag_node),
        ("strategy",        strategy_node),
        ("rag_primary",     rag_primary_node),
        ("rag_secondary",   rag_secondary_node),
        ("citation_ranker", citation_ranker_node),
        ("extractor",       extract_fields_node),
        ("interim_relief",  interim_relief_node),
        ("drafter",         drafter_node),
        ("validator",       validator_node),
        ("revision",        revision_node),
    ]:
        builder2.add_node(name, fn)

    builder2.add_edge(START, "orchestrator")
    builder2.add_edge("orchestrator",    "red_flag")
    builder2.add_edge("red_flag",        "strategy")
    builder2.add_edge("strategy",        "rag_primary")
    builder2.add_conditional_edges("rag_primary", route_after_rag,
        {"rag_retry": "rag_primary", "rag_secondary": "rag_secondary"})
    builder2.add_edge("rag_secondary",   "citation_ranker")
    builder2.add_edge("citation_ranker", "extractor")
    builder2.add_edge("extractor",       "interim_relief")
    builder2.add_edge("interim_relief",  "drafter")
    builder2.add_edge("drafter",         "validator")
    builder2.add_conditional_edges("validator", route_after_validator,
        {"revise": "revision", "done": END})
    builder2.add_edge("revision", END)

    pipeline = builder2.compile()
    output   = pipeline.invoke(state)
    state.update(output)

    # Step 4: Save memory
    save_to_memory(user_id, state)

    # Step 5: Print result
    if state.get("final_petition"):
        sep = "=" * 65
        print(f"\n{sep}")
        print(f"⚖️  {state.get('petition_type','').upper()}")
        print(f"🏛️  {state.get('jurisdiction','')}")
        print(f"📌 Primary:   {state.get('primary_citation','N/A')} [{state.get('citation_tier','?')}]")
        print(f"📌 Supporting:{state.get('supporting_citation','N/A')}")
        if state.get("red_flags"):
            print(f"🚨 Red flags: {len(state['red_flags'])}")
            for f in state["red_flags"]:
                print(f"   → {f}")
        print(f"✅ Valid: {state.get('is_valid')} | Score: {state.get('eval_overall_score',0):.1f}/10")
        print(f"📊 Struct:{state['eval_structure_score']} Cite:{state['eval_citation_score']} "
              f"Redun:{state['eval_redundancy_score']} Tone:{state['eval_tone_score']} "
              f"Grounds:{state['eval_grounds_count']}")
        print(sep)
        print(state["final_petition"])

        fname = f"/kaggle/working/{user_id}_{state.get('petition_type','petition').replace(' ','_')}.txt"
        with open(fname, "w") as f:
            f.write(state["final_petition"])
        print(f"\n💾 Saved to: {fname}")
    else:
        print("⚠️ No petition generated.")

    return state

print("✅ Runner ready")

