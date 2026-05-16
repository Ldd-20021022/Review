from typing import List, Optional

from pydantic import BaseModel


# ── Tenant ──

class TenantInfo(BaseModel):
    id: int
    name: str
    contact: Optional[str] = None
    status: str

    class Config:
        from_attributes = True


class TenantCreate(BaseModel):
    name: str
    contact: Optional[str] = None


# ── Department ──

class DeptInfo(BaseModel):
    id: int
    name: str
    parent_id: Optional[int] = None

    class Config:
        from_attributes = True


class DeptCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None


# ── User ──

class UserInfo(BaseModel):
    id: int
    phone: str
    name: str
    is_platform_admin: bool = False

    class Config:
        from_attributes = True


class UserTenantInfo(BaseModel):
    id: int
    user_id: int
    tenant_id: int
    role: str
    dept_id: Optional[int] = None
    dept_name: Optional[str] = None
    user_name: Optional[str] = None
    user_phone: Optional[str] = None

    class Config:
        from_attributes = True


class UserInTenantCreate(BaseModel):
    phone: str
    name: str
    password: str = "123456"
    role: str  # admin / expert / dept_head / leader
    dept_id: Optional[int] = None
