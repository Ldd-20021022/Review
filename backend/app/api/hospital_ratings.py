from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.assessment import Assessment, AssessmentItem
from ..models.standard import StdCategory, StdIndicator, StdRequirement
from ..models.standard_set import StandardSet
from ..models.department import Department
from ..models.review import ReviewRecord
from ..models.notification import Notification
from ..models.user import UserTenant
from ..middleware.tenant import get_current_tenant_id, get_current_user, get_current_user_tenant, require_role
from ..services.compliance import check_compliance, calculate_total_score

router = APIRouter(prefix="/api/hospital-ratings", tags=["hospital-ratings"])


# ---------- Pydantic schemas ----------

class SubmitDetail(BaseModel):
    indicator_id: int
    actual_value: Optional[str] = None
    remark: Optional[str] = None

class SubmitBody(BaseModel):
    department_id: Optional[int] = None
    rating_cycle: str
    details: List[SubmitDetail]

class RejectBody(BaseModel):
    feedback: str


# ---------- Dashboard ----------

@router.get("/dashboard")
def dashboard(
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    """院长仪表盘 — 全院各科室评级状态一览"""
    hg_set = db.query(StandardSet).filter(StandardSet.type == "hospital_grade").first()
    set_id = hg_set.id if hg_set else None

    q = db.query(Assessment).filter(Assessment.tenant_id == tenant_id)
    if set_id:
        q = q.filter(Assessment.set_id == set_id)
    assessments = q.order_by(Assessment.created_at.desc()).all()

    depts = db.query(Department).filter(Department.tenant_id == tenant_id).all()
    dept_map = {d.id: d.name for d in depts}

    dept_latest = {}
    for a in assessments:
        if a.department_id and a.department_id not in dept_latest:
            dept_latest[a.department_id] = a

    dept_stats = []
    for d in depts:
        latest = dept_latest.get(d.id)
        if latest:
            non_compliant = sum(1 for it in latest.items if it.is_compliant is False)
            dept_stats.append({
                "id": d.id,
                "name": d.name,
                "assessment_id": latest.id,
                "score": float(latest.total_score) if latest.total_score else None,
                "status": latest.status,
                "non_compliant_count": non_compliant,
                "total_items": len(latest.items),
                "rating_cycle": latest.rating_cycle,
            })
        else:
            dept_stats.append({
                "id": d.id,
                "name": d.name,
                "assessment_id": None,
                "score": None,
                "status": "not_submitted",
                "non_compliant_count": 0,
                "total_items": 0,
                "rating_cycle": None,
            })

    approved = sum(1 for s in dept_stats if s["status"] == "approved")
    rejected = sum(1 for s in dept_stats if s["status"] == "rejected")
    pending = sum(1 for s in dept_stats if s["status"] in ("submitted", "revising"))
    not_submitted = sum(1 for s in dept_stats if s["status"] in ("not_submitted", "draft"))

    scores = [s["score"] for s in dept_stats if s["score"] is not None]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0

    return {
        "total_departments": len(dept_stats),
        "approved": approved,
        "rejected": rejected,
        "pending": pending,
        "not_submitted": not_submitted,
        "average_score": avg_score,
        "departments": dept_stats,
    }


# ---------- Submit ----------

@router.post("/submit")
def submit_rating(
    body: SubmitBody,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    ut=Depends(get_current_user_tenant),
):
    """科室负责人提交评级数据"""
    dept_id = body.department_id or ut.dept_id
    if not dept_id:
        raise HTTPException(400, "No department context")

    hg_set = db.query(StandardSet).filter(StandardSet.type == "hospital_grade").first()
    if not hg_set:
        raise HTTPException(400, "No hospital grade standard set found")

    dept = db.get(Department, dept_id)
    if not dept:
        raise HTTPException(404, "Department not found")

    a = Assessment(
        tenant_id=tenant_id,
        name=f"{dept.name} - {body.rating_cycle}三甲评级",
        target_level=1,
        department_id=dept_id,
        rating_cycle=body.rating_cycle,
        submitter_id=user.id,
        status="draft",
        set_id=hg_set.id,
    )
    db.add(a)
    db.flush()

    items_out = []
    for d in body.details:
        ind = db.get(StdIndicator, d.indicator_id)
        if not ind:
            continue

        is_compliant = None
        score = None
        if d.actual_value is not None and ind.standard_value and ind.indicator_type:
            result = check_compliance(d.actual_value, ind.standard_value, ind.indicator_type)
            is_compliant = result["is_compliant"]
            score = result["score"]

        item = AssessmentItem(
            assessment_id=a.id,
            indicator_id=d.indicator_id,
            actual_value=d.actual_value,
            is_compliant=is_compliant,
            score=score,
            gap_note=d.remark,
            updated_at=datetime.now(timezone.utc) if d.actual_value else None,
        )
        db.add(item)
        db.flush()

        cat = db.get(StdCategory, ind.category_id)
        items_out.append({
            "id": item.id,
            "indicator_id": ind.id,
            "name": ind.name,
            "category_name": cat.name if cat else None,
            "standard_value": ind.standard_value,
            "unit": ind.unit,
            "indicator_type": ind.indicator_type,
            "weight": float(ind.weight) if ind.weight else None,
            "actual_value": item.actual_value,
            "is_compliant": item.is_compliant,
            "score": item.score,
            "remark": item.gap_note,
        })

    scored_items = [
        {"score": it["score"], "weight": it["weight"]}
        for it in items_out if it["score"] is not None and it["weight"]
    ]
    if scored_items:
        total_weighted = sum(s["score"] * s["weight"] / 100 for s in scored_items)
        total_weight = sum(s["weight"] for s in scored_items)
        a.total_score = round(total_weighted / total_weight * 100, 2) if total_weight else 0

    a.status = "submitted"
    a.submitted_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "assessment_id": a.id,
        "total_score": float(a.total_score) if a.total_score else 0,
        "total_items": len(items_out),
        "compliant_count": sum(1 for it in items_out if it["is_compliant"]),
        "non_compliant_count": sum(1 for it in items_out if it["is_compliant"] is False),
        "items": items_out,
    }


# ---------- My Department ----------

@router.get("/my-department")
def my_department_ratings(
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    ut: UserTenant = Depends(get_current_user_tenant),
):
    """科室负责人查看自己的评级记录"""
    hg_set = db.query(StandardSet).filter(StandardSet.type == "hospital_grade").first()
    set_id = hg_set.id if hg_set else None

    q = db.query(Assessment).filter(
        Assessment.tenant_id == tenant_id,
        Assessment.department_id == ut.dept_id,
    )
    if set_id:
        q = q.filter(Assessment.set_id == set_id)

    assessments = q.order_by(Assessment.created_at.desc()).all()
    return [
        {
            "id": a.id,
            "name": a.name,
            "rating_cycle": a.rating_cycle,
            "total_score": float(a.total_score) if a.total_score else None,
            "status": a.status,
            "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
            "non_compliant_count": sum(1 for it in a.items if it.is_compliant is False),
            "total_items": len(a.items),
        }
        for a in assessments
    ]


# ---------- Report ----------

@router.get("/report/{aid}")
def get_report(
    aid: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    """查看科室评级报告"""
    a = db.query(Assessment).filter(
        Assessment.id == aid, Assessment.tenant_id == tenant_id
    ).first()
    if not a:
        raise HTTPException(404, "Assessment not found")

    items = []
    for item in a.items:
        ind = db.get(StdIndicator, item.indicator_id)
        cat = db.get(StdCategory, ind.category_id) if ind else None
        items.append({
            "id": item.id,
            "indicator_id": item.indicator_id,
            "name": ind.name if ind else None,
            "category_name": cat.name if cat else None,
            "standard_value": ind.standard_value if ind else None,
            "unit": ind.unit if ind else None,
            "weight": float(ind.weight) if ind and ind.weight else None,
            "actual_value": item.actual_value,
            "is_compliant": item.is_compliant,
            "score": item.score,
            "remark": item.gap_note,
        })

    compliant = [i for i in items if i["is_compliant"]]
    non_compliant = [i for i in items if i["is_compliant"] is False]

    return {
        "assessment_id": a.id,
        "name": a.name,
        "rating_cycle": a.rating_cycle,
        "total_score": float(a.total_score) if a.total_score else 0,
        "total_items": len(items),
        "compliant_count": len(compliant),
        "non_compliant_count": len(non_compliant),
        "compliance_rate": f"{(len(compliant) / len(items) * 100):.1f}%" if items else "0%",
        "passed": float(a.total_score or 0) >= 60,
        "status": a.status,
        "items": items,
    }


# ---------- Approve ----------

@router.post("/{aid}/approve")
def approve_rating(
    aid: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_role("admin", "director")),
):
    """院长通过评级"""
    a = db.query(Assessment).filter(
        Assessment.id == aid, Assessment.tenant_id == tenant_id
    ).first()
    if not a:
        raise HTTPException(404, "Assessment not found")
    if a.status != "submitted":
        raise HTTPException(400, f"Cannot approve: current status is '{a.status}'")

    a.status = "approved"
    db.add(ReviewRecord(assessment_id=a.id, reviewer_id=user.id, action="approved", feedback=""))

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


# ---------- Reject ----------

@router.post("/{aid}/reject")
def reject_rating(
    aid: int,
    body: RejectBody,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_role("admin", "director")),
):
    """院长退回评级"""
    a = db.query(Assessment).filter(
        Assessment.id == aid, Assessment.tenant_id == tenant_id
    ).first()
    if not a:
        raise HTTPException(404, "Assessment not found")
    if a.status != "submitted":
        raise HTTPException(400, f"Cannot reject: current status is '{a.status}'")

    a.status = "rejected"
    db.add(ReviewRecord(
        assessment_id=a.id,
        reviewer_id=user.id,
        action="rejected",
        feedback=body.feedback,
    ))

    non_compliant_items = [it for it in a.items if it.is_compliant is False]
    ncp = "\n".join(
        f"  • {db.get(StdIndicator, it.indicator_id).name}: 实际 {it.actual_value}"
        for it in non_compliant_items[:5]
    ) if non_compliant_items else ""

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


# ---------- Standards ----------

@router.get("/standards")
def list_hospital_standards(
    db: Session = Depends(get_db),
):
    """获取三甲医院评审标准库（分类 + 指标树）"""
    categories = db.query(StdCategory).filter(
        StdCategory.parent_id.is_(None)
    ).order_by(StdCategory.sort_order).all()

    def build_tree(cat):
        children = [build_tree(c) for c in cat.children] if cat.children else None
        indicators = [
            {
                "id": ind.id,
                "code": ind.code,
                "name": ind.name,
                "standard_value": ind.standard_value,
                "unit": ind.unit,
                "indicator_type": ind.indicator_type,
                "weight": float(ind.weight) if ind.weight else None,
                "max_score": ind.max_score,
            }
            for ind in cat.indicators
        ]
        return {
            "id": cat.id,
            "name": cat.name,
            "code": cat.code,
            "weight": float(cat.weight) if cat.weight else None,
            "sort_order": cat.sort_order,
            "children": children,
            "indicators": indicators,
        }

    return [build_tree(c) for c in categories]
