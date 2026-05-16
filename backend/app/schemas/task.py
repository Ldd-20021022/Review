from typing import List, Optional

from pydantic import BaseModel


class TaskCreate(BaseModel):
    assessment_id: int
    indicator_ids: List[int]
    dept_id: int
    assignee_id: Optional[int] = None
    priority: str = "medium"
    due_date: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    assignee_id: Optional[int] = None


class CommentCreate(BaseModel):
    content: str


class ReturnReason(BaseModel):
    reason: str = ""


class CommentInfo(BaseModel):
    id: int
    task_id: int
    user_id: int
    content: str
    created_at: str
    user_name: Optional[str] = None

    class Config:
        from_attributes = True


class TaskInfo(BaseModel):
    id: int
    assessment_id: int
    indicator_id: int
    dept_id: int
    assignee_id: Optional[int] = None
    title: str
    gap_desc: Optional[str] = None
    target_level: int
    priority: str
    due_date: Optional[str] = None
    status: str
    created_at: str
    updated_at: Optional[str] = None
    assessment_name: Optional[str] = None
    indicator_code: Optional[str] = None
    indicator_name: Optional[str] = None
    dept_name: Optional[str] = None
    assignee_name: Optional[str] = None

    class Config:
        from_attributes = True


class TaskDetail(TaskInfo):
    comments: List[CommentInfo] = []

    class Config:
        from_attributes = True
