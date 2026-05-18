"""流程深化模型 — PDCA 改进追踪 + 评审会议记录"""
from datetime import datetime, timezone, date
from typing import Optional
from sqlalchemy import String, Integer, Text, Date, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


class PDCAProject(Base):
    """PDCA 改进项目 — 从未达标指标自动创建"""
    __tablename__ = "pdca_projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id"))
    indicator_id: Mapped[int] = mapped_column(ForeignKey("std_indicators.id"))
    dept_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    title: Mapped[str] = mapped_column(String(300))
    current_value: Mapped[str] = mapped_column(String(50))
    target_value: Mapped[str] = mapped_column(String(50))
    phase: Mapped[str] = mapped_column(String(20), default="plan")  # plan/do/check/act
    plan_detail: Mapped[str] = mapped_column(Text, default="")
    do_detail: Mapped[str] = mapped_column(Text, default="")
    check_detail: Mapped[str] = mapped_column(Text, default="")
    act_detail: Mapped[str] = mapped_column(Text, default="")
    owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active/completed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


class ReviewMeeting(Base):
    """评审会议记录"""
    __tablename__ = "review_meetings"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"))
    title: Mapped[str] = mapped_column(String(300))
    meeting_date: Mapped[date] = mapped_column(Date, default=date.today)
    attendees: Mapped[str] = mapped_column(String(500), default="")     # 参会人员
    topics: Mapped[str] = mapped_column(Text, default="")               # 议题
    discussion: Mapped[str] = mapped_column(Text, default="")           # 讨论记录
    conclusions: Mapped[str] = mapped_column(Text, default="")          # 评审结论
    votes_approve: Mapped[int] = mapped_column(Integer, default=0)      # 赞成票
    votes_reject: Mapped[int] = mapped_column(Integer, default=0)       # 反对票
    votes_abstain: Mapped[int] = mapped_column(Integer, default=0)      # 弃权票
    recorder_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
