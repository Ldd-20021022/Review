from typing import Optional

from pydantic import BaseModel


class LoginRequest(BaseModel):
    phone: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    user: dict


class UserInfo(BaseModel):
    id: int
    phone: str
    name: str
    is_platform_admin: bool = False
    tenant_id: Optional[int] = None
    role: Optional[str] = None
    dept_id: Optional[int] = None
    dept_name: Optional[str] = None
