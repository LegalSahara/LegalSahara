import chromadb
from chromadb.utils import embedding_functions
from chromadb import Client
from chromadb.config import Settings
from config import CHROMA_PATH, COLLECTION_NAME, EMBEDDING_MODEL_NAME

_client = None
_collection = None
_CHUNKS = None


def _init_db():
    global _client, _collection, _CHUNKS

    if _collection is not None:
        return

    try:
        # Correct client with proper path
        _client = Client(Settings(
            persist_directory="/app/chromadb_v2"
        ))

        embed_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=EMBEDDING_MODEL_NAME
        )

        # Check existing collections
        existing_collections = [c.name for c in _client.list_collections()]
        print(f"📂 Existing collections: {existing_collections}")

        # Use get_collection (NOT create)
        _collection = _client.get_collection(
            name=COLLECTION_NAME,
            embedding_function=embed_fn
        )

        # Load data
        res = _collection.get()

        if not res or not res.get("ids"):
            _CHUNKS = []
            print("⚠️ Collection exists but is EMPTY (no embeddings found)")
        else:
            _CHUNKS = [
                {
                    "chunk_id": res["ids"][i],
                    "text": res["documents"][i],
                    "metadata": res["metadatas"][i]
                }
                for i in range(len(res["ids"]))
            ]
            print(f"DB loaded: {len(_CHUNKS)} chunks")

    except Exception as e:
        print(f"Error initializing ChromaDB: {e}")
        _collection = None
        _CHUNKS = []


def get_collection():
    _init_db()

    if _collection is None:
        raise RuntimeError("ChromaDB collection not initialized properly.")

    return _collection, _CHUNKS