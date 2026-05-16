from __future__ import annotations
from typing import List, Optional
from datetime import datetime, timezone

from sqlalchemy import String, Integer, Text, Float, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Snapshot(Base):
    __tablename__ = "snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id"))
    version: Mapped[str] = mapped_column(String(10))
    total_score: Mapped[float] = mapped_column(Float)
    locked_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    assessment: Mapped["Assessment"] = relationship(back_populates="snapshots")
    items: Mapped[List["SnapshotItem"]] = relationship(back_populates="snapshot", lazy="selectin")


class SnapshotItem(Base):
    __tablename__ = "snapshot_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(ForeignKey("snapshots.id"))
    indicator_id: Mapped[int] = mapped_column(ForeignKey("std_indicators.id"))
    score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    gap_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    snapshot: Mapped["Snapshot"] = relationship(back_populates="items")
    indicator: Mapped["StdIndicator"] = relationship()
