"""流程深化 API — PDCA 改进 + 评审会议 + 模拟抽检"""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.workflow import PDCAProject, ReviewMeeting
from ..models.assessment import Assessment, AssessmentItem
from ..models.standard import StdIndicator, StdCategory
from ..models.department import Department
from ..middleware.tenant import get_current_tenant_id, get_current_user, get_current_user_tenant
from ..services.deepseek_client import chat_with_system

router = APIRouter(prefix="/api/workflow", tags=["workflow"])


# ═══════════════ PDCA ═══════════════

@router.post("/pdca/create")
def create_pdca(
    assessment_id: int = 0,
    db: Session = Depends(get_db),
    ut=Depends(get_current_user_tenant),
):
    """从未达标指标自动生成 PDCA 改进项目"""
    a = db.query(Assessment).filter(
        Assessment.id == assessment_id,
        Assessment.tenant_id == ut.tenant_id,
    ).first()
    if not a: raise HTTPException(404, "Assessment not found")
    items = [it for it in a.items if it.is_compliant is False]
    created = 0
    for item in items:
        exists = db.query(PDCAProject).filter(
            PDCAProject.assessment_id == assessment_id,
            PDCAProject.indicator_id == item.indicator_id,
        ).first()
        if exists: continue
        ind = db.get(StdIndicator, item.indicator_id)
        title = ind.name if ind else f"指标{item.indicator_id}"
        p = PDCAProject(
            assessment_id=assessment_id, indicator_id=item.indicator_id,
            dept_id=a.department_id or 0,
            title=f"整改: {title}",
            current_value=item.actual_value or "",
            target_value=ind.standard_value if ind else "",
        )
        db.add(p)
        created += 1
    db.commit()
    return {"ok": True, "created": created}


@router.get("/pdca/list")
def list_pdca(
    assessment_id: int = 0,
    db: Session = Depends(get_db),
    ut=Depends(get_current_user_tenant),
):
    q = db.query(PDCAProject).join(Assessment).filter(
        Assessment.tenant_id == ut.tenant_id
    )
    if assessment_id: q = q.filter(PDCAProject.assessment_id == assessment_id)
    if ut.dept_id: q = q.filter(PDCAProject.dept_id == ut.dept_id)
    return [{"id": p.id, "title": p.title, "current_value": p.current_value,
             "target_value": p.target_value, "phase": p.phase, "status": p.status,
             "plan_detail": p.plan_detail, "do_detail": p.do_detail,
             "check_detail": p.check_detail, "act_detail": p.act_detail,
             "due_date": str(p.due_date) if p.due_date else None}
            for p in q.order_by(PDCAProject.created_at.desc()).limit(50).all()]


class PDCAUpdate(BaseModel):
    phase: str = "plan"
    detail: str = ""
    due_date: str = ""


@router.put("/pdca/{pid}")
def update_pdca(
    pid: int,
    body: PDCAUpdate,
    db: Session = Depends(get_db),
    ut=Depends(get_current_user_tenant),
):
    p = db.query(PDCAProject).join(Assessment).filter(
        PDCAProject.id == pid,
        Assessment.tenant_id == ut.tenant_id,
    ).first()
    if not p: raise HTTPException(404, "Not found")
    p.phase = body.phase
    phase_map = {"plan": "plan_detail", "do": "do_detail", "check": "check_detail", "act": "act_detail"}
    if body.phase in phase_map:
        setattr(p, phase_map[body.phase], body.detail)
    if body.due_date:
        p.due_date = date.fromisoformat(body.due_date)
    if body.phase == "act":
        p.status = "completed"
    db.commit()
    return {"ok": True}


# ═══════════════ 评审会议 ═══════════════

class MeetingBody(BaseModel):
    title: str
    meeting_date: str = ""
    attendees: str = ""
    topics: str = ""
    discussion: str = ""
    conclusions: str = ""
    votes_approve: int = 0
    votes_reject: int = 0
    votes_abstain: int = 0


@router.post("/meetings")
def create_meeting(
    body: MeetingBody,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    tenant_id=Depends(get_current_tenant_id),
):
    m = ReviewMeeting(
        tenant_id=tenant_id, title=body.title, attendees=body.attendees,
        topics=body.topics, discussion=body.discussion, conclusions=body.conclusions,
        votes_approve=body.votes_approve, votes_reject=body.votes_reject,
        votes_abstain=body.votes_abstain, recorder_id=user.id,
    )
    if body.meeting_date:
        m.meeting_date = date.fromisoformat(body.meeting_date)
    db.add(m); db.commit(); db.refresh(m)
    return {"ok": True, "id": m.id}


@router.get("/meetings")
def list_meetings(
    db: Session = Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    items = db.query(ReviewMeeting).filter(
        ReviewMeeting.tenant_id == tenant_id
    ).order_by(ReviewMeeting.meeting_date.desc()).limit(20).all()
    return [{"id": m.id, "title": m.title, "meeting_date": str(m.meeting_date),
             "attendees": m.attendees, "topics": m.topics, "discussion": m.discussion,
             "conclusions": m.conclusions,
             "votes": f"{m.votes_approve}赞成/{m.votes_reject}反对/{m.votes_abstain}弃权",
             "recorder_id": m.recorder_id}
            for m in items]


# ═══════════════ 模拟抽检 ═══════════════

@router.get("/inspection")
def random_inspection(
    count: int = 10,
    tenant_id=Depends(get_current_tenant_id),
    db=Depends(get_db),
):
    """随机抽检：从全院指标中随机抽取 N 项生成检查清单"""
    import random
    assessments = db.query(Assessment).filter(
        Assessment.tenant_id == tenant_id
    ).all()
    if not assessments: return {"items": [], "total": 0}

    all_items = []
    for a in assessments:
        for item in a.items:
            ind = db.get(StdIndicator, item.indicator_id)
            if not ind: continue
            cat = db.get(StdCategory, ind.category_id)
            dept = db.get(Department, a.department_id)
            all_items.append({
                "dept_name": dept.name if dept else "?",
                "indicator_name": ind.name,
                "category": cat.name if cat else "?",
                "standard_value": ind.standard_value,
                "unit": ind.unit,
                "actual_value": item.actual_value,
                "is_compliant": item.is_compliant,
                "assessment_id": a.id,
            })

    sample = random.sample(all_items, min(count, len(all_items)))
    compliant = sum(1 for i in sample if i["is_compliant"])
    return {
        "items": sample,
        "total": len(sample),
        "compliant": compliant,
        "pass_rate": round(compliant / len(sample) * 100, 1) if sample else 0,
    }


# ═══════════════ AI 辅助 PDCA ═══════════════

PDCA_SYSTEM = """\
你是医院质量改进专家，精通 PDCA（Plan-Do-Check-Act）方法论。
你需要为未达标指标设计详细的 PDCA 改进计划，包括具体的行动步骤、责任人建议、时间节点和验收标准。
计划要分阶段（plan/do/check/act），每个阶段给出可操作的具体措施。"""


@router.get("/pdca/{pid}/ai-plan")
def ai_generate_pdca_plan(
    pid: int,
    db: Session = Depends(get_db),
    ut=Depends(get_current_user_tenant),
):
    """AI 为指定 PDCA 项目生成详细的改进计划"""
    p = db.query(PDCAProject).join(Assessment).filter(
        PDCAProject.id == pid,
        Assessment.tenant_id == ut.tenant_id,
    ).first()
    if not p:
        raise HTTPException(404, "PDCA project not found")

    # Fetch indicator info
    ind = db.get(StdIndicator, p.indicator_id)
    a = db.get(Assessment, p.assessment_id)

    prompt = f"""请为以下未达标指标设计 PDCA 改进计划：

指标名称: {ind.name if ind else '未知'}
当前值: {p.current_value}
目标值: {p.target_value or (ind.standard_value if ind else '')}
所属科室: {p.dept_id}
评估名称: {a.name if a else ''}

请按 PDCA 四个阶段给出具体计划：

## Plan（计划阶段）
- 根因分析
- 设定量化目标
- 制定行动方案
- 责任分工

## Do（执行阶段）
- 具体实施步骤
- 培训安排
- 资源配置

## Check（检查阶段）
- 过程监控指标
- 中期检查节点
- 数据收集方法

## Act（处理阶段）
- 效果评估标准
- 标准化措施
- 持续改进计划"""

    plan = chat_with_system(prompt, PDCA_SYSTEM, temperature=0.4, max_tokens=16384)

    if plan:
        # Save to plan_detail
        p.plan_detail = plan
        db.commit()

    return {
        "ok": True,
        "pdca_id": pid,
        "plan": plan or "AI 服务暂不可用",
    }


@router.get("/meetings/{mid}/ai-summary")
def ai_meeting_summary(
    mid: int,
    db: Session = Depends(get_db),
    tenant_id=Depends(get_current_tenant_id),
):
    """AI 为评审会议生成纪要总结"""
    m = db.query(ReviewMeeting).filter(
        ReviewMeeting.id == mid,
        ReviewMeeting.tenant_id == tenant_id,
    ).first()
    if not m:
        raise HTTPException(404, "Meeting not found")

    prompt = f"""请根据以下评审会议记录生成一份结构化的会议纪要：

会议标题: {m.title}
日期: {m.meeting_date}
参会人员: {m.attendees}
议题: {m.topics}
讨论内容: {m.discussion}
会议结论: {m.conclusions}
投票结果: {m.votes_approve}赞成/{m.votes_reject}反对/{m.votes_abstain}弃权

请生成包含以下内容的会议纪要：
1. 会议基本信息
2. 议题概述
3. 讨论要点归纳
4. 决议事项
5. 下一步行动计划（含责任人和时间节点）"""

    summary = chat_with_system(
        prompt,
        "你是医院评审会议秘书，擅长整理会议纪要。格式规范，要点清晰，行动计划明确可追踪。",
        temperature=0.3,
        max_tokens=16384,
    )

    return {
        "meeting_id": mid,
        "summary": summary or "AI 服务暂不可用",
    }


class AIInspectionBody(BaseModel):
    category_filter: str = ""


@router.post("/inspection/ai-analysis")
def ai_inspection_analysis(
    count: int = 10,
    body: AIInspectionBody = AIInspectionBody(),
    tenant_id=Depends(get_current_tenant_id),
    db=Depends(get_db),
):
    """AI 模拟抽检分析：先抽检，再用 AI 分析薄弱环节"""
    import random
    assessments = db.query(Assessment).filter(
        Assessment.tenant_id == tenant_id
    ).all()
    if not assessments:
        raise HTTPException(404, "No assessments found")

    all_items = []
    for a in assessments:
        for item in a.items:
            ind = db.get(StdIndicator, item.indicator_id)
            if not ind:
                continue
            cat = db.get(StdCategory, ind.category_id)
            if body.category_filter and cat and body.category_filter not in cat.name:
                continue
            dept = db.get(Department, a.department_id)
            all_items.append({
                "dept_name": dept.name if dept else "?",
                "indicator_name": ind.name,
                "category": cat.name if cat else "?",
                "standard_value": ind.standard_value,
                "unit": ind.unit,
                "actual_value": item.actual_value,
                "is_compliant": item.is_compliant,
            })

    if not all_items:
        raise HTTPException(404, "No items found for the given filter")

    sample = random.sample(all_items, min(count, len(all_items)))
    compliant = sum(1 for i in sample if i["is_compliant"])

    # AI analysis
    import json
    analysis = chat_with_system(
        f"""以下是随机抽取的 {len(sample)} 项指标检查结果，请分析薄弱环节：

{json.dumps(sample, ensure_ascii=False, indent=2)}

请给出：
1. 整体抽检情况评价
2. 主要薄弱类别/科室
3. 最容易出问题的指标类型
4. 建议优先整改的方向""",
        "你是医院等级评审专家，擅长通过抽样检查发现系统性问题。分析要基于数据，建议要具体。",
        temperature=0.3,
        max_tokens=16384,
    )

    return {
        "items": sample,
        "total": len(sample),
        "compliant": compliant,
        "pass_rate": round(compliant / len(sample) * 100, 1) if sample else 0,
        "ai_analysis": analysis or "AI 服务暂不可用",
    }
