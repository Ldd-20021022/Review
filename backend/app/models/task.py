from __future__ import annotations
from typing import List, Optional
from datetime import datetime, timezone, date

from sqlalchemy import String, Integer, Text, Date, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class RectifyTask(Base):
    __tablename__ = "rectify_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id"))
    indicator_id: Mapped[int] = mapped_column(ForeignKey("std_indicators.id"))
    dept_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    assignee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(300))
    gap_desc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    target_level: Mapped[int] = mapped_column(Integer)
    priority: Mapped[str] = mapped_column(String(10), default="medium")
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=None)

    assessment: Mapped["Assessment"] = relationship(back_populates="tasks")
    indicator: Mapped["StdIndicator"] = relationship()
    department: Mapped["Department"] = relationship()
    assignee: Mapped["Optional[User]"] = relationship()
    comments: Mapped[List["TaskComment"]] = relationship(back_populates="task", lazy="selectin")


class TaskComment(Base):
    __tablename__ = "task_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("rectify_tasks.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    task: Mapped["RectifyTask"] = relationship(back_populates="comments")
    user: Mapped["User"] = relationship()
