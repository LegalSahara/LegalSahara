import os
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-production-12345")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 24 * 60

# ── User Database (in-memory for now) ────────────────────────────────────────
# Password is bcrypt hashed — "demo123"
TEST_USER = {
    "id":           "user_001",
    "email":        "advocate@legal-sahara.com",
    "password_hash": bcrypt.hashpw(b"demo123", bcrypt.gensalt()).decode("utf-8"),
    "full_name":    "Adv. Ali Khan",
    "license_type": "Pro",
}

# ── Password utilities ────────────────────────────────────────────────────────
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8")
    )

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

# ── JWT utilities ─────────────────────────────────────────────────────────────
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None

# ── User authentication ───────────────────────────────────────────────────────
def authenticate_user(email: str, password: str) -> Optional[dict]:
    if email != TEST_USER["email"]:
        return None
    if not verify_password(password, TEST_USER["password_hash"]):
        return None
    return {
        "id":           TEST_USER["id"],
        "email":        TEST_USER["email"],
        "full_name":    TEST_USER["full_name"],
        "license_type": TEST_USER["license_type"],
    }

def get_user_from_token(token: str) -> Optional[dict]:
    email = verify_token(token)
    if not email or email != TEST_USER["email"]:
        return None
    return {
        "id":           TEST_USER["id"],
        "email":        TEST_USER["email"],
        "full_name":    TEST_USER["full_name"],
        "license_type": TEST_USER["license_type"],
    }