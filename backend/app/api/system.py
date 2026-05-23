"""System info + health status"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db, engine
from ..config import settings
from ..models.tenant import Tenant
from ..models.user import User
from ..models.assessment import Assessment
from ..middleware.tenant import get_current_tenant_id, require_role

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/info")
def system_info(
    tenant_id: int = Depends(get_current_tenant_id),
    db: Session = Depends(get_db),
    _=Depends(require_role("admin", "director")),
):
    """System status and configuration (read-only)."""
    # Database status
    db_ok = False
    try:
        engine.connect().close()
        db_ok = True
    except Exception:
        pass

    # Counts
    tenant_count = db.query(Tenant).count()
    user_count = db.query(User).count()
    assessment_count = db.query(Assessment).filter(Assessment.tenant_id == tenant_id).count()

    return {
        "app_name": settings.APP_NAME,
        "debug": settings.DEBUG,
        "db_connected": db_ok,
        "database_type": "postgresql" if "postgresql" in settings.DATABASE_URL else "sqlite",
        "jwt_algorithm": settings.JWT_ALGORITHM,
        "jwt_expire_minutes": settings.JWT_EXPIRE_MINUTES,
        "smtp_configured": bool(settings.SMTP_HOST and settings.SMTP_HOST != "smtp.example.com"),
        "deepseek_configured": bool(settings.DEEPSEEK_API_KEY),
        "deepseek_model": settings.DEEPSEEK_MODEL,
        "rate_limit_enabled": settings.RATE_LIMIT_ENABLED,
        "counts": {
            "tenants": tenant_count,
            "users": user_count,
            "assessments": assessment_count,
        },
    }
