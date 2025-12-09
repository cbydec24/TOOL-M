# backend/app/routers/stats.py

from typing import AsyncGenerator, List
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import async_session
from ..models import Device, Interface, InterfaceStats as InterfaceStatsModel
from ..schemas import InterfaceStats as InterfaceStatsSchema

router = APIRouter()


# Dependency: get DB session
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session


# --- Get bandwidth stats for all interfaces of a device ---
@router.get("/device/{device_id}", response_model=List[InterfaceStatsSchema])
async def device_stats(device_id: int, session: AsyncSession = Depends(get_session)):
    # Check if device exists
    result = await session.execute(select(Device).where(Device.id == device_id))
    device = result.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Fetch stats for all interfaces of this device
    result = await session.execute(
        select(InterfaceStatsModel).join(Interface).where(Interface.device_id == device_id)
    )
    stats_list = result.scalars().all()

    # Optional: Convert bps to kbps and Mbps (can also be done in frontend)
    response = []
    for stat in stats_list:
        stat_dict = InterfaceStatsSchema.from_orm(stat).dict()
        stat_dict["in_kbps"] = stat.in_bps / 1000 if stat.in_bps else 0
        stat_dict["out_kbps"] = stat.out_bps / 1000 if stat.out_bps else 0
        stat_dict["in_mbps"] = stat.in_bps / 1_000_000 if stat.in_bps else 0
        stat_dict["out_mbps"] = stat.out_bps / 1_000_000 if stat.out_bps else 0
        response.append(stat_dict)

    return response
