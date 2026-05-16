from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.tenant import Tenant
from ..schemas.admin import TenantInfo, TenantCreate
from ..middleware.tenant import require_role

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
