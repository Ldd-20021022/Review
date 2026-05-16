from datetime import datetime, timezone, date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.assessment import Assessment, AssessmentItem
from ..models.department import Department
from ..models.snapshot import Snapshot
from ..models.standard import StdIndicator
from ..models.task import RectifyTask, TaskComment
from ..models.user import User
from ..schemas.task import TaskCreate, TaskUpdate, TaskInfo, TaskDetail, CommentInfo, CommentCreate, ReturnReason
from ..middleware.tenant import get_current_tenant_id, get_current_user, require_role

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _build_task_info(task, db: Session) -> TaskInfo:
    assessment = db.get(Assessment, task.assessment_id)
    ind = db.get(StdIndicator, task.indicator_id)
    dept = db.get(Department, task.dept_id)
    assignee = db.get(User, task.assignee_id) if task.assignee_id else None

    return TaskInfo(
        id=task.id,
        assessment_id=task.assessment_id,
        indicator_id=task.indicator_id,
        dept_id=task.dept_id,
        assignee_id=task.assignee_id,
        title=task.title,
        gap_desc=task.gap_desc,
        target_level=task.target_level,
        priority=task.priority,
        due_date=task.due_date.isoformat() if task.due_date else None,
        status=task.status,
        created_at=task.created_at.isoformat(),
        updated_at=task.updated_at.isoformat() if task.updated_at else None,
        assessment_name=assessment.name if assessment else None,
        indicator_code=ind.code if ind else None,
        indicator_name=ind.name if ind else None,
        dept_name=dept.name if dept else None,
        assignee_name=assignee.name if assignee else None,
    )


@router.get("/", response_model=List[TaskInfo])
def list_tasks(
    status: Optional[str] = Query(None),
    dept_id: Optional[int] = Query(None),
    assessment_id: Optional[int] = Query(None),
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    q = db.query(RectifyTask).join(Assessment).filter(Assessment.tenant_id == tenant_id)
    if status:
        q = q.filter(RectifyTask.status == status)
    if dept_id:
        q = q.filter(RectifyTask.dept_id == dept_id)
    if assessment_id:
        q = q.filter(RectifyTask.assessment_id == assessment_id)

    tasks = q.order_by(RectifyTask.created_at.desc()).all()
    return [_build_task_info(t, db) for t in tasks]


@router.post("/", response_model=List[TaskInfo])
def create_tasks(
    data: TaskCreate,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    _=Depends(require_role("admin", "expert")),
):
    # Verify assessment exists and is locked
    assessment = db.query(Assessment).filter(
        Assessment.id == data.assessment_id, Assessment.tenant_id == tenant_id
    ).first()
    if not assessment:
        raise HTTPException(404, "Assessment not found")
    if assessment.status not in ("review", "rectifying"):
        raise HTTPException(400, "Assessment must be locked before creating tasks")

    # Verify department exists
    dept = db.query(Department).filter(
        Department.id == data.dept_id, Department.tenant_id == tenant_id
    ).first()
    if not dept:
        raise HTTPException(404, "Department not found")

    tasks = []
    for iid in data.indicator_ids:
        # Get the assessment item to include gap info
        item = db.query(AssessmentItem).filter(
            AssessmentItem.assessment_id == data.assessment_id,
            AssessmentItem.indicator_id == iid,
        ).first()

        ind = db.get(StdIndicator, iid)
        title = f"{ind.name} 整改" if ind else f"指标{iid}整改"

        task = RectifyTask(
            assessment_id=data.assessment_id,
            indicator_id=iid,
            dept_id=data.dept_id,
            assignee_id=data.assignee_id,
            title=title,
            gap_desc=item.gap_note if item else None,
            target_level=assessment.target_level,
            priority=data.priority,
            due_date=date.fromisoformat(data.due_date) if data.due_date else None,
            status="pending",
        )
        db.add(task)
        db.flush()
        tasks.append(task)

    # Update assessment status to rectifying
    if assessment.status == "review":
        assessment.status = "rectifying"

    db.commit()
    return [_build_task_info(t, db) for t in tasks]


@router.get("/{tid}", response_model=TaskDetail)
def get_task(
    tid: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
):
    task = db.get(RectifyTask, tid)
    if not task:
        raise HTTPException(404, "Task not found")
    assessment = db.get(Assessment, task.assessment_id)
    if not assessment or assessment.tenant_id != tenant_id:
        raise HTTPException(404, "Task not found")

    info = _build_task_info(task, db)
    comments = []
    for c in task.comments:
        u = db.get(User, c.user_id)
        comments.append(CommentInfo(
            id=c.id,
            task_id=c.task_id,
            user_id=c.user_id,
            content=c.content,
            created_at=c.created_at.isoformat(),
            user_name=u.name if u else "",
        ))

    return TaskDetail(
        **info.dict(),
        comments=comments,
    )


@router.put("/{tid}", response_model=TaskInfo)
def update_task(
    tid: int,
    data: TaskUpdate,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    _=Depends(require_role("admin", "expert", "dept_head")),
):
    task = db.get(RectifyTask, tid)
    if not task:
        raise HTTPException(404, "Task not found")
    assessment = db.get(Assessment, task.assessment_id)
    if not assessment or assessment.tenant_id != tenant_id:
        raise HTTPException(404, "Task not found")

    for k, v in data.dict(exclude_unset=True).items():
        if k == "due_date" and v:
            v = date.fromisoformat(v)
        setattr(task, k, v)
    task.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(task)
    return _build_task_info(task, db)


@router.post("/{tid}/submit", response_model=TaskInfo)
def submit_task(
    tid: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    _=Depends(require_role("admin", "expert", "dept_head")),
):
    task = _get_task_or_404(tid, tenant_id, db)
    if task.status not in ("pending", "in_progress", "returned"):
        raise HTTPException(400, f"Cannot submit in status: {task.status}")
    task.status = "submitted"
    task.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(task)
    return _build_task_info(task, db)


@router.post("/{tid}/accept", response_model=TaskInfo)
def accept_task(
    tid: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    _=Depends(require_role("admin", "expert")),
):
    task = _get_task_or_404(tid, tenant_id, db)
    if task.status != "submitted":
        raise HTTPException(400, "Only submitted tasks can be accepted")
    task.status = "accepted"
    task.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(task)
    return _build_task_info(task, db)


@router.post("/{tid}/return", response_model=TaskInfo)
def return_task(
    tid: int,
    data: ReturnReason,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    _=Depends(require_role("admin", "expert")),
):
    task = _get_task_or_404(tid, tenant_id, db)
    if task.status != "submitted":
        raise HTTPException(400, "Only submitted tasks can be returned")
    task.status = "returned"
    task.updated_at = datetime.now(timezone.utc)

    if data.reason:
        db.add(TaskComment(
            task_id=tid,
            user_id=0,
            content=f"[退回原因] {data.reason}",
        ))

    db.commit()
    db.refresh(task)
    return _build_task_info(task, db)


@router.post("/{tid}/start", response_model=TaskInfo)
def start_task(
    tid: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    _=Depends(require_role("admin", "expert", "dept_head")),
):
    task = _get_task_or_404(tid, tenant_id, db)
    if task.status != "pending":
        raise HTTPException(400, f"Cannot start in status: {task.status}")
    task.status = "in_progress"
    task.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(task)
    return _build_task_info(task, db)


@router.post("/{tid}/comments", response_model=CommentInfo)
def add_comment(
    tid: int,
    data: CommentCreate,
    tenant_id: int = Depends(get_current_tenant_id),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = _get_task_or_404(tid, tenant_id, db)
    c = TaskComment(task_id=tid, user_id=user.id, content=data.content)
    db.add(c)
    db.commit()
    db.refresh(c)

    return CommentInfo(
        id=c.id,
        task_id=c.task_id,
        user_id=c.user_id,
        content=c.content,
        created_at=c.created_at.isoformat(),
        user_name=user.name,
    )


def _get_task_or_404(tid: int, tenant_id: int, db: Session) -> RectifyTask:
    task = db.get(RectifyTask, tid)
    if not task:
        raise HTTPException(404, "Task not found")
    assessment = db.get(Assessment, task.assessment_id)
    if not assessment or assessment.tenant_id != tenant_id:
        raise HTTPException(404, "Task not found")
    return task
