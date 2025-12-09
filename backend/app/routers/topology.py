# backend/app/routers/topology.py

from typing import AsyncGenerator, List
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import or_

from ..database import async_session
from ..models import TopologyLink, Device, Interface, DiscoveredDevice
from ..schemas import TopologyLink as TopologyLinkSchema

router = APIRouter()


# Dependency: get DB session
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session


# --- List all topology links ---
@router.get("/")
async def list_links(session: AsyncSession = Depends(get_session)):
    query = await session.execute(select(TopologyLink))
    links = query.scalars().all()
    result = []
    for link in links:
        src_device = await session.get(Device, link.src_device_id)
        dst_device = await session.get(Device, link.dst_device_id)
        link_data = TopologyLinkSchema.from_orm(link).dict()
        link_data["src_device_name"] = src_device.hostname if src_device else None
        link_data["dst_device_name"] = dst_device.hostname if dst_device else None
        result.append(link_data)
    return result


# --- Get topology links endpoint (for frontend) ---
@router.get("/links")
async def get_links(session: AsyncSession = Depends(get_session)):
    """Get all topology links with device names (returns raw dicts)"""
    try:
        query = await session.execute(select(TopologyLink).order_by(TopologyLink.id))
        links = query.scalars().all()
        result = []
        for link in links:
            src_device = await session.get(Device, link.src_device_id)
            dst_device = await session.get(Device, link.dst_device_id) if link.dst_device_id else None
            discovered_device = await session.get(DiscoveredDevice, link.dst_discovered_device_id) if link.dst_discovered_device_id else None
            
            # Determine destination hostname: prefer dst_device.hostname, then discovered_device.lldp_hostname, then stored dst_hostname
            dst_device_name = None
            dst_lldp_hostname = None
            
            if dst_device:
                dst_device_name = dst_device.hostname
            if discovered_device:
                dst_lldp_hostname = discovered_device.lldp_hostname
            
            # serialize link dict
            link_data = {
                "id": link.id,
                "src_device_id": link.src_device_id,
                "src_interface": link.src_interface,
                "dst_device_id": link.dst_device_id,
                "dst_discovered_device_id": link.dst_discovered_device_id,
                "dst_interface": link.dst_interface,
                "dst_hostname": link.dst_hostname,
                "last_seen": link.last_seen,
                "src_device_name": src_device.hostname if src_device else None,
                "dst_device_name": dst_device_name,
                "dst_lldp_hostname": dst_lldp_hostname,  # LLDP-discovered hostname
            }
            result.append(link_data)
        
        # Add Cache-Control headers for 5-minute caching (300 seconds)
        response = JSONResponse(content=result)
        response.headers["Cache-Control"] = "public, max-age=300"
        return response
    except Exception as e:
        # avoid raising validation errors to client; log and return minimal failure info
        print(f"[Topology:get_links] error: {e}")
        raise


# --- Get topology graph endpoint (for frontend) ---
@router.get("/graph")
async def get_graph(session: AsyncSession = Depends(get_session)):
    """Get topology graph with nodes (devices + discovered devices) and edges (device-to-device links)"""
    # Get all managed devices as nodes (ordered by ID for consistency)
    devices_result = await session.execute(select(Device).order_by(Device.id))
    devices = devices_result.scalars().all()
    
    nodes = [
        {
            "id": device.id,
            "label": device.hostname,
            "type": "device",
            "status": device.status,
            "ipAddress": device.ip_address,
            "isDiscovered": False,
        }
        for device in devices
    ]
    
    # Get all discovered devices and add as nodes with negative IDs (so they don't conflict)
    discovered_result = await session.execute(select(DiscoveredDevice).order_by(DiscoveredDevice.id))
    discovered_devices = discovered_result.scalars().all()
    
    # Map discovered device id to negative node id for graph
    discovered_id_map = {}
    for dd in discovered_devices:
        node_id = -(dd.id + 1000)  # Use negative ID to distinguish from managed devices
        discovered_id_map[dd.id] = node_id
        nodes.append({
            "id": node_id,
            "label": dd.lldp_hostname,
            "type": "discovered",
            "status": "unknown",
            "ipAddress": dd.ip_address,
            "isDiscovered": True,
        })
    
    # Get all links as edges (ordered by ID for consistency)
    links_result = await session.execute(select(TopologyLink).order_by(TopologyLink.id))
    links = links_result.scalars().all()
    
    # Build edges: include device-to-device, device-to-discovered, and discovered-to-device
    edges = []
    existing_node_ids = {n["id"] for n in nodes}

    for link in links:
        src = link.src_device_id
        dst = link.dst_device_id
        discovered_dst = link.dst_discovered_device_id
        
        # device-to-device edge
        if src in existing_node_ids and dst is not None and dst in existing_node_ids:
            edges.append({
                "id": link.id,
                "source": src,
                "target": dst,
                "sourceInterface": link.src_interface,
                "targetInterface": link.dst_interface,
            })
        # device-to-discovered edge
        elif src in existing_node_ids and discovered_dst is not None and discovered_dst in discovered_id_map:
            edges.append({
                "id": link.id,
                "source": src,
                "target": discovered_id_map[discovered_dst],
                "sourceInterface": link.src_interface,
                "targetInterface": link.dst_interface,
            })

    graph_data = {
        "nodes": nodes,
        "edges": edges,
    }
    
    # Add Cache-Control headers for 5-minute caching (300 seconds)
    response = JSONResponse(content=graph_data)
    response.headers["Cache-Control"] = "public, max-age=300"
    return response


# --- Get topology links for a specific device ---
@router.get("/device/{device_id}")
async def device_links(device_id: int, session: AsyncSession = Depends(get_session)):
    device_result = await session.execute(select(Device).where(Device.id == device_id))
    device = device_result.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    query = await session.execute(
        select(TopologyLink).where(
            or_(
                TopologyLink.src_device_id == device_id,
                TopologyLink.dst_device_id == device_id
            )
        ).order_by(TopologyLink.id)
    )
    links = query.scalars().all()

    result = []
    for link in links:
        src_device = await session.get(Device, link.src_device_id)
        dst_device = await session.get(Device, link.dst_device_id) if link.dst_device_id else None
        discovered_device = await session.get(DiscoveredDevice, link.dst_discovered_device_id) if link.dst_discovered_device_id else None
        
        link_data = {
            "id": link.id,
            "src_device_id": link.src_device_id,
            "src_interface": link.src_interface,
            "dst_device_id": link.dst_device_id,
            "dst_discovered_device_id": link.dst_discovered_device_id,
            "dst_interface": link.dst_interface,
            "dst_hostname": link.dst_hostname,
            "last_seen": link.last_seen,
            "src_device_name": src_device.hostname if src_device else None,
            "dst_device_name": dst_device.hostname if dst_device else None,
            "dst_lldp_hostname": discovered_device.lldp_hostname if discovered_device else None,
        }
        result.append(link_data)

    # Add Cache-Control headers for 5-minute caching (300 seconds)
    response = JSONResponse(content=result)
    response.headers["Cache-Control"] = "public, max-age=300"
    return response


# --- Backfill topology links (attempt to match dst_hostname to known devices) ---
@router.post("/backfill")
async def backfill_links(dry_run: bool = False, limit: int = 0, session: AsyncSession = Depends(get_session)):
    """Attempt to resolve topology links where dst_device_id is NULL.

    - If `dry_run=true` returns suggested matches without modifying DB.
    - `limit>0` restricts number of links processed (useful for sampling).

    Matching strategies (in order): exact hostname, short hostname, substring contains,
    IP inside dst_hostname, and MAC-like string matching against interface MACs.
    """
    import re

    # fetch links missing dst_device_id
    q = await session.execute(select(TopologyLink).where(TopologyLink.dst_device_id == None))
    links = q.scalars().all()
    if limit and limit > 0:
        links = links[:limit]

    processed = 0
    updated = 0
    suggestions = []

    # cache all devices for substring matching
    qdevs = await session.execute(select(Device))
    all_devices = qdevs.scalars().all()

    # cache interfaces that have mac_address for MAC matching
    qifs = await session.execute(select(Interface).where(Interface.mac_address != None))
    all_ifaces = qifs.scalars().all()

    def normalize_mac(s: str) -> str:
        if not s:
            return ""
        return re.sub(r"[^0-9a-fA-F]", "", s).lower()

    for link in links:
        processed += 1
        dst_name = (link.dst_hostname or "").strip()
        candidate = None
        candidate_reason = None

        # Skip obvious non-device strings (adapter descriptions, firmware strings)
        if dst_name and ("adapter" in dst_name.lower() or "fw_version" in dst_name.lower() or "firmware" in dst_name.lower()):
            continue

        # 1) exact hostname match (case-insensitive)
        if dst_name:
            for d in all_devices:
                if d.hostname and d.hostname.lower() == dst_name.lower():
                    candidate = d
                    candidate_reason = "exact"
                    break

        # 2) short hostname (prefix before first dot)
        if not candidate and dst_name and "." in dst_name:
            short = dst_name.split(".", 1)[0]
            for d in all_devices:
                if d.hostname and d.hostname.lower() == short.lower():
                    candidate = d
                    candidate_reason = "short"
                    break

        # 3) substring contains hostname (case-insensitive)
        if not candidate and dst_name:
            for d in all_devices:
                if d.hostname and d.hostname.lower() in dst_name.lower():
                    candidate = d
                    candidate_reason = "contains_dst"
                    break
                if dst_name.lower() in d.hostname.lower():
                    candidate = d
                    candidate_reason = "contains_dev"
                    break

        # 4) IP inside dst_name
        if not candidate and dst_name:
            ip_match = re.search(r"(\d{1,3}(?:\.\d{1,3}){3})", dst_name)
            if ip_match:
                ip = ip_match.group(1)
                for d in all_devices:
                    if d.ip_address and d.ip_address == ip:
                        candidate = d
                        candidate_reason = f"ip:{ip}"
                        break

        # 5) 12-hex MAC-like inside dst_name -> match against interface macs
        # This handles SEP-prefixed MAC addresses (IP phones, etc.)
        if not candidate and dst_name:
            mac_match = re.search(r"([0-9A-Fa-f]{12})", dst_name)
            if mac_match:
                hexstr = mac_match.group(1).lower()
                for iface in all_ifaces:
                    mac_norm = normalize_mac(iface.mac_address)
                    if mac_norm.endswith(hexstr) or mac_norm == hexstr:
                        try:
                            candidate = await session.get(Device, iface.device_id)
                            candidate_reason = f"mac:{hexstr}"
                            break
                        except Exception:
                            continue

        if candidate:
            suggestions.append({
                "link_id": link.id,
                "src_device_id": link.src_device_id,
                "src_interface": link.src_interface,
                "dst_hostname": link.dst_hostname,
                "matched_device_id": candidate.id,
                "matched_device_hostname": candidate.hostname,
                "reason": candidate_reason,
            })

            if not dry_run:
                try:
                    link.dst_device_id = candidate.id
                    link.dst_hostname = candidate.hostname or link.dst_hostname
                    updated += 1
                except Exception:
                    continue

    if not dry_run:
        try:
            await session.commit()
        except Exception:
            await session.rollback()

    return {"processed": processed, "updated": updated, "suggestions": suggestions}


# --- Diagnostic endpoint: show what's in the database ---
@router.get("/debug/sample-data")
async def debug_sample_data(session: AsyncSession = Depends(get_session)):
    """Return sample device hostnames and IPs, sample interface MACs, and sample dst_hostname values
    to help debug why backfill isn't matching."""
    
    # Get sample devices
    qdevs = await session.execute(select(Device).limit(20))
    devices_sample = qdevs.scalars().all()
    devices_info = [
        {"id": d.id, "hostname": d.hostname, "ip_address": d.ip_address}
        for d in devices_sample
    ]
    
    # Get sample interfaces with MACs
    qifs = await session.execute(select(Interface).where(Interface.mac_address != None).limit(20))
    ifaces_sample = qifs.scalars().all()
    ifaces_info = [
        {"id": i.id, "device_id": i.device_id, "mac_address": i.mac_address}
        for i in ifaces_sample
    ]
    
    # Get sample topology links with NULL dst_device_id
    q = await session.execute(select(TopologyLink).where(TopologyLink.dst_device_id == None).limit(50))
    links_sample = q.scalars().all()
    links_info = [
        {
            "id": link.id,
            "src_device_id": link.src_device_id,
            "src_interface": link.src_interface,
            "dst_hostname": link.dst_hostname,
            "dst_interface": link.dst_interface,
        }
        for link in links_sample
    ]
    
    return {
        "sample_devices": devices_info,
        "sample_interfaces": ifaces_info,
        "sample_null_links": links_info,
    }
