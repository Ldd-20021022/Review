from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.assessment import Assessment, AssessmentItem
from ..models.standard import StdIndicator, StdRequirement, StdCategory
from ..models.snapshot import Snapshot, SnapshotItem
from ..models.user import UserTenant
from ..schemas.assessment import (
    AssessmentCreate, AssessmentInfo, AssessmentDetail, AssessmentItemInfo, ScoreUpdate
)
from ..middleware.tenant import get_current_tenant_id, get_current_user, get_current_user_tenant, require_role

router = APIRouter(prefix="/api/assessments", tags=["assessments"])


def _build_item_info(item, target_level: int, db: Session) -> AssessmentItemInfo:
    """Enrich item with indicator info including compliance fields."""
    ind = db.get(StdIndicator, item.indicator_id)
    req = None
    cat_name = None
    if ind:
        cat = db.get(StdCategory, ind.category_id)
        cat_name = cat.name if cat else None
        req = (
            db.query(StdRequirement)
            .filter(StdRequirement.indicator_id == ind.id, StdRequirement.level == target_level)
            .first()
        )
    return AssessmentItemInfo(
        id=item.id,
        assessment_id=item.assessment_id,
        indicator_id=item.indicator_id,
        actual_value=item.actual_value,
        is_compliant=item.is_compliant,
        score=item.score,
        gap_note=item.gap_note,
        updated_at=item.updated_at.isoformat() if item.updated_at else None,
        indicator_code=ind.code if ind else None,
        indicator_name=ind.name if ind else None,
        category_name=cat_name,
        standard_value=ind.standard_value if ind else None,
        indicator_type=ind.indicator_type if ind else None,
        req_text=req.requirement_text if req else None,
    )


@router.get("/", response_model=List[AssessmentInfo])
def list_assessments(
    status: Optional[str] = Query(None),
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    q = db.query(Assessment).filter(Assessment.tenant_id == tenant_id)
    if status:
        q = q.filter(Assessment.status == status)
    return q.order_by(Assessment.created_at.desc()).all()


@router.post("/", response_model=AssessmentDetail)
def create_assessment(
    data: AssessmentCreate,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_role("admin", "director", "expert", "dept_head")),
):
    a = Assessment(
        tenant_id=tenant_id,
        name=data.name,
        target_level=data.target_level,
        department_id=data.department_id,
        rating_cycle=data.rating_cycle,
        submitter_id=user.id,
        status="draft",
    )
    db.add(a)
    db.flush()

    # Determine which indicators to include
    if data.category_ids:
        cat_ids = set(data.category_ids)
        for cid in list(cat_ids):
            children = db.query(StdCategory).filter(StdCategory.parent_id == cid).all()
            cat_ids.update(c.id for c in children)
        indicators = (
            db.query(StdIndicator)
            .filter(StdIndicator.category_id.in_(cat_ids))
            .all()
        )
    else:
        indicators = db.query(StdIndicator).all()

    for ind in indicators:
        db.add(AssessmentItem(assessment_id=a.id, indicator_id=ind.id))

    db.commit()
    db.refresh(a)

    items = [
        _build_item_info(item, a.target_level, db)
        for item in a.items
    ]
    return AssessmentDetail(
        id=a.id,
        tenant_id=a.tenant_id,
        name=a.name,
        target_level=a.target_level,
        department_id=a.department_id,
        rating_cycle=a.rating_cycle,
        submitter_id=a.submitter_id,
        total_score=a.total_score,
        status=a.status,
        created_at=a.created_at.isoformat(),
        items=items,
    )


@router.get("/my-department", response_model=List[AssessmentInfo])
def my_department_assessments(
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    ut: UserTenant = Depends(get_current_user_tenant),
):
    """Returns assessments for the current user's department."""
    q = db.query(Assessment).filter(
        Assessment.tenant_id == tenant_id,
        Assessment.department_id == ut.dept_id,
    )
    return q.order_by(Assessment.created_at.desc()).all()


@router.get("/{aid}", response_model=AssessmentDetail)
def get_assessment(
    aid: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    a = db.query(Assessment).filter(
        Assessment.id == aid, Assessment.tenant_id == tenant_id
    ).first()
    if not a:
        raise HTTPException(404, "Assessment not found")

    items = [_build_item_info(item, a.target_level, db) for item in a.items]
    return AssessmentDetail(
        id=a.id,
        tenant_id=a.tenant_id,
        name=a.name,
        target_level=a.target_level,
        department_id=a.department_id,
        rating_cycle=a.rating_cycle,
        submitter_id=a.submitter_id,
        total_score=a.total_score,
        status=a.status,
        created_at=a.created_at.isoformat(),
        items=items,
    )


@router.put("/{aid}/items/{iid}", response_model=AssessmentItemInfo)
def update_score(
    aid: int,
    iid: int,
    data: ScoreUpdate,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    _=Depends(require_role("admin", "director", "expert", "dept_head")),
):
    # Verify assessment belongs to tenant
    a = db.query(Assessment).filter(
        Assessment.id == aid, Assessment.tenant_id == tenant_id
    ).first()
    if not a:
        raise HTTPException(404, "Assessment not found")
    if a.status not in ("draft", "assessing", "review", "revising"):
        raise HTTPException(400, "Assessment is locked")

    item = db.query(AssessmentItem).filter(
        AssessmentItem.id == iid, AssessmentItem.assessment_id == aid
    ).first()
    if not item:
        raise HTTPException(404, "Item not found")

    # Handle actual_value update with auto compliance check
    if data.actual_value is not None:
        item.actual_value = data.actual_value
        ind = db.get(StdIndicator, item.indicator_id)
        if ind and ind.standard_value and ind.indicator_type:
            from ..services.compliance import check_compliance
            result = check_compliance(data.actual_value, ind.standard_value, ind.indicator_type)
            item.is_compliant = result["is_compliant"]
            item.score = result["score"]

    if data.score is not None:
        item.score = data.score
    if data.gap_note is not None:
        item.gap_note = data.gap_note
    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)

    return _build_item_info(item, a.target_level, db)


@router.post("/{aid}/submit")
def submit_assessment(
    aid: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    """Department head submits assessment for review."""
    a = db.query(Assessment).filter(
        Assessment.id == aid, Assessment.tenant_id == tenant_id
    ).first()
    if not a:
        raise HTTPException(404, "Assessment not found")
    if a.status not in ("draft", "revising"):
        raise HTTPException(400, "Cannot submit in current status")

    # Calculate total score
    items = a.items
    total_weighted = 0.0
    total_weight = 0.0
    for item in items:
        ind = db.get(StdIndicator, item.indicator_id)
        if ind and item.score is not None and ind.weight:
            total_weighted += item.score * float(ind.weight) / 100
            total_weight += float(ind.weight)

    if total_weight > 0:
        a.total_score = round(total_weighted / total_weight * 100, 2)

    a.status = "submitted"
    a.submitted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(a)

    items_out = [_build_item_info(item, a.target_level, db) for item in a.items]
    return AssessmentDetail(
        id=a.id,
        tenant_id=a.tenant_id,
        name=a.name,
        target_level=a.target_level,
        department_id=a.department_id,
        rating_cycle=a.rating_cycle,
        submitter_id=a.submitter_id,
        total_score=a.total_score,
        status=a.status,
        created_at=a.created_at.isoformat(),
        items=items_out,
    )


@router.post("/{aid}/resubmit")
def resubmit_assessment(
    aid: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Department head resubmits after rejection."""
    a = db.query(Assessment).filter(
        Assessment.id == aid, Assessment.tenant_id == tenant_id
    ).first()
    if not a:
        raise HTTPException(404, "Assessment not found")
    if a.status != "rejected":
        raise HTTPException(400, f"Cannot resubmit: current status is '{a.status}'")

    a.status = "revising"
    db.commit()
    db.refresh(a)

    items_out = [_build_item_info(item, a.target_level, db) for item in a.items]
    return AssessmentDetail(
        id=a.id,
        tenant_id=a.tenant_id,
        name=a.name,
        target_level=a.target_level,
        department_id=a.department_id,
        rating_cycle=a.rating_cycle,
        submitter_id=a.submitter_id,
        total_score=a.total_score,
        status=a.status,
        created_at=a.created_at.isoformat(),
        items=items_out,
    )


@router.post("/{aid}/lock")
def lock_assessment(
    aid: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    _=Depends(require_role("admin", "director", "expert")),
):
    a = db.query(Assessment).filter(
        Assessment.id == aid, Assessment.tenant_id == tenant_id
    ).first()
    if not a:
        raise HTTPException(404, "Assessment not found")
    if a.status not in ("assessing", "review"):
        raise HTTPException(400, "Cannot lock in current status")

    # Count items with scores
    items = a.items
    scored = [it for it in items if it.score is not None]
    if not scored:
        raise HTTPException(400, "No scores recorded")
    total = sum(it.score for it in scored) / len(scored)

    # Count existing snapshots to determine version
    count = db.query(Snapshot).filter(Snapshot.assessment_id == aid).count()

    snap = Snapshot(
        assessment_id=a.id,
        version=f"V{count + 1}",
        total_score=round(total, 1),
    )
    db.add(snap)
    db.flush()

    for item in items:
        db.add(SnapshotItem(
            snapshot_id=snap.id,
            indicator_id=item.indicator_id,
            score=item.score,
            gap_note=item.gap_note,
        ))

    a.status = "review"
    db.commit()

    return {"ok": True, "snapshot_id": snap.id, "version": snap.version, "total_score": snap.total_score}
