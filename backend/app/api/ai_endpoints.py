"""AI Report + Anomaly Detection + Health Commission Export"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.assessment import Assessment
from ..models.standard import StdCategory, StdIndicator
from ..middleware.tenant import get_current_tenant_id

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/summary/{aid}")
def ai_summary(aid: int, tenant_id=Depends(get_current_tenant_id), db=Depends(get_db)):
    a = db.query(Assessment).filter(Assessment.id == aid, Assessment.tenant_id == tenant_id).first()
    if not a:
        raise HTTPException(404, "Assessment not found")
    items = []
    for item in a.items:
        ind = db.get(StdIndicator, item.indicator_id)
        cat = db.get(StdCategory, ind.category_id) if ind else None
        items.append({
            "name": ind.name if ind else "?", "category_name": cat.name if cat else "?",
            "standard_value": ind.standard_value if ind else "",
            "actual_value": item.actual_value, "is_compliant": item.is_compliant,
            "score": item.score, "indicator_id": item.indicator_id,
        })
    cats = {}
    for i in items:
        cn = i["category_name"]
        cats.setdefault(cn, {"total": 0, "compliant": 0})
        cats[cn]["total"] += 1
        if i["is_compliant"]:
            cats[cn]["compliant"] += 1
    from ..services.ai_report import generate_summary_report, detect_anomalies
    breakdown = [{"name": cn, "total": s["total"], "compliant": s["compliant"],
                  "rate": round(s["compliant"] / s["total"] * 100, 1)} for cn, s in cats.items()]
    data = {"name": a.name, "rating_cycle": a.rating_cycle,
            "total_score": float(a.total_score or 0), "items": items,
            "categories_breakdown": breakdown}
    return {"report": generate_summary_report(data), "anomalies": detect_anomalies(items)}


@router.get("/export/{aid}")
def export_health_commission(aid: int, tenant_id=Depends(get_current_tenant_id), db=Depends(get_db)):
    a = db.query(Assessment).filter(Assessment.id == aid, Assessment.tenant_id == tenant_id).first()
    if not a:
        raise HTTPException(404, "Assessment not found")
    items = []
    for item in a.items:
        ind = db.get(StdIndicator, item.indicator_id)
        cat = db.get(StdCategory, ind.category_id) if ind else None
        items.append({
            "name": ind.name if ind else "?", "category_name": cat.name if cat else "?",
            "standard_value": ind.standard_value if ind else "",
            "actual_value": item.actual_value, "is_compliant": item.is_compliant,
            "score": item.score, "indicator_id": item.indicator_id,
        })
    data = {"name": a.name, "rating_cycle": a.rating_cycle,
            "total_score": float(a.total_score or 0),
            "compliance_rate": f"{sum(1 for i in items if i.get('is_compliant')) / len(items) * 100:.1f}%" if items else "0%",
            "items": items}
    from ..services.ai_report import export_health_commission_format
    return export_health_commission_format(data)
