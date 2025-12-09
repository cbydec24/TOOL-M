from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# -----------------------------
# --- Site ---
# -----------------------------
class SiteBase(BaseModel):
    site_name: str
    location: Optional[str] = None
    description: Optional[str] = None

class Site(SiteBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        orm_mode = True

# -----------------------------
# --- Device ---
# -----------------------------
class DeviceBase(BaseModel):
    hostname: str
    ip_address: str
    device_type: str
    vendor: Optional[str] = "Cisco"
    model: Optional[str] = None
    os_version: Optional[str] = None

class DeviceCreate(DeviceBase):
    site_id: Optional[int] = None
    status: Optional[str] = "unknown"
    snmp_version: Optional[str] = None
    snmp_community: Optional[str] = None
    ssh_enabled: Optional[bool] = False
    ssh_username: Optional[str] = None
    ssh_password: Optional[str] = None
    ssh_port: Optional[int] = 22

class Device(DeviceBase):
    id: int
    site_id: Optional[int] = None
    status: Optional[str] = "unknown"
    last_seen: Optional[datetime] = None
    ssh_enabled: bool
    ssh_username: Optional[str] = None
    ssh_port: int
    lldp_hostname: Optional[str] = None  # LLDP hostname from discovered device

    class Config:
        orm_mode = True

# -----------------------------
# --- Interface ---
# -----------------------------
class InterfaceBase(BaseModel):
    interface_name: str
    description: Optional[str] = None
    status: Optional[str] = "unknown"
    mac_address: Optional[str] = None
    speed_bps: Optional[int] = 0
    mtu: Optional[int] = None

class InterfaceCreate(InterfaceBase):
    device_id: int

class Interface(InterfaceBase):
    id: int
    device_id: int

    class Config:
        orm_mode = True

# -----------------------------
# --- Interface Stats ---
# -----------------------------
class InterfaceStatsBase(BaseModel):
    interface_id: int
    in_bps: Optional[int] = 0
    out_bps: Optional[int] = 0
    timestamp: Optional[datetime] = None

class InterfaceStats(InterfaceStatsBase):
    id: int

    class Config:
        orm_mode = True

# -----------------------------
# --- Alerts ---
# -----------------------------
class AlertBase(BaseModel):
    alert_type: str
    severity: str
    message: str

class Alert(AlertBase):
    id: int
    device_id: int
    interface_id: int
    timestamp: Optional[datetime] = None

    class Config:
        orm_mode = True

# -----------------------------
# --- Discovered Device (LLDP) ---
# -----------------------------
class DiscoveredDeviceBase(BaseModel):
    lldp_hostname: str
    ip_address: Optional[str] = None

class DiscoveredDevice(DiscoveredDeviceBase):
    id: int
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None

    class Config:
        orm_mode = True

# -----------------------------
# --- Topology Links ---
# -----------------------------
class TopologyLinkBase(BaseModel):
    src_device_id: int
    src_interface: str
    dst_device_id: Optional[int] = None
    dst_discovered_device_id: Optional[int] = None
    dst_interface: Optional[str] = None
    dst_hostname: Optional[str] = None

class TopologyLink(TopologyLinkBase):
    id: int
    last_seen: Optional[datetime] = None

    class Config:
        orm_mode = True

# -----------------------------
# --- User (Auth) ---
# -----------------------------
class UserBase(BaseModel):
    username: str
    email: Optional[str] = None
    role: Optional[str] = "admin"

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        orm_mode = True

# -----------------------------
# --- JWT Token ---
# -----------------------------
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    username: Optional[str] = None

# -----------------------------
# --- MAC Change Log ---
# -----------------------------
class MacChangeLog(BaseModel):
    id: Optional[int]
    device_id: int
    interface_id: int
    old_mac: str
    new_mac: str
    timestamp: Optional[datetime]

    class Config:
        from_attributes = True  # For Pydantic V2
