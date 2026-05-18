from typing import List, Optional
from decimal import Decimal

from pydantic import BaseModel, validator
from datetime import datetime


class AssessmentCreate(BaseModel):
    name: str
    target_level: int  # 4 / 5 / 6
    department_id: Optional[int] = None
    rating_cycle: Optional[str] = None
    category_ids: Optional[List[int]] = None  # if None, include all indicators


def _dt_to_str(v):
    if isinstance(v, datetime):
        return v.isoformat()
    return v


class AssessmentInfo(BaseModel):
    id: int
    tenant_id: int
    name: str
    target_level: int
    department_id: Optional[int] = None
    rating_cycle: Optional[str] = None
    submitter_id: Optional[int] = None
    total_score: Optional[Decimal] = None
    status: str
    created_at: str

    @validator('created_at', pre=True)
    @classmethod
    def dt_to_str(cls, v):
        return _dt_to_str(v)

    class Config:
        from_attributes = True


class AssessmentItemInfo(BaseModel):
    id: int
    assessment_id: int
    indicator_id: int
    actual_value: Optional[str] = None
    is_compliant: Optional[bool] = None
    score: Optional[int] = None
    gap_note: Optional[str] = None
    updated_at: Optional[str] = None
    # indicator info
    indicator_code: Optional[str] = None
    indicator_name: Optional[str] = None
    category_name: Optional[str] = None
    standard_value: Optional[str] = None
    indicator_type: Optional[str] = None
    req_text: Optional[str] = None  # requirement for the target level

    class Config:
        from_attributes = True


class AssessmentDetail(BaseModel):
    id: int
    tenant_id: int
    name: str
    target_level: int
    department_id: Optional[int] = None
    rating_cycle: Optional[str] = None
    submitter_id: Optional[int] = None
    total_score: Optional[Decimal] = None
    status: str
    created_at: str
    items: List[AssessmentItemInfo] = []

    @validator('created_at', pre=True)
    @classmethod
    def dt_to_str(cls, v):
        return _dt_to_str(v)

    class Config:
        from_attributes = True


class ScoreUpdate(BaseModel):
    actual_value: Optional[str] = None
    score: Optional[int] = None
    gap_note: Optional[str] = None
