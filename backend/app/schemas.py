"""Request bodies (Pydantic v2) and response serialisers."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .models import Camera, Incident, Report, Section
from .services.serializers import iso
from .vision.hazard_classes import HAZARD_CLASSES


class LoginIn(BaseModel):
    username: str
    password: str


class IncidentUpdateIn(BaseModel):
    status: Literal["OPEN", "ACKNOWLEDGED", "RESOLVED", "FALSE_ALARM"] | None = None
    operator_notes: str | None = Field(default=None, max_length=5000)


class SignOffIn(BaseModel):
    notes: str | None = Field(default=None, max_length=5000)
    resolution: Literal["RESOLVED", "FALSE_ALARM"] = "RESOLVED"


class CameraUpdateIn(BaseModel):
    status: Literal["ONLINE", "OFFLINE", "MAINTENANCE"] | None = None
    name: str | None = None
    stream_url: str | None = None


class ScenarioIn(BaseModel):
    scenario: str


class SettingsIn(BaseModel):
    simulation_enabled: bool | None = None
    auto_scenarios: bool | None = None
    scenario_frequency: Literal["LOW", "NORMAL", "HIGH"] | None = None
    alert_sound: bool | None = None
    escalation_critical_s: int | None = Field(default=None, ge=5, le=600)
    escalation_high_s: int | None = Field(default=None, ge=5, le=1800)


def section_to_dict(s: Section) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "from_station": s.from_station,
        "to_station": s.to_station,
        "km_start": s.km_start,
        "km_end": s.km_end,
        "terrain": s.terrain,
        "forest_proximity": s.forest_proximity,
        "elephant_corridor": s.elephant_corridor,
        "landslide_prone": s.landslide_prone,
        "lat": s.lat,
        "lng": s.lng,
        "polyline": s.polyline,
    }


def camera_to_dict(c: Camera, runtime: dict | None = None) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "section_id": c.section_id,
        "section_name": c.section.name if c.section else None,
        "km_marker": c.km_marker,
        "lat": c.lat,
        "lng": c.lng,
        "status": c.status,
        "camera_type": c.camera_type,
        "resolution": c.resolution,
        "fps": c.fps,
        "focal_length_px": c.focal_length_px,
        "mount_height_m": c.mount_height_m,
        "stream_url": c.stream_url,
        "scenario_profile": c.scenario_profile,
        "temperature_c": c.temperature_c,
        "uptime_pct": c.uptime_pct,
        "bandwidth_mbps": c.bandwidth_mbps,
        "installed_on": iso(c.installed_on),
        "last_heartbeat": iso(c.last_heartbeat),
        "runtime": runtime,
    }


def incident_to_dict(i: Incident, full: bool = False) -> dict:
    hz = HAZARD_CLASSES.get(i.hazard_class)
    d = {
        "id": i.id,
        "code": i.code,
        "camera_id": i.camera_id,
        "camera_name": i.camera.name if i.camera else None,
        "section_id": i.section_id,
        "section_name": i.section.name if i.section else None,
        "track_id": i.track_id,
        "hazard_class": i.hazard_class,
        "hazard_label": hz.label if hz else i.hazard_class,
        "hazard_icon": hz.icon if hz else "",
        "category": hz.category if hz else "",
        "risk_score": i.risk_score,
        "risk_level": i.risk_level,
        "zone": i.zone,
        "distance_m": i.distance_m,
        "edge_distance_m": i.edge_distance_m,
        "confidence": i.confidence,
        "motion_direction": i.motion_direction,
        "speed_mps": i.speed_mps,
        "predicted_entry_s": i.predicted_entry_s,
        "predicted_threat": i.predicted_threat,
        "frames_persisted": i.frames_persisted,
        "summary_reason": i.summary_reason,
        "status": i.status,
        "source": i.source,
        "response_time_s": i.response_time_s,
        "detected_at": iso(i.detected_at),
        "updated_at": iso(i.updated_at),
        "has_image": bool(i.snapshot_path),
    }
    if full:
        d.update(
            {
                "factors": i.factors,
                "snapshot": i.snapshot,
                "operator_notes": i.operator_notes,
                "signed_off_by": i.signed_off_by,
                "signed_off_at": iso(i.signed_off_at),
                "acknowledged_at": iso(i.acknowledged_at),
                "resolved_at": iso(i.resolved_at),
                "km_marker": i.camera.km_marker if i.camera else None,
                "lat": i.camera.lat if i.camera else None,
                "lng": i.camera.lng if i.camera else None,
            }
        )
    return d


def report_to_dict(r: Report) -> dict:
    return {
        "id": r.id,
        "code": r.code,
        "kind": r.kind,
        "title": r.title,
        "incident_id": r.incident_id,
        "size_bytes": r.size_bytes,
        "created_by": r.created_by,
        "created_at": iso(r.created_at),
    }
