"""AI Report + Anomaly Detection + Health Commission Export + Async tasks"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db, SessionLocal
from ..models.assessment import Assessment
from ..models.standard import StdCategory, StdIndicator
from ..middleware.tenant import get_current_tenant_id
from ..services.task_queue import submit

router = APIRouter(prefix="/api/ai", tags=["ai"])


class AsyncAIRequest(BaseModel):
    type: str  # summary, anomalies, gap_analysis, knowledge_search, suggest_case, pdca_plan, meeting_summary, inspection
    params: dict = {}

    class Config:
        extra = "allow"


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


@router.post("/async")
def ai_async(body: AsyncAIRequest, tenant_id=Depends(get_current_tenant_id), db=Depends(get_db)):
    """Submit an AI task to background queue. Returns task_id for polling at GET /api/tasks/{task_id}."""
    p = body.params

    if body.type == "summary":
        # Build assessment data inline
        aid = p.get("aid")
        a = db.query(Assessment).filter(Assessment.id == aid, Assessment.tenant_id == tenant_id).first()
        if not a: raise HTTPException(404, "Assessment not found")
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
            if i["is_compliant"]: cats[cn]["compliant"] += 1
        breakdown = [{"name": cn, "total": s["total"], "compliant": s["compliant"],
                      "rate": round(s["compliant"]/s["total"]*100,1)} for cn, s in cats.items()]
        data = {"name": a.name, "rating_cycle": a.rating_cycle, "total_score": float(a.total_score or 0),
                "items": items, "categories_breakdown": breakdown}

        def _run():
            from ..services.ai_report import generate_summary_report, detect_anomalies
            return {"report": generate_summary_report(data), "anomalies": detect_anomalies(items)}
        return {"task_id": submit(_run)}

    elif body.type == "anomalies":
        aid = p.get("aid")
        a = db.query(Assessment).filter(Assessment.id == aid, Assessment.tenant_id == tenant_id).first()
        if not a: raise HTTPException(404, "Assessment not found")
        items = []
        for item in a.items:
            ind = db.get(StdIndicator, item.indicator_id)
            cat = db.get(StdCategory, ind.category_id) if ind else None
            items.append({
                "name": ind.name if ind else "?", "category_name": cat.name if cat else "?",
                "standard_value": ind.standard_value if ind else "",
                "actual_value": item.actual_value, "indicator_type": ind.indicator_type if ind else "",
            })

        def _run():
            from ..services.ai_report import detect_anomalies
            return {"anomalies": detect_anomalies(items)}
        return {"task_id": submit(_run)}

    elif body.type == "gap_analysis":
        aid = p.get("aid")
        a = db.query(Assessment).filter(Assessment.id == aid, Assessment.tenant_id == tenant_id).first()
        if not a: raise HTTPException(404, "Assessment not found")
        items = []
        for item in a.items:
            ind = db.get(StdIndicator, item.indicator_id)
            cat = db.get(StdCategory, ind.category_id) if ind else None
            if not ind: continue
            items.append({
                "name": ind.name, "category_name": cat.name if cat else None,
                "standard_value": ind.standard_value, "unit": ind.unit,
                "indicator_type": ind.indicator_type,
                "actual_value": item.actual_value, "is_compliant": item.is_compliant,
            })

        def _run():
            from ..services.gap_analysis import analyze_assessment_ai
            return analyze_assessment_ai(items, assessment_name=a.name if a else "")
        return {"task_id": submit(_run)}

    elif body.type == "knowledge_search":
        q = p.get("q", "")
        if not q: raise HTTPException(400, "Missing query")

        def _run():
            db2 = SessionLocal()
            try:
                from ..services.deepseek_client import chat_with_system
                from ..models.knowledge import Regulation, RectifyCase
                regs = db2.query(Regulation).filter(
                    (Regulation.title.contains(q[:20])) | (Regulation.content.contains(q[:20]))
                ).limit(20).all()
                cases = db2.query(RectifyCase).filter(
                    RectifyCase.indicator_name.contains(q[:10])
                ).limit(10).all()
                sources = [{"type": "regulation", "id": r.id, "title": r.title} for r in regs]
                sources += [{"type": "case", "id": c.id, "title": c.indicator_name} for c in cases]
                context_parts = [f"[法规] {r.title}: {r.content}" for r in regs]
                context_parts += [f"[案例] {c.indicator_name}: {c.solution}" for c in cases]
                system = "你是医院评审专家，基于知识库内容回答问题。"
                if context_parts:
                    prompt = f"用户问题: {q}\n\n知识库检索结果:\n" + "\n".join(context_parts) + "\n\n请基于以上知识库内容回答。"
                else:
                    prompt = q
                answer = chat_with_system(prompt, system, max_tokens=8192)
                return {"answer": answer or "AI 服务暂不可用", "sources": sources}
            finally:
                db2.close()
        return {"task_id": submit(_run)}

    elif body.type == "suggest_case":
        indicator_name = p.get("indicator_name", "")
        problem_desc = p.get("problem_desc", "")
        if not indicator_name: raise HTTPException(400, "Missing indicator_name")

        def _run():
            db2 = SessionLocal()
            try:
                from ..services.deepseek_client import chat_with_system
                from ..models.knowledge import RectifyCase
                cases = db2.query(RectifyCase).filter(
                    RectifyCase.indicator_name.contains(indicator_name[:8])
                ).limit(10).all()
                refs = [{"id": c.id, "title": c.indicator_name, "solution": c.solution} for c in cases]
                context = "\n".join(f"- {c.problem} → {c.solution} (效果: {c.result})" for c in cases)
                ctx_block = "知识库相似案例:\n" + context if context else "无相似案例"
                prompt = f"未达标指标: {indicator_name}\n问题描述: {problem_desc}\n\n{ctx_block}\n\n请设计整改方案：1.根因分析 2.具体措施 3.时间线 4.预期效果"
                suggestion = chat_with_system(prompt, "你是医院评审整改专家，设计具体可操作的整改方案。", max_tokens=8192)
                return {"suggestion": suggestion or "AI 服务暂不可用", "references": refs}
            finally:
                db2.close()
        return {"task_id": submit(_run)}

    elif body.type == "pdca_plan":
        pid = p.get("pid")
        if not pid: raise HTTPException(400, "Missing pid")
        from ..models.workflow import PDCAProject
        proj = db.query(PDCAProject).join(Assessment).filter(
            PDCAProject.id == pid, Assessment.tenant_id == tenant_id
        ).first()
        if not proj: raise HTTPException(404, "PDCA not found")
        ind = db.get(StdIndicator, proj.indicator_id)
        a = db.get(Assessment, proj.assessment_id)

        def _run():
            from ..services.deepseek_client import chat_with_system
            prompt = f"指标: {ind.name if ind else '?'}\n当前值: {proj.current_value}\n目标值: {proj.target_value or (ind.standard_value if ind else '')}\n\n请按PDCA四阶段设计改进计划：(1)Plan根因+方案 (2)Do实施步骤 (3)Check监控指标 (4)Act标准化+持续改进"
            plan = chat_with_system(prompt, "你是医院质量改进专家，精通PDCA方法论。", max_tokens=16384)
            return {"plan": plan or "AI 服务暂不可用"}
        return {"task_id": submit(_run)}

    elif body.type == "meeting_summary":
        mid = p.get("mid")
        if not mid: raise HTTPException(400, "Missing mid")
        from ..models.workflow import ReviewMeeting
        m = db.query(ReviewMeeting).filter(
            ReviewMeeting.id == mid, ReviewMeeting.tenant_id == tenant_id
        ).first()
        if not m: raise HTTPException(404, "Meeting not found")

        def _run():
            from ..services.deepseek_client import chat_with_system
            prompt = f"会议: {m.title}\n日期: {m.meeting_date}\n参会: {m.attendees}\n议题: {m.topics}\n讨论: {m.discussion}\n结论: {m.conclusions}\n投票: {m.votes_approve}赞成/{m.votes_reject}反对/{m.votes_abstain}弃权\n\n请生成会议纪要：1.基本信息 2.议题概述 3.讨论要点 4.决议事项 5.下一步行动计划"
            summary = chat_with_system(prompt, "你是医院评审会议秘书，整理会议纪要。", max_tokens=16384)
            return {"summary": summary or "AI 服务暂不可用"}
        return {"task_id": submit(_run)}

    elif body.type == "inspection":
        count = p.get("count", 10)
        category_filter = p.get("category_filter", "")
        tid = tenant_id  # capture for closure

        def _run():
            import random, json
            db2 = SessionLocal()
            try:
                from ..models.department import Department as DeptM
                assessments = db2.query(Assessment).filter(Assessment.tenant_id == tid).all()
                if not assessments: return {"analysis": "无评估数据"}
                all_items = []
                for a in assessments:
                    for item in a.items:
                        ind = db2.get(StdIndicator, item.indicator_id)
                        if not ind: continue
                        cat = db2.get(StdCategory, ind.category_id)
                        if category_filter and cat and category_filter not in cat.name: continue
                        dept = db2.get(DeptM, a.department_id)
                        all_items.append({
                            "dept_name": dept.name if dept else "?", "indicator_name": ind.name,
                            "category": cat.name if cat else "?", "standard_value": ind.standard_value,
                            "actual_value": item.actual_value, "is_compliant": item.is_compliant,
                        })
                if not all_items: return {"analysis": "无符合条件的数据"}
                sample = random.sample(all_items, min(count, len(all_items)))
                compliant = sum(1 for i in sample if i["is_compliant"])
                from ..services.deepseek_client import chat_with_system
                analysis = chat_with_system(
                    f"随机抽检{len(sample)}项指标:\n{json.dumps(sample, ensure_ascii=False, indent=2)}\n\n请分析：1.整体评价 2.薄弱类别/科室 3.高风险指标类型 4.优先整改方向",
                    "你是医院评审专家，通过抽样发现系统性问题。", max_tokens=8192
                )
                return {"items": sample, "total": len(sample), "compliant": compliant,
                        "pass_rate": round(compliant/len(sample)*100,1) if sample else 0,
                        "ai_analysis": analysis or "AI 服务暂不可用"}
            finally:
                db2.close()
        return {"task_id": submit(_run)}

    else:
        raise HTTPException(400, f"Unknown task type: {body.type}")
