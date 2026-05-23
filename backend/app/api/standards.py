from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import parse_obj_as

from ..database import get_db
from ..models.standard import StdCategory, StdIndicator, StdRequirement
from ..schemas.standard import CategoryInfo, CategoryCreate, IndicatorInfo, IndicatorCreate, RequirementInfo
from ..middleware.tenant import get_current_user, require_role
from ..utils.excel import parse_standards_excel

router = APIRouter(prefix="/api/standards", tags=["standards"])


# ── Categories ──

@router.get("/categories", response_model=List[CategoryInfo])
def list_categories(db: Session = Depends(get_db)):
    """Return tree of all categories (L1 → L2)."""
    categories = db.query(StdCategory).order_by(StdCategory.sort_order).all()
    # Build tree: L1 with children
    lookup = {c.id: CategoryInfo.model_validate(c) for c in categories}
    roots = []
    for c in categories:
        if c.parent_id and c.parent_id in lookup:
            lookup[c.parent_id].children.append(lookup[c.id])
        elif not c.parent_id:
            roots.append(lookup[c.id])
    return roots


@router.post("/categories", response_model=CategoryInfo)
def create_category(
    data: CategoryCreate,
    db: Session = Depends(get_db),
    _=Depends(require_role("admin")),
):
    c = StdCategory(**data.dict())
    db.add(c)
    db.commit()
    db.refresh(c)
    return CategoryInfo.model_validate(c)


@router.put("/categories/{cid}", response_model=CategoryInfo)
def update_category(
    cid: int,
    data: CategoryCreate,
    db: Session = Depends(get_db),
    _=Depends(require_role("admin")),
):
    c = db.get(StdCategory, cid)
    if not c:
        raise HTTPException(404, "Category not found")
    for k, v in data.dict(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return CategoryInfo.model_validate(c)


@router.delete("/categories/{cid}")
def delete_category(
    cid: int,
    db: Session = Depends(get_db),
    _=Depends(require_role("admin")),
):
    c = db.get(StdCategory, cid)
    if not c:
        raise HTTPException(404, "Category not found")
    # Also delete children and indicators
    for child in db.query(StdCategory).filter(StdCategory.parent_id == cid).all():
        _delete_category_cascade(db, child.id)
    _delete_category_cascade(db, cid)
    db.delete(c)
    db.commit()
    return {"ok": True}


def _delete_category_cascade(db, cat_id):
    indicators = db.query(StdIndicator).filter(StdIndicator.category_id == cat_id).all()
    for ind in indicators:
        db.query(StdRequirement).filter(StdRequirement.indicator_id == ind.id).delete()
        db.delete(ind)
    db.query(StdCategory).filter(StdCategory.parent_id == cat_id).delete()


# ── Indicators ──

@router.get("/indicators", response_model=List[IndicatorInfo])
def list_indicators(
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(StdIndicator)
    if category_id:
        # Include sub-categories
        cat_ids = [category_id]
        children = db.query(StdCategory).filter(StdCategory.parent_id == category_id).all()
        cat_ids.extend(c.id for c in children)
        q = q.filter(StdIndicator.category_id.in_(cat_ids))
    return q.order_by(StdIndicator.sort_order).all()


@router.get("/indicators/{iid}", response_model=IndicatorInfo)
def get_indicator(iid: int, db: Session = Depends(get_db)):
    ind = db.get(StdIndicator, iid)
    if not ind:
        raise HTTPException(404, "Indicator not found")
    return ind


@router.post("/indicators", response_model=IndicatorInfo)
def create_indicator(
    data: IndicatorCreate,
    db: Session = Depends(get_db),
    _=Depends(require_role("admin")),
):
    reqs = data.requirements
    ind = StdIndicator(
        category_id=data.category_id,
        code=data.code,
        name=data.name,
        sort_order=data.sort_order,
        standard_value=data.standard_value,
        unit=data.unit,
        max_score=data.max_score,
        weight=data.weight,
        indicator_type=data.indicator_type,
    )
    db.add(ind)
    db.flush()
    for r in reqs:
        db.add(StdRequirement(indicator_id=ind.id, level=r.level, requirement_text=r.requirement_text))
    db.commit()
    db.refresh(ind)
    return ind


@router.delete("/indicators/{iid}")
def delete_indicator(
    iid: int,
    db: Session = Depends(get_db),
    _=Depends(require_role("admin")),
):
    ind = db.get(StdIndicator, iid)
    if not ind:
        raise HTTPException(404, "Indicator not found")
    db.query(StdRequirement).filter(StdRequirement.indicator_id == iid).delete()
    db.delete(ind)
    db.commit()
    return {"ok": True}


@router.put("/indicators/{iid}", response_model=IndicatorInfo)
def update_indicator(
    iid: int,
    data: IndicatorCreate,
    db: Session = Depends(get_db),
    _=Depends(require_role("admin")),
):
    ind = db.get(StdIndicator, iid)
    if not ind:
        raise HTTPException(404, "Indicator not found")
    for k, v in data.dict(exclude_unset=True).items():
        if k != "requirements":
            setattr(ind, k, v)
    db.commit()
    db.refresh(ind)
    return IndicatorInfo.model_validate(ind)


# ── Requirements ──

@router.put("/indicators/{iid}/requirements", response_model=IndicatorInfo)
def update_requirements(
    iid: int,
    data: List[RequirementInfo],
    db: Session = Depends(get_db),
    _=Depends(require_role("admin")),
):
    ind = db.get(StdIndicator, iid)
    if not ind:
        raise HTTPException(404, "Indicator not found")
    db.query(StdRequirement).filter(StdRequirement.indicator_id == iid).delete()
    for r in data:
        db.add(StdRequirement(indicator_id=iid, level=r.level, requirement_text=r.requirement_text))
    db.commit()
    db.refresh(ind)
    return ind


# ── Import ──

@router.post("/import")
def import_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=Depends(require_role("admin")),
):
    import tempfile
    import os

    suffix = os.path.splitext(file.filename or "data.xlsx")[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file.file.read())
        tmp_path = tmp.name

    try:
        count = parse_standards_excel(tmp_path, db)
        return {"ok": True, "count": count}
    finally:
        os.unlink(tmp_path)

@router.get("/template")
def download_template():
    """下载 Excel 导入模板（含填写说明 sheet）"""
    from io import BytesIO
    from fastapi.responses import StreamingResponse
    from ..utils.excel import generate_template
    wb = generate_template()
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": "attachment; filename=standards_template.xlsx"})
