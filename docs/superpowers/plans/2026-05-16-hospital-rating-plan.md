# 三甲医院评级系统 MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 PJ_pro 项目中构建三甲医院评级系统核心流程：标准库管理 → 科室数据填报 + 自动对比判定 → 院长仪表盘 → 退回/通过审核

**Architecture:** 后端复用 PJ_pro 的 FastAPI + SQLAlchemy 基础设施（认证、科室、通知），新增 `StandardSet` 模型区分标准套件类型，新增 `/api/hospital-ratings` 路由。前端新建侧边栏布局和全部页面，仅复用登录/auth store/api client。

**Tech Stack:** Python FastAPI + SQLAlchemy + SQLite / Vue 3 (Composition API + `<script setup>`) + Element Plus + Vue Router (hash mode)

---

## File Structure

### Files to Create
```
backend/app/
├── models/standard_set.py         # StandardSet model
└── api/hospital_ratings.py        # Hospital rating API routes (dashboard, report, submit, approve, reject)

frontend/src/
├── views/hospital-rating/
│   ├── Layout.js                  # New sidebar layout for hospital rating system
│   ├── Dashboard.js               # Director dashboard with stat cards + department table
│   ├── RatingForm.js              # Department data entry with collapsible categories
│   ├── ReportView.js              # Comparison report: compliant vs non-compliant items
│   └── StandardManage.js          # Standard library CRUD (categories + indicators)
├── api/hospital-rating.js         # API client for hospital-rating endpoints
└── stores/hospital-rating.js      # (if needed) shared state for rating module
```

### Files to Modify
```
backend/app/
├── main.py                        # Register hospital_ratings router + import new model
└── models/__init__.py             # Export StandardSet

frontend/src/
└── router/index.js                # Add hospital-rating routes (Layout as parent, children for each page)
```

### Frontend Pattern Reference (from existing codebase)
- Components use `defineComponent({ setup() { ... }, template: \`...\` })` with `<script setup>`-equivalent via setup() returning state
- API calls via `src/api/client.js` (get/post/put/del wrappers with JWT token)
- Router uses `createWebHashHistory`, meta with `roles` array for auth, `public: true` for login
- Element Plus imported via `src/shim/element-plus.js` (CDN-like shim), components usable as `<el-button>`, `<el-table>`, etc.
- Stores use `reactive()` plain objects (no Pinia), imported as composables
- Auth store: `useAuthStore()` from `stores/auth.js` provides `user`, `token`, `fetchMe()`, `logout()`, `loginAction()`

### Backend Pattern Reference (from existing codebase)
- Models: SQLAlchemy 2.0 Mapped columns, `Base` from `database.py`, exported via `models/__init__.py`
- API routes: `APIRouter(prefix="/api/xxx", tags=["xxx"])`, registered in `main.py`
- Auth deps: `get_current_user`, `get_current_tenant_id`, `get_current_user_tenant`, `require_role(*roles)` from `middleware/tenant.py`
- DB session: `Depends(get_db)` from `database.py`
- Response: plain dicts or Pydantic models with `from_attributes = True`
- Tables auto-created via `Base.metadata.create_all()` in lifespan

---

### Task 1: Backend — StandardSet Model

**Files:**
- Create: `backend/app/models/standard_set.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create StandardSet model**

```python
# backend/app/models/standard_set.py
from __future__ import annotations
from typing import Optional, List
from datetime import datetime, timezone

from sqlalchemy import String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class StandardSet(Base):
    __tablename__ = "standard_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))          # "电子病历评级" / "三甲医院评审"
    type: Mapped[str] = mapped_column(String(30), default="emr")  # "emr" / "hospital_grade"
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
```

- [ ] **Step 2: Export StandardSet in models/__init__.py**

```python
# Add after the last import line:
from .standard_set import StandardSet
```

- [ ] **Step 3: Verify app starts with new model**

Run: `cd backend && python -c "from app.database import Base, engine; Base.metadata.create_all(bind=engine); print('OK')"`
Expected: `OK` (table created silently)

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/standard_set.py backend/app/models/__init__.py
git commit -m "feat: add StandardSet model for multi-type standard libraries"
```

---

### Task 2: Backend — Hospital Rating API Routes

**Files:**
- Create: `backend/app/api/hospital_ratings.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create the API router with dashboard endpoint**

```python
# backend/app/api/hospital_ratings.py
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

class IndicatorInfo(BaseModel):
    id: int
    indicator_id: int
    name: str
    category_name: str
    standard_value: Optional[str]
    unit: Optional[str]
    indicator_type: Optional[str]
    weight: Optional[float]
    actual_value: Optional[str]
    is_compliant: Optional[bool]
    score: Optional[int]
    remark: Optional[str]

    class Config:
        from_attributes = True


# ---------- Dashboard ----------

@router.get("/dashboard")
def dashboard(
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    """院长仪表盘 — 全院各科室评级状态一览 (三甲评级专用)。"""
    # Get hospital_grade standard_set
    hg_set = db.query(StandardSet).filter(StandardSet.type == "hospital_grade").first()
    set_id = hg_set.id if hg_set else None

    # Get all assessments for this tenant, filtered by hospital_grade set if available
    q = db.query(Assessment).filter(Assessment.tenant_id == tenant_id)
    if set_id:
        q = q.filter(Assessment.set_id == set_id)
    assessments = q.order_by(Assessment.created_at.desc()).all()

    depts = db.query(Department).filter(Department.tenant_id == tenant_id).all()
    dept_map = {d.id: d.name for d in depts}

    # Group latest assessment per department
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
```

- [ ] **Step 2: Add submit endpoint (department head fills data)**

```python
# Continue in hospital_ratings.py

@router.post("/submit")
def submit_rating(
    body: SubmitBody,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    ut=Depends(get_current_user_tenant),
):
    """科室负责人提交评级数据。自动创建 assessment + items，实时判定达标。"""
    dept_id = body.department_id or ut.dept_id
    if not dept_id:
        raise HTTPException(400, "No department context")

    # Get hospital_grade standard set
    hg_set = db.query(StandardSet).filter(StandardSet.type == "hospital_grade").first()
    if not hg_set:
        raise HTTPException(400, "No hospital grade standard set found")

    dept = db.get(Department, dept_id)
    if not dept:
        raise HTTPException(404, "Department not found")

    # Create assessment
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

    # Create items with compliance check
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

    # Calculate total score
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
```

- [ ] **Step 3: Add report and department-endpoints**

```python
# Continue in hospital_ratings.py

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


@router.get("/report/{aid}")
def get_report(
    aid: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    """查看科室评级报告 — 达标/未达标明细"""
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
```

- [ ] **Step 4: Add approve/reject endpoints**

```python
# Continue in hospital_ratings.py

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


@router.post("/{aid}/reject")
def reject_rating(
    aid: int,
    body: RejectBody,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_role("admin", "director")),
):
    """院长退回评级，附带整改意见"""
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
```

- [ ] **Step 5: Add standards listing endpoint for hospital grade standards**

```python
# Continue in hospital_ratings.py

@router.get("/standards")
def list_hospital_standards(
    db: Session = Depends(get_db),
):
    """获取三甲医院评审标准库（分类 + 指标树）。MVP 阶段返回全部标准，后续可加 set_id 过滤。"""
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
```

- [ ] **Step 6: Register router in main.py**

In `backend/app/main.py`, add after the last `from .api.xxx import`:

```python
from .api.hospital_ratings import router as hospital_ratings_router
```

And add after the last `app.include_router(xxx_router)`:

```python
app.include_router(hospital_ratings_router)
```

- [ ] **Step 7: Add set_id to Assessment model**

The Assessment model needs a `set_id` field. Edit `backend/app/models/assessment.py`

```python
# Add to Assessment class attributes (after submitter_id):
    set_id: Mapped[Optional[int]] = mapped_column(ForeignKey("standard_sets.id"), nullable=True)
```

- [ ] **Step 8: Verify backend starts**

Run: `cd backend && python -c "from app.main import app; print('Backend OK')" 2>&1`
Expected: `Backend OK` (no import errors)

- [ ] **Step 9: Commit**

```bash
git add backend/app/api/hospital_ratings.py backend/app/main.py backend/app/models/assessment.py
git commit -m "feat: add hospital rating API (dashboard, submit, approve, reject, report)"
```

---

### Task 3: Frontend — API Client

**Files:**
- Create: `frontend/src/api/hospital-rating.js`

- [ ] **Step 1: Create API client for hospital-rating endpoints**

```javascript
// frontend/src/api/hospital-rating.js
import { get, post } from './client.js'

export function getDashboard() {
  return get('/api/hospital-ratings/dashboard')
}

export function submitRating(data) {
  return post('/api/hospital-ratings/submit', data)
}

export function getMyRatings() {
  return get('/api/hospital-ratings/my-department')
}

export function getReport(id) {
  return get(`/api/hospital-ratings/report/${id}`)
}

export function approveRating(id) {
  return post(`/api/hospital-ratings/${id}/approve`)
}

export function rejectRating(id, feedback) {
  return post(`/api/hospital-ratings/${id}/reject`, { feedback })
}

export function getStandards() {
  return get('/api/hospital-ratings/standards')
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/hospital-rating.js
git commit -m "feat: add hospital-rating API client"
```

---

### Task 4: Frontend — New Layout

**Files:**
- Create: `frontend/src/views/hospital-rating/Layout.js`
- Modify: `frontend/src/router/index.js`

- [ ] **Step 1: Create hospital rating layout with sidebar**

```javascript
// frontend/src/views/hospital-rating/Layout.js
import { defineComponent, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'

const menuItems = [
  { path: '/hospital-rating/dashboard', title: '📊 综合仪表盘', roles: ['admin', 'director', 'expert', 'leader'] },
  { path: '/hospital-rating/form', title: '📋 数据填报', roles: ['admin', 'director', 'expert', 'dept_head'] },
  { path: '/hospital-rating/reports', title: '📄 评级报告', roles: ['admin', 'director', 'expert', 'leader', 'dept_head'] },
  { path: '/hospital-rating/standards', title: '📐 标准库管理', roles: ['admin'] },
]

const roleLabels = {
  admin: '管理员',
  director: '院长',
  expert: '评级专家',
  dept_head: '科室负责人',
  leader: '院领导',
}

export default defineComponent({
  name: 'HRLayout',
  setup() {
    const router = useRouter()
    const route = useRoute()
    const auth = useAuthStore()

    auth.fetchMe()

    const visibleMenus = computed(() =>
      menuItems.filter(m => m.roles.includes(auth.user?.role))
    )

    function handleSelect(path) {
      if (path) router.push(path)
    }

    function handleLogout() {
      auth.logout()
      router.push('/login')
    }

    return { route, auth, visibleMenus, handleSelect, handleLogout, roleLabels }
  },
  template: `
<el-container style="min-height:100vh">
  <el-aside width="200px" style="background:#1e293b">
    <div style="padding:16px 12px;font-weight:700;font-size:15px;color:#fff;border-bottom:1px solid #334155">
      🏥 三甲评级系统
    </div>
    <el-menu
      :default-active="route.path"
      background-color="#1e293b"
      text-color="#94a3b8"
      active-text-color="#60a5fa"
      @select="handleSelect"
    >
      <el-menu-item v-for="m in visibleMenus" :key="m.path" :index="m.path">
        <span>{{ m.title }}</span>
      </el-menu-item>
    </el-menu>
  </el-aside>
  <el-container>
    <el-header style="background:#fff;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:flex-end;height:52px;padding:0 24px;gap:16px">
      <span style="font-size:13px;color:#64748b">
        <strong>{{ auth.user?.name || '' }}</strong>
        <el-tag size="small" style="margin-left:8px">{{ roleLabels[auth.user?.role] || '' }}</el-tag>
      </span>
      <el-button text @click="handleLogout" style="color:#94a3b8">退出</el-button>
    </el-header>
    <el-main style="background:#f8fafc">
      <router-view />
    </el-main>
  </el-container>
</el-container>
`,
})
```

- [ ] **Step 2: Add routes in router/index.js**

```javascript
// Add import near top:
import HRLayout from '../views/hospital-rating/Layout.js'
import HRDashboard from '../views/hospital-rating/Dashboard.js'
import HRRatingForm from '../views/hospital-rating/RatingForm.js'
import HRReportView from '../views/hospital-rating/ReportView.js'
import HRStandardManage from '../views/hospital-rating/StandardManage.js'

// Add route group before closing of children array:
      {
        path: '/hospital-rating',
        component: HRLayout,
        children: [
          { path: '', redirect: '/hospital-rating/dashboard' },
          { path: 'dashboard', name: 'HRDashboard', component: HRDashboard, meta: { title: '综合仪表盘', ...ALL } },
          { path: 'form', name: 'HRRatingForm', component: HRRatingForm, meta: { title: '数据填报', ...STAFF } },
          { path: 'reports', name: 'HRReports', component: HRReportView, meta: { title: '评级报告', ...ALL } },
          { path: 'standards', name: 'HRStandards', component: HRStandardManage, meta: { title: '标准库管理', ...ADMIN } },
        ],
      },
```

Also add hospital-rating/dashboard as default redirect from root. Change the root redirect:
```javascript
// From:
      { path: '', redirect: '/dashboard' },
// To:
      { path: '', redirect: '/hospital-rating/dashboard' },
```

- [ ] **Step 3: Verify frontend builds**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: Build completes (may have warnings about missing component files which is OK — they'll be created next)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/hospital-rating/Layout.js frontend/src/router/index.js
git commit -m "feat: add hospital rating layout with sidebar navigation"
```

---

### Task 5: Frontend — Dashboard Page

**Files:**
- Create: `frontend/src/views/hospital-rating/Dashboard.js`

- [ ] **Step 1: Create dashboard component**

```javascript
// frontend/src/views/hospital-rating/Dashboard.js
import { defineComponent, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from '/src/shim/element-plus.js'
import { getDashboard, approveRating, rejectRating } from '../../api/hospital-rating.js'

export default defineComponent({
  name: 'HRDashboard',
  setup() {
    const router = useRouter()
    const dashboard = ref(null)
    const loading = ref(false)
    const rejectDialog = ref(false)
    const rejectForm = ref({ assessment_id: null, dept_name: '', score: 0, feedback: '' })
    const rejecting = ref(false)

    async function fetch() {
      loading.value = true
      try {
        dashboard.value = await getDashboard()
      } finally {
        loading.value = false
      }
    }

    function goReport(id) {
      if (id) router.push(`/hospital-rating/reports?assessment=${id}`)
    }

    function openReject(row) {
      rejectForm.value = {
        assessment_id: row.assessment_id,
        dept_name: row.name,
        score: row.score || 0,
        feedback: '',
      }
      rejectDialog.value = true
    }

    async function handleReject() {
      if (!rejectForm.value.feedback.trim()) {
        ElMessage.warning('请填写退回意见')
        return
      }
      rejecting.value = true
      try {
        await rejectRating(rejectForm.value.assessment_id, rejectForm.value.feedback)
        ElMessage.success('已退回并通知科室负责人')
        rejectDialog.value = false
        await fetch()
      } catch (e) {
        ElMessage.error('操作失败: ' + e.message)
      } finally {
        rejecting.value = false
      }
    }

    async function handleApprove(row) {
      await ElMessageBox.confirm(
        `确认通过【${row.name}】的评级吗？`,
        '确认通过',
        { type: 'success' }
      )
      try {
        await approveRating(row.assessment_id)
        ElMessage.success('已通过')
        await fetch()
      } catch (e) {
        ElMessage.error('操作失败: ' + e.message)
      }
    }

    const statusMap = {
      approved: '✅ 已通过',
      rejected: '❌ 已退回',
      submitted: '📝 待审核',
      revising: '🔄 整改中',
      draft: '📋 草稿',
      not_submitted: '📋 未提交',
    }

    onMounted(fetch)

    return {
      dashboard, loading, rejectDialog, rejectForm, rejecting,
      goReport, openReject, handleReject, handleApprove, statusMap,
    }
  },
  template: `
<div v-loading="loading">
  <h2 style="margin-bottom:20px">🏥 全院三甲评级综合仪表盘</h2>

  <el-row :gutter="16" style="margin-bottom:20px">
    <el-col :span="6">
      <el-card shadow="hover" style="text-align:center;border-left:3px solid #409eff">
        <p style="color:#909399;font-size:13px;margin:0 0 8px">📊 全院均分</p>
        <h1 style="margin:0;color:#409eff;font-size:28px">{{ dashboard?.average_score ?? '-' }}</h1>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" style="text-align:center;border-left:3px solid #67c23a">
        <p style="color:#909399;font-size:13px;margin:0 0 8px">✅ 已达标</p>
        <h1 style="margin:0;color:#67c23a;font-size:28px">{{ dashboard?.approved ?? 0 }} 个</h1>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" style="text-align:center;border-left:3px solid #f56c6c">
        <p style="color:#909399;font-size:13px;margin:0 0 8px">❌ 未达标</p>
        <h1 style="margin:0;color:#f56c6c;font-size:28px">{{ dashboard?.rejected ?? 0 }} 个</h1>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" style="text-align:center;border-left:3px solid #e6a23c">
        <p style="color:#909399;font-size:13px;margin:0 0 8px">📝 待提交/审核</p>
        <h1 style="margin:0;color:#e6a23c;font-size:28px">{{ (dashboard?.pending ?? 0) + (dashboard?.not_submitted ?? 0) }} 个</h1>
      </el-card>
    </el-col>
  </el-row>

  <el-card>
    <template #header>
      <span style="font-weight:bold">科室评级状态一览</span>
      <span style="color:#909399;font-size:12px;margin-left:8px">
        共 {{ dashboard?.total_departments ?? 0 }} 个科室
      </span>
    </template>

    <el-table :data="dashboard?.departments ?? []" stripe>
      <el-table-column label="科室" width="120">
        <template #default="{ row }">🏥 {{ row.name }}</template>
      </el-table-column>
      <el-table-column label="评级周期" width="110">
        <template #default="{ row }">{{ row.rating_cycle || '-' }}</template>
      </el-table-column>
      <el-table-column label="总分" width="90" align="center">
        <template #default="{ row }">
          <span v-if="row.score != null" style="font-weight:bold;font-size:16px"
            :style="{color: row.score >= 60 ? '#67c23a' : '#f56c6c'}">{{ row.score }}</span>
          <span v-else style="color:#c0c4cc">-</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="120" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : row.status === 'submitted' ? 'warning' : 'info'" size="small">
            {{ statusMap[row.status] || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="未达标项" width="100" align="center">
        <template #default="{ row }">
          <span v-if="row.non_compliant_count > 0" style="color:#f56c6c;font-weight:bold">{{ row.non_compliant_count }} 项</span>
          <span v-else style="color:#67c23a">-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220">
        <template #default="{ row }">
          <div v-if="row.assessment_id" style="display:flex;gap:6px">
            <el-button size="small" @click="goReport(row.assessment_id)">查看报告</el-button>
            <el-button v-if="row.status === 'submitted'" size="small" type="success" @click="handleApprove(row)">通过</el-button>
            <el-button v-if="row.status === 'submitted'" size="small" type="danger" @click="openReject(row)">⭐ 退回</el-button>
          </div>
          <span v-else style="color:#c0c4cc;font-size:12px">暂未提交</span>
        </template>
      </el-table-column>
    </el-table>
  </el-card>

  <el-dialog v-model="rejectDialog" title="❌ 退回科室评级" width="500px">
    <div style="margin-bottom:16px">
      <p><strong>科室：</strong>{{ rejectForm.dept_name }}</p>
      <p><strong>当前得分：</strong>
        <span :style="{color: rejectForm.score >= 60 ? '#e6a23c' : '#f56c6c',fontWeight:'bold'}">
          {{ rejectForm.score }} 分
        </span>
      </p>
    </div>
    <el-form label-width="90px">
      <el-form-item label="退回意见" required>
        <el-input v-model="rejectForm.feedback" type="textarea" :rows="4"
          placeholder="请填写具体的整改意见，科室负责人将收到通知..." />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="rejectDialog = false">取消</el-button>
      <el-button type="danger" @click="handleReject" :loading="rejecting">确认退回 ❌</el-button>
    </template>
  </el-dialog>
</div>
`,
})
```

- [ ] **Step 2: Verify file imports work**

Run: `cd frontend && node -e "require('./src/views/hospital-rating/Dashboard.js'); console.log('Import OK')" 2>&1 || echo "Cannot verify directly — check in browser"`
(JSX/Vue SFC can only be verified via build; proceed to next step)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/hospital-rating/Dashboard.js
git commit -m "feat: add hospital rating dashboard with stat cards, department table, and reject modal"
```

---

### Task 6: Frontend — Rating Form (Data Entry)

**Files:**
- Create: `frontend/src/views/hospital-rating/RatingForm.js`

- [ ] **Step 1: Create data entry form**

```javascript
// frontend/src/views/hospital-rating/RatingForm.js
import { defineComponent, ref, onMounted, computed } from 'vue'
import { ElMessage } from '/src/shim/element-plus.js'
import { useAuthStore } from '../../stores/auth.js'
import { getStandards, submitRating, getMyRatings } from '../../api/hospital-rating.js'

export default defineComponent({
  name: 'HRRatingForm',
  setup() {
    const auth = useAuthStore()
    const categories = ref([])
    const formValues = ref({})              // indicator_id -> actual_value
    const formRemarks = ref({})             // indicator_id -> remark
    const activeNames = ref([])
    const submitting = ref(false)
    const cycle = ref('2025年度')
    const history = ref([])
    const showHistory = ref(false)

    const cycleOptions = [
      '2024年度','2025年度','2026年度',
      '2024-Q1','2024-Q2','2024-Q3','2024-Q4',
      '2025-Q1','2025-Q2','2025-Q3','2025-Q4',
    ]

    // Flatten all indicators across categories for score calculation
    const allIndicators = computed(() => {
      const result = []
      for (const cat of categories.value) {
        if (cat.indicators) {
          for (const ind of cat.indicators) {
            result.push({ ...ind, category_name: cat.name, category_weight: cat.weight })
          }
        }
        if (cat.children) {
          for (const child of cat.children) {
            if (child.indicators) {
              for (const ind of child.indicators) {
                result.push({ ...ind, category_name: child.name, category_weight: child.weight })
              }
            }
          }
        }
      }
      return result
    })

    const totalScore = computed(() => {
      let weighted = 0, totalW = 0
      for (const ind of allIndicators.value) {
        const val = formValues.value[ind.id]
        if (val && ind.standard_value && ind.indicator_type && ind.weight) {
          const actual = parseFloat(String(val).replace('%', ''))
          const standard = parseFloat(String(ind.standard_value).replace('%', ''))
          if (isNaN(actual) || isNaN(standard)) continue
          let compliant = false, score = 0
          if (ind.indicator_type === 'numeric_less_equal') {
            compliant = actual <= standard
            score = compliant ? 100 : Math.max(0, 100 - (actual - standard) * 50)
          } else if (ind.indicator_type === 'numeric_greater_equal') {
            compliant = actual >= standard
            score = compliant ? 100 : Math.max(0, 100 - (standard - actual) * 50)
          } else if (ind.indicator_type === 'numeric_equal') {
            compliant = actual === standard
            score = compliant ? 100 : 0
          } else if (ind.indicator_type === 'numeric_range') {
            const parts = String(ind.standard_value).replace('%', '').split('-')
            const lo = parseFloat(parts[0]), hi = parseFloat(parts[1])
            compliant = actual >= lo && actual <= hi
            score = compliant ? 100 : Math.max(0, 100 - Math.min(Math.abs(actual - lo), Math.abs(actual - hi)) * 50)
          } else if (ind.indicator_type === 'yesno') {
            compliant = ['是','1','yes','true'].includes(String(val).toLowerCase())
            score = compliant ? 100 : 0
          }
          weighted += score * ind.weight / 100
          totalW += ind.weight
        }
      }
      return totalW > 0 ? (weighted / totalW * 100).toFixed(1) : '-'
    })

    const compliantCount = computed(() => {
      let count = 0
      for (const ind of allIndicators.value) {
        const val = formValues.value[ind.id]
        if (!val || !ind.standard_value || !ind.indicator_type) continue
        const actual = parseFloat(String(val).replace('%', ''))
        const standard = parseFloat(String(ind.standard_value).replace('%', ''))
        if (isNaN(actual) || isNaN(standard)) continue
        if (ind.indicator_type === 'numeric_less_equal' && actual <= standard) count++
        else if (ind.indicator_type === 'numeric_greater_equal' && actual >= standard) count++
        else if (ind.indicator_type === 'numeric_equal' && actual === standard) count++
        else if (ind.indicator_type === 'numeric_range') {
          const parts = String(ind.standard_value).replace('%', '').split('-')
          if (actual >= parseFloat(parts[0]) && actual <= parseFloat(parts[1])) count++
        } else if (ind.indicator_type === 'yesno' && ['是','1','yes','true'].includes(String(val).toLowerCase())) count++
      }
      return count
    })

    function checkCompliance(ind) {
      const val = formValues.value[ind.id]
      if (!val || !ind.standard_value || !ind.indicator_type) return null
      const actual = parseFloat(String(val).replace('%', ''))
      const standard = parseFloat(String(ind.standard_value).replace('%', ''))
      if (isNaN(actual) || isNaN(standard)) return null
      if (ind.indicator_type === 'numeric_less_equal') return actual <= standard
      if (ind.indicator_type === 'numeric_greater_equal') return actual >= standard
      if (ind.indicator_type === 'numeric_equal') return actual === standard
      if (ind.indicator_type === 'numeric_range') {
        const parts = String(ind.standard_value).replace('%', '').split('-')
        return actual >= parseFloat(parts[0]) && actual <= parseFloat(parts[1])
      }
      if (ind.indicator_type === 'yesno') return ['是','1','yes','true'].includes(String(val).toLowerCase())
      return null
    }

    async function fetchStandards() {
      categories.value = await getStandards() || []
      activeNames.value = categories.value.map(c => String(c.id))
    }

    async function fetchHistory() {
      history.value = await getMyRatings() || []
    }

    async function handleSubmit() {
      const details = []
      for (const ind of allIndicators.value) {
        const val = formValues.value[ind.id]
        if (val !== undefined && val !== '') {
          details.push({
            indicator_id: ind.id,
            actual_value: String(val),
            remark: formRemarks.value[ind.id] || '',
          })
        }
      }
      if (details.length === 0) {
        ElMessage.warning('请至少填写一项指标数据')
        return
      }
      submitting.value = true
      try {
        await submitRating({ rating_cycle: cycle.value, details })
        ElMessage.success('提交成功！')
        formValues.value = {}
        formRemarks.value = {}
        await fetchHistory()
      } catch (e) {
        ElMessage.error('提交失败: ' + e.message)
      } finally {
        submitting.value = false
      }
    }

    onMounted(() => { fetchStandards(); fetchHistory() })

    return {
      categories, formValues, formRemarks, activeNames, submitting, cycle, cycleOptions,
      allIndicators, totalScore, compliantCount, history, showHistory,
      checkCompliance, handleSubmit,
    }
  },
  template: `
<div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <h2>📋 三甲评级数据填报</h2>
    <div style="display:flex;gap:8px;align-items:center">
      <el-select v-model="cycle" style="width:140px" size="small">
        <el-option v-for="o in cycleOptions" :key="o" :label="o" :value="o" />
      </el-select>
      <el-button type="primary" @click="handleSubmit" :loading="submitting">📤 提交审核</el-button>
    </div>
  </div>

  <div v-if="allIndicators.length === 0" style="text-align:center;padding:60px;color:#909399">
    <p style="font-size:48px;margin:0">📐</p>
    <p>暂无评审指标，请先配置标准库</p>
  </div>

  <el-collapse v-model="activeNames" v-else>
    <el-collapse-item v-for="cat in categories" :key="String(cat.id)" :name="String(cat.id)">
      <template #title>
        <span style="font-weight:600;font-size:14px">
          {{ cat.name }}
          <span style="color:#909399;font-weight:400;font-size:12px">(权重 {{ cat.weight }}%)</span>
        </span>
      </template>

      <el-table :data="(cat.indicators || [])" stripe size="small">
        <el-table-column label="指标名称" min-width="180">
          <template #default="{ row }">{{ row.name }}</template>
        </el-table-column>
        <el-table-column label="标准值" width="120" align="center">
          <template #default="{ row }">{{ row.standard_value }}{{ row.unit ? ' ' + row.unit : '' }}</template>
        </el-table-column>
        <el-table-column label="实际值" width="160" align="center">
          <template #default="{ row }">
            <el-input v-model="formValues[row.id]" size="small" style="width:120px"
              :placeholder="row.unit || '输入值'" />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <span v-if="checkCompliance(row) === true" style="color:#67c23a;font-size:18px">✅</span>
            <span v-else-if="checkCompliance(row) === false" style="color:#f56c6c;font-size:18px">❌</span>
            <span v-else style="color:#c0c4cc">-</span>
          </template>
        </el-table-column>
        <el-table-column label="备注" width="160">
          <template #default="{ row }">
            <el-input v-model="formRemarks[row.id]" size="small" placeholder="可选" />
          </template>
        </el-table-column>
      </el-table>
    </el-collapse-item>
  </el-collapse>

  <div v-if="allIndicators.length > 0" style="margin-top:16px;padding:12px 16px;background:#e3f2fd;border-radius:8px;display:flex;justify-content:space-between;align-items:center">
    <div>
      📊 当前预估：<strong>总分 {{ totalScore }} 分</strong> |
      达标 <span style="color:#67c23a;font-weight:600">{{ compliantCount }}</span> / {{ allIndicators.length }} 项
    </div>
    <el-button type="primary" @click="handleSubmit" :loading="submitting">📤 提交审核</el-button>
  </div>
</div>
`,
})
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/hospital-rating/RatingForm.js
git commit -m "feat: add rating data entry form with collapsible categories and real-time compliance check"
```

---

### Task 7: Frontend — Report View

**Files:**
- Create: `frontend/src/views/hospital-rating/ReportView.js`

- [ ] **Step 1: Create report view component**

```javascript
// frontend/src/views/hospital-rating/ReportView.js
import { defineComponent, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getReport, getMyRatings } from '../../api/hospital-rating.js'

export default defineComponent({
  name: 'HRReportView',
  setup() {
    const route = useRoute()
    const report = ref(null)
    const list = ref([])
    const loading = ref(false)
    const selectedId = ref(null)

    async function fetchList() {
      list.value = await getMyRatings() || []
    }

    async function fetchReport(id) {
      loading.value = true
      selectedId.value = id
      try {
        report.value = await getReport(id)
      } finally {
        loading.value = false
      }
    }

    onMounted(async () => {
      await fetchList()
      // Check URL param
      const aid = route.query.assessment
      if (aid) {
        await fetchReport(Number(aid))
      } else if (list.value.length > 0) {
        await fetchReport(list.value[0].id)
      }
    })

    const statusMap = {
      approved: '✅ 已通过',
      rejected: '❌ 已退回',
      submitted: '📝 待审核',
      revising: '🔄 整改中',
      draft: '📋 草稿',
    }

    return { report, list, loading, selectedId, fetchReport, statusMap }
  },
  template: `
<div>
  <h2 style="margin-bottom:20px">📄 评级报告</h2>

  <div v-if="list.length > 0" style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap">
    <el-tag v-for="a in list" :key="a.id"
      :type="selectedId === a.id ? 'primary' : 'info'"
      style="cursor:pointer"
      @click="fetchReport(a.id)">
      {{ a.name }} ({{ a.rating_cycle || '-' }})
    </el-tag>
  </div>
  <div v-else style="text-align:center;padding:60px;color:#909399">
    <p style="font-size:48px;margin:0">📄</p>
    <p>暂无评级报告</p>
  </div>

  <div v-if="report" v-loading="loading">
    <div style="display:flex;gap:12px;margin-bottom:16px">
      <el-card shadow="hover" style="flex:1;text-align:center">
        <span style="font-size:13px;color:#909399">总分</span>
        <div :style="{fontSize:'28px',fontWeight:'700',color:report.passed ? '#67c23a' : '#f56c6c'}">
          {{ report.total_score }}
        </div>
      </el-card>
      <el-card shadow="hover" style="flex:1;text-align:center">
        <span style="font-size:13px;color:#909399">达标率</span>
        <div style="font-size:28px;font-weight:700;color:#409eff">{{ report.compliance_rate }}</div>
      </el-card>
      <el-card shadow="hover" style="flex:1;text-align:center">
        <span style="font-size:13px;color:#909399">状态</span>
        <div style="font-size:18px;">{{ statusMap[report.status] || report.status }}</div>
      </el-card>
      <el-card shadow="hover" style="flex:1;text-align:center">
        <span style="font-size:13px;color:#909399">达标 / 总数</span>
        <div style="font-size:28px;font-weight:700">
          <span style="color:#67c23a">{{ report.compliant_count }}</span>
          <span style="color:#c0c4cc">/ {{ report.total_items }}</span>
        </div>
      </el-card>
    </div>

    <el-card>
      <template #header><span style="font-weight:bold">指标明细</span></template>
      <el-table :data="report.items || []" stripe>
        <el-table-column label="分类" width="120">
          <template #default="{ row }">{{ row.category_name }}</template>
        </el-table-column>
        <el-table-column label="指标" min-width="180">
          <template #default="{ row }">{{ row.name }}</template>
        </el-table-column>
        <el-table-column label="标准值" width="120" align="center">
          <template #default="{ row }">{{ row.standard_value }}{{ row.unit ? ' ' + row.unit : '' }}</template>
        </el-table-column>
        <el-table-column label="实际值" width="120" align="center">
          <template #default="{ row }">
            <span :style="{color: row.is_compliant ? '#67c23a' : '#f56c6c',fontWeight:'600'}">
              {{ row.actual_value || '-' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="结果" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.is_compliant ? 'success' : 'danger'" size="small">
              {{ row.is_compliant ? '✅ 达标' : '❌ 未达标' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="得分" width="70" align="center">
          <template #default="{ row }">{{ row.score ?? '-' }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</div>
`,
})
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/hospital-rating/ReportView.js
git commit -m "feat: add rating report view with compliant/non-compliant comparison"
```

---

### Task 8: Frontend — Standard Management

**Files:**
- Create: `frontend/src/views/hospital-rating/StandardManage.js`

- [ ] **Step 1: Create standard management page (placeholder)**

```javascript
// frontend/src/views/hospital-rating/StandardManage.js
import { defineComponent, ref, onMounted } from 'vue'
import { getStandards } from '../../api/hospital-rating.js'

export default defineComponent({
  name: 'HRStandardManage',
  setup() {
    const categories = ref([])
    const loading = ref(false)

    async function fetch() {
      loading.value = true
      try {
        categories.value = await getStandards() || []
      } finally {
        loading.value = false
      }
    }

    onMounted(fetch)

    return { categories, loading }
  },
  template: `
<div v-loading="loading">
  <h2 style="margin-bottom:20px">📐 三甲评审标准库</h2>

  <el-card v-if="categories.length === 0">
    <div style="text-align:center;padding:40px;color:#909399">
      <p style="font-size:48px;margin:0">📐</p>
      <p>标准库为空，请通过 Excel 导入或手动添加评审指标</p>
      <p style="font-size:12px;margin-top:8px">后续将支持 Excel 导入和 CRUD 操作</p>
    </div>
  </el-card>

  <el-collapse v-else>
    <el-collapse-item v-for="cat in categories" :key="cat.id" :name="String(cat.id)">
      <template #title>
        <span style="font-weight:600">{{ cat.name }}</span>
        <span style="color:#909399;font-size:12px;margin-left:8px">
          {{ cat.indicators?.length || 0 }} 项指标 · 权重 {{ cat.weight }}%
        </span>
      </template>
      <el-table :data="cat.indicators || []" stripe size="small">
        <el-table-column prop="code" label="编号" width="80" />
        <el-table-column prop="name" label="指标名称" min-width="200" />
        <el-table-column prop="standard_value" label="标准值" width="120" align="center" />
        <el-table-column label="类型" width="120" align="center">
          <template #default="{ row }">
            <el-tag size="small">{{ row.indicator_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="weight" label="权重" width="70" align="center" />
        <el-table-column prop="max_score" label="满分" width="70" align="center" />
      </el-table>
    </el-collapse-item>
  </el-collapse>
</div>
`,
})
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/hospital-rating/StandardManage.js
git commit -m "feat: add standard library management page"
```

---

### Task 9: Integration Test — Full Flow Verification

- [ ] **Step 1: Start backend and verify API**

```bash
cd backend
python -c "
from app.main import app
from fastapi.testclient import TestClient
client = TestClient(app)
# Health check
r = client.get('/api/health')
assert r.status_code == 200, f'Health failed: {r.status_code}'
print('API health: OK')
# Standards endpoint
r = client.get('/api/hospital-ratings/standards')
assert r.status_code == 200, f'Standards failed: {r.status_code}'
print('Standards endpoint: OK')
print('All API checks passed')
"
```

- [ ] **Step 2: Verify frontend builds**

```bash
cd frontend && npm run build 2>&1
```

Expected: Build completes successfully with no errors.

- [ ] **Step 3: Run full backend test (manually)**

Start backend: `cd backend && uvicorn app.main:app --reload --port 8000`

Test flow:
1. `POST /api/auth/login` with admin credentials → get JWT token
2. `GET /api/hospital-ratings/standards` → returns categories tree (may be empty)
3. `GET /api/hospital-ratings/dashboard` → returns department stats
4. `POST /api/hospital-ratings/submit` with indicator data → creates assessment

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore: integration verification complete"
```

---

## Execution Order

Tasks 1-2 (backend) → Tasks 3-4 (frontend infrastructure) → Tasks 5-8 (frontend pages) → Task 9 (verify)

Backend tasks (1, 2) can be done in parallel with a review gate. Frontend tasks (3-8) are sequential since each page imports from the shared API client and layout.
