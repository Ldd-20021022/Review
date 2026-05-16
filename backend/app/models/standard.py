from __future__ import annotations
from decimal import Decimal
from typing import List, Optional
from sqlalchemy import String, Integer, Text, Numeric, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class StdCategory(Base):
    __tablename__ = "std_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("std_categories.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    code: Mapped[str] = mapped_column(String(20))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    weight: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)

    children: Mapped[List["StdCategory"]] = relationship(
        "StdCategory", back_populates="parent", remote_side="StdCategory.parent_id", lazy="selectin"
    )
    parent: Mapped["Optional[StdCategory]"] = relationship(
        "StdCategory", back_populates="children", remote_side="StdCategory.id"
    )
    indicators: Mapped[List["StdIndicator"]] = relationship(back_populates="category", lazy="selectin")


class StdIndicator(Base):
    __tablename__ = "std_indicators"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("std_categories.id"))
    code: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(200))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    standard_value: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    max_score: Mapped[int] = mapped_column(Integer, default=100)
    weight: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    indicator_type: Mapped[str] = mapped_column(String(30), default="numeric_less_equal")

    category: Mapped["StdCategory"] = relationship(back_populates="indicators")
    requirements: Mapped[List["StdRequirement"]] = relationship(back_populates="indicator", lazy="selectin")


class StdRequirement(Base):
    __tablename__ = "std_requirements"
    __table_args__ = (UniqueConstraint("indicator_id", "level"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    indicator_id: Mapped[int] = mapped_column(ForeignKey("std_indicators.id"))
    level: Mapped[int] = mapped_column(Integer)
    requirement_text: Mapped[str] = mapped_column(Text)

    indicator: Mapped["StdIndicator"] = relationship(back_populates="requirements")
