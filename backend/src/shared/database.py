# src/shared/database.py
import os
from sqlalchemy import create_engine, text, Column, String, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.orm import sessionmaker, DeclarativeBase, relationship
from datetime import datetime, timezone
import uuid

DATABASE_URL = os.environ.get("DATABASE_URL", "")

engine = create_engine(
    DATABASE_URL,
    connect_args={"sslmode": "require"} if "neon.tech" in DATABASE_URL else {},
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id            = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email         = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    full_name     = Column(String, nullable=False)
    license_type  = Column(String, default="Free")
    is_active     = Column(Boolean, default=True)
    created_at    = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    sessions      = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")


class UserSession(Base):
    """
    Stores drafter / RAG / summarizer sessions per user.

    data column is a JSON string containing:
      - drafter:    { messages, doc, meta, label }
      - rag:        { query, result }
      - summarizer: { filename, result }
    """
    __tablename__ = "user_sessions"

    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id    = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    feature    = Column(String, nullable=False)   # "drafter" | "rag" | "summarizer"
    label      = Column(String, nullable=False)   # display name shown in sidebar
    data       = Column(Text, nullable=False)     # JSON blob
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    user       = relationship("User", back_populates="sessions")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables initialized")
