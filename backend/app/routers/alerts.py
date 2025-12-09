# backend/app/routers/alerts.py

from typing import AsyncGenerator, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..database import async_session
from ..models import Alert as AlertModel
from ..schemas import Alert as AlertSchema, AlertBase

router = APIRouter()

# Dependency to get async DB session
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session


# --- Create a new alert ---
@router.post("/", response_model=AlertSchema, status_code=status.HTTP_201_CREATED)
async def create_alert(alert: AlertBase, session: AsyncSession = Depends(get_session)):
    new_alert = AlertModel(**alert.dict())
    session.add(new_alert)
    await session.commit()
    await session.refresh(new_alert)
    return new_alert


# --- Get all alerts ---
@router.get("/", response_model=List[AlertSchema])
async def get_alerts(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(AlertModel))
    alerts = result.scalars().all()
    return alerts


# --- Get a single alert by ID ---
@router.get("/{alert_id}", response_model=AlertSchema)
async def get_alert(alert_id: int, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(AlertModel).where(AlertModel.id == alert_id))
    alert = result.scalars().first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


# --- Delete an alert by ID ---
@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(alert_id: int, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(AlertModel).where(AlertModel.id == alert_id))
    alert = result.scalars().first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    await session.delete(alert)
    await session.commit()
    return None


# --- Get alerts for a specific device ---
@router.get("/device/{device_id}", response_model=List[AlertSchema])
async def get_device_alerts(device_id: int, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(AlertModel).where(AlertModel.device_id == device_id))
    alerts = result.scalars().all()
    return alerts
