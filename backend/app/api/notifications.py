from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.notification import Notification
from ..middleware.tenant import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("/")
def list_notifications(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Return all notifications for current user, newest first."""
    notifs = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .all()
    )
    return [
        {
            "id": n.id,
            "title": n.title,
            "content": n.content,
            "type": n.type,
            "is_read": n.is_read,
            "related_id": n.related_id,
            "created_at": n.created_at.isoformat(),
        }
        for n in notifs
    ]


@router.patch("/{nid}/read")
def mark_read(
    nid: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    n = db.query(Notification).filter(
        Notification.id == nid, Notification.user_id == user.id
    ).first()
    if not n:
        raise HTTPException(404, "Notification not found")
    n.is_read = True
    db.commit()
    return {"ok": True}


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    count = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.is_read == False)
        .count()
    )
    return {"count": count}

@router.get("/stream")
async def notification_stream(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """SSE endpoint for real-time notification count"""
    from fastapi.responses import StreamingResponse
    import asyncio
    import json

    async def generate():
        while True:
            count = db.query(Notification).filter(
                Notification.user_id == user.id,
                Notification.is_read == False,
            ).count()
            yield f"data: {json.dumps({'count': count})}\n\n"
            await asyncio.sleep(15)

    return StreamingResponse(generate(), media_type="text/event-stream")
