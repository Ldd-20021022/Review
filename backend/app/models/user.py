from __future__ import annotations
from typing import List, Optional
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(100))
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    tenant_links: Mapped[List["UserTenant"]] = relationship(back_populates="user", lazy="selectin")


class UserTenant(Base):
    __tablename__ = "user_tenants"
    __table_args__ = (UniqueConstraint("user_id", "tenant_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"))
    role: Mapped[str] = mapped_column(String(20))
    dept_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    user: Mapped["User"] = relationship(back_populates="tenant_links")
    tenant: Mapped["Tenant"] = relationship(back_populates="user_links")
    department: Mapped["Optional[Department]"] = relationship(back_populates="members")
