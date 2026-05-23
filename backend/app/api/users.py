from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models.user import User, UserTenant
from ..models.department import Department
from ..schemas.admin import UserTenantInfo, UserInTenantCreate
from ..utils.security import hash_password
from ..middleware.tenant import get_current_tenant_id, require_role

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/", response_model=List[UserTenantInfo])
def list_tenant_users(
    tenant_id: int = Depends(get_current_tenant_id),
    role: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_role("admin", "director")),
):
    q = (
        db.query(UserTenant)
        .options(joinedload(UserTenant.user), joinedload(UserTenant.department))
        .filter(UserTenant.tenant_id == tenant_id)
    )
    if role:
        q = q.filter(UserTenant.role == role)
    results = []
    for ut in q.all():
        results.append(UserTenantInfo(
            id=ut.id,
            user_id=ut.user_id,
            tenant_id=ut.tenant_id,
            role=ut.role,
            dept_id=ut.dept_id,
            dept_name=ut.department.name if ut.department else None,
            user_name=ut.user.name,
            user_phone=ut.user.phone,
        ))
    return results


@router.post("/", response_model=UserTenantInfo)
def add_user_to_tenant(
    data: UserInTenantCreate,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    _=Depends(require_role("admin")),
):
    # Find or create user
    user = db.query(User).filter(User.phone == data.phone).first()
    if not user:
        user = User(
            phone=data.phone,
            name=data.name,
            password_hash=hash_password(data.password),
        )
        db.add(user)
        db.flush()

    # Check duplicate
    existing = db.query(UserTenant).filter(
        UserTenant.user_id == user.id, UserTenant.tenant_id == tenant_id
    ).first()
    if existing:
        raise HTTPException(400, "User already in this tenant")

    ut = UserTenant(
        user_id=user.id,
        tenant_id=tenant_id,
        role=data.role,
        dept_id=data.dept_id,
    )
    db.add(ut)
    db.commit()
    db.refresh(ut)

    dept_name = None
    if data.dept_id:
        dept = db.get(Department, data.dept_id)
        dept_name = dept.name if dept else None
    return UserTenantInfo(
        id=ut.id,
        user_id=user.id,
        tenant_id=tenant_id,
        role=ut.role,
        dept_id=ut.dept_id,
        dept_name=dept_name,
        user_name=user.name,
        user_phone=user.phone,
    )


@router.put("/{ut_id}", response_model=UserTenantInfo)
def update_user_role(
    ut_id: int,
    role: str = Query(...),
    dept_id: Optional[int] = Query(None),
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    _=Depends(require_role("admin")),
):
    ut = db.query(UserTenant).filter(
        UserTenant.id == ut_id, UserTenant.tenant_id == tenant_id
    ).first()
    if not ut:
        raise HTTPException(404, "User not found in tenant")
    ut.role = role
    if dept_id is not None:
        ut.dept_id = dept_id
    db.commit()
    db.refresh(ut)

    dept_name = None
    if ut.dept_id:
        dept = db.get(Department, ut.dept_id)
        dept_name = dept.name if dept else None
    return UserTenantInfo(
        id=ut.id,
        user_id=ut.user_id,
        tenant_id=ut.tenant_id,
        role=ut.role,
        dept_id=ut.dept_id,
        dept_name=dept_name,
        user_name=ut.user.name,
        user_phone=ut.user.phone,
    )


@router.delete("/{ut_id}")
def remove_user_from_tenant(
    ut_id: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    _=Depends(require_role("admin")),
):
    ut = db.query(UserTenant).filter(
        UserTenant.id == ut_id, UserTenant.tenant_id == tenant_id
    ).first()
    if not ut:
        raise HTTPException(404, "User not found in tenant")
    db.delete(ut)
    db.commit()
    return {"ok": True}


@router.post("/{user_id}/reset-password")
def reset_user_password(
    user_id: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    _=Depends(require_role("admin")),
):
    """Admin resets a user's password to a random one. Returns the new password."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    # Verify target user belongs to the same tenant
    ut = db.query(UserTenant).filter(
        UserTenant.user_id == user_id, UserTenant.tenant_id == tenant_id
    ).first()
    if not ut:
        raise HTTPException(404, "User not found in this tenant")
    import secrets
    new_pwd = secrets.token_hex(6)
    user.password_hash = hash_password(new_pwd)
    db.commit()
    # Log the action
    from ..models.audit_log import AuditLog
    from datetime import datetime, timezone
    db.add(AuditLog(
        user_id=0, tenant_id=0,
        action="reset_password",
        target_type="user", target_id=user_id,
        detail=f"Password reset for {user.phone}",
        created_at=datetime.now(timezone.utc),
    ))
    db.commit()
    return {"ok": True, "new_password": new_pwd, "phone": user.phone}
