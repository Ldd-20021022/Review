"""Background task polling endpoint."""
from fastapi import APIRouter, HTTPException
from ..services.task_queue import get as get_task

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/{task_id}")
def poll_task(task_id: str):
    """Poll the status of a background task."""
    t = get_task(task_id)
    if t is None:
        raise HTTPException(404, "Task not found or expired")
    return {
        "task_id": task_id,
        "status": t["status"],
        "result": t["result"] if t["status"] == "done" else None,
        "error": t["error"],
    }
