# backend/app/routers/interfaces.py

from typing import AsyncGenerator, List
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import async_session
from ..models import Device, Interface as InterfaceModel
from ..schemas import Interface as InterfaceSchema

router = APIRouter()

# Dependency: get DB session
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session


# --- List all interfaces of a device ---
@router.get("/device/{device_id}", response_model=List[InterfaceSchema])
async def list_interfaces(device_id: int, session: AsyncSession = Depends(get_session)):
    # Check if device exists
    result = await session.execute(select(Device).where(Device.id == device_id))
    device = result.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Fetch interfaces for the device
    result = await session.execute(select(InterfaceModel).where(InterfaceModel.device_id == device_id))
    interfaces = result.scalars().all()
    return interfaces


# --- Get interface by ID ---
@router.get("/{interface_id}", response_model=InterfaceSchema)
async def get_interface(interface_id: int, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(InterfaceModel).where(InterfaceModel.id == interface_id))
    interface = result.scalars().first()
    if not interface:
        raise HTTPException(status_code=404, detail="Interface not found")
    return interface
