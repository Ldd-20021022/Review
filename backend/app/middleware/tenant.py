from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models.user import User, UserTenant
from ..utils.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


def _extract_token(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> str:
    """Extract JWT from httpOnly cookie first, then Bearer header fallback."""
    # Priority 1: httpOnly cookie (XSS-safe)
    cookie_token = request.cookies.get("token")
    if cookie_token:
        return cookie_token
    # Priority 2: Bearer header (backward compat)
    if credentials:
        return credentials.credentials
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


def get_current_user(
    token: str = Depends(_extract_token),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user_id = payload.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    user = db.get(User, int(user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def get_current_tenant_id(
    token: str = Depends(_extract_token),
) -> int:
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    tenant_id = payload.get("tenant_id")
    if tenant_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tenant context")
    return int(tenant_id)


def get_current_user_tenant(
    user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
) -> UserTenant:
    ut = (
        db.query(UserTenant)
        .filter(UserTenant.user_id == user.id, UserTenant.tenant_id == tenant_id)
        .first()
    )
    if ut is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this tenant")
    return ut


def require_role(*roles: str):
    """Factory for role-based access control."""

    def checker(ut: UserTenant = Depends(get_current_user_tenant)) -> UserTenant:
        if ut.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return ut

    return checker
