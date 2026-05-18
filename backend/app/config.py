import os


class Settings:
    APP_NAME: str = "三甲医院评级系统"
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./emr.db")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24
    PDF_OUTPUT_DIR: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "pdf_output")


settings = Settings()
