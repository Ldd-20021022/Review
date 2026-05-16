from __future__ import annotations
from typing import List, Optional
from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"))
    name: Mapped[str] = mapped_column(String(100))
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"), nullable=True)

    tenant: Mapped["Tenant"] = relationship(back_populates="departments")
    members: Mapped[List["UserTenant"]] = relationship(back_populates="department")
    children: Mapped[List["Department"]] = relationship(
        "Department", back_populates="parent", remote_side="Department.parent_id"
    )
    parent: Mapped["Optional[Department]"] = relationship(
        "Department", back_populates="children", remote_side="Department.id"
    )
