"""知识库 API — 法规查询 + 整改案例 + AI 智能检索"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.knowledge import Regulation, RectifyCase
from ..services.deepseek_client import chat_with_system, chat_structured

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.get("/regulations")
def search_regulations(q: str = Query(""), db: Session = Depends(get_db)):
    """搜索法规条文"""
    if q:
        like = f"%{q}%"
        items = db.query(Regulation).filter(
            (Regulation.title.contains(q)) |
            (Regulation.content.contains(q)) |
            (Regulation.keywords.contains(q))
        ).order_by(Regulation.chapter, Regulation.article).limit(50).all()
    else:
        items = db.query(Regulation).order_by(Regulation.chapter, Regulation.article).limit(50).all()
    return [{"id": r.id, "chapter": r.chapter, "article": r.article, "title": r.title,
             "content": r.content, "interpretation": r.interpretation, "keywords": r.keywords}
            for r in items]


@router.get("/cases")
def search_cases(
    indicator: str = Query(""),
    category: str = Query(""),
    db: Session = Depends(get_db),
):
    """搜索整改案例"""
    q = db.query(RectifyCase)
    if indicator:
        q = q.filter(RectifyCase.indicator_name.contains(indicator))
    if category:
        q = q.filter(RectifyCase.category == category)
    items = q.order_by(RectifyCase.difficulty).limit(50).all()
    return [{"id": c.id, "indicator_name": c.indicator_name, "category": c.category,
             "problem": c.problem, "root_cause": c.root_cause, "solution": c.solution,
             "result": c.result, "duration": c.duration, "difficulty": c.difficulty}
            for c in items]


@router.get("/cases/{case_id}")
def get_case(case_id: int, db: Session = Depends(get_db)):
    c = db.get(RectifyCase, case_id)
    if not c:
        from fastapi import HTTPException
        raise HTTPException(404, "Case not found")
    return {"id": c.id, "indicator_name": c.indicator_name, "category": c.category,
            "problem": c.problem, "root_cause": c.root_cause, "solution": c.solution,
            "result": c.result, "duration": c.duration, "difficulty": c.difficulty}


# ── AI-powered knowledge endpoints ──

KNOWLEDGE_SYSTEM = """\
你是三甲医院评审知识专家，精通《三级医院评审标准》及相关法律法规。
你需要根据用户问题，从知识库检索结果中提取最相关的信息，给出专业、准确的回答。
如果知识库中没有直接答案，请基于你的专业知识给出参考建议，并注明"建议进一步查询官方文件"。"""


@router.get("/ai/search")
def ai_knowledge_search(
    q: str = Query("", description="自然语言问题"),
    db: Session = Depends(get_db),
):
    """AI 智能知识检索：输入自然语言问题，综合法规和案例给出答案"""
    if not q:
        return {"answer": "请输入问题", "sources": []}

    # Search regulations
    regs = db.query(Regulation).filter(
        (Regulation.title.contains(q[:20])) |
        (Regulation.content.contains(q[:20])) |
        (Regulation.keywords.contains(q[:20]))
    ).limit(20).all()

    # Search related cases
    cases = db.query(RectifyCase).filter(
        RectifyCase.indicator_name.contains(q[:10])
    ).limit(10).all()

    # Build context
    context_parts = []
    sources = []
    for r in regs:
        context_parts.append(f"[法规] {r.title}: {r.content}")
        sources.append({"type": "regulation", "id": r.id, "title": r.title})
    for c in cases:
        context_parts.append(f"[案例] {c.indicator_name}: 问题={c.problem}, 方案={c.solution}, 效果={c.result}")
        sources.append({"type": "case", "id": c.id, "title": c.indicator_name})

    if not context_parts:
        # No matches in DB — answer from model knowledge
        answer = chat_with_system(
            f"请简要回答以下医院评审相关问题：{q}",
            KNOWLEDGE_SYSTEM,
            temperature=0.3,
            max_tokens=8192,
        )
        return {"answer": answer or "AI 服务暂不可用", "sources": []}

    prompt = f"""用户问题: {q}

知识库检索结果:
{chr(10).join(context_parts)}

请基于以上知识库内容回答用户问题。回答要简明、专业，引用具体法规条款或案例。"""

    answer = chat_with_system(prompt, KNOWLEDGE_SYSTEM, temperature=0.3, max_tokens=8192)
    return {"answer": answer or "AI 服务暂不可用", "sources": sources}


@router.get("/ai/suggest-case")
def ai_suggest_rectify_case(
    indicator_name: str = Query(""),
    problem_desc: str = Query(""),
    db: Session = Depends(get_db),
):
    """AI 根据指标名称和问题描述，推荐整改方案"""
    if not indicator_name:
        return {"suggestion": "请提供指标名称", "references": []}

    # Find similar cases
    cases = db.query(RectifyCase).filter(
        RectifyCase.indicator_name.contains(indicator_name[:8])
    ).limit(10).all()

    case_context = ""
    refs = []
    for c in cases:
        case_context += f"- 案例: {c.problem} → {c.solution} (效果: {c.result})\n"
        refs.append({"id": c.id, "title": c.indicator_name, "solution": c.solution})

    context_block = ""
    if case_context:
        context_block = "知识库相似案例:\n" + case_context
    else:
        context_block = "无相似案例记录"

    prompt = f"""未达标指标: {indicator_name}
问题描述: {problem_desc or '未提供'}

{context_block}

请为该指标设计一个具体的整改方案，包括：
1. 根因分析
2. 具体整改措施（分步骤）
3. 建议时间线
4. 预期效果评估方法"""

    suggestion = chat_with_system(
        prompt,
        "你是医院评审整改专家，擅长设计具体可操作的整改方案。回答要分步骤、有可操作性。",
        temperature=0.4,
        max_tokens=8192,
    )
    return {"suggestion": suggestion or "AI 服务暂不可用", "references": refs}

