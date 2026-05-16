from __future__ import annotations
from decimal import Decimal
from typing import List, Optional
from datetime import datetime, timezone

from sqlalchemy import String, Integer, Text, Numeric, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Assessment(Base):
    __tablename__ = "assessments"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"))
    name: Mapped[str] = mapped_column(String(200))
    target_level: Mapped[int] = mapped_column(Integer)
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"), nullable=True)
    rating_cycle: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    submitter_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    total_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True, default=None)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    items: Mapped[List["AssessmentItem"]] = relationship(back_populates="assessment", lazy="selectin")
    snapshots: Mapped[List["Snapshot"]] = relationship(back_populates="assessment", lazy="selectin")
    tasks: Mapped[List["RectifyTask"]] = relationship(back_populates="assessment", lazy="selectin")
    reviews: Mapped[List["ReviewRecord"]] = relationship(back_populates="assessment", lazy="selectin")


class AssessmentItem(Base):
    __tablename__ = "assessment_items"
    __table_args__ = (UniqueConstraint("assessment_id", "indicator_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id"))
    indicator_id: Mapped[int] = mapped_column(ForeignKey("std_indicators.id"))
    actual_value: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, default=None)
    is_compliant: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=None)
    score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=None)
    gap_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=None)

    assessment: Mapped["Assessment"] = relationship(back_populates="items")
    indicator: Mapped["StdIndicator"] = relationship()
