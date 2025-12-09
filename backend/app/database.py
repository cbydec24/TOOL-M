# backend/app/database.py

import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import text
from .config import DATABASE_URL

log = logging.getLogger("DB_INIT")

# Async SQLAlchemy engine
engine = create_async_engine(DATABASE_URL, echo=False)

# Async session
async_session = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

# Base class for models
Base = declarative_base()


# Function to create all tables and ensure schema migrations for simple changes
async def init_db():
    async with engine.begin() as conn:
        # Create any missing tables
        log.info("Creating missing tables (if any)")
        await conn.run_sync(Base.metadata.create_all)

        # Ensure topology_links.dst_hostname exists (some installations may have older schema)
        try:
            log.info("Ensuring topology_links.dst_hostname column exists")
            await conn.execute(text("""
                ALTER TABLE topology_links
                ADD COLUMN IF NOT EXISTS dst_hostname VARCHAR(100)
            """))
            log.info("Checked/created topology_links.dst_hostname")
        except Exception as e:
            log.warning(f"Could not ensure dst_hostname column: {e}")

        # Ensure topology_links.dst_discovered_device_id exists
        try:
            log.info("Ensuring topology_links.dst_discovered_device_id column exists")
            await conn.execute(text("""
                ALTER TABLE topology_links
                ADD COLUMN IF NOT EXISTS dst_discovered_device_id INTEGER
            """))
            log.info("Checked/created topology_links.dst_discovered_device_id")
        except Exception as e:
            log.warning(f"Could not ensure dst_discovered_device_id column: {e}")

        # Ensure devices.lldp_hostname exists
        try:
            log.info("Ensuring devices.lldp_hostname column exists")
            await conn.execute(text("""
                ALTER TABLE devices
                ADD COLUMN IF NOT EXISTS lldp_hostname VARCHAR(100)
            """))
            log.info("Checked/created devices.lldp_hostname")
        except Exception as e:
            log.warning(f"Could not ensure lldp_hostname column: {e}")
