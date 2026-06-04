import src.shared.db as _db
import re
from chromadb.utils import embedding_functions
from rank_bm25 import BM25Okapi
from typing import List, Dict, Optional
from collections import defaultdict

# ============================================
# RETRIEVAL HELPERS
# ============================================

def _tokenize(text: str) -> List[str]:
    return re.findall(r"\w+", text.lower())

def _dedup_by_case(results: List[Dict]) -> List[Dict]:
    seen = {}
    for r in results:
        cid = r["metadata"].get("case_id")
        if cid and cid not in seen:
            seen[cid] = r
    return list(seen.values())

    
def _normalize_filter_values(metadata_filter: dict) -> dict:
    
    if not metadata_filter:
        return None
    normalized = {}
    for k, v in metadata_filter.items():
        if v is None or str(v).lower() == "none":  # ← skip null values
            continue
        if k == "year" and not str(v).endswith(".0"):
            v = f"{v}.0"
        if k == "judges":
            v = re.sub(
                r"^(MR\.\s+JUSTICE\s+|MRS\.\s+JUSTICE\s+|Mr\.\s+Justice\s+|Mrs\.\s+Justice\s+|JUSTICE\s+|Justice\s+|MR\.\s+|MRS\.\s+)",
                "", v, flags=re.IGNORECASE
            ).strip()
        normalized[k] = v
    return normalized if normalized else None

def _format_chroma_filter(metadata_filter: dict) -> dict:
    if not metadata_filter:
        return None

    # These fields need substring matching — only BM25 handles them
    bm25_only_fields = {"judges", "petitioner", "respondent"}

    items = [(k, v) for k, v in metadata_filter.items() if k not in bm25_only_fields]

    print(f"  chroma items: {items}") 

    if not items:
        return None
    if len(items) == 1:
        k, v = items[0]
        return {k: {"$eq": v}}
    else:
        return {"$and": [{k: {"$eq": v}} for k, v in items]}

def _dense_search(query: str, metadata_filter: dict = None, k: int = 30) -> List[Dict]:
    _db._init_db()
    try:
        if metadata_filter:
            res = _db._collection.query(
                query_texts=[query],
                where=metadata_filter,
                n_results=k
            )
        else:
            res = _db._collection.query(
                query_texts=[query],
                n_results=k
            )
    except Exception as e:
        print(f"  ⚠️ Dense search error: {e}")
        return []

    results = [
        {
            "text": res["documents"][0][i],
            "metadata": res["metadatas"][0][i],
            "score": 1 - res["distances"][0][i],
            "method": "DENSE"
        }
        for i in range(len(res["ids"][0]))
    ]
    return _dedup_by_case(results)

def _bm25_search_filtered(query: str, bm25_filter: dict = None, k: int = 30) -> List[Dict]:
    
    _db._init_db()
    if not isinstance(bm25_filter, dict):
        bm25_filter = None
    if bm25_filter:
        filtered_chunks = [
            ch for ch in _db._CHUNKS
            if all(
                str(v).lower() in str(ch["metadata"].get(fk, "")).lower()
                for fk, v in bm25_filter.items()
            )
        ]
    else:
        filtered_chunks = _db._CHUNKS

    if not filtered_chunks:
        print("  ⚠️ BM25: No chunks matched metadata filter")
        return []

    corpus = [_tokenize(ch["text"]) for ch in filtered_chunks]
    bm25 = BM25Okapi(corpus)
    scores = bm25.get_scores(_tokenize(query))
    ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)[:k]
    results = [
        {**filtered_chunks[idx], "score": score, "method": "BM25"}
        for idx, score in ranked
    ]
    return _dedup_by_case(results)

def _aggregate_rrf(dense_results: List[Dict], bm25_results: List[Dict]) -> List[Dict]:
    scores = defaultdict(lambda: {
        "case_id": None,
        "rrf_score": 0.0,
        "matched_on": set(),
        "preview": ""
    })

    k = 60

    for rank, ch in enumerate(dense_results):
        cid = ch["metadata"].get("case_id")
        if not cid:
            continue
        scores[cid]["case_id"] = cid
        scores[cid]["rrf_score"] += 1 / (k + rank + 1)
        scores[cid]["matched_on"].add("DENSE")
        if not scores[cid]["preview"]:
            scores[cid]["preview"] = ch["text"][:150]

    for rank, ch in enumerate(bm25_results):
        cid = ch["metadata"].get("case_id")
        if not cid:
            continue
        scores[cid]["case_id"] = cid
        scores[cid]["rrf_score"] += 1 / (k + rank + 1)
        scores[cid]["matched_on"].add("BM25")
        if not scores[cid]["preview"]:
            scores[cid]["preview"] = ch["text"][:150]

    return sorted(
        [
            {
                "case_id": v["case_id"],
                "score": round(v["rrf_score"], 4),
                "matched_on": list(v["matched_on"]),
                "preview": v["preview"]
            }
            for v in scores.values()
        ],
        key=lambda x: x["score"],
        reverse=True
    )

def _filter_relative(cases: List[Dict], drop_threshold: float = 0.5, top_k: int = 3) -> List[Dict]:
    if not cases:
        return []
    top_score = cases[0]["score"]
    return [c for c in cases if c["score"] >= top_score * drop_threshold][:top_k]

def _build_chunks(res) -> List[Dict]:
    chunks = []
    if not res or not res["ids"] or not res["ids"][0]:
        return chunks
    for i, cid in enumerate(res["ids"][0]):
        chunks.append({
            "chunk_id": cid,
            "text": res["documents"][0][i],
            "metadata": res["metadatas"][0][i],
            "score": 1 - res["distances"][0][i]
        })
    return chunks

def _resolve_case_id(case_id: str) -> str:
    """Handle SC-PK_ prefix variants."""
    _db._init_db()
    all_case_ids = set(ch["metadata"]["case_id"] for ch in _db._CHUNKS if ch["metadata"].get("case_id"))
    
    if case_id in all_case_ids:
        return case_id
    
    prefixed = f"SC-PK_{case_id}"
    if prefixed in all_case_ids:
        return prefixed
    
    if case_id.startswith("SC-PK_"):
        stripped = case_id[6:]
        if stripped in all_case_ids:
            return stripped
    
    return case_id

def _expand_case(case_id: str, k: int = 15) -> List[Dict]:
    _db._init_db()
    try:
        resolved_id = _resolve_case_id(case_id)
        if resolved_id != case_id:
            print(f"  🔧 Resolved case_id: {case_id} → {resolved_id}")
        res = _db._collection.query(
            query_texts=[""],
            where={"case_id": resolved_id},
            n_results=k
        )
        return _build_chunks(res)
    except Exception as e:
        print(f"  ⚠️ expand_case error: {e}")
        return []
