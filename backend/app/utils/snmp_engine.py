# backend/app/utils/snmp_engine.py
import asyncio
import logging
from datetime import datetime
import platform
import socket

# Try to import pysnmp; if it fails (e.g., on Python 3.12+), use stubs
try:
    from pysnmp.hlapi import (
        SnmpEngine,
        CommunityData,
        UdpTransportTarget,
        ContextData,
        ObjectType,
        ObjectIdentity,
        getCmd,
        nextCmd,
    )
    PYSNMP_AVAILABLE = True
except (ImportError, ModuleNotFoundError) as e:
    log_msg = f"pysnmp not available: {e}. SNMP operations will be stubbed."
    print(log_msg)
    PYSNMP_AVAILABLE = False
    # Stub classes for when pysnmp is not available
    class SnmpEngine: pass
    class CommunityData: pass
    class UdpTransportTarget: pass
    class ContextData: pass
    class ObjectType: pass
    class ObjectIdentity: pass
    class getCmd: pass
    class nextCmd: pass

from ..database import async_session
from ..models import Device, Interface, InterfaceStats, TopologyLink, DiscoveredDevice
from sqlalchemy.future import select

# --------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("SNMP_ENGINE")

# --------------------------------------------------------------------------
# SNMP OIDs
# --------------------------------------------------------------------------
IF_DESCR_OID = "1.3.6.1.2.1.2.2.1.2"
IF_OPER_STATUS_OID = "1.3.6.1.2.1.2.2.1.8"
IF_IN_OCTETS_OID = "1.3.6.1.2.1.2.2.1.10"
IF_OUT_OCTETS_OID = "1.3.6.1.2.1.2.2.1.16"
IF_MAC_OID = "1.3.6.1.2.1.2.2.1.6"

# LLDP MIB OIDs (standard)
LLDP_REM_SYS_NAME = "1.0.8802.1.1.2.1.4.1.1.9"
LLDP_REM_PORT_DESC = "1.0.8802.1.1.2.1.4.1.1.8"
LLDP_REM_MAN_ADDR = "1.0.8802.1.1.2.1.4.2.1.4"

# --------------------------------------------------------------------------
# Utility Functions
# --------------------------------------------------------------------------
def calc_bps(old, new, interval):
    try:
        return max((new - old) * 8 / interval, 0)
    except Exception:
        return 0


def format_mac_address(mac_value):
    """
    Convert binary MAC address octets to standard hex format (aa:bb:cc:dd:ee:ff)
    Handles both bytes and string representations from SNMP.
    """
    if not mac_value:
        return None
    
    try:
        # If it's a string representation of bytes, convert it
        if isinstance(mac_value, str):
            # Handle case where string contains null bytes or other artifacts
            mac_value = mac_value.replace("\x00", "").strip()
            if not mac_value:
                return None
            
            # If already in hex format (contains colons), return as-is
            if ":" in mac_value:
                return mac_value
            
            # Convert string representation of bytes to hex
            # Try to interpret as raw bytes
            if isinstance(mac_value, str):
                # Get the byte representation
                mac_bytes = mac_value.encode('latin-1')
            else:
                mac_bytes = mac_value
        else:
            mac_bytes = mac_value
        
        # Convert bytes to hex format with colons
        if len(mac_bytes) >= 6:
            hex_parts = [f"{byte:02x}" for byte in mac_bytes[:6]]
            return ":".join(hex_parts)
        else:
            return None
    except Exception as e:
        log.warning(f"Failed to format MAC address {repr(mac_value)}: {e}")
        return None


def oid_index(oid_string):
    try:
        return oid_string.rsplit(".", 1)[-1]
    except Exception:
        return None


async def async_ping(host: str, timeout_ms: int = 1000) -> bool:
    """Check host reachability via TCP socket connect to common ports.

    Tries SNMP (161) and SSH (22). Returns True if any port is reachable.
    More reliable than ICMP/subprocess ping on Windows.
    """
    if not host:
        return False

    try:
        timeout_sec = max(1, timeout_ms / 1000.0)
        # Try TCP connect to SNMP (161) and SSH (22) ports
        for port in (161, 22):
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(timeout_sec)
                try:
                    result = sock.connect_ex((host, port))
                    sock.close()
                    # connect_ex returns 0 on success, non-zero on failure
                    if result == 0:
                        return True
                except Exception:
                    try:
                        sock.close()
                    except Exception:
                        pass
            except Exception:
                continue
        return False
    except Exception:
        return False


# --------------------------------------------------------------------------
# Async SNMP GET
# --------------------------------------------------------------------------
async def snmp_get(target, oid, community="public", port=161):
    if not PYSNMP_AVAILABLE:
        log.warning(f"SNMP not available, returning None for {target} OID={oid}")
        return None
    
    def run_get():
        iterator = getCmd(
            SnmpEngine(),
            CommunityData(community, mpModel=0),
            UdpTransportTarget((target, port), timeout=2, retries=1),
            ContextData(),
            ObjectType(ObjectIdentity(oid)),
        )
        return next(iterator)

    try:
        errorIndication, errorStatus, errorIndex, varBinds = await asyncio.to_thread(run_get)
    except Exception as e:
        log.error(f"snmp_get exception on {target} oid={oid} -> {e}")
        return None

    if errorIndication or errorStatus:
        log.debug(f"SNMP GET failed {target} OID={oid} Error={errorIndication or errorStatus}")
        return None
    try:
        return varBinds[0][1]
    except Exception:
        return None


# --------------------------------------------------------------------------
# Async SNMP WALK
# --------------------------------------------------------------------------
async def snmp_walk(target, oid, community="public", port=161):
    results = {}

    def run_walk():
        iterator = nextCmd(
            SnmpEngine(),
            CommunityData(community, mpModel=0),
            UdpTransportTarget((target, port), timeout=2, retries=1),
            ContextData(),
            ObjectType(ObjectIdentity(oid)),
            lexicographicMode=False,
        )
        return list(iterator)

    try:
        walk_results = await asyncio.to_thread(run_walk)
    except Exception as e:
        log.error(f"snmp_walk exception on {target} oid={oid} -> {e}")
        return None

    for errInd, errStat, errIdx, varBinds in walk_results:
        if errInd or errStat:
            log.debug(f"SNMP WALK error on {target} OID={oid} => {errInd or errStat}")
            return None
        for oid_val, value in varBinds:
            results[str(oid_val)] = value
    return results


# --------------------------------------------------------------------------
# Fetch LLDP neighbors
# --------------------------------------------------------------------------
async def get_lldp_neighbors(target, community="public"):
    """
    Returns dict: {local_iface_index: {"neighbor_ip": str, "neighbor_iface": str, "neighbor_name": str}}
    Note: local_iface_index is the LLDP index suffix. Mapping index -> ifDescr may be needed if you require human
    interface names (we keep index here and match to ifDescr loop).
    """
    neighbors = {}
    # Perform LLDP walks concurrently to reduce latency
    sysnames, portdesc, manaddr = await asyncio.gather(
        snmp_walk(target, LLDP_REM_SYS_NAME, community),
        snmp_walk(target, LLDP_REM_PORT_DESC, community),
        snmp_walk(target, LLDP_REM_MAN_ADDR, community),
    )

    log.debug(f"LLDP walk results for {target}: sysnames={bool(sysnames)}, portdesc={bool(portdesc)}, manaddr={bool(manaddr)}")
    
    if not sysnames:
        log.debug(f"{target}: No LLDP neighbors found (sysnames empty)")
        return neighbors

    for oid, sysname in sysnames.items():
        try:
            index = oid_index(oid)
            if index is None:
                continue
            # sanitize values
            neighbor_name = str(sysname).replace("\x00", "").strip()
            neighbor_ip = ""
            if manaddr:
                neighbor_ip = str(manaddr.get(f"{LLDP_REM_MAN_ADDR}.{index}", "")).replace("\x00", "").strip()
            neighbor_iface = ""
            if portdesc:
                neighbor_iface = str(portdesc.get(f"{LLDP_REM_PORT_DESC}.{index}", "")).replace("\x00", "").strip()

            log.debug(f"  LLDP index={index}: name={neighbor_name}, ip={neighbor_ip}, iface={neighbor_iface}")
            
            neighbors[index] = {
                "neighbor_name": neighbor_name,
                "neighbor_ip": neighbor_ip,
                "neighbor_iface": neighbor_iface,
            }
        except Exception as e:
            log.warning(f"Error processing LLDP entry {oid}: {e}")
            continue

    log.info(f"{target}: Found {len(neighbors)} LLDP neighbors")
    return neighbors


# --------------------------------------------------------------------------
# Poll a single device (interfaces + LLDP)
# --------------------------------------------------------------------------
async def poll_device(device_info: dict, interval=5):
    """
    device_info is a plain dict (not a SQLAlchemy instance):
      { "id": int, "hostname": str, "ip_address": str, "snmp_community": str }
    This avoids DetachedInstance errors when sessions are closed.
    """
    try:
        target = device_info.get("ip_address")
        community = device_info.get("snmp_community") or "public"
        device_id = device_info.get("id")
        device_name = device_info.get("hostname") or str(device_id)

        if not target:
            log.error(f"Device {device_name} has no IP configured - skipping")
            return

        log.info(f"Polling device {device_name} ({target})")

        # SNMP interface data - perform walks concurrently to reduce per-device latency
        if_descr, if_oper, if_in, if_out, if_mac = await asyncio.gather(
            snmp_walk(target, IF_DESCR_OID, community),
            snmp_walk(target, IF_OPER_STATUS_OID, community),
            snmp_walk(target, IF_IN_OCTETS_OID, community),
            snmp_walk(target, IF_OUT_OCTETS_OID, community),
            snmp_walk(target, IF_MAC_OID, community),
        )

        if not if_descr:
            log.info(f"{target}: no ifDescr (SNMP may be unreachable)")
            # mark device down in DB if present
            async with async_session() as session:
                try:
                    q = await session.execute(select(Device).where(Device.id == device_id))
                    db_dev = q.scalars().first()
                    if db_dev:
                        db_dev.status = "down"
                        db_dev.last_seen = None
                        await session.commit()
                except Exception:
                    await session.rollback()
            return

        # SNMP LLDP neighbors
        neighbors = await get_lldp_neighbors(target, community)

        async with async_session() as session:
            try:
                # Load existing interface rows for this device, keyed by interface_name
                q = await session.execute(select(Interface).where(Interface.device_id == device_id))
                existing_ifaces = { (i.interface_name or "").strip(): i for i in q.scalars().all() }

                # iterate ifDescr results
                for full_oid, name_val in if_descr.items():
                    try:
                        name = str(name_val).replace("\x00", "").strip()
                        index = oid_index(full_oid)
                        if index is None:
                            continue

                        # build keys for other walks
                        oper_key = f"{IF_OPER_STATUS_OID}.{index}"
                        in_key = f"{IF_IN_OCTETS_OID}.{index}"
                        out_key = f"{IF_OUT_OCTETS_OID}.{index}"
                        mac_key = f"{IF_MAC_OID}.{index}"

                        oper_raw = if_oper.get(oper_key) if if_oper else None
                        oper_status_val = int(oper_raw) if oper_raw is not None else 2
                        oper_status = "up" if oper_status_val == 1 else "down"

                        in_oct = int(if_in.get(in_key, 0)) if if_in else 0
                        out_oct = int(if_out.get(out_key, 0)) if if_out else 0
                        
                        # Convert MAC address from SNMP binary format to hex
                        mac_raw = if_mac.get(mac_key) if if_mac else None
                        mac = format_mac_address(mac_raw) if mac_raw else None

                        # compute bps and convert to integer for BigInteger DB column
                        in_bps = int((in_oct * 8 / interval)) if in_oct is not None else 0
                        out_bps = int((out_oct * 8 / interval)) if out_oct is not None else 0
                        speed_bps = int(calc_bps(0, in_oct, interval)) if in_oct else None

                        log.info(f"IF={name} STATUS={oper_status} IN={in_bps}bps OUT={out_bps}bps MAC=({mac})")

                        # Find or create interface ORM row
                        intf = existing_ifaces.get(name)
                        if intf:
                            intf.status = oper_status
                            if mac:
                                intf.mac_address = mac
                            if speed_bps is not None:
                                intf.speed_bps = speed_bps
                        else:
                            intf = Interface(
                                device_id=device_id,
                                interface_name=name,
                                status=oper_status,
                                mac_address=mac or None,
                                speed_bps=speed_bps,
                            )
                            session.add(intf)
                            # flush to get intf.id for InterfaceStats FK
                            await session.flush()
                            existing_ifaces[name] = intf

                        # Insert interface stats (integers only)
                        stats = InterfaceStats(
                            interface_id=intf.id,
                            timestamp=datetime.utcnow(),
                            in_bps=in_bps,
                            out_bps=out_bps,
                        )
                        session.add(stats)

                        # Process LLDP neighbor for this index (if any)
                        neighbor_info = neighbors.get(index)
                        if neighbor_info:
                            neighbor_ip = neighbor_info.get("neighbor_ip")
                            neighbor_iface = neighbor_info.get("neighbor_iface")
                            neighbor_name = neighbor_info.get("neighbor_name")

                            # Lookup neighbor device by IP (if present in DB)
                            neighbor_device = None
                            discovered_device = None
                            
                            if neighbor_ip:
                                qdev = await session.execute(select(Device).where(Device.ip_address == neighbor_ip))
                                neighbor_device = qdev.scalars().first()

                            # If neighbor not a managed device, try to find or create a DiscoveredDevice record
                            if not neighbor_device and neighbor_name:
                                qdiscov = await session.execute(select(DiscoveredDevice).where(DiscoveredDevice.lldp_hostname == neighbor_name))
                                discovered_device = qdiscov.scalars().first()
                                if discovered_device:
                                    discovered_device.last_seen = datetime.utcnow()
                                else:
                                    # Create new DiscoveredDevice record
                                    discovered_device = DiscoveredDevice(
                                        lldp_hostname=neighbor_name,
                                        ip_address=neighbor_ip or None,
                                        first_seen=datetime.utcnow(),
                                        last_seen=datetime.utcnow(),
                                    )
                                    session.add(discovered_device)
                                    await session.flush()  # flush to get discovered_device.id
                                    log.info(f"Created discovered device: {neighbor_name} ({neighbor_ip})")
                                
                                # Update the source device's lldp_hostname
                                if device and not device.lldp_hostname:
                                    device.lldp_hostname = neighbor_name

                            # Create topology link
                            if neighbor_device or discovered_device or neighbor_ip or neighbor_name:
                                if neighbor_device:
                                    # Link to managed device
                                    qlink = await session.execute(
                                        select(TopologyLink).where(
                                            (TopologyLink.src_device_id == device_id)
                                            & (TopologyLink.src_interface == name)
                                            & (TopologyLink.dst_device_id == neighbor_device.id)
                                            & (TopologyLink.dst_interface == neighbor_iface)
                                        )
                                    )
                                    link = qlink.scalars().first()
                                    if link:
                                        link.last_seen = datetime.utcnow()
                                    else:
                                        new_link = TopologyLink(
                                            src_device_id=device_id,
                                            src_interface=name,
                                            dst_device_id=neighbor_device.id,
                                            dst_discovered_device_id=None,
                                            dst_interface=neighbor_iface,
                                            dst_hostname=neighbor_name,
                                            last_seen=datetime.utcnow(),
                                        )
                                        session.add(new_link)
                                        log.info(f"{target} IF={name}: neighbor ({neighbor_name} {neighbor_ip}) linked to device")
                                elif discovered_device:
                                    # Link to discovered device
                                    qlink = await session.execute(
                                        select(TopologyLink).where(
                                            (TopologyLink.src_device_id == device_id)
                                            & (TopologyLink.src_interface == name)
                                            & (TopologyLink.dst_discovered_device_id == discovered_device.id)
                                            & (TopologyLink.dst_interface == neighbor_iface)
                                        )
                                    )
                                    link = qlink.scalars().first()
                                    if link:
                                        link.last_seen = datetime.utcnow()
                                    else:
                                        new_link = TopologyLink(
                                            src_device_id=device_id,
                                            src_interface=name,
                                            dst_device_id=None,
                                            dst_discovered_device_id=discovered_device.id,
                                            dst_interface=neighbor_iface,
                                            dst_hostname=neighbor_name,
                                            last_seen=datetime.utcnow(),
                                        )
                                        session.add(new_link)
                                        log.info(f"{target} IF={name}: neighbor ({neighbor_name} {neighbor_ip}) linked to discovered device")
                                else:
                                    # Fallback: store link with hostname only (for non-matching neighbors)
                                    new_link = TopologyLink(
                                        src_device_id=device_id,
                                        src_interface=name,
                                        dst_device_id=None,
                                        dst_discovered_device_id=None,
                                        dst_hostname=neighbor_name,
                                        dst_interface=neighbor_iface,
                                        last_seen=datetime.utcnow(),
                                    )
                                    session.add(new_link)
                                    log.debug(f"{target} IF={name}: neighbor ({neighbor_name} {neighbor_ip}) stored as fallback")

                    except Exception as e:
                        log.exception(f"Error processing interface {full_oid} on {target}: {e}")
                        # continue with other interfaces

                # Update device status in DB (fetch the DB row and update)
                qdev = await session.execute(select(Device).where(Device.id == device_id))
                db_dev = qdev.scalars().first()
                if db_dev:
                    db_dev.status = "up"
                    db_dev.last_seen = datetime.utcnow()

                # commit everything for this device
                try:
                    await session.commit()
                    log.info(f"{target}: interfaces, stats, and LLDP committed")
                except Exception as e:
                    log.exception(f"{target}: DB commit failed: {e}")
                    await session.rollback()

            except Exception as e:
                # rollback if something inside the session block blows up
                log.exception(f"Session-level error for {target}: {e}")
                try:
                    await session.rollback()
                except Exception:
                    pass

    except Exception as e:
        log.exception(f"Unexpected error polling device {device_info.get('hostname', device_info.get('id'))}: {e}")


# --------------------------------------------------------------------------
# Poll all devices continuously
# --------------------------------------------------------------------------
async def poll_all_devices(interval=5):
    log.info(f"Starting continuous SNMP polling every {interval} seconds...")
    while True:
        try:
            async with async_session() as session:
                q = await session.execute(select(Device))
                devices = q.scalars().all()

            # build simple device_info dicts to avoid passing ORM instances between tasks
            device_infos = []
            for d in devices:
                device_infos.append({
                    "id": d.id,
                    "hostname": d.hostname,
                    "ip_address": d.ip_address,
                    "snmp_community": d.snmp_community,
                })

            log.info(f"Polling {len(device_infos)} devices...")

            # First: ping all devices concurrently to set quick up/down status
            ping_concurrency = 50
            ping_sem = asyncio.Semaphore(ping_concurrency)

            async def ping_worker(info):
                ip = info.get("ip_address")
                async with ping_sem:
                    try:
                        ok = await async_ping(ip, timeout_ms=1000)
                        return info["id"], ip, ok
                    except Exception as e:
                        log.exception(f"Ping error for {ip}: {e}")
                        return info["id"], ip, False

            ping_tasks = [ping_worker(info) for info in device_infos]
            ping_results = await asyncio.gather(*ping_tasks, return_exceptions=False)

            # Update DB statuses based on ping results
            async with async_session() as session:
                try:
                    log.debug(f"Processing {len(ping_results)} ping results")
                    for dev_id, ip, ok in ping_results:
                        q = await session.execute(select(Device).where(Device.id == dev_id))
                        db_dev = q.scalars().first()
                        if db_dev:
                            prev = db_dev.status
                            if ok:
                                db_dev.status = "up"
                                db_dev.last_seen = datetime.utcnow()
                            else:
                                db_dev.status = "down"
                                db_dev.last_seen = None
                            if prev != db_dev.status:
                                log.info(f"Device {db_dev.hostname or db_dev.ip_address} ({ip}) status changed: {prev} -> {db_dev.status}")
                    await session.commit()
                    log.info("Ping status update committed for devices")
                except Exception as e:
                    log.exception(f"Failed to update ping statuses: {e}")
                    try:
                        await session.rollback()
                    except Exception:
                        pass

            # Limit concurrency for SNMP polling so we don't overload system for large device counts
            max_concurrency = 20
            sem = asyncio.Semaphore(max_concurrency)

            async def sem_task(info):
                async with sem:
                    # Skip SNMP polling if device is down per ping
                    ip = info.get("ip_address")
                    dev_id = info.get("id")
                    try:
                        # quick check: if DB says down, skip SNMP poll
                        async with async_session() as s:
                            q = await s.execute(select(Device).where(Device.id == dev_id))
                            db_dev = q.scalars().first()
                            if db_dev and db_dev.status == "down":
                                log.debug(f"Skipping SNMP poll for {ip} (down per ping)")
                                return
                        await poll_device(info, interval)
                    except Exception as e:
                        log.exception(f"poll_device error for {info.get('ip_address')}: {e}")

            tasks = [sem_task(info) for info in device_infos]
            # gather tasks but don't let one failing task cancel others
            await asyncio.gather(*tasks, return_exceptions=True)
        except Exception as e:
            log.exception(f"poll_all_devices top-level error: {e}")

        await asyncio.sleep(interval)
