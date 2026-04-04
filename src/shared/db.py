import chromadb
from chromadb.utils import embedding_functions
from config import CHROMA_PATH, COLLECTION_NAME, EMBEDDING_MODEL_NAME

_client = None
_collection = None
_CHUNKS = None

def _init_db():
    global _client, _collection, _CHUNKS

    if _collection is not None:
        return

    _client = chromadb.PersistentClient(path=CHROMA_PATH)
    embed_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=EMBEDDING_MODEL_NAME
    )
    _collection = _client.get_collection(
        name=COLLECTION_NAME,
        embedding_function=embed_fn
    )

    res = _collection.get()
    _CHUNKS = [
        {
            "chunk_id": res["ids"][i],
            "text": res["documents"][i],
            "metadata": res["metadatas"][i]
        }
        for i in range(len(res["ids"]))
    ]
    print(f"✅ DB loaded: {len(_CHUNKS)} chunks")
def get_collection():
    _init_db()
    return _collection, _CHUNKS