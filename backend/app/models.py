from sqlalchemy import Column, Integer, String, Boolean, BigInteger, ForeignKey, TIMESTAMP, Text
from .database import Base
from sqlalchemy.orm import relationship
from datetime import datetime

# -------------------------------------------------
# Site
# -------------------------------------------------
class Site(Base):
    __tablename__ = "sites"
    id = Column(Integer, primary_key=True, index=True)
    site_name = Column(String(100), nullable=False)
    location = Column(String(200))
    description = Column(Text)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)

    devices = relationship("Device", back_populates="site")


# -------------------------------------------------
# Device
# -------------------------------------------------
class Device(Base):
    __tablename__ = "devices"
    id = Column(Integer, primary_key=True, index=True)
    hostname = Column(String(100))
    ip_address = Column(String(50), unique=True, nullable=False)
    site_id = Column(Integer, ForeignKey("sites.id"))
    device_type = Column(String(50), nullable=False)
    vendor = Column(String(50), default="Cisco")
    model = Column(String(100))
    os_version = Column(String(100))
    snmp_version = Column(String(10))
    snmp_community = Column(String(100))
    status = Column(String(20), default="unknown")
    last_seen = Column(TIMESTAMP)
    ssh_enabled = Column(Boolean, default=False)
    ssh_username = Column(String(100))
    ssh_password = Column(String(200))
    ssh_port = Column(Integer, default=22)
    lldp_hostname = Column(String(100), nullable=True)  # LLDP hostname from discovered device

    site = relationship("Site", back_populates="devices")
    interfaces = relationship("Interface", back_populates="device")
    alerts = relationship("Alert", back_populates="device")
    mac_changes = relationship("MacChangeLog", back_populates="device")


# -------------------------------------------------
# Interface
# -------------------------------------------------
class Interface(Base):
    __tablename__ = "interfaces"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    interface_name = Column(String(100))
    description = Column(String(200))
    mac_address = Column(String(50))
    status = Column(String(20))
    speed_bps = Column(BigInteger)
    mtu = Column(Integer)

    device = relationship("Device", back_populates="interfaces")
    stats = relationship("InterfaceStats", back_populates="interface")
    alerts = relationship("Alert", back_populates="interface")
    mac_changes = relationship("MacChangeLog", back_populates="interface")


# -------------------------------------------------
# Interface Statistics
# -------------------------------------------------
class InterfaceStats(Base):
    __tablename__ = "interface_stats"
    id = Column(Integer, primary_key=True, index=True)
    interface_id = Column(Integer, ForeignKey("interfaces.id"))
    timestamp = Column(TIMESTAMP, default=datetime.utcnow)
    in_bps = Column(BigInteger)
    out_bps = Column(BigInteger)

    interface = relationship("Interface", back_populates="stats")


# -------------------------------------------------
# Alerts
# -------------------------------------------------
class Alert(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    interface_id = Column(Integer, ForeignKey("interfaces.id"))
    alert_type = Column(String(50))
    severity = Column(String(20))
    message = Column(Text)
    timestamp = Column(TIMESTAMP, default=datetime.utcnow)

    device = relationship("Device", back_populates="alerts")
    interface = relationship("Interface", back_populates="alerts")


# -------------------------------------------------
# MAC Change Log (NEW)
# -------------------------------------------------
class MacChangeLog(Base):
    __tablename__ = "mac_change_logs"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    interface_id = Column(Integer, ForeignKey("interfaces.id"))
    old_mac = Column(String(50))
    new_mac = Column(String(50))
    timestamp = Column(TIMESTAMP, default=datetime.utcnow)

    device = relationship("Device", back_populates="mac_changes")
    interface = relationship("Interface", back_populates="mac_changes")


# -------------------------------------------------
# Discovered Devices (auto-created from LLDP)
# -------------------------------------------------
class DiscoveredDevice(Base):
    __tablename__ = "discovered_devices"
    id = Column(Integer, primary_key=True, index=True)
    lldp_hostname = Column(String(100), nullable=False, unique=True)  # hostname from LLDP (e.g., "SEP9433D8B287D0.nmda.in")
    ip_address = Column(String(50), nullable=True)  # if we extract an IP from LLDP
    first_seen = Column(TIMESTAMP, default=datetime.utcnow)
    last_seen = Column(TIMESTAMP, default=datetime.utcnow)
    
    # Links that point to this discovered device
    topology_links = relationship("TopologyLink", back_populates="discovered_device")


# -------------------------------------------------
# Topology Links
# -------------------------------------------------
class TopologyLink(Base):
    __tablename__ = "topology_links"
    id = Column(Integer, primary_key=True, index=True)
    src_device_id = Column(Integer, ForeignKey("devices.id"))
    src_interface = Column(String(100))
    dst_device_id = Column(Integer, ForeignKey("devices.id"), nullable=True)  # neighbor is a managed device
    dst_discovered_device_id = Column(Integer, ForeignKey("discovered_devices.id"), nullable=True)  # neighbor is LLDP-discovered
    dst_hostname = Column(String(100), nullable=True)  # store LLDP neighbor hostname (for backwards compat)
    dst_interface = Column(String(100))
    last_seen = Column(TIMESTAMP, default=datetime.utcnow)
    
    # Relationships with explicit foreign_keys to resolve ambiguity
    src_device = relationship("Device", foreign_keys=[src_device_id], viewonly=True)
    dst_device = relationship("Device", foreign_keys=[dst_device_id], viewonly=True)
    discovered_device = relationship("DiscoveredDevice", back_populates="topology_links", viewonly=True)


# -------------------------------------------------
# User
# -------------------------------------------------
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100))
    password_hash = Column(String(200))
    role = Column(String(20), default="admin")
    created_at = Column(TIMESTAMP, default=datetime.utcnow)
