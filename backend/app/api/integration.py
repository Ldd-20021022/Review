"""系统集成 API — HIS对接 + QR扫码 + 卫健委直报"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.assessment import Assessment, AssessmentItem
from ..models.standard import StdIndicator, StdCategory
from ..models.department import Department
from ..middleware.tenant import get_current_tenant_id, get_current_user, require_role
from ..services.compliance import check_compliance

router = APIRouter(prefix="/api/integration", tags=["integration"])


# ═══════════ HIS 数据对接 ═══════════

class HISDataRow(BaseModel):
    dept_code: str = ""
    dept_name: str = ""        # 科室名称
    indicator_code: str = ""   # 指标编码
    actual_value: str = ""     # 实际值
    cycle: str = ""            # 周期


@router.post("/his/pull")
def his_pull_data(
    data: List[HISDataRow],
    tenant_id=Depends(get_current_tenant_id),
    db=Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_role("admin", "director")),
):
    """HIS/EMR 自动推送数据 — 批量创建/更新科室指标"""
    from datetime import datetime, timezone
    from ..models.standard_set import StandardSet
    hg_set = db.query(StandardSet).filter(StandardSet.type == "hospital_grade").first()
    if not hg_set: raise HTTPException(400, "No hospital grade standard set")

    results = {"created": 0, "updated": 0, "errors": []}
    dept_assessments = {}  # (dept_name, cycle) -> assessment_id

    for row in data:
        try:
            ind = db.query(StdIndicator).filter(StdIndicator.code == row.indicator_code).first()
            if not ind:
                results["errors"].append(f"Unknown code: {row.indicator_code}")
                continue

            dept = db.query(Department).filter(
                Department.tenant_id == tenant_id,
                Department.name == row.dept_name,
            ).first()
            if not dept:
                dept = Department(tenant_id=tenant_id, name=row.dept_name)
                db.add(dept); db.flush()

            key = (dept.id, row.cycle or "HIS导入")
            if key not in dept_assessments:
                a = Assessment(tenant_id=tenant_id, name=f"{dept.name}-{key[1]}三甲评级",
                               target_level=1, department_id=dept.id, rating_cycle=key[1],
                               submitter_id=user.id, set_id=hg_set.id, status="draft")
                db.add(a); db.flush()
                dept_assessments[key] = a.id

            aid = dept_assessments[key]
            existing = db.query(AssessmentItem).filter(
                AssessmentItem.assessment_id == aid,
                AssessmentItem.indicator_id == ind.id,
            ).first()

            is_compliant = None; score = None
            if row.actual_value and ind.standard_value and ind.indicator_type:
                r = check_compliance(row.actual_value, ind.standard_value, ind.indicator_type)
                is_compliant = r["is_compliant"]; score = r["score"]

            if existing:
                existing.actual_value = row.actual_value
                existing.is_compliant = is_compliant
                existing.score = score
                existing.updated_at = datetime.now(timezone.utc)
                results["updated"] += 1
            else:
                db.add(AssessmentItem(assessment_id=aid, indicator_id=ind.id,
                      actual_value=row.actual_value, is_compliant=is_compliant,
                      score=score))
                results["created"] += 1
        except Exception as e:
            results["errors"].append(str(e))

    db.commit()
    return results


# ═══════════ QR 扫码填报 ═══════════

@router.get("/qr/{dept_id}")
def get_dept_qr_url(dept_id: int, db=Depends(get_db)):
    """获取科室填报二维码链接"""
    dept = db.get(Department, dept_id)
    if not dept: raise HTTPException(404, "Department not found")
    return {
        "dept_id": dept.id,
        "dept_name": dept.name,
        "form_url": f"/#/hospital-rating/form?dept={dept_id}",
        "qr_content": f"hospital-rating://fill?dept={dept_id}&name={dept.name}",
    }


# ═══════════ 卫健委直报 ═══════════

@router.post("/report-to-commission")
def report_to_commission(
    assessment_id: int = 0,
    tenant_id=Depends(get_current_tenant_id),
    db=Depends(get_db),
    _=Depends(require_role("admin", "director")),
):
    """一键上报省级卫健委平台 — 生成标准格式并提交"""
    a = db.query(Assessment).filter(
        Assessment.id == assessment_id, Assessment.tenant_id == tenant_id
    ).first()
    if not a: raise HTTPException(404, "Assessment not found")

    items = []
    for it in a.items:
        ind = db.get(StdIndicator, it.indicator_id)
        cat = db.get(StdCategory, ind.category_id) if ind else None
        items.append({
            "indicator_code": (ind.code if ind else ""),
            "indicator_name": (ind.name if ind else ""),
            "category": (cat.name if cat else ""),
            "standard_value": (ind.standard_value if ind else ""),
            "actual_value": (it.actual_value or ""),
            "is_compliant": it.is_compliant,
            "score": it.score,
        })

    dept = db.get(Department, a.department_id)
    payload = {
        "report_type": "三级医院评审监测数据",
        "standard_version": "2025年版",
        "hospital_name": getattr(dept, "name", "") if dept else "",
        "cycle": a.rating_cycle,
        "total_score": float(a.total_score or 0),
        "compliance_rate": round(sum(1 for i in items if i["is_compliant"]) / len(items) * 100, 1) if items else 0,
        "total_indicators": len(items),
        "submitted_at": str(a.submitted_at),
        "indicators": items,
        "submitter": "三甲医院评级系统",
    }

    # In production, this would POST to provincial health commission API
    # For now, return the payload that would be submitted
    commission_url = "https://wjw-province-api.example.com/api/hospital-rating/submit"
    return {
        "ok": True,
        "message": f"已生成卫健委标准格式，共{len(items)}项指标",
        "target_url": commission_url,
        "payload": payload,
    }


# ═══════════ Dashboard Customization ═══════════

class DashboardConfig(BaseModel):
    layout: str = "default"


@router.get("/dashboard-config")
def get_dashboard_config():
    return {"layout": "default"}


@router.post("/dashboard-config")
def save_dashboard_config(config: DashboardConfig):
    return {"ok": True, "layout": config.layout}
