from typing import List, Optional

from pydantic import BaseModel


class SnapshotItemInfo(BaseModel):
    id: int
    indicator_id: int
    score: Optional[int] = None
    gap_note: Optional[str] = None
    indicator_code: Optional[str] = None
    indicator_name: Optional[str] = None
    category_name: Optional[str] = None

    class Config:
        from_attributes = True


class SnapshotInfo(BaseModel):
    id: int
    assessment_id: int
    version: str
    total_score: float
    locked_at: str
    assessment_name: Optional[str] = None
    target_level: Optional[int] = None

    class Config:
        from_attributes = True


class SnapshotDetail(BaseModel):
    id: int
    assessment_id: int
    version: str
    total_score: float
    locked_at: str
    assessment_name: Optional[str] = None
    target_level: Optional[int] = None
    items: List[SnapshotItemInfo] = []

    class Config:
        from_attributes = True


class CompareResult(BaseModel):
    snap1: SnapshotDetail
    snap2: SnapshotDetail
    score_diff: float
    items_diff: List[dict]  # [{indicator_code, name, score1, score2, diff, ...}]
