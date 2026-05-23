"""Security middleware — rate limiting + persistent login lockout."""
import time
import threading
from fastapi import Request, HTTPException
from sqlalchemy.orm import Session

# Rate limiting (lightweight in-memory, for production use nginx limit_req)
_rate_store = {}
_rate_lock = threading.Lock()
RATE_WINDOW = 60
RATE_MAX = 100


def rate_limit_middleware(request: Request, call_next):
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    with _rate_lock:
        entries = _rate_store.get(ip, [])
        entries = [t for t in entries if now - t < RATE_WINDOW]
        if len(entries) >= RATE_MAX:
            raise HTTPException(429, "Too many requests")
        entries.append(now)
        _rate_store[ip] = entries
    return call_next(request)


# Login lockout (persisted in DB, survives server restart)
MAX_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


def check_login_lockout(phone: str, db: Session):
    """Check if this phone is currently locked out. Raises HTTPException if so."""
    from ..models.login_attempt import LoginAttempt
    entry = db.get(LoginAttempt, phone)
    if entry and entry.locked_until and time.time() < entry.locked_until:
        remain = int((entry.locked_until - time.time()) / 60) + 1
        raise HTTPException(429, f"Account locked, try again in {remain} minutes")
    # Clear expired lockout
    if entry and entry.locked_until and time.time() >= entry.locked_until:
        db.delete(entry)
        db.commit()


def record_login_failure(phone: str, db: Session):
    """Record a failed login attempt. Triggers lockout after MAX_ATTEMPTS."""
    from ..models.login_attempt import LoginAttempt
    entry = db.get(LoginAttempt, phone)
    if not entry:
        entry = LoginAttempt(phone=phone, count=0)
        db.add(entry)
    entry.count += 1
    if entry.count >= MAX_ATTEMPTS:
        entry.locked_until = time.time() + LOCKOUT_MINUTES * 60
    db.commit()


def record_login_success(phone: str, db: Session):
    """Clear login attempts on successful login."""
    from ..models.login_attempt import LoginAttempt
    entry = db.get(LoginAttempt, phone)
    if entry:
        db.delete(entry)
        db.commit()
