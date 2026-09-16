from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.notification import Notification
from app.db.session import get_db
from app.notifications.service import notification_service
from app.schemas.common import NotificationOut

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class TestNotificationIn(BaseModel):
    channel: str = "console"
    subject: str = "ORVIX test notification"
    body: str = "This is a test notification from ORVIX."


@router.get("", response_model=list[NotificationOut])
async def list_notifications(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Notification).order_by(Notification.created_at.desc()).limit(100))
    return list(result.scalars().all())


@router.post("/test")
async def test_notification(payload: TestNotificationIn, db: AsyncSession = Depends(get_db)):
    result = await notification_service.notify(channel=payload.channel, subject=payload.subject, body=payload.body)
    row = Notification(channel=result["channel"], subject=payload.subject, body=payload.body,
                        status="SENT" if result["delivered"] else "FAILED")
    db.add(row)
    await db.commit()
    return result
