from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.assessment import Assessment
from ..models.review import ReviewRecord
from ..models.notification import Notification
from ..middleware.tenant import get_current_tenant_id, get_current_user, require_role

router = APIRouter(prefix="/api/assessments", tags=["reviews"])


class RejectBody(BaseModel):
    feedback: str


def _get_assessment(aid: int, tenant_id: int, db: Session) -> Assessment:
    a = db.query(Assessment).filter(
        Assessment.id == aid, Assessment.tenant_id == tenant_id
    ).first()
    if not a:
        raise HTTPException(404, "Assessment not found")
    return a


@router.post("/{aid}/approve")
def approve_assessment(
    aid: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_role("admin", "director")),
):
    """院长通过评级提交。"""
    a = _get_assessment(aid, tenant_id, db)
    if a.status != "submitted":
        raise HTTPException(400, f"Cannot approve: current status is '{a.status}'")

    # Update status
    a.status = "approved"

    # Record review
    db.add(ReviewRecord(
        assessment_id=a.id,
        reviewer_id=user.id,
        action="approved",
        feedback="",
    ))

    # Notify submitter
    if a.submitter_id:
        db.add(Notification(
            user_id=a.submitter_id,
            title="✅ 您的科室评级已通过",
            content=f"【{a.name}】评级已通过院长审核！总分: {a.total_score} 分",
            type="approve",
            related_id=a.id,
        ))

    db.commit()
    return {"ok": True, "message": "已通过"}


@router.post("/{aid}/reject")
def reject_assessment(
    aid: int,
    body: RejectBody,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_role("admin", "director")),
):
    """院长退回评级提交，附带整改意见。"""
    a = _get_assessment(aid, tenant_id, db)
    if a.status != "submitted":
        raise HTTPException(400, f"Cannot reject: current status is '{a.status}'")

    # Update status
    a.status = "rejected"

    # Record review
    db.add(ReviewRecord(
        assessment_id=a.id,
        reviewer_id=user.id,
        action="rejected",
        feedback=body.feedback,
    ))

    # Get non-compliant items for notification detail
    from ..models.standard import StdIndicator
    non_compliant_items = [
        item for item in a.items if item.is_compliant is False
    ]

    ncp = "\n".join(
        f"  • {db.get(StdIndicator, it.indicator_id).name if db.get(StdIndicator, it.indicator_id) else '未知指标'}: 实际 {it.actual_value}"
        for it in non_compliant_items[:5]
    )

    # Notify submitter
    if a.submitter_id:
        db.add(Notification(
            user_id=a.submitter_id,
            title="⚠️ 您的科室评级未通过，已被退回",
            content=(
                f"【{a.name}】已被院长退回。\n\n"
                f"总分: {a.total_score} 分\n"
                f"未达标项: {len(non_compliant_items)} 项\n"
                f"{ncp}\n\n"
                f"院长意见: {body.feedback}\n\n"
                f"请尽快整改后重新提交！"
            ),
            type="reject",
            related_id=a.id,
        ))

    db.commit()
    return {"ok": True, "message": "已退回并通知科室负责人"}
