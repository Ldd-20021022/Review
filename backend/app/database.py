from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from .config import settings

# SQLite needs check_same_thread=False; PostgreSQL needs no special connect_args
_connect_args = {"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
_pool_size = None if "sqlite" in settings.DATABASE_URL else {"pool_size": 10, "max_overflow": 20}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=_connect_args,
    echo=settings.DEBUG,
    **_pool_size if _pool_size else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
