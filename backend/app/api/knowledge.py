"""知识库 API — 法规查询 + 整改案例"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.knowledge import Regulation, RectifyCase

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
