from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.department import Department
from ..schemas.admin import DeptInfo, DeptCreate
from ..middleware.tenant import get_current_tenant_id, require_role

router = APIRouter(prefix="/api/departments", tags=["departments"])


@router.get("/", response_model=List[DeptInfo])
def list_departments(
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    return db.query(Department).filter(Department.tenant_id == tenant_id).all()


@router.post("/", response_model=DeptInfo)
def create_department(
    data: DeptCreate,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    _=Depends(require_role("admin")),
):
    d = Department(tenant_id=tenant_id, **data.dict())
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


@router.put("/{did}", response_model=DeptInfo)
def update_department(
    did: int,
    data: DeptCreate,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    _=Depends(require_role("admin")),
):
    d = db.query(Department).filter(Department.id == did, Department.tenant_id == tenant_id).first()
    if not d:
        raise HTTPException(404, "Department not found")
    for k, v in data.dict(exclude_unset=True).items():
        setattr(d, k, v)
    db.commit()
    db.refresh(d)
    return d


@router.delete("/{did}")
def delete_department(
    did: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    _=Depends(require_role("admin")),
):
    d = db.query(Department).filter(Department.id == did, Department.tenant_id == tenant_id).first()
    if not d:
        raise HTTPException(404, "Department not found")
    db.delete(d)
    db.commit()
    return {"ok": True}
