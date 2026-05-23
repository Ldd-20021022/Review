"""Background task queue — in-memory cache + DB persistence for survival across restarts."""
import threading
import time
import uuid
from typing import Optional, Callable

# Memory cache for fast polling (hot path)
_tasks = {}
_lock = threading.Lock()
_TTL = 600  # auto-cleanup after 10 minutes


def _db_session():
    """Create a fresh DB session for background threads."""
    from ..database import SessionLocal
    return SessionLocal()


def submit(fn: Callable[[], any]) -> str:
    """Submit a callable to background thread. Returns task_id."""
    task_id = uuid.uuid4().hex[:12]
    now = time.time()

    with _lock:
        _tasks[task_id] = {"status": "running", "result": None, "error": None, "created_at": now}

    # Persist to DB
    try:
        db = _db_session()
        from ..models.ai_task import AITask
        db.add(AITask(task_id=task_id, status="running", created_at=None))
        db.commit()
        db.close()
    except Exception:
        pass  # DB persistence is best-effort, memory cache is primary

    def _runner():
        try:
            result = fn()
            now2 = time.time()
            with _lock:
                if task_id in _tasks:
                    _tasks[task_id] = {"status": "done", "result": result, "error": None, "created_at": now2}
            _save_to_db(task_id, "done", result=result)
        except Exception as e:
            with _lock:
                if task_id in _tasks:
                    _tasks[task_id]["status"] = "error"
                    _tasks[task_id]["error"] = str(e)
            _save_to_db(task_id, "error", error=str(e))

    t = threading.Thread(target=_runner, daemon=True)
    t.start()
    return task_id


def get(task_id: str) -> Optional[dict]:
    """Poll task status. Checks memory first, then DB (recovery after restart)."""
    _cleanup()
    with _lock:
        task = _tasks.get(task_id)
    if task:
        return task
    # Fallback: try DB (task was running when server restarted)
    return _load_from_db(task_id)


def _save_to_db(task_id: str, status: str, result=None, error=None):
    try:
        db = _db_session()
        from ..models.ai_task import AITask
        t = db.get(AITask, task_id)
        if t:
            t.status = status
            t.result = result
            t.error = error
        else:
            t = AITask(task_id=task_id, status=status, result=result, error=error)
            db.add(t)
        db.commit()
        db.close()
    except Exception:
        pass


def _load_from_db(task_id: str) -> Optional[dict]:
    try:
        db = _db_session()
        from ..models.ai_task import AITask
        t = db.get(AITask, task_id)
        db.close()
        if t:
            return {"status": t.status, "result": t.result, "error": t.error, "created_at": 0}
    except Exception:
        pass
    return None


def _cleanup():
    now = time.time()
    with _lock:
        expired = [tid for tid, t in _tasks.items() if now - t["created_at"] > _TTL]
        for tid in expired:
            del _tasks[tid]
