"""安全中间件 — 限流 + 登录锁定"""
import time
import threading
from fastapi import Request, HTTPException

_rate_store = {}
_rate_lock = threading.Lock()

# Rate limit: 100 req/min per IP
RATE_WINDOW = 60
RATE_MAX = 100


def rate_limit_middleware(request: Request, call_next):
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    with _rate_lock:
        entries = _rate_store.get(ip, [])
        entries = [t for t in entries if now - t < RATE_WINDOW]
        if len(entries) >= RATE_MAX:
            raise HTTPException(429, "请求过于频繁，请稍后再试")
        entries.append(now)
        _rate_store[ip] = entries
    return call_next(request)


# Login lockout
_login_attempts = {}
_login_lock = threading.Lock()
MAX_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


def check_login_lockout(phone: str):
    with _login_lock:
        entry = _login_attempts.get(phone)
        if entry:
            if entry["locked_until"] and time.time() < entry["locked_until"]:
                remain = int((entry["locked_until"] - time.time()) / 60)
                raise HTTPException(429, f"账号已锁定，请{remain}分钟后再试")
            if entry["locked_until"] and time.time() >= entry["locked_until"]:
                del _login_attempts[phone]


def record_login_failure(phone: str):
    with _login_lock:
        entry = _login_attempts.get(phone, {"count": 0, "locked_until": None})
        entry["count"] += 1
        if entry["count"] >= MAX_ATTEMPTS:
            entry["locked_until"] = time.time() + LOCKOUT_MINUTES * 60
        _login_attempts[phone] = entry


def record_login_success(phone: str):
    with _login_lock:
        _login_attempts.pop(phone, None)
