import os
from dotenv import load_dotenv
load_dotenv()

GROQ_API_KEY      = os.environ["GROQ_API_KEY"]
GOOGLE_API_KEY    = os.environ["GOOGLE_API_KEY"]
DATABASE_URL      = os.environ["DATABASE_URL"]
CHROMA_PATH       = os.environ.get("CHROMA_PATH", "./chromadb")
COLLECTION_NAME   = "legal_judgments_collection"
EMBEDDING_MODEL_NAME = "BAAI/bge-large-en-v1.5"