from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models.assessment import Assessment, AssessmentItem
from ..models.department import Department
from ..models.standard import StdCategory, StdIndicator
from ..middleware.tenant import get_current_tenant_id, get_current_user_tenant

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/director")
def director_dashboard(
    set_type: Optional[str] = Query(None),
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    ut = Depends(get_current_user_tenant),
):
    """综合仪表盘 — 院长/管理员看全院，科室负责人只看自己科室。"""
    q = db.query(Assessment).filter(Assessment.tenant_id == tenant_id)
    if set_type:
        from ..models.standard_set import StandardSet
        hg_set = db.query(StandardSet).filter(StandardSet.type == set_type).first()
        if hg_set:
            q = q.filter(Assessment.set_id == hg_set.id)
    assessments = q.order_by(Assessment.created_at.desc()).all()

    # 科室负责人只看自己科室
    is_manager = ut.role in ('admin', 'director')
    if not is_manager and ut.dept_id:
        assessments = [a for a in assessments if a.department_id == ut.dept_id]

    depts = db.query(Department).filter(Department.tenant_id == tenant_id).all()
    if not is_manager and ut.dept_id:
        depts = [d for d in depts if d.id == ut.dept_id]

    # Group assessments by department (latest per dept)
    dept_latest = {}
    for a in assessments:
        if a.department_id and a.department_id not in dept_latest:
            dept_latest[a.department_id] = a

    # Build department stats
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

    # Summary
    approved = sum(1 for s in dept_stats if s["status"] == "approved")
    rejected = sum(1 for s in dept_stats if s["status"] == "rejected")
    pending = sum(1 for s in dept_stats if s["status"] in ("submitted", "revising"))
    not_submitted = sum(1 for s in dept_stats if s["status"] in ("not_submitted", "draft"))

    scores = [s["score"] for s in dept_stats if s["score"] is not None]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0

    # Category-level compliance across all assessments
    cat_compliance = {}
    for s in dept_stats:
        aid = s.get("assessment_id")
        if not aid: continue
        a = db.get(Assessment, aid)
        if not a: continue
        for item in a.items:
            ind = db.get(StdIndicator, item.indicator_id)
            if not ind: continue
            cat = db.get(StdCategory, ind.category_id)
            cn = cat.name if cat else "其他"
            if cn not in cat_compliance:
                cat_compliance[cn] = {"total": 0, "compliant": 0}
            cat_compliance[cn]["total"] += 1
            if item.is_compliant:
                cat_compliance[cn]["compliant"] += 1
    category_stats = [
        {"name": cn, "total": s["total"], "compliant": s["compliant"],
         "rate": round(s["compliant"]/s["total"]*100, 1) if s["total"] else 0}
        for cn, s in sorted(cat_compliance.items(), key=lambda x: x[1]["compliant"]/x[1]["total"] if x[1]["total"] else 0)
    ]

    # Urgent departments (rejected + not submitted)
    urgent = [s for s in dept_stats if s["status"] in ("rejected", "not_submitted")]
    urgent.sort(key=lambda x: (x["score"] or 0))

    return {
        "total_departments": len(dept_stats),
        "approved": approved,
        "rejected": rejected,
        "pending": pending,
        "not_submitted": not_submitted,
        "average_score": avg_score,
        "departments": dept_stats,
        "is_manager": is_manager,
        "category_stats": category_stats,
        "urgent": urgent[:5],
    }


@router.get("/overview")
def overview(
    assessment_id: int = Query(...),
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    """Task-based overview for a specific assessment (legacy)."""
    from ..models.task import RectifyTask
    tasks = (
        db.query(RectifyTask)
        .join(Assessment)
        .filter(
            RectifyTask.assessment_id == assessment_id,
            Assessment.tenant_id == tenant_id,
        )
        .all()
    )

    total = len(tasks)
    status_counts = {"pending": 0, "in_progress": 0, "submitted": 0, "accepted": 0, "returned": 0}
    for t in tasks:
        if t.status in status_counts:
            status_counts[t.status] += 1

    completed = status_counts["accepted"]
    rate = round(completed / total * 100, 1) if total > 0 else 0

    return {
        "total": total,
        "pending": status_counts["pending"],
        "in_progress": status_counts["in_progress"],
        "submitted": status_counts["submitted"],
        "accepted": status_counts["accepted"],
        "returned": status_counts["returned"],
        "completed": completed,
        "completion_rate": rate,
    }


@router.get("/departments")
def departments(
    assessment_id: int = Query(...),
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    """Per-department progress comparison (legacy)."""
    from ..models.task import RectifyTask
    tasks = (
        db.query(RectifyTask)
        .join(Assessment)
        .filter(
            RectifyTask.assessment_id == assessment_id,
            Assessment.tenant_id == tenant_id,
        )
        .all()
    )

    dept_map = {}
    for t in tasks:
        if t.dept_id not in dept_map:
            dept = db.get(Department, t.dept_id)
            dept_map[t.dept_id] = {
                "dept_id": t.dept_id,
                "dept_name": dept.name if dept else f"科室{t.dept_id}",
                "total": 0,
                "accepted": 0,
                "in_progress": 0,
                "pending": 0,
            }
        d = dept_map[t.dept_id]
        d["total"] += 1
        if t.status == "accepted":
            d["accepted"] += 1
        elif t.status in ("in_progress", "submitted"):
            d["in_progress"] += 1
        else:
            d["pending"] += 1

    result = []
    for d in dept_map.values():
        d["rate"] = round(d["accepted"] / d["total"] * 100, 1) if d["total"] > 0 else 0
        result.append(d)

    result.sort(key=lambda x: x["rate"], reverse=True)
    return result


@router.get("/dimensions")
def dimensions(
    assessment_id: int = Query(...),
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    """Coverage analysis by standard categories (legacy)."""
    from ..models.task import RectifyTask
    tasks = (
        db.query(RectifyTask)
        .join(Assessment)
        .filter(
            RectifyTask.assessment_id == assessment_id,
            Assessment.tenant_id == tenant_id,
        )
        .all()
    )

    cat_map = {}
    for t in tasks:
        ind = db.get(StdIndicator, t.indicator_id)
        if not ind:
            continue
        cat = db.get(StdCategory, ind.category_id)
        cat_name = cat.name if cat else "其他"

        if cat_name not in cat_map:
            cat_map[cat_name] = {"category_name": cat_name, "total": 0, "accepted": 0}
        cat_map[cat_name]["total"] += 1
        if t.status == "accepted":
            cat_map[cat_name]["accepted"] += 1

    result = []
    for c in cat_map.values():
        c["rate"] = round(c["accepted"] / c["total"] * 100, 1) if c["total"] > 0 else 0
        result.append(c)

    result.sort(key=lambda x: x["rate"])
    return result


@router.get("/trend")
def trend(
    assessment_id: int = Query(...),
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    """Time-based completion trend (legacy)."""
    from ..models.task import RectifyTask
    tasks = (
        db.query(RectifyTask)
        .join(Assessment)
        .filter(
            RectifyTask.assessment_id == assessment_id,
            Assessment.tenant_id == tenant_id,
        )
        .order_by(RectifyTask.created_at)
        .all()
    )

    if not tasks:
        return []

    from collections import defaultdict
    daily = defaultdict(lambda: {"completed": 0, "total": 0})

    for t in tasks:
        day = t.created_at.strftime("%Y-%m-%d")
        daily[day]["total"] += 1
        if t.status == "accepted":
            daily[day]["completed"] += 1

    result = []
    cum_total = 0
    cum_done = 0
    for day in sorted(daily.keys()):
        cum_total += daily[day]["total"]
        cum_done += daily[day]["completed"]
        result.append({
            "date": day,
            "total": cum_total,
            "completed": cum_done,
            "rate": round(cum_done / cum_total * 100, 1) if cum_total > 0 else 0,
        })

    return result
