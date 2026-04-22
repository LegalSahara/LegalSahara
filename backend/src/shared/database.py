# src/shared/database.py
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy import Column, String, DateTime, Boolean
from datetime import datetime, timezone
import uuid

DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Neon requires SSL; SQLAlchemy needs connect_args for psycopg2
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

    id           = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email        = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    full_name    = Column(String, nullable=False)
    license_type = Column(String, default="Free")
    is_active    = Column(Boolean, default=True)
    created_at   = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


def get_db():
    """FastAPI dependency — yields a DB session and closes it after."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create tables if they don't exist. Call once on startup."""
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables initialized")