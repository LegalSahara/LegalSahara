import os
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt

# ── Configuration ─────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-production-12345")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 24 * 60  # 24 hours

# ── Data Models ───────────────────────────────────────────────────────────────
class TokenResponse:
    access_token: str
    token_type: str
    user: dict

class TokenData:
    email: Optional[str] = None

class User:
    email: str
    full_name: str
    license_type: str
    id: str

# ── Test User Database (In-memory) ────────────────────────────────────────────
# In production, this would be a real database
TEST_USER = {
    "id": "user_001",
    "email": "advocate@legal-sahara.com",
    "password": "demo123",  # Simple password for now
    "full_name": "Adv. Ali Khan",
    "license_type": "Pro",
}

# ── Password Utilities ────────────────────────────────────────────────────────
def verify_password(plain_password: str, stored_password: str) -> bool:
    """Simple password verification (use bcrypt in production)"""
    try:
        # For testing only - compare plain text
        result = plain_password == stored_password
        print(f"[DEBUG] Password verification result: {result}")
        return result
    except Exception as e:
        print(f"[DEBUG] Password verification error: {e}")
        return False

def get_password_hash(password: str) -> str:
    """Placeholder for production use"""
    return password

# ── JWT Token Utilities ───────────────────────────────────────────────────────
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
        return email
    except JWTError:
        return None

# ── User Authentication ───────────────────────────────────────────────────────
def authenticate_user(email: str, password: str) -> Optional[dict]:
    """Authenticate user with email and password"""
    print(f"[DEBUG] Attempting login with email: {email}")
    print(f"[DEBUG] Password input: {password}")
    print(f"[DEBUG] Test user email: {TEST_USER['email']}")
    print(f"[DEBUG] Email match: {email == TEST_USER['email']}")
    
    if email != TEST_USER["email"]:
        print("[DEBUG] Email does not match test user email")
        return None
    
    print(f"[DEBUG] Verifying password...")
    password_valid = verify_password(password, TEST_USER["password"])
    print(f"[DEBUG] Password valid: {password_valid}")
    
    if not password_valid:
        print("[DEBUG] Password verification failed")
        return None
    
    print("[DEBUG] Authentication successful!")
    return {
        "id": TEST_USER["id"],
        "email": TEST_USER["email"],
        "full_name": TEST_USER["full_name"],
        "license_type": TEST_USER["license_type"],
    }

def get_user_from_token(token: str) -> Optional[dict]:
    """Get user info from valid JWT token"""
    email = verify_token(token)
    if email is None:
        return None
    
    if email == TEST_USER["email"]:
        return {
            "id": TEST_USER["id"],
            "email": TEST_USER["email"],
            "full_name": TEST_USER["full_name"],
            "license_type": TEST_USER["license_type"],
        }
    
    return None