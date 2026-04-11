from src.rag.graph import run_agentic_system
from src.drafter.graph import run_legal_assistant
from src.summarizer.graph import process_uploaded_document

# integration/router.py
import json, re
from rag.graph import run_agentic_system, AgenticState
from drafter.graph import run_legal_assistant
from summarizer.graph import process_uploaded_document

def route_and_run(query: str = None, file_path: str = None, user_id: str = "default") -> dict:
    
    # File upload → summarizer
    if file_path:
        result = process_uploaded_document(file_path)
        return {"type": "summary", "result": result}
    
    if not query:
        return {"type": "error", "result": "No query or file provided"}
    
    # Classify intent
    intent = _classify_intent(query)
    
    if intent == "drafter":
        result = run_legal_assistant(query, user_id=user_id)
        return {"type": "petition", "result": result.get("final_petition", "")}
    else:
        result = run_agentic_system(query)
        return {"type": "rag", "result": result}

def _classify_intent(query: str) -> str:
    # Drafter keywords — user describing a legal situation they need help with
    drafter_signals = [
        "arrested", "detention", "warrant", "bail", "FIR", "police station",
        "sealed", "petition", "my brother", "my client", "my name is",
        "I am", "I need a petition", "draft", "habeas corpus"
    ]
    query_lower = query.lower()
    if any(signal.lower() in query_lower for signal in drafter_signals):
        return "drafter"
    return "rag"