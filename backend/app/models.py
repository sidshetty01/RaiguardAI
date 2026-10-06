from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(16))  # ADMIN | OPERATOR | VIEWER
    hashed_password: Mapped[str] = mapped_column(String(256))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Section(Base):
    __tablename__ = "sections"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)  # SEC-01
    name: Mapped[str] = mapped_column(String(128))
    from_station: Mapped[str] = mapped_column(String(64))
    to_station: Mapped[str] = mapped_column(String(64))
    km_start: Mapped[float] = mapped_column(Float)
    km_end: Mapped[float] = mapped_column(Float)
    terrain: Mapped[str] = mapped_column(String(32))  # FOREST | GHAT | COASTAL | RURAL
    forest_proximity: Mapped[float] = mapped_column(Float)  # 0..1
    elephant_corridor: Mapped[bool] = mapped_column(Boolean, default=False)
    landslide_prone: Mapped[bool] = mapped_column(Boolean, default=False)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    polyline: Mapped[list] = mapped_column(JSON, default=list)  # [[lat, lng], ...]

    cameras: Mapped[list[Camera]] = relationship(back_populates="section")


class Camera(Base):
    __tablename__ = "cameras"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)  # CAM-01
    name: Mapped[str] = mapped_column(String(128))
    section_id: Mapped[str] = mapped_column(ForeignKey("sections.id"))
    km_marker: Mapped[float] = mapped_column(Float)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(16), default="ONLINE")  # ONLINE | OFFLINE | MAINTENANCE
    camera_type: Mapped[str] = mapped_column(String(32), default="PTZ Day/Night")
    resolution: Mapped[str] = mapped_column(String(16), default="1280x720")
    fps: Mapped[int] = mapped_column(Integer, default=10)
    focal_length_px: Mapped[float] = mapped_column(Float, default=1000.0)
    mount_height_m: Mapped[float] = mapped_column(Float, default=5.0)
    stream_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    scenario_profile: Mapped[str] = mapped_column(String(32), default="FOREST")
    temperature_c: Mapped[float] = mapped_column(Float, default=38.0)
    uptime_pct: Mapped[float] = mapped_column(Float, default=99.0)
    bandwidth_mbps: Mapped[float] = mapped_column(Float, default=4.2)
    installed_on: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_heartbeat: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    section: Mapped[Section] = relationship(back_populates="cameras")


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    camera_id: Mapped[str] = mapped_column(ForeignKey("cameras.id"), index=True)
    section_id: Mapped[str] = mapped_column(ForeignKey("sections.id"), index=True)
    track_id: Mapped[int] = mapped_column(Integer)
    hazard_class: Mapped[str] = mapped_column(String(32), index=True)
    risk_score: Mapped[float] = mapped_column(Float, index=True)
    risk_level: Mapped[str] = mapped_column(String(16), index=True)
    zone: Mapped[str] = mapped_column(String(16))
    distance_m: Mapped[float] = mapped_column(Float)
    edge_distance_m: Mapped[float] = mapped_column(Float, default=0.0)
    confidence: Mapped[float] = mapped_column(Float)
    motion_direction: Mapped[str] = mapped_column(String(24), default="STATIONARY")
    speed_mps: Mapped[float] = mapped_column(Float, default=0.0)
    predicted_entry_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    predicted_threat: Mapped[bool] = mapped_column(Boolean, default=False)
    frames_persisted: Mapped[int] = mapped_column(Integer, default=0)
    summary_reason: Mapped[str] = mapped_column(Text, default="")
    factors: Mapped[list] = mapped_column(JSON, default=list)
    snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    snapshot_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="SIMULATION")  # SIMULATION | VIDEO | CAMERA | SEED
    status: Mapped[str] = mapped_column(String(16), default="OPEN", index=True)
    operator_notes: Mapped[str] = mapped_column(Text, default="")
    signed_off_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    signed_off_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    response_time_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    camera: Mapped[Camera] = relationship()
    section: Mapped[Section] = relationship()
    alerts: Mapped[list[Alert]] = relationship(back_populates="incident", cascade="all, delete-orphan")


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    incident_id: Mapped[int | None] = mapped_column(ForeignKey("incidents.id"), nullable=True, index=True)
    camera_id: Mapped[str] = mapped_column(String(16), index=True)
    level: Mapped[str] = mapped_column(String(16), index=True)  # INFO | WARNING | HIGH | CRITICAL
    kind: Mapped[str] = mapped_column(String(16), default="RAISED")  # RAISED | UPGRADED | ESCALATED | PREDICTED
    title: Mapped[str] = mapped_column(String(256))
    message: Mapped[str] = mapped_column(Text)
    predicted: Mapped[bool] = mapped_column(Boolean, default=False)
    escalation_stage: Mapped[int] = mapped_column(Integer, default=1)
    escalated_to: Mapped[str] = mapped_column(String(64), default="Control Room Operator")
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    acknowledged_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    incident: Mapped[Incident | None] = relationship(back_populates="alerts")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    kind: Mapped[str] = mapped_column(String(24))  # INCIDENT | DAILY_SUMMARY | SECTION_HEALTH
    title: Mapped[str] = mapped_column(String(256))
    incident_id: Mapped[int | None] = mapped_column(ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True)
    file_path: Mapped[str] = mapped_column(String(512))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AppSetting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict | list | str | float | bool | None] = mapped_column(JSON)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(64))
    entity: Mapped[str] = mapped_column(String(64))
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
