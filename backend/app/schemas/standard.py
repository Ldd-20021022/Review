from typing import List, Optional
from decimal import Decimal

from pydantic import BaseModel


class RequirementInfo(BaseModel):
    id: int
    level: int
    requirement_text: str

    class Config:
        from_attributes = True


class IndicatorInfo(BaseModel):
    id: int
    code: str
    name: str
    category_id: int
    sort_order: int
    standard_value: Optional[str] = None
    unit: Optional[str] = None
    max_score: int = 100
    weight: Optional[Decimal] = None
    indicator_type: str = "numeric_less_equal"
    requirements: List[RequirementInfo] = []

    class Config:
        from_attributes = True


class CategoryInfo(BaseModel):
    id: int
    parent_id: Optional[int] = None
    name: str
    code: str
    sort_order: int
    weight: Optional[Decimal] = None
    children: List["CategoryInfo"] = []

    class Config:
        from_attributes = True


class CategoryCreate(BaseModel):
    parent_id: Optional[int] = None
    name: str
    code: str
    sort_order: int = 0
    weight: Optional[Decimal] = None


class IndicatorCreate(BaseModel):
    category_id: int
    code: str
    name: str
    sort_order: int = 0
    standard_value: Optional[str] = None
    unit: Optional[str] = None
    max_score: int = 100
    weight: Optional[Decimal] = None
    indicator_type: str = "numeric_less_equal"
    requirements: List["RequirementCreate"] = []


class RequirementCreate(BaseModel):
    level: int
    requirement_text: str
