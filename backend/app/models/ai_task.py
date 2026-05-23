"""Persistent AI background task — survives server restart."""
from datetime import datetime, timezone
from sqlalchemy import String, Text, Float, JSON, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


class AITask(Base):
    __tablename__ = "ai_tasks"

    task_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    status: Mapped[str] = mapped_column(String(20), default="running")  # running / done / error
    result: Mapped[dict] = mapped_column(JSON, nullable=True)
    error: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
