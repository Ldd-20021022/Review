from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User, UserTenant
from ..utils.security import decode_access_token

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_access_token(credentials.credentials)
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
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> int:
    payload = decode_access_token(credentials.credentials)
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
