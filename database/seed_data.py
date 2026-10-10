"""Seed the RailGuard database with the monitored network and 14 days of history.

    python database/seed_data.py            # create tables + seed if empty
    python database/seed_data.py --reset    # drop everything and re-seed

Network: the Hassan-Mangaluru ghat line (Sakleshpur - Subrahmanya Road, an elephant and
landslide corridor through the Western Ghats) and Konkan Railway sections along coastal
Karnataka. Historical incidents are produced by running the *real* risk engine on sampled
situations, so every stored score, level and XAI breakdown is internally consistent.
"""
from __future__ import annotations

import argparse
import random
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from backend.app.auth import hash_password  # noqa: E402
from backend.app.database import Base, SessionLocal, engine, init_db  # noqa: E402
from backend.app.models import Alert, AppSetting, Camera, Incident, Section, User, utcnow  # noqa: E402
from backend.app.vision.alert_engine import ESCALATION_CHAIN, level_for  # noqa: E402
from backend.app.vision.geometry import CameraModel  # noqa: E402
from backend.app.vision.hazard_classes import HAZARD_CLASSES  # noqa: E402
from backend.app.vision.motion import Direction, MotionState  # noqa: E402
from backend.app.vision.risk_engine import RiskEngine, RiskInput  # noqa: E402
from backend.app.vision.roi import TrackROI, Zone  # noqa: E402

# Single-user mode: no login; this account is only used to attribute actions in the audit trail.
USERS = [("operator", "-", "Control Room Operator", "ADMIN")]

# id, name, from, to, km_start, km_end, terrain, forest, elephant, landslide, (lat1,lng1), (lat2,lng2)
SECTIONS = [
    ("SEC-01", "Sakleshpur - Donigal Ghat", "Sakleshpur", "Donigal", 0, 14, "GHAT", 0.85, True, True, (12.9417, 75.7856), (12.8920, 75.7080)),
    ("SEC-02", "Donigal - Yedakumeri Forest", "Donigal", "Yedakumeri", 14, 27, "FOREST", 0.95, True, False, (12.8920, 75.7080), (12.8420, 75.6520)),
    ("SEC-03", "Yedakumeri - Shiribagilu Ghat", "Yedakumeri", "Shiribagilu", 27, 38, "GHAT", 0.90, False, True, (12.8420, 75.6520), (12.7830, 75.6010)),
    ("SEC-04", "Shiribagilu - Subrahmanya Road", "Shiribagilu", "Subrahmanya Road", 38, 52, "FOREST", 0.80, True, False, (12.7830, 75.6010), (12.7350, 75.5400)),
    ("SEC-05", "Mangaluru Jn - Thokur", "Mangaluru Jn", "Thokur", 0, 16, "RURAL", 0.30, False, False, (12.8640, 74.8760), (12.9800, 74.8200)),
    ("SEC-06", "Udupi - Barkur Coastal", "Udupi", "Barkur", 60, 75, "COASTAL", 0.25, False, False, (13.3600, 74.7600), (13.4700, 74.7500)),
    ("SEC-07", "Kundapura - Byndoor", "Kundapura", "Byndoor", 90, 115, "RURAL", 0.45, False, False, (13.6300, 74.7100), (13.8600, 74.6400)),
    ("SEC-08", "Bhatkal - Murdeshwar", "Bhatkal", "Murdeshwar", 125, 140, "FOREST", 0.55, False, True, (13.9900, 74.5600), (14.0900, 74.4900)),
]

# camera status per section index (README: ONLINE / OFFLINE telemetry)
CAMERA_STATUS = ["ONLINE", "ONLINE", "ONLINE", "ONLINE", "ONLINE", "ONLINE", "MAINTENANCE", "OFFLINE"]
CAMERA_TYPES = ["PTZ Day/Night", "Fixed Thermal + RGB", "PTZ Day/Night", "Fixed Thermal + RGB", "Fixed RGB", "Fixed RGB", "PTZ Day/Night", "Fixed Thermal + RGB"]

PROFILE_CLASSES = {
    "FOREST": [("elephant", 5), ("deer", 3), ("wild_boar", 2), ("fallen_tree", 2), ("bear", 1), ("cattle", 1), ("fire_smoke", 1), ("person", 1)],
    "GHAT": [("rock", 4), ("boulder", 2), ("landslide_debris", 2), ("fallen_tree", 2), ("elephant", 2), ("person", 1)],
    "COASTAL": [("cattle", 3), ("person", 3), ("vehicle", 2), ("flood_water", 2), ("dog", 2), ("motorcycle", 1)],
    "RURAL": [("cattle", 5), ("person", 2), ("vehicle", 2), ("motorcycle", 2), ("dog", 2), ("wild_boar", 1)],
}
DAILY_RATE = {"FOREST": 4.5, "GHAT": 4.0, "COASTAL": 2.5, "RURAL": 3.0}
NIGHT_ACTIVE = {"elephant", "wild_boar", "bear", "deer"}


def _polyline(a, b, rng: random.Random, n: int = 7) -> list[list[float]]:
    pts = []
    for k in range(n):
        t = k / (n - 1)
        bend = 0.0 if k in (0, n - 1) else rng.uniform(-0.006, 0.006)
        lat = a[0] + (b[0] - a[0]) * t + bend
        lng = a[1] + (b[1] - a[1]) * t - bend
        pts.append([round(lat, 5), round(lng, 5)])
    return pts


def _weighted(rng: random.Random, pool):
    total = sum(w for _, w in pool)
    r = rng.uniform(0, total)
    for k, w in pool:
        r -= w
        if r <= 0:
            return k
    return pool[-1][0]


def _sample_hour(rng: random.Random, cls: str) -> float:
    if cls in NIGHT_ACTIVE and rng.random() < 0.6:
        return rng.choice([rng.uniform(18, 24), rng.uniform(0, 6)])
    if cls in ("person", "vehicle", "motorcycle", "cattle", "dog"):
        return rng.uniform(6, 20)
    return rng.uniform(0, 24)


def _situation(rng: random.Random, cls: str):
    """Sample (zone, lateral X, depth Z, motion) for a historical incident."""
    static = cls in ("fallen_tree", "boulder", "rock", "landslide_debris", "flood_water")
    r = rng.random()
    z = rng.uniform(25, 110)
    if static:
        zone = Zone.CRITICAL if r < 0.8 else Zone.WARNING
        x = rng.uniform(-1.2, 1.2) if zone == Zone.CRITICAL else rng.choice([-1, 1]) * rng.uniform(3.2, 6.5)
        ms = MotionState(direction=Direction.STATIONARY)
        return zone, x, z, ms
    if r < 0.45:
        zone, x = Zone.CRITICAL, rng.uniform(-1.8, 1.8)
        moving = rng.random() < 0.7
        sp = rng.uniform(0.6, 3.5) if moving else 0.0
        ms = MotionState(direction=Direction.ON_TRACK_MOVING if moving else Direction.STATIONARY, speed_mps=sp)
    elif r < 0.75:
        zone, x = Zone.WARNING, rng.choice([-1, 1]) * rng.uniform(3.0, 7.0)
        closing = rng.uniform(0.4, 2.5)
        edge = abs(x) - 2.6
        eta = edge / closing
        ms = MotionState(direction=Direction.TOWARD_TRACK, speed_mps=closing * 1.1, closing_speed_mps=closing, eta_s=eta, predicted_threat=eta <= 12)
    else:
        zone, x = Zone.SAFE, rng.choice([-1, 1]) * rng.uniform(8, 20)
        closing = rng.uniform(1.0, 4.0)
        edge = abs(x) - 2.6
        eta = edge / closing
        ms = MotionState(direction=Direction.TOWARD_TRACK, speed_mps=closing * 1.1, closing_speed_mps=closing, eta_s=eta, predicted_threat=eta <= 12)
    return zone, x, z, ms


def _snapshot(cam_model: CameraModel, roi: TrackROI, cls: str, x: float, z: float, risk: dict, conf: float, zone: Zone, ms: MotionState, edge: float) -> dict:
    hz = HAZARD_CLASSES[cls]
    u, v = cam_model.project(x, z)
    h = cam_model.focal_px * hz.height_m / z
    w = h * hz.aspect
    obj = {
        "track_id": 1,
        "cls": cls,
        "label": hz.label,
        "icon": hz.icon,
        "category": hz.category,
        "bbox": [round(u - w / 2, 1), round(v - h, 1), round(u + w / 2, 1), round(v, 1)],
        "confidence": round(conf, 3),
        "zone": zone.value,
        "distance_m": round(z, 1),
        "edge_distance_m": round(edge, 1),
        "lateral_m": round(x, 2),
        "persisted_frames": 45,
        "persisted_s": 3.0,
        "motion": ms.to_dict(),
        "risk": risk,
    }
    return {"camera": cam_model.to_dict(), "roi": roi.to_dict(), "objects": [obj], "env": {"time_of_day": "DAY", "weather": "CLEAR"}, "frame_no": 0, "focus_track_id": 1}


def seed(reset: bool = False, days: int = 14, rng_seed: int = 2026) -> None:
    if reset:
        Base.metadata.drop_all(bind=engine)
    init_db()
    rng = random.Random(rng_seed)
    eng = RiskEngine()
    with SessionLocal() as db:
        if db.scalar(select(User).limit(1)) is not None and not reset:
            print("Database already seeded - use --reset to rebuild.")
            return

        for username, pw, name, role in USERS:
            db.add(User(username=username, full_name=name, role=role, hashed_password=hash_password(pw)))

        sections: list[Section] = []
        cameras: list[Camera] = []
        for idx, (sid, name, a, b, k1, k2, terrain, forest, ele, slide, p1, p2) in enumerate(SECTIONS):
            poly = _polyline(p1, p2, rng)
            mid = poly[len(poly) // 2]
            sec = Section(id=sid, name=name, from_station=a, to_station=b, km_start=k1, km_end=k2, terrain=terrain, forest_proximity=forest, elephant_corridor=ele, landslide_prone=slide, lat=mid[0], lng=mid[1], polyline=poly)
            sections.append(sec)
            db.add(sec)
            cam = Camera(
                id=f"CAM-{idx + 1:02d}",
                name=f"{b} Approach Cam" if idx % 2 else f"{a} Cutting Cam",
                section_id=sid,
                km_marker=round((k1 + k2) / 2 + rng.uniform(-2, 2), 1),
                lat=mid[0],
                lng=mid[1],
                status=CAMERA_STATUS[idx],
                camera_type=CAMERA_TYPES[idx],
                resolution="1280x720",
                fps=10,
                focal_length_px=1000.0,
                mount_height_m=5.0,
                scenario_profile=terrain,
                temperature_c=round(rng.uniform(31, 47), 1),
                uptime_pct=round(rng.uniform(97.2, 99.9) if CAMERA_STATUS[idx] == "ONLINE" else rng.uniform(78, 92), 2),
                bandwidth_mbps=round(rng.uniform(2.8, 6.4), 1),
                installed_on=utcnow() - timedelta(days=rng.randint(120, 600)),
                last_heartbeat=utcnow() - timedelta(minutes=rng.randint(30, 600)) if CAMERA_STATUS[idx] != "ONLINE" else utcnow(),
            )
            cameras.append(cam)
            db.add(cam)
        db.flush()

        cam_model = CameraModel()
        roi = TrackROI.from_camera(cam_model)
        now = utcnow()
        count = 0
        for sec, cam in zip(sections, cameras):
            n = int(DAILY_RATE[sec.terrain] * days * rng.uniform(0.8, 1.2))
            for _ in range(n):
                cls = _weighted(rng, PROFILE_CLASSES[sec.terrain])
                day_ago = rng.uniform(0, days)
                ts = now - timedelta(days=day_ago)
                ts = ts.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(hours=_sample_hour(rng, cls))
                ts -= timedelta(hours=5, minutes=30)  # sampled hour is IST; store UTC
                if ts > now:
                    ts -= timedelta(days=1)
                zone, x, z, ms = _situation(rng, cls)
                conf = min(0.99, max(0.55, rng.gauss(0.88, 0.06)))
                edge = 0.0 if zone == Zone.CRITICAL else max(abs(x) - 2.6, 0.0)
                frames = rng.randint(25, 160)
                assessment = eng.assess(RiskInput(cls, zone, edge, conf, frames, frames / 10, ms))
                if assessment.risk_score < 41 and not ms.predicted_threat:
                    continue
                risk = assessment.to_dict()
                age_h = (now - ts).total_seconds() / 3600
                level = assessment.risk_level
                if age_h < 3 and level in ("HIGH", "CRITICAL") and rng.random() < 0.5:
                    status = rng.choice(["OPEN", "ACKNOWLEDGED"])
                elif assessment.risk_score < 61:
                    status = rng.choice(["AUTO_CLEARED", "AUTO_CLEARED", "RESOLVED", "FALSE_ALARM"])
                else:
                    status = "RESOLVED" if rng.random() < 0.9 else "FALSE_ALARM"
                night = (ts + timedelta(hours=5, minutes=30)).hour < 6 or (ts + timedelta(hours=5, minutes=30)).hour >= 20
                resp = None if status in ("OPEN", "AUTO_CLEARED") else round(max(6.0, rng.gauss(52 if night else 34, 14)), 1)
                inc = Incident(
                    code=f"SEED-{count}",
                    camera_id=cam.id,
                    section_id=sec.id,
                    track_id=rng.randint(1, 400),
                    hazard_class=cls,
                    risk_score=assessment.risk_score,
                    risk_level=level,
                    zone=zone.value,
                    distance_m=round(z, 1),
                    edge_distance_m=round(edge, 1),
                    confidence=round(conf, 3),
                    motion_direction=ms.direction.value,
                    speed_mps=round(ms.speed_mps, 2),
                    predicted_entry_s=None if ms.eta_s is None else round(ms.eta_s, 1),
                    predicted_threat=ms.predicted_threat,
                    frames_persisted=frames,
                    summary_reason=assessment.summary_reason,
                    factors=risk["contributing_factors"],
                    snapshot=_snapshot(cam_model, roi, cls, x, z, risk, conf, zone, ms, edge),
                    source="SEED",
                    status=status,
                    detected_at=ts,
                    updated_at=ts + timedelta(seconds=frames / 10),
                    acknowledged_at=ts + timedelta(seconds=resp) if resp else None,
                    response_time_s=resp,
                    resolved_at=ts + timedelta(minutes=rng.randint(4, 45)) if status in ("RESOLVED", "FALSE_ALARM", "AUTO_CLEARED") else None,
                )
                if status in ("RESOLVED", "FALSE_ALARM"):
                    inc.signed_off_by = "Control Room Operator"
                    inc.signed_off_at = inc.resolved_at
                    inc.operator_notes = (
                        "False alarm confirmed on CCTV review." if status == "FALSE_ALARM" else rng.choice(
                            [
                                "Loco pilot of approaching train cautioned; hazard cleared by gang.",
                                "Forest department informed; herd moved away from the line.",
                                "Track cleared by P-Way gang, speed restriction lifted.",
                                "Station master notified, patrol dispatched and confirmed clear.",
                            ]
                        )
                    )
                db.add(inc)
                db.flush()
                inc.code = f"INC-{ts.year}-{inc.id:06d}"

                # alert trail consistent with the escalation engine
                lvl = level_for(assessment.risk_score, ms.predicted_threat)
                if lvl is None or lvl.value == "INFO":
                    count += 1
                    continue
                acked = resp is not None
                trail = []
                if ms.predicted_threat:
                    trail.append(("PREDICTED", "WARNING", 1, f"PREDICTED THREAT: {HAZARD_CLASSES[cls].label} approaching track"))
                if not ms.predicted_threat or lvl.value != "WARNING":
                    trail.append(("RAISED" if not trail else "UPGRADED", lvl.value, 1, f"{lvl.value}: {HAZARD_CLASSES[cls].label} detected"))
                if lvl.value == "CRITICAL" and (resp or 60) > 20:
                    trail.append(("ESCALATED", "CRITICAL", 2, f"ESCALATED to {ESCALATION_CHAIN[1]}: {HAZARD_CLASSES[cls].label} (CRITICAL)"))
                for k, (kind, lv, stage, title) in enumerate(trail):
                    db.add(
                        Alert(
                            incident_id=inc.id,
                            camera_id=cam.id,
                            level=lv,
                            kind=kind,
                            title=title,
                            message=f"{assessment.summary_reason} at {cam.name}, {z:.0f} m ahead.",
                            predicted=ms.predicted_threat,
                            escalation_stage=stage,
                            escalated_to=ESCALATION_CHAIN[stage - 1],
                            risk_score=assessment.risk_score,
                            acknowledged=acked or status == "AUTO_CLEARED",
                            acknowledged_by="operator" if acked else ("system" if status == "AUTO_CLEARED" else None),
                            acknowledged_at=inc.acknowledged_at or inc.resolved_at,
                            created_at=ts + timedelta(seconds=k * 8),
                        )
                    )
                count += 1

        for key, val in {"simulation_enabled": True, "auto_scenarios": True, "scenario_frequency": "NORMAL", "alert_sound": True}.items():
            db.merge(AppSetting(key=key, value=val))
        db.commit()
        print(f"Seeded {len(USERS)} users, {len(sections)} sections, {len(cameras)} cameras, {count} historical incidents.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Seed the RailGuard AI database")
    ap.add_argument("--reset", action="store_true", help="drop and recreate all tables first")
    ap.add_argument("--days", type=int, default=14)
    args = ap.parse_args()
    seed(reset=args.reset, days=args.days)
