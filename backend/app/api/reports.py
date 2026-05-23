import os
import html as _html

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.assessment import Assessment
from ..models.snapshot import Snapshot
from ..models.standard import StdIndicator, StdCategory, StdRequirement
from ..middleware.tenant import get_current_tenant_id

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _render_report_html(snapshot_id: int, db: Session) -> str:
    """Render assessment report as HTML."""
    snap = db.get(Snapshot, snapshot_id)
    if not snap:
        raise HTTPException(404, "Snapshot not found")

    assessment = db.get(Assessment, snap.assessment_id)

    # Gather items with full info
    rows = []
    for si in snap.items:
        ind = db.get(StdIndicator, si.indicator_id)
        cat = db.get(StdCategory, ind.category_id) if ind else None
        req = (
            db.query(StdRequirement)
            .filter(
                StdRequirement.indicator_id == si.indicator_id,
                StdRequirement.level == assessment.target_level,
            )
            .first()
        ) if assessment else None
        rows.append({
            "code": ind.code if ind else "",
            "name": ind.name if ind else "",
            "category": cat.name if cat else "",
            "requirement": req.requirement_text if req else "",
            "score": si.score,
            "gap_note": si.gap_note or "",
        })

    # Category summary
    cat_scores = {}
    for r in rows:
        cat = r["category"]
        if cat not in cat_scores:
            cat_scores[cat] = []
        if r["score"] is not None:
            cat_scores[cat].append(r["score"])

    cat_rows = ""
    for cat, scores in cat_scores.items():
        avg = sum(scores) / len(scores) if scores else 0
        color = "#67c23a" if avg >= 80 else "#e6a23c" if avg >= 60 else "#f56c6c"
        cat_rows += f"""
        <tr>
            <td>{e(cat)}</td>
            <td>{len(scores)}</td>
            <td style="color:{color};font-weight:bold">{avg:.1f}%</td>
        </tr>"""

    items_rows = ""
    for r in rows:
        score = r["score"] or 0
        color = "#67c23a" if score >= 80 else "#e6a23c" if score >= 60 else "#f56c6c"
        items_rows += f"""
        <tr>
            <td>{e(r['code'])}</td>
            <td>{e(r['name'])}</td>
            <td>{e(r['category'])}</td>
            <td style="font-size:12px">{e(r['requirement'][:60]) if r['requirement'] else ''}</td>
            <td style="color:{color};font-weight:bold">{score}%</td>
            <td style="font-size:12px">{e(r['gap_note'][:40]) if r['gap_note'] else ''}</td>
        </tr>"""

    e = _html.escape
    assessment_name = e(assessment.name) if assessment else 'N/A'
    target_level = str(assessment.target_level) if assessment else '-'

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>评估报告</title>
<style>
    body {{ font-family: 'Microsoft YaHei', sans-serif; padding: 40px; color: #333; }}
    h1 {{ text-align: center; margin-bottom: 4px; }}
    .subtitle {{ text-align: center; color: #999; margin-bottom: 24px; }}
    .summary {{ display: flex; gap: 24px; justify-content: center; margin-bottom: 32px; }}
    .summary-item {{ text-align: center; padding: 16px 32px; background: #f5f7fa; border-radius: 8px; }}
    .summary-item .num {{ font-size: 28px; font-weight: bold; }}
    table {{ width: 100%; border-collapse: collapse; margin-bottom: 24px; }}
    th, td {{ border: 1px solid #e4e7ed; padding: 8px 12px; text-align: left; font-size: 13px; }}
    th {{ background: #f5f7fa; }}
    h2 {{ margin-top: 32px; margin-bottom: 12px; }}
</style></head>
<body>
    <h1>{assessment_name} — 评估报告</h1>
    <p class="subtitle">快照版本: {e(snap.version)} | 目标级别: {target_level}级 | 锁定时间: {snap.locked_at.strftime('%Y-%m-%d %H:%M')}</p>

    <div class="summary">
        <div class="summary-item"><div class="num">{len(rows)}</div>指标总数</div>
        <div class="summary-item"><div class="num">{len([r for r in rows if r['score'] is not None])}</div>已评分</div>
        <div class="summary-item"><div class="num" style="color:#409eff">{snap.total_score:.1f}%</div>综合得分</div>
    </div>

    <h2>分类得分汇总</h2>
    <table><tr><th>分类</th><th>指标数</th><th>平均得分</th></tr>{cat_rows}</table>

    <h2>指标明细</h2>
    <table><tr><th>编号</th><th>名称</th><th>分类</th><th>级别要求</th><th>得分</th><th>差距说明</th></tr>{items_rows}</table>
</body></html>"""


@router.get("/preview/{snapshot_id}", response_class=HTMLResponse)
def preview_report(
    snapshot_id: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    snap = db.get(Snapshot, snapshot_id)
    if not snap:
        raise HTTPException(404, "Snapshot not found")
    assessment = db.get(Assessment, snap.assessment_id)
    if not assessment or assessment.tenant_id != tenant_id:
        raise HTTPException(404, "Snapshot not found")
    return _render_report_html(snapshot_id, db)


@router.get("/download/{snapshot_id}")
def download_report(
    snapshot_id: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    snap = db.get(Snapshot, snapshot_id)
    if not snap:
        raise HTTPException(404, "Snapshot not found")
    assessment = db.get(Assessment, snap.assessment_id)
    if not assessment or assessment.tenant_id != tenant_id:
        raise HTTPException(404, "Snapshot not found")

    html = _render_report_html(snapshot_id, db)

    try:
        from weasyprint import HTML
        import tempfile
        pdf_path = os.path.join(tempfile.gettempdir(), f"report_{snapshot_id}.pdf")
        HTML(string=html).write_pdf(pdf_path)
        return FileResponse(pdf_path, filename=f"评估报告_{snap.version}.pdf", media_type="application/pdf")
    except ImportError:
        # Fallback: return HTML with print prompt
        return HTMLResponse(content=html)
