from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.tenant import Tenant
from ..schemas.admin import TenantInfo, TenantCreate
from ..middleware.tenant import require_role, get_current_user
from ..models.user import UserTenant

router = APIRouter(prefix="/api/tenants", tags=["tenants"])


@router.get("/", response_model=List[TenantInfo])
def list_tenants(db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    return db.query(Tenant).all()


@router.post("/", response_model=TenantInfo)
def create_tenant(data: TenantCreate, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    t = Tenant(**data.dict())
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.get("/{tid}", response_model=TenantInfo)
def get_tenant(tid: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    t = db.get(Tenant, tid)
    if not t:
        raise HTTPException(404, "Tenant not found")
    return t


@router.put("/{tid}", response_model=TenantInfo)
def update_tenant(tid: int, data: TenantCreate, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    t = db.get(Tenant, tid)
    if not t:
        raise HTTPException(404, "Tenant not found")
    for k, v in data.dict(exclude_unset=True).items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return t

@router.get("/mine")
def my_tenants(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Return all tenants the current user belongs to."""
    uts = db.query(UserTenant).filter(UserTenant.user_id == user.id).all()
    return [{"id": ut.tenant_id, "role": ut.role, "dept_id": ut.dept_id,
             "name": db.get(Tenant, ut.tenant_id).name if db.get(Tenant, ut.tenant_id) else str(ut.tenant_id)}
            for ut in uts]
