# backend/app/routers/devices.py

from typing import AsyncGenerator, List
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from sqlalchemy import func
from ..database import async_session
from ..models import Device as DeviceModel, Interface as InterfaceModel, InterfaceStats as InterfaceStatsModel, TopologyLink, DiscoveredDevice
from ..schemas import Device as DeviceSchema, DeviceCreate, Interface as InterfaceSchema, InterfaceStats as InterfaceStatsSchema
import asyncio
import socket
from ..utils.snmp_engine import snmp_get
from ..utils.snmp_engine import async_ping
import logging

log = logging.getLogger("DEVICES_ROUTER")

router = APIRouter()

# Dependency: get DB session
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session

# -----------------------------
# Add new device
# -----------------------------
@router.post("/", response_model=DeviceSchema)
async def add_device(device: DeviceCreate, session: AsyncSession = Depends(get_session)):
    # Check if device already exists
    query = await session.execute(select(DeviceModel).where(DeviceModel.ip_address == device.ip_address))
    existing = query.scalars().first()
    if existing:
        raise HTTPException(status_code=400, detail="Device with this IP already exists")

    new_device = DeviceModel(
        hostname=device.hostname,
        ip_address=device.ip_address,
        site_id=device.site_id,
        device_type=device.device_type,
        vendor=device.vendor,
        model=device.model,
        os_version=device.os_version,
        status=device.status,
        snmp_version=device.snmp_version,
        snmp_community=device.snmp_community,
        ssh_enabled=device.ssh_enabled,
        ssh_username=device.ssh_username,
        ssh_password=device.ssh_password,
        ssh_port=device.ssh_port
    )
    session.add(new_device)
    await session.commit()
    await session.refresh(new_device)
    return new_device


# -----------------------------
# Connectivity test endpoints
# -----------------------------
@router.post("/test/connectivity")
async def test_connectivity(payload: dict):
    """
    Simple TCP reachability test. Payload: { "ip_address": "1.2.3.4" }
    Attempts to open a TCP socket to common device ports (161 and 22).
    """
    ip = payload.get("ip_address")
    if not ip:
        raise HTTPException(status_code=400, detail="ip_address is required")

    def try_connect(host, port, timeout=2):
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return True
        except Exception:
            return False

    # test SNMP (161) first, then SSH (22)
    reachable_snmp = await asyncio.to_thread(try_connect, ip, 161, 2)
    reachable_ssh = await asyncio.to_thread(try_connect, ip, 22, 2)
    return {"snmp": reachable_snmp, "ssh": reachable_ssh, "any": (reachable_snmp or reachable_ssh)}


@router.post("/test/snmp")
async def test_snmp(payload: dict):
    """
    Test SNMP GET for sysName OID. Payload: { "ip_address": "..", "community": "public", "port": 161 }
    """
    ip = payload.get("ip_address")
    community = payload.get("community", "public")
    port = int(payload.get("port", 161))
    if not ip:
        raise HTTPException(status_code=400, detail="ip_address is required")

    # sysName OID
    oid = "1.3.6.1.2.1.1.5.0"
    try:
        val = await snmp_get(ip, oid, community=community, port=port)
        return {"reachable": bool(val), "value": str(val) if val is not None else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test/ssh")
async def test_ssh(payload: dict):
    """
    Simple SSH port test (TCP connect). Payload: { "ip_address": "..", "port": 22 }
    """
    ip = payload.get("ip_address")
    port = int(payload.get("port", 22))
    if not ip:
        raise HTTPException(status_code=400, detail="ip_address is required")

    def try_connect(host, port, timeout=2):
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return True
        except Exception:
            return False

    ok = await asyncio.to_thread(try_connect, ip, port, 2)
    return {"reachable": ok}

# -----------------------------
# List all devices
# -----------------------------
@router.get("/", response_model=List[DeviceSchema])
async def list_devices(session: AsyncSession = Depends(get_session)):
    query = await session.execute(select(DeviceModel).order_by(DeviceModel.id))
    devices = query.scalars().all()
    # Debug: log current statuses for troubleshooting frontend sync
    try:
        statuses = [(d.id, d.ip_address, d.status, d.last_seen) for d in devices]
        log.debug(f"list_devices returning {len(statuses)} devices: {statuses}")
    except Exception:
        pass
    # Normalize status values so frontend receives 'online'/'offline' consistently
    for d in devices:
        if d.status == "up":
            d.status = "online"
        elif d.status == "down":
            d.status = "offline"
    return devices


# --- Get only changed devices since a timestamp (for incremental sync) ---
@router.get("/changes/since/{timestamp}")
async def get_device_changes(timestamp: str, session: AsyncSession = Depends(get_session)):
    """Get only devices that changed since the given ISO timestamp.
    
    Returns:
    - changed: List of modified/new devices
    - timestamp: Current server time (for next sync)
    """
    from datetime import datetime
    from fastapi.responses import JSONResponse
    
    try:
        # Parse ISO timestamp from client
        since = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    except ValueError:
        # If timestamp is invalid, return all devices (fallback to full sync)
        since = datetime.min
    
    # Get all devices that were modified OR created after the given timestamp
    query = await session.execute(
        select(DeviceModel)
        .where(
            (DeviceModel.last_seen >= since) |
            (DeviceModel.status != 'unknown')  # Changed status
        )
        .order_by(DeviceModel.id)
    )
    devices = query.scalars().all()
    
    # Normalize status
    for d in devices:
        if d.status == "up":
            d.status = "online"
        elif d.status == "down":
            d.status = "offline"
    
    result = [{
        "id": d.id,
        "hostname": d.hostname,
        "ip_address": d.ip_address,
        "site_id": d.site_id,
        "device_type": d.device_type,
        "vendor": d.vendor,
        "model": d.model,
        "os_version": d.os_version,
        "snmp_version": d.snmp_version,
        "snmp_community": d.snmp_community,
        "status": d.status,
        "last_seen": d.last_seen.isoformat() if d.last_seen else None,
        "ssh_enabled": d.ssh_enabled,
        "ssh_username": d.ssh_username,
        "ssh_password": d.ssh_password,
        "ssh_port": d.ssh_port,
        "lldp_hostname": d.lldp_hostname,
    } for d in devices]
    
    # Add Cache-Control headers to cache changes endpoint (2-minute cache for polling efficiency)
    response = JSONResponse(content={
        "changed": result,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    })
    response.headers["Cache-Control"] = "public, max-age=120"
    return response


@router.get("/debug/statuses")
async def debug_device_statuses(session: AsyncSession = Depends(get_session)):
    """Return minimal device status info for debugging (id, ip_address, status, last_seen)"""
    query = await session.execute(select(DeviceModel))
    devices = query.scalars().all()
    result = []
    for d in devices:
        result.append({
            "id": d.id,
            "ip_address": d.ip_address,
            "status": d.status,
            "last_seen": d.last_seen.isoformat() if d.last_seen else None,
        })
    return result


@router.get("/debug/ping")
async def debug_ping_devices(session: AsyncSession = Depends(get_session)):
    """Ping all devices from the backend and return results for debugging."""
    query = await session.execute(select(DeviceModel))
    devices = query.scalars().all()

    async def do_ping(d):
        ok = await async_ping(d.ip_address, timeout_ms=1000)
        return {"id": d.id, "ip_address": d.ip_address, "hostname": d.hostname, "reachable": ok}

    tasks = [do_ping(d) for d in devices]
    results = await asyncio.gather(*tasks, return_exceptions=False)
    return results

# -----------------------------
# Get single device by ID
# -----------------------------
@router.get("/{device_id}", response_model=DeviceSchema)
async def get_device(device_id: int, session: AsyncSession = Depends(get_session)):
    query = await session.execute(select(DeviceModel).where(DeviceModel.id == device_id))
    device = query.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    # Normalize status for single-device endpoint as well
    if device.status == "up":
        device.status = "online"
    elif device.status == "down":
        device.status = "offline"
    return device

# -----------------------------
# Update device (especially site_id)
# -----------------------------
@router.put("/{device_id}", response_model=DeviceSchema)
async def update_device(device_id: int, payload: dict, session: AsyncSession = Depends(get_session)):
    query = await session.execute(select(DeviceModel).where(DeviceModel.id == device_id))
    device = query.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Update fields if provided
    if "site_id" in payload:
        device.site_id = payload["site_id"]
    if "hostname" in payload:
        device.hostname = payload["hostname"]
    if "device_type" in payload:
        device.device_type = payload["device_type"]
    if "snmp_community" in payload:
        device.snmp_community = payload["snmp_community"]
    if "ssh_enabled" in payload:
        device.ssh_enabled = payload["ssh_enabled"]
    if "ssh_username" in payload:
        device.ssh_username = payload["ssh_username"]
    
    await session.commit()
    await session.refresh(device)
    return device

# -----------------------------
# Delete a device
# -----------------------------
@router.delete("/{device_id}", response_model=dict)
async def delete_device(device_id: int, session: AsyncSession = Depends(get_session)):
    query = await session.execute(select(DeviceModel).where(DeviceModel.id == device_id))
    device = query.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    await session.delete(device)
    await session.commit()
    return {"message": f"Device {device.hostname} deleted successfully"}

# -----------------------------
# Get interfaces for a device
# -----------------------------
@router.get("/{device_id}/interfaces", response_model=List[InterfaceSchema])
async def get_device_interfaces(device_id: int, session: AsyncSession = Depends(get_session)):
    # Check if device exists
    query = await session.execute(select(DeviceModel).where(DeviceModel.id == device_id))
    device = query.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Fetch interfaces for the device
    query = await session.execute(select(InterfaceModel).where(InterfaceModel.device_id == device_id))
    interfaces = query.scalars().all()
    return interfaces

# -----------------------------
# Get stats for a device
# -----------------------------
@router.get("/{device_id}/stats", response_model=List[InterfaceStatsSchema])
async def get_device_stats(device_id: int, session: AsyncSession = Depends(get_session)):
    # Check if device exists
    query = await session.execute(select(DeviceModel).where(DeviceModel.id == device_id))
    device = query.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Fetch stats for all interfaces of this device
    query = await session.execute(
        select(InterfaceStatsModel).join(InterfaceModel).where(InterfaceModel.device_id == device_id)
    )
    stats_list = query.scalars().all()
    return stats_list
