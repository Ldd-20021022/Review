from __future__ import annotations
from typing import List, Optional
from datetime import datetime, timezone

from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    contact: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    user_links: Mapped[List["UserTenant"]] = relationship(back_populates="tenant", lazy="selectin")
    departments: Mapped[List["Department"]] = relationship(back_populates="tenant", lazy="selectin")
