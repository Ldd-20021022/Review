from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.assessment import Assessment
from ..models.snapshot import Snapshot, SnapshotItem
from ..models.standard import StdIndicator, StdCategory
from ..schemas.snapshot import SnapshotInfo, SnapshotDetail, SnapshotItemInfo, CompareResult
from ..middleware.tenant import get_current_tenant_id

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


def _build_snapshot_detail(snap, db: Session) -> SnapshotDetail:
    assessment = db.get(Assessment, snap.assessment_id)
    items = []
    for si in snap.items:
        ind = db.get(StdIndicator, si.indicator_id)
        cat = db.get(StdCategory, ind.category_id) if ind else None
        items.append(SnapshotItemInfo(
            id=si.id,
            indicator_id=si.indicator_id,
            score=si.score,
            gap_note=si.gap_note,
            indicator_code=ind.code if ind else None,
            indicator_name=ind.name if ind else None,
            category_name=cat.name if cat else None,
        ))
    return SnapshotDetail(
        id=snap.id,
        assessment_id=snap.assessment_id,
        version=snap.version,
        total_score=snap.total_score,
        locked_at=snap.locked_at.isoformat(),
        assessment_name=assessment.name if assessment else None,
        target_level=assessment.target_level if assessment else None,
        items=items,
    )


@router.get("/", response_model=List[SnapshotInfo])
def list_snapshots(
    assessment_id: Optional[int] = Query(None),
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    q = db.query(Snapshot).join(Assessment).filter(
        Assessment.tenant_id == tenant_id
    )
    if assessment_id:
        q = q.filter(Snapshot.assessment_id == assessment_id)

    results = []
    for snap in q.order_by(Snapshot.locked_at.desc()).all():
        assessment = db.get(Assessment, snap.assessment_id)
        results.append(SnapshotInfo(
            id=snap.id,
            assessment_id=snap.assessment_id,
            version=snap.version,
            total_score=snap.total_score,
            locked_at=snap.locked_at.isoformat(),
            assessment_name=assessment.name if assessment else None,
            target_level=assessment.target_level if assessment else None,
        ))
    return results


@router.get("/{sid}", response_model=SnapshotDetail)
def get_snapshot(
    sid: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    snap = db.get(Snapshot, sid)
    if not snap:
        raise HTTPException(404, "Snapshot not found")
    # Verify tenant access
    assessment = db.get(Assessment, snap.assessment_id)
    if not assessment or assessment.tenant_id != tenant_id:
        raise HTTPException(404, "Snapshot not found")
    return _build_snapshot_detail(snap, db)


@router.get("/compare/", response_model=CompareResult)
def compare_snapshots(
    snap1_id: int = Query(..., alias="snap1"),
    snap2_id: int = Query(..., alias="snap2"),
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    snap1 = db.get(Snapshot, snap1_id)
    snap2 = db.get(Snapshot, snap2_id)
    if not snap1 or not snap2:
        raise HTTPException(404, "Snapshot not found")

    # Verify both belong to same tenant
    a1 = db.get(Assessment, snap1.assessment_id)
    a2 = db.get(Assessment, snap2.assessment_id)
    if not a1 or not a2 or a1.tenant_id != tenant_id or a2.tenant_id != tenant_id:
        raise HTTPException(404, "Snapshot not found")

    detail1 = _build_snapshot_detail(snap1, db)
    detail2 = _build_snapshot_detail(snap2, db)

    # Build item diff
    items1 = {si.indicator_id: si for si in snap1.items}
    items2 = {si.indicator_id: si for si in snap2.items}
    all_ids = set(list(items1.keys()) + list(items2.keys()))

    items_diff = []
    for iid in sorted(all_ids):
        s1 = items1.get(iid)
        s2 = items2.get(iid)
        score1 = s1.score if s1 else None
        score2 = s2.score if s2 else None
        diff = (score2 or 0) - (score1 or 0) if (score1 is not None or score2 is not None) else 0

        ind = db.get(StdIndicator, iid)
        cat = db.get(StdCategory, ind.category_id) if ind else None
        items_diff.append({
            "indicator_id": iid,
            "indicator_code": ind.code if ind else "",
            "indicator_name": ind.name if ind else "",
            "category_name": cat.name if cat else "",
            "score1": score1,
            "score2": score2,
            "diff": diff,
        })

    return CompareResult(
        snap1=detail1,
        snap2=detail2,
        score_diff=round(detail2.total_score - detail1.total_score, 1),
        items_diff=items_diff,
    )
