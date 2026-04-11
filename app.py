import sys
import os
import streamlit as st
from fpdf import FPDF
from langgraph.graph import StateGraph, START, END

# Import from the correct source (state.py, NOT graph.py)
from src.drafter.state import LegalGenState
from src.drafter.nodes import (
    check_missing_info_node, orchestrator_node, red_flag_node, 
    strategy_node, rag_primary_node, rag_secondary_node, 
    citation_ranker_node, extract_fields_node, interim_relief_node, 
    drafter_node, validator_node, revision_node
)

def create_pdf(text):
    pdf = FPDF()
    pdf.add_page()
    # Use a standard font that supports basic text (you may need a custom font for specific symbols)
    pdf.set_font("Arial", size=11)
    
    # FPDF needs latin-1 or utf-8 encoding handling
    text = text.encode('latin-1', 'replace').decode('latin-1')
    pdf.multi_cell(0, 5, text)
    
    # Save to a temporary file
    temp_path = "temp_petition.pdf"
    pdf.output(temp_path)
    return temp_path

# --- Graph Initialization (Headless Version) ---
def run_pipeline(state):
    # This rebuilds your graph without the input() pauses
    def route_after_rag(s):       return s.get("next_step", "rag_secondary")
    def route_after_validator(s): return s.get("next_step", "done")
    
    builder = StateGraph(LegalGenState)
    for name, fn in [
        ("orchestrator", orchestrator_node), ("red_flag", red_flag_node),
        ("strategy", strategy_node), ("rag_primary", rag_primary_node),
        ("rag_secondary", rag_secondary_node), ("citation_ranker", citation_ranker_node),
        ("extractor", extract_fields_node), ("interim_relief", interim_relief_node),
        ("drafter", drafter_node), ("validator", validator_node), ("revision", revision_node),
    ]:
        builder.add_node(name, fn)

    builder.add_edge(START, "orchestrator")
    builder.add_edge("orchestrator", "red_flag")
    builder.add_edge("red_flag", "strategy")
    builder.add_edge("strategy", "rag_primary")
    builder.add_conditional_edges("rag_primary", route_after_rag, {"rag_retry": "rag_primary", "rag_secondary": "rag_secondary"})
    builder.add_edge("rag_secondary", "citation_ranker")
    builder.add_edge("citation_ranker", "extractor")
    builder.add_edge("extractor", "interim_relief")
    builder.add_edge("interim_relief", "drafter")
    builder.add_edge("drafter", "validator")
    builder.add_conditional_edges("validator", route_after_validator, {"revise": "revision", "done": END})
    builder.add_edge("revision", END)

    pipeline = builder.compile()
    return pipeline.invoke(state)

# --- Streamlit UI ---
st.set_page_config(page_title="AI Legal Drafter", layout="wide")
st.title("⚖️ AI Legal Drafter (Pakistan)")

# Initialize session state variables
if "messages" not in st.session_state:
    st.session_state.messages = [{"role": "assistant", "content": "Hello. Please describe your case. Include your name, the affected person's name, and the location/police station."}]
if "petition_draft" not in st.session_state:
    st.session_state.petition_draft = ""
if "is_drafting" not in st.session_state:
    st.session_state.is_drafting = False

# Layout: Chat on the left, Document on the right
col1, col2 = st.columns([1, 1])

with col1:
    st.subheader("Chat Context")
    # Display chat history
    for msg in st.session_state.messages:
        st.chat_message(msg["role"]).write(msg["content"])

    # Chat Input
    if prompt := st.chat_input("Enter case details..."):
        st.session_state.messages.append({"role": "user", "content": prompt})
        st.chat_message("user").write(prompt)

        # Combine all user messages to form the full story
        user_story = "\n".join([m["content"] for m in st.session_state.messages if m["role"] == "user"])
        
        # Build a temporary state to check for missing info
        temp_state = {"user_story": user_story}
        info_check = check_missing_info_node(temp_state)
        
        if not info_check["is_complete"]:
            # Ask for missing info
            missing_str = ", ".join(info_check["missing_info"])
            reply = f"Please provide: **{missing_str}**"
            st.session_state.messages.append({"role": "assistant", "content": reply})
            st.chat_message("assistant").write(reply)
        else:
            # We have all info, start drafting
            st.session_state.is_drafting = True
            st.session_state.messages.append({"role": "assistant", "content": "All details gathered. Drafting petition now..."})
            st.chat_message("assistant").write("All details gathered. Drafting petition now...")
            
            with st.spinner("Analyzing legal strategy & drafting..."):
                initial_state = {
                    "user_story": user_story, "user_id": "web_user", "jurisdiction": "", 
                    "petition_type": "", "next_step": "", "primary_context": "", 
                    "primary_citation": "", "supporting_context": "", "supporting_citation": "", 
                    "rag_attempts": 0, "petitioner": "", "detenu": "", "facts_text": "", 
                    "grounds_text": "", "prayer": "", "is_valid": False, "validation_notes": "", 
                    "validation_score": 0, "revision_count": 0, "final_petition": "", 
                    "memory_context": "", "red_flags": [], "legal_strategy": "", 
                    "citation_tier": "UNKNOWN", "interim_relief": ""
                }
                
                final_state = run_pipeline(initial_state)
                st.session_state.petition_draft = final_state.get("final_petition", "Error generating draft.")
                st.rerun()

with col2:
    st.subheader("Petition Editor")
    if st.session_state.petition_draft:
        # Allow the user to edit the generated text
        edited_petition = st.text_area(
            "Review and edit your petition:",
            value=st.session_state.petition_draft,
            height=600
        )
        
        # Generate PDF Button
        if st.button("Generate PDF"):
            pdf_path = create_pdf(edited_petition)
            with open(pdf_path, "rb") as pdf_file:
                st.download_button(
                    label="⬇️ Download PDF",
                    data=pdf_file,
                    file_name="petition_draft.pdf",
                    mime="application/pdf"
                )
            # Cleanup temp file
            os.remove(pdf_path)
    else:
        st.info("Your draft will appear here once the chat is complete.")