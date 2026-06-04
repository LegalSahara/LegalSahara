from unittest import result

from src.rag.retrieval import _dense_search, _bm25_search_filtered, _aggregate_rrf, _filter_relative, _expand_case
from src.rag.qa import _parse_legal_query, _detect_case_reference, _rewrite_query, _generate_answer, _verify_with_gemini
from src.rag.qa import _call_groq_json, gemini_model, groq_client
import json
import re
from typing import TypedDict, Literal, Optional
from langgraph.graph import StateGraph, END
from src.rag.qa import _evaluate_answer


# ============================================
# PLANNER PROMPTS
# ============================================

CASE_SEARCH_PLANNER_PROMPT = """You are a Planner for a Pakistani Supreme Court case search system.

You will receive a user query and must output a JSON plan — an ordered list of tool calls to find relevant cases.

AVAILABLE TOOLS:
- parse_legal_query: Parses query into semantic_query, metadata_filter (for ChromaDB), bm25_filter (for BM25). Always call this first.
- dense_search: Semantic embedding search. Args: query (str), metadata_filter (dict or null), k (int, default 30)
- bm25_search: Keyword search. Args: query (str), bm25_filter (dict or null), k (int, default 30). Handles judges filtering since ChromaDB cannot.
- aggregate_rrf: Combines dense and BM25 results using Reciprocal Rank Fusion. No args needed — uses previous dense and bm25 results automatically.
- filter_relative: Keeps top cases by relative score. No args needed — uses aggregate_rrf results automatically.

METADATA FILTER FIELDS (all available):
- year: e.g. "2023.0"
- judges: e.g. "YAHYA AFRIDI" (handled by bm25_filter only, not ChromaDB)
- case_type: e.g. "C.A", "Crl.A"
- petitioner: e.g. "Dawood Investment Bank" (use in bm25_filter for partial matching)
- respondent: e.g. "Federation of Pakistan" (use in bm25_filter for partial matching)

IMPORTANT CONSTRAINTS:
- ChromaDB metadata_filter supports ONLY: year (e.g. "2023.0"), case_type (e.g. "C.A"), NOT judges
- Judges filtering is handled ONLY by bm25_filter — never put judges in metadata_filter
- bm25_filter is a plain dict e.g. {"judges": "YAHYA AFRIDI", "year": "2023.0"}
- metadata_filter uses ChromaDB format e.g. {"year": {"$eq": "2023.0"}}
- parse_legal_query handles all this automatically — always call it first

CRITICAL RULE ABOUT BM25_FILTER:
- ALWAYS use "PARSED_BM25_FILTER" as the bm25_filter value — never null, never omit it
- parse_legal_query returns bm25_filter which may contain year, case_type, judges, petitioner, respondent
- Even if you think there is no filter, use "PARSED_BM25_FILTER" — let the executor decide if it's null
- The executor resolves "PARSED_BM25_FILTER" automatically from parse_legal_query output


DEFAULT PIPELINE (use this for most queries):
1. parse_legal_query
2. dense_search
3. bm25_search
4. aggregate_rrf
5. filter_relative

WHEN TO DEVIATE:
- Skip bm25_search only if query is purely conceptual with no keywords (rare)
- Add extra metadata filters if you notice specific fields in the query (e.g. a specific year not mentioned explicitly)
- If replanning after failure, try different parameters (different k, different query phrasing)

OUTPUT FORMAT (JSON array only, no explanation):
[
  {"tool": "parse_legal_query", "args": {"user_query": "original query here"}},
  {"tool": "dense_search", "args": {"query": "SEMANTIC_QUERY", "metadata_filter": null, "k": 30}},
  {"tool": "bm25_search", "args": {"query": "SEMANTIC_QUERY", "bm25_filter": null, "k": 30}},
  {"tool": "aggregate_rrf", "args": {}},
  {"tool": "filter_relative", "args": {}}
]

NOTE: After parse_legal_query runs, use "PARSED_SEMANTIC_QUERY", "PARSED_METADATA_FILTER", "PARSED_BM25_FILTER" as placeholder values in subsequent tools — the executor will resolve these from parse_legal_query output automatically.
NOTE ON PLACEHOLDERS:
- use placeholder values like "TOP_RANKED_CASE"
+ use references like "$aggregate_rrf[0].case_id"
- Use "REWRITTEN_QUERY" as query value in tools after rewrite_query runs — executor resolves it automatically
- Use "PARSED_SEMANTIC_QUERY", "PARSED_METADATA_FILTER", "PARSED_BM25_FILTER" after parse_legal_query
- Use "TOP_RANKED_CASE", "SECOND_RANKED_CASE", "THIRD_RANKED_CASE" for expand_case case_id
- bm25_filter must always be a dict like {"judges": "YAHYA AFRIDI"} or null — never a plain string
"""

QA_PLANNER_PROMPT = """You are a Planner for a Pakistani Supreme Court legal QA system.

You will receive a user query and must output a JSON plan — an ordered list of tool calls to find and answer the question.

AVAILABLE TOOLS:
- detect_case_reference: Checks if query mentions a specific case number. Args: query (str). Returns case_id or null.
- parse_legal_query: Parses query into semantic_query, metadata_filter, bm25_filter. Use when no explicit case reference found.
- dense_search: Semantic embedding search. Args: query (str), metadata_filter (dict or null), k (int, default 30)
- bm25_search: Keyword search. Args: query (str), bm25_filter (dict or null), k (int, default 30)
- aggregate_rrf: Combines dense and BM25 results. No args needed.
- expand_case: Retrieves all chunks from a specific case. Args: case_id (str), k (int, default 15). Use "TOP_RANKED_CASE" as case_id to expand the top result from aggregate_rrf automatically.
- generate_answer: Generates answer using Groq/Llama from expanded chunks. No args needed. ALWAYS include this.
- verify_answer: Verifies answer is grounded in chunks using Gemini. No args needed. ALWAYS include this — NEVER skip.
- rewrite_query: Rewrites query with legal synonyms for better retrieval. Args: query (str). Use in plan 2 if plan 1 failed.

METADATA FILTER FIELDS (all available):
- year: e.g. "2023.0"
- judges: e.g. "YAHYA AFRIDI" (handled by bm25_filter only, not ChromaDB)
- case_type: e.g. "C.A", "Crl.A"
- petitioner: e.g. "Dawood Investment Bank" (use in bm25_filter for partial matching)
- respondent: e.g. "Federation of Pakistan" (use in bm25_filter for partial matching)

IMPORTANT CONSTRAINTS:
- ChromaDB metadata_filter supports ONLY: year, case_type — NOT judges
- Judges filtering handled ONLY by bm25_filter
- parse_legal_query handles filter formatting automatically
- verify_answer is MANDATORY in every plan — never omit it
- generate_answer is MANDATORY in every plan — never omit it


CRITICAL RULE ABOUT BM25_FILTER:
- ALWAYS use "PARSED_BM25_FILTER" as the bm25_filter value — never null, never omit it
- parse_legal_query returns bm25_filter which may contain year, case_type, judges, petitioner, respondent
- Even if you think there is no filter, use "PARSED_BM25_FILTER" — let the executor decide if it's null
- The executor resolves "PARSED_BM25_FILTER" automatically from parse_legal_query output

CRITICAL: When detect_case_reference is in the plan, ALWAYS use "DETECTED_CASE_ID" as the case_id in expand_case — never null, never the literal case number. The executor resolves it automatically.

CORRECT:
{"tool": "expand_case", "args": {"case_id": "DETECTED_CASE_ID", "k": 15}}

WRONG:
{"tool": "expand_case", "args": {"case_id": null, "k": 15}}
{"tool": "expand_case", "args": {"case_id": "C.A.875_2017", "k": 15}}


DEFAULT PIPELINE — explicit case reference:
1. detect_case_reference
2. expand_case (with detected case_id)
3. generate_answer
4. verify_answer

DEFAULT PIPELINE — no explicit case reference:
1. detect_case_reference
2. parse_legal_query
3. dense_search
4. bm25_search
5. aggregate_rrf
6. expand_case (with "TOP_RANKED_CASE")
7. generate_answer
8. verify_answer

WHEN TO DEVIATE:
- If query mentions a party name, organization, or plaintiff — add it to bm25_filter as a keyword search
- If replanning after failure: use rewrite_query, try a different ranked case ("SECOND_RANKED_CASE"), or add/remove filters
- If plan 1 failed because wrong case was expanded — try "SECOND_RANKED_CASE" or "THIRD_RANKED_CASE" in plan 2

OUTPUT FORMAT (JSON array only, no explanation):
[
  {"tool": "detect_case_reference", "args": {"query": "original query here"}},
  {"tool": "parse_legal_query", "args": {"user_query": "original query here"}},
  {"tool": "dense_search", "args": {"query": "PARSED_SEMANTIC_QUERY", "metadata_filter": "PARSED_METADATA_FILTER", "k": 30}},
  {"tool": "bm25_search", "args": {"query": "PARSED_SEMANTIC_QUERY", "bm25_filter": "PARSED_BM25_FILTER", "k": 30}},
  {"tool": "aggregate_rrf", "args": {}},
  {"tool": "expand_case", "args": {"case_id": "TOP_RANKED_CASE", "k": 15}},
  {"tool": "generate_answer", "args": {}},
  {"tool": "verify_answer", "args": {}}
]
NOTE ON PLACEHOLDERS:
- Use "REWRITTEN_QUERY" as query value in tools after rewrite_query runs — executor resolves it automatically
- Use "PARSED_SEMANTIC_QUERY", "PARSED_METADATA_FILTER", "PARSED_BM25_FILTER" after parse_legal_query
- Use "TOP_RANKED_CASE", "SECOND_RANKED_CASE", "THIRD_RANKED_CASE" for expand_case case_id
- bm25_filter must always be a dict like {"judges": "YAHYA AFRIDI"} or null — never a plain string
"""

REPLAN_PROMPT = """You are a Planner for a Pakistani Supreme Court legal system. Your first plan failed. Generate a new plan.

ORIGINAL QUERY: {query}

PLAN 1 THAT FAILED:
{plan_1}

FAILURE REASON:
{failure_reason}

RESULTS FROM PLAN 1:
{plan_1_results}

STRICT PLACEHOLDER RULES — only these placeholders are valid:
- "PARSED_SEMANTIC_QUERY" — query from parse_legal_query
- "PARSED_METADATA_FILTER" — chroma filter from parse_legal_query
- "PARSED_BM25_FILTER" — bm25 filter from parse_legal_query
- "REWRITTEN_QUERY" — output from rewrite_query
- "DETECTED_CASE_ID" — output from detect_case_reference
- "TOP_RANKED_CASE" — top case from aggregate_rrf
- "SECOND_RANKED_CASE" — second case from aggregate_rrf
- "THIRD_RANKED_CASE" — third case from aggregate_rrf
DO NOT invent any other placeholder names.
DO NOT pass arguments to aggregate_rrf — it takes no arguments.
DO NOT call aggregate_rrf without first calling both dense_search and bm25_search.

STRATEGIES FOR PLAN 2:
- If failure was "no chunks found for X" → case may be stored with SC-PK_ prefix, try "SC-PK_X" directly in expand_case
- If failure was "generate_answer returned Context insufficient" → wrong case expanded, try SECOND_RANKED_CASE or run full search pipeline first
- If failure was "verify_answer returned NO" → wrong case, try SECOND_RANKED_CASE
- If failure was token/size error → keep same case, use k=6 in expand_case
- If no case reference detected → run full search: parse_legal_query → dense_search → bm25_search → aggregate_rrf → expand_case(TOP_RANKED_CASE)
- If replanning after rewrite → use "REWRITTEN_QUERY" as query in dense_search and bm25_search, NOT as user_query in parse_legal_query

AVAILABLE TOOLS: detect_case_reference, parse_legal_query, dense_search, bm25_search, aggregate_rrf, expand_case, generate_answer, verify_answer, rewrite_query

CONSTRAINTS:
- verify_answer and generate_answer are MANDATORY
- aggregate_rrf takes NO arguments — always: {{"tool": "aggregate_rrf", "args": {{}}}}
- bm25_filter must be a dict or "PARSED_BM25_FILTER" — never a plain string

Return a JSON object with key 'plan' containing the array of tool calls.
"""

ROUTER_PROMPT = """You are a Router deciding which agent handles the query.

Route to CASE_SEARCH if:
- User wants to FIND/SEARCH/LOCATE cases
- User asks for LIST of cases
- Query contains: "find", "search", "show me", "cases about", "cases by", "cases from"
- Examples: "Find cases about Section 302", "Show me tax cases from 2023", "Cases by Justice Yahya"

Route to QA if:
- User asks a QUESTION requiring an answer
- User wants EXPLANATION/INTERPRETATION
- Query contains: "what", "why", "how", "did", "was", "explain"
- Examples: "What does Section 302 cover?", "What was the court's ruling in C.A.142/2019?"

AMBIGUOUS CASES:
- "Cases about X" → CASE_SEARCH
- "What cases discuss X" → CASE_SEARCH
- "What did court say about X" → QA

Respond with ONLY JSON:
{"agent": "case_search"} or {"agent": "qa"}
"""

# ============================================
# STATE
# ============================================

class AgenticState(TypedDict):
    query: str
    agent_type: str
    plan: list
    plan_results: dict
    plan_number: int
    failure_reason: str
    final_result: str
    eval_scores: dict


# ============================================
# PLANNER
# ============================================

def _call_planner(prompt: str) -> list:
    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system", 
                "content": "You are a planning assistant. Always respond with a valid JSON object containing a single key 'plan' whose value is an array of tool call objects."
            },
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"},
        temperature=0
    )
    result = json.loads(response.choices[0].message.content)
    # Extract the plan array from the wrapper object
    if "plan" in result:
        return result["plan"]
    # Fallback — if model returned array directly inside another key, find it
    for v in result.values():
        if isinstance(v, list):
            return v
    return []

def _generate_plan(query: str, agent_type: str) -> list:
    if agent_type == "case_search":
        prompt = f"{CASE_SEARCH_PLANNER_PROMPT}\n\nQuery: {query}\n\nReturn a JSON object with key 'plan' containing the array of tool calls."
    else:
        prompt = f"{QA_PLANNER_PROMPT}\n\nQuery: {query}\n\nReturn a JSON object with key 'plan' containing the array of tool calls."
    plan = _call_planner(prompt)
    print(f"  📋 Plan generated: {[s['tool'] for s in plan]}")
    return plan

def _generate_replan(query: str, plan_1: list, failure_reason: str, plan_1_results: dict) -> list:
    prompt = REPLAN_PROMPT.format(
        query=query,
        plan_1=json.dumps(plan_1, indent=2),
        failure_reason=failure_reason,
        plan_1_results=json.dumps(
            {k: str(v)[:300] for k, v in plan_1_results.items()},
            indent=2
        )
    )
    prompt += "\n\nReturn a JSON object with key 'plan' containing the array of tool calls."
    plan = _call_planner(prompt)
    print(f"  📋 Replan generated: {[s['tool'] for s in plan]}")
    return plan

def route_query_agentic(state: AgenticState) -> AgenticState:
    query = state["query"]
    
    system = """You are a Router deciding which agent handles a legal query.

Route to case_search if:
- User wants to FIND/SEARCH/LOCATE cases
- User asks for LIST of cases
- Query contains: find, search, show me, cases about, cases by, cases from

Route to qa if:
- User asks a QUESTION requiring an answer
- User wants EXPLANATION/INTERPRETATION
- Query contains: what, why, how, did, was, explain

AMBIGUOUS CASES:
- Cases about X → case_search
- What cases discuss X → case_search
- What did court say about X → qa

Return ONLY a JSON object with key 'agent' and value either 'case_search' or 'qa'."""

    try:
        result = _call_groq_json(f"Query: {query}", system=system)
        agent_choice = result.get("agent", "qa")
    except:
        agent_choice = "qa"

    print(f"🔀 Router: {agent_choice}")
    state["agent_type"] = agent_choice
    return state
# ============================================
# EXECUTOR
# ============================================

def _resolve_arg(value, results: dict):
    if value == "PARSED_SEMANTIC_QUERY":
        return results.get("parse_legal_query", {}).get("semantic_query", "")
    if value == "PARSED_METADATA_FILTER":
        val = results.get("parse_legal_query", {}).get("metadata_filter", None)
        print(f"  resolved PARSED_METADATA_FILTER: {val}")
        return val
    if value == "PARSED_BM25_FILTER":
        return results.get("parse_legal_query", {}).get("bm25_filter", None)
    if value == "REWRITTEN_QUERY":  # ← add this
        return results.get("rewrite_query", "")
    if value == "TOP_RANKED_CASE":
        ranked = results.get("aggregate_rrf", [])
        return ranked[0]["case_id"] if ranked else None
    if value == "SECOND_RANKED_CASE":
        ranked = results.get("aggregate_rrf", [])
        return ranked[1]["case_id"] if len(ranked) > 1 else None
    if value == "THIRD_RANKED_CASE":
        ranked = results.get("aggregate_rrf", [])
        return ranked[2]["case_id"] if len(ranked) > 2 else None
    if value == "DETECTED_CASE_ID":
        return results.get("detect_case_reference")
        
    return value

def _resolve_args(args: dict, results: dict) -> dict:
    return {k: _resolve_arg(v, results) for k, v in args.items()}

def _execute_plan(plan: list, query: str) -> tuple[dict, str]:
    results = {}
    failure_reason = None

    for step in plan:
        tool = step["tool"]
        raw_args = step.get("args", {})
        args = _resolve_args(raw_args, results)

        print(f"  ⚙️ Executing: {tool}({args})")

        try:
            if tool == "parse_legal_query":
                results["parse_legal_query"] = _parse_legal_query(args.get("user_query", query))

            elif tool == "detect_case_reference":
                results["detect_case_reference"] = _detect_case_reference(args.get("query", query))

            elif tool == "dense_search":
                results["dense_search"] = _dense_search(
                    args.get("query", query),
                    args.get("metadata_filter"),
                    args.get("k", 30)
                )

            elif tool == "bm25_search":
                results["bm25_search"] = _bm25_search_filtered(
                    args.get("query", query),
                    args.get("bm25_filter"),
                    args.get("k", 30)
                )

            elif tool == "aggregate_rrf":
                dense = results.get("dense_search", [])
                bm25 = results.get("bm25_search", [])
                results["aggregate_rrf"] = _aggregate_rrf(dense, bm25)
                if not results["aggregate_rrf"]:
                    failure_reason = "aggregate_rrf returned no results"
                    break

            elif tool == "filter_relative":
                ranked = results.get("aggregate_rrf", [])
                results["filter_relative"] = _filter_relative(ranked)

            elif tool == "expand_case":
                case_id = args.get("case_id")
                if not case_id:
                    failure_reason = "expand_case: no case_id resolved"
                    break
                chunks = _expand_case(case_id, args.get("k", 15))
                results["expand_case"] = chunks
                results["expanded_case_id"] = case_id
                if not chunks:
                    failure_reason = f"expand_case: no chunks found for {case_id}"
                    break

            elif tool == "rewrite_query":
                results["rewrite_query"] = _rewrite_query(args.get("query", query))

            elif tool == "generate_answer":
                chunks = results.get("expand_case", [])
                if not chunks:
                    failure_reason = "generate_answer: no chunks available"
                    break
                effective_query = results.get("rewrite_query", query)
                answer = _generate_answer(effective_query, chunks)
                results["generate_answer"] = answer
                if not answer or "Context insufficient" in answer:
                    failure_reason = f"generate_answer returned: {answer[:100]}"
                    break

            elif tool == "verify_answer":
                answer = results.get("generate_answer", "")
                chunks = results.get("expand_case", [])
                if not answer or not chunks:
                    failure_reason = "verify_answer: missing answer or chunks"
                    break
                effective_query = results.get("rewrite_query", query)
                verified = _verify_with_gemini(effective_query, answer, chunks)
                results["verify_answer"] = verified
                if not verified:
                    failure_reason = "verify_answer returned NO — answer not grounded in chunks"
                    break

        except Exception as e:
            failure_reason = f"{tool} raised exception: {str(e)}"
            print(f"  ❌ {failure_reason}")
            break

    return results, failure_reason

# ============================================
# AGENT NODES
# ============================================

def case_search_agent_node(state: AgenticState) -> AgenticState:
    query = state["query"]
    print(f"\n🔍 CASE SEARCH AGENT executing...")

    # Plan 1
    print("\n📋 Generating Plan 1...")
    plan = _generate_plan(query, "case_search")
    results, failure_reason = _execute_plan(plan, query)

    if not failure_reason:
        filtered = results.get("filter_relative", results.get("aggregate_rrf", []))
        output = "Found Cases:\n\n"
        for i, case in enumerate(filtered, 1):
            output += f"{i}. Case ID: {case['case_id']}\n"
            output += f"   Score: {case['score']}\n"
            output += f"   Methods: {', '.join(case['matched_on'])}\n"
            output += f"   Preview: {case['preview'][:150]}\n\n"
        state["final_result"] = output
        return state

    # Plan 2
    print(f"\n⚠️ Plan 1 failed: {failure_reason}")
    print("\n📋 Generating Plan 2...")
    plan_2 = _generate_replan(query, plan, failure_reason, results)
    results_2, failure_reason_2 = _execute_plan(plan_2, query)

    if not failure_reason_2:
        filtered = results_2.get("filter_relative", results_2.get("aggregate_rrf", []))
        output = "Found Cases:\n\n"
        for i, case in enumerate(filtered, 1):
            output += f"{i}. Case ID: {case['case_id']}\n"
            output += f"   Score: {case['score']}\n"
            output += f"   Methods: {', '.join(case['matched_on'])}\n"
            output += f"   Preview: {case['preview'][:150]}\n\n"
        state["final_result"] = output
        return state

    state["final_result"] = "Could not find relevant cases."
    return state


def qa_agent_node(state: AgenticState) -> AgenticState:
    query = state["query"]
    print(f"\n💬 QA AGENT executing...")

    # Plan 1
    print("\n📋 Generating Plan 1...")
    plan = _generate_plan(query, "qa")
    results, failure_reason = _execute_plan(plan, query)

    if not failure_reason:
        answer = results.get("generate_answer", "Context insufficient.")
        state["final_result"] = answer

        ranked = results.get("aggregate_rrf", [])
        if ranked:
            top_case = ranked[0]
            rrf_score = top_case.get("score", 0.0)
            sources_matched = top_case.get("matched_on", [])
        else:
            # Case was found via detect_case_reference — no RRF score available
            rrf_score = 1.0   # direct case reference = 100% retrieval confidence
            sources_matched = ["DIRECT"]

        chunks = results.get("expand_case", [])
        print(f"DEBUG chunks: {len(chunks) if chunks else 'EMPTY'}, answer: {bool(answer)}")

        if chunks and answer and "Context insufficient" not in answer:
            print("DEBUG calling _evaluate_answer")
            state["eval_scores"] = _evaluate_answer(
                query, answer, chunks, rrf_score, sources_matched
            )
        else:
            state["eval_scores"] = {}

        return state

    # Plan 2
    print(f"\n⚠️ Plan 1 failed: {failure_reason}")
    print("\n📋 Generating Plan 2...")
    plan_2 = _generate_replan(query, plan, failure_reason, results)
    results_2, failure_reason_2 = _execute_plan(plan_2, query)

    if not failure_reason_2:
        answer = results_2.get("generate_answer", "Context insufficient.")
        state["final_result"] = answer

        ranked = results_2.get("aggregate_rrf", [])
        top_case = ranked[0] if ranked else {}
        rrf_score = top_case.get("score", 0.0)
        sources_matched = top_case.get("matched_on", [])
        chunks = results_2.get("expand_case", [])

        state["eval_scores"] = _evaluate_answer(
            query, answer, chunks, rrf_score, sources_matched
        )
        return state

    state["final_result"] = "Context insufficient. Answer could not be verified after replanning."
    return state

# ============================================
# ROUTER NODE
# ============================================

def route_query_agentic(state: AgenticState) -> AgenticState:
    query = state["query"]
    response = gemini_model.generate_content(
        f"{ROUTER_PROMPT}\n\nQuery: {query}",
        generation_config={"temperature": 0}
    )
    try:
        result = json.loads(re.sub(r"```json|```", "", response.text).strip())
        agent_choice = result.get("agent", "qa")
    except:
        agent_choice = "qa"

    print(f"🔀 Router: {agent_choice}")
    state["agent_type"] = agent_choice
    return state

def decide_agent(state: AgenticState) -> Literal["case_search_agent", "qa_agent"]:
    return "case_search_agent" if state["agent_type"] == "case_search" else "qa_agent"

# ============================================
# GRAPH
# ============================================

def build_agentic_graph():
    workflow = StateGraph(AgenticState)
    workflow.add_node("route", route_query_agentic)
    workflow.add_node("case_search_agent", case_search_agent_node)
    workflow.add_node("qa_agent", qa_agent_node)
    workflow.set_entry_point("route")
    workflow.add_conditional_edges(
        "route",
        decide_agent,
        {
            "case_search_agent": "case_search_agent",
            "qa_agent": "qa_agent"
        }
    )
    workflow.add_edge("case_search_agent", END)
    workflow.add_edge("qa_agent", END)
    return workflow.compile()

def run_agentic_system(query: str, verbose: bool = True):
    graph = build_agentic_graph()
    result = graph.invoke({
        "query": query,
        "agent_type": "",
        "plan": [],
        "plan_results": {},
        "plan_number": 1,
        "failure_reason": "",
        "final_result": "",
        "eval_scores":    {}
    })

    print(f"DEBUG result keys: {result.keys()}")
    print(f"DEBUG eval_scores in result: {result.get('eval_scores')}")

    if verbose:
        print("\n" + "=" * 60)
        print(f"FINAL RESULT:\n{result['final_result']}")

    return result

print("✅ Agentic system ready")