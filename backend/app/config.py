import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "EMR Assessment API"
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./emr.db")

    # JWT
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # PDF
    PDF_OUTPUT_DIR: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "pdf_output")

    class Config:
        env_file = ".env"


settings = Settings()
