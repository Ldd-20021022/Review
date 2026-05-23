from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User, UserTenant
from ..models.tenant import Tenant
from ..schemas.auth import LoginRequest, LoginResponse, UserInfo
from ..utils.security import verify_password, create_access_token, hash_password
from ..middleware.tenant import get_current_user
from ..config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    from ..middleware.security import check_login_lockout, record_login_failure, record_login_success
    check_login_lockout(req.phone, db)
    user = db.query(User).filter(User.phone == req.phone).first()
    if not user or not verify_password(req.password, user.password_hash):
        record_login_failure(req.phone, db)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="账号或密码错误")
    record_login_success(req.phone, db)

    # Pick the first tenant as active context (platform admin can have none)
    first_ut = (
        db.query(UserTenant).filter(UserTenant.user_id == user.id).first()
    )

    token_data = {"user_id": user.id}
    if first_ut:
        token_data["tenant_id"] = first_ut.tenant_id
        token_data["role"] = first_ut.role

    token = create_access_token(token_data)

    user_info = {
        "id": user.id,
        "phone": user.phone,
        "name": user.name,
        "is_platform_admin": user.is_platform_admin,
        "tenant_id": first_ut.tenant_id if first_ut else None,
        "role": first_ut.role if first_ut else None,
        "dept_id": first_ut.dept_id if first_ut else None,
    }

    resp = JSONResponse(content={"access_token": token, "user": user_info})
    resp.set_cookie(
        key="token",
        value=token,
        httponly=True,
        secure=not settings.DEBUG,  # Secure in production (HTTPS only)
        samesite="strict",
        max_age=settings.JWT_EXPIRE_MINUTES * 60,
        path="/",
    )
    return resp


@router.get("/me", response_model=UserInfo)
def me(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Find active tenant info from first user_tenant
    first_ut = (
        db.query(UserTenant).filter(UserTenant.user_id == user.id).first()
    )
    dept_name = None
    if first_ut and first_ut.dept_id:
        from ..models.department import Department
        dept = db.get(Department, first_ut.dept_id)
        dept_name = dept.name if dept else None

    return UserInfo(
        id=user.id,
        phone=user.phone,
        name=user.name,
        is_platform_admin=user.is_platform_admin,
        tenant_id=first_ut.tenant_id if first_ut else None,
        role=first_ut.role if first_ut else None,
        dept_id=first_ut.dept_id if first_ut else None,
        dept_name=dept_name,
    )


@router.post("/register")
def register(req: LoginRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.phone == req.phone).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone already registered")
    user = User(
        phone=req.phone,
        password_hash=hash_password(req.password),
        name=req.phone,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "phone": user.phone, "name": user.name}


class ChangePasswordBody(BaseModel):
    old_password: str
    new_password: str


@router.post("/change-password")
def change_password(
    body: ChangePasswordBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="当前密码不正确")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}


@router.post("/logout")
def logout():
    """Clear the auth cookie."""
    resp = JSONResponse(content={"ok": True})
    resp.delete_cookie("token", path="/")
    return resp
