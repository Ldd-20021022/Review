"""知识库模型 — 法规库 + 整改案例库"""
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


class Regulation(Base):
    """评审标准法规条文"""
    __tablename__ = "regulations"

    id: Mapped[int] = mapped_column(primary_key=True)
    chapter: Mapped[str] = mapped_column(String(100))        # 章节
    article: Mapped[str] = mapped_column(String(50))         # 条款号
    title: Mapped[str] = mapped_column(String(300))          # 标题
    content: Mapped[str] = mapped_column(Text)               # 条文内容
    interpretation: Mapped[str] = mapped_column(Text, default="")  # 官方解读
    keywords: Mapped[str] = mapped_column(String(500), default="")  # 搜索关键词
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


class RectifyCase(Base):
    """整改案例库"""
    __tablename__ = "rectify_cases"

    id: Mapped[int] = mapped_column(primary_key=True)
    indicator_name: Mapped[str] = mapped_column(String(200))  # 关联指标
    category: Mapped[str] = mapped_column(String(100))         # 分类
    problem: Mapped[str] = mapped_column(Text)                 # 问题描述
    root_cause: Mapped[str] = mapped_column(Text)              # 根因分析
    solution: Mapped[str] = mapped_column(Text)                # 整改措施
    result: Mapped[str] = mapped_column(Text)                  # 整改效果
    duration: Mapped[str] = mapped_column(String(50))          # 整改周期
    difficulty: Mapped[str] = mapped_column(String(20), default="medium")  # easy/medium/hard
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
