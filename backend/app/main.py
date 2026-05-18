from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import engine, Base
from .models import *  # noqa: ensure all models registered
from .api.auth import router as auth_router
from .api.standards import router as standards_router
from .api.tenants import router as tenants_router
from .api.departments import router as departments_router
from .api.users import router as users_router
from .api.assessments import router as assessments_router
from .api.snapshots import router as snapshots_router
from .api.reports import router as reports_router
from .api.tasks import router as tasks_router
from .api.dashboard import router as dashboard_router
from .api.reviews import router as reviews_router
from .api.notifications import router as notifications_router
from .api.hospital_ratings import router as hospital_ratings_router
from .api.knowledge import router as knowledge_router
from .api.ai_endpoints import router as ai_router
from .api.workflow import router as workflow_router
from .api.integration import router as integration_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev mode: auto-create tables
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title=settings.APP_NAME, debug=settings.DEBUG, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(standards_router)
app.include_router(tenants_router)
app.include_router(departments_router)
app.include_router(users_router)
app.include_router(assessments_router)
app.include_router(snapshots_router)
app.include_router(reports_router)
app.include_router(tasks_router)
app.include_router(dashboard_router)
app.include_router(reviews_router)
app.include_router(notifications_router)
app.include_router(hospital_ratings_router)
app.include_router(knowledge_router)
app.include_router(ai_router)
app.include_router(workflow_router)
app.include_router(integration_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/favicon.ico")
def favicon():
    from fastapi.responses import Response
    return Response(status_code=204)
