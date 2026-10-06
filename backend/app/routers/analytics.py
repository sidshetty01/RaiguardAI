import math
from collections import Counter, defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Alert, Camera, Incident, Section, User, utcnow
from ..schemas import incident_to_dict, section_to_dict
from ..services.health_score import all_sections_health, section_health, section_health_trend
from ..services.stream_manager import alert_to_dict, stream_manager
from ..vision.hazard_classes import HAZARD_CLASSES

router = APIRouter(prefix="/api", tags=["analytics"])

IST = timedelta(hours=5, minutes=30)
LEVELS = ["SAFE", "LOW", "MEDIUM", "HIGH", "CRITICAL"]


def _label(cls: str) -> str:
    hz = HAZARD_CLASSES.get(cls)
    return hz.label if hz else cls


def _window(db: Session, days: float) -> list[Incident]:
    since = utcnow() - timedelta(days=days)
    return db.scalars(select(Incident).where(Incident.detected_at >= since)).all()


@router.get("/dashboard/summary")
def dashboard(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = utcnow()
    last24 = _window(db, 1)
    last7 = _window(db, 7)
    prev24 = db.scalar(select(func.count(Incident.id)).where(Incident.detected_at >= now - timedelta(days=2), Incident.detected_at < now - timedelta(days=1))) or 0
    unack = db.scalar(select(func.count(Alert.id)).where(Alert.acknowledged.is_(False))) or 0
    resp = [i.response_time_s for i in last7 if i.response_time_s is not None]
    cams = db.scalars(select(Camera)).all()
    live = [rt for rt in stream_manager.runtimes.values() if rt.mode != "VIDEO" and rt.status == "ONLINE"]
    network_safety = round(sum((rt.latest or {}).get("safety_score", 100.0) for rt in live) / len(live), 1) if live else 100.0

    # 24-hour risk index, one bucket per hour
    buckets = []
    for h in range(23, -1, -1):
        start, end = now - timedelta(hours=h + 1), now - timedelta(hours=h)
        sub = [i for i in last24 if start <= i.detected_at < end]
        buckets.append(
            {
                "hour": (end + IST).strftime("%H:00"),
                "count": len(sub),
                "max_risk": round(max((i.risk_score for i in sub), default=0), 1),
                "avg_risk": round(sum(i.risk_score for i in sub) / len(sub), 1) if sub else 0,
                "critical": sum(1 for i in sub if i.risk_level == "CRITICAL"),
            }
        )
    recent = db.scalars(select(Incident).order_by(Incident.detected_at.desc()).limit(8)).all()
    alerts = db.execute(select(Alert, Incident).outerjoin(Incident, Alert.incident_id == Incident.id).order_by(Alert.created_at.desc()).limit(10)).all()
    overview = stream_manager.overview()
    return {
        "kpis": {
            "incidents_24h": len(last24),
            "incidents_prev_24h": prev24,
            "critical_24h": sum(1 for i in last24 if i.risk_level == "CRITICAL"),
            "predicted_24h": sum(1 for i in last24 if i.predicted_threat),
            "active_alerts": unack,
            "open_incidents": db.scalar(select(func.count(Incident.id)).where(Incident.status.in_(["OPEN", "ACKNOWLEDGED"]))) or 0,
            "cameras_online": sum(1 for c in cams if c.status == "ONLINE"),
            "cameras_total": len(cams),
            "avg_response_s": round(sum(resp) / len(resp), 1) if resp else None,
            "network_safety_score": network_safety,
            "detection_latency_ms": overview["avg_latency_ms"],
            "active_hazards": overview["active_hazards"],
        },
        "risk_index_24h": buckets,
        "recent_incidents": [incident_to_dict(i) for i in recent],
        "recent_alerts": [alert_to_dict(a, i) for a, i in alerts],
        "level_mix_24h": [{"level": lv, "count": sum(1 for i in last24 if i.risk_level == lv)} for lv in LEVELS],
        "system": overview,
    }


@router.get("/analytics")
def analytics(days: int = Query(14, ge=1, le=90), _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    incs = _window(db, days)
    now = utcnow()
    sections = {s.id: s.name for s in db.scalars(select(Section))}

    by_class = Counter(i.hazard_class for i in incs)
    crit_by_class = Counter(i.hazard_class for i in incs if i.risk_level == "CRITICAL")
    risk_by_class: dict[str, list[float]] = defaultdict(list)
    for i in incs:
        risk_by_class[i.hazard_class].append(i.risk_score)

    hourly = [{"hour": f"{h:02d}:00", "count": 0, "risk_sum": 0.0} for h in range(24)]
    for i in incs:
        h = (i.detected_at + IST).hour
        hourly[h]["count"] += 1
        hourly[h]["risk_sum"] += i.risk_score
    for h in hourly:
        h["avg_risk"] = round(h.pop("risk_sum") / h["count"], 1) if h["count"] else 0

    daily = []
    for d in range(days - 1, -1, -1):
        day = (now + IST - timedelta(days=d)).date()
        sub = [i for i in incs if (i.detected_at + IST).date() == day]
        rt = [i.response_time_s for i in sub if i.response_time_s is not None]
        daily.append(
            {
                "date": day.strftime("%d %b"),
                "total": len(sub),
                "critical": sum(1 for i in sub if i.risk_level == "CRITICAL"),
                "high": sum(1 for i in sub if i.risk_level == "HIGH"),
                "predicted": sum(1 for i in sub if i.predicted_threat),
                "avg_response_s": round(sum(rt) / len(rt), 1) if rt else None,
            }
        )

    conf_bins = [{"bin": f"{b / 100:.2f}", "count": 0} for b in range(50, 100, 5)]
    for i in incs:
        idx = min(max(int((i.confidence * 100 - 50) // 5), 0), len(conf_bins) - 1)
        conf_bins[idx]["count"] += 1

    pred_vs = []
    for cls in by_class:
        sub = [i for i in incs if i.hazard_class == cls]
        pred_vs.append(
            {
                "label": _label(cls),
                "predicted": sum(1 for i in sub if i.predicted_threat),
                "on_track": sum(1 for i in sub if i.zone == "CRITICAL"),
            }
        )

    return {
        "days": days,
        "total": len(incs),
        "by_class": [{"cls": c, "label": _label(c), "count": n, "critical": crit_by_class.get(c, 0)} for c, n in by_class.most_common()],
        "by_level": [{"level": lv, "count": sum(1 for i in incs if i.risk_level == lv)} for lv in LEVELS],
        "hourly": hourly,
        "daily": daily,
        "by_section": [{"section": s, "name": sections.get(s, s), "count": n} for s, n in sorted(Counter(i.section_id for i in incs).items())],
        "by_zone": [{"zone": z, "count": n} for z, n in Counter(i.zone for i in incs).most_common()],
        "risk_by_class": sorted(
            [{"label": _label(c), "avg_risk": round(sum(v) / len(v), 1), "max_risk": round(max(v), 1)} for c, v in risk_by_class.items()],
            key=lambda r: r["avg_risk"],
            reverse=True,
        ),
        "confidence_hist": conf_bins,
        "by_status": [{"status": s, "count": n} for s, n in Counter(i.status for i in incs).most_common()],
        "by_motion": [{"direction": m.replace("_", " ").title(), "count": n} for m, n in Counter(i.motion_direction for i in incs).most_common()],
        "predicted_vs_on_track": sorted(pred_vs, key=lambda r: r["on_track"] + r["predicted"], reverse=True),
    }


@router.get("/map")
def map_data(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    health = {h["section_id"]: h for h in all_sections_health(db)}
    sections = []
    for s in db.scalars(select(Section).order_by(Section.id)):
        d = section_to_dict(s)
        d["health"] = health.get(s.id)
        sections.append(d)
    cams = []
    for c in db.scalars(select(Camera).order_by(Camera.id)):
        rt = stream_manager.runtimes.get(c.id)
        cams.append(
            {
                "id": c.id,
                "name": c.name,
                "section_id": c.section_id,
                "lat": c.lat,
                "lng": c.lng,
                "km_marker": c.km_marker,
                "status": c.status,
                "live": rt.summary() if rt else None,
            }
        )
    active = db.scalars(
        select(Incident).where(Incident.status.in_(["OPEN", "ACKNOWLEDGED"]), Incident.risk_level.in_(["HIGH", "CRITICAL"])).order_by(Incident.detected_at.desc()).limit(40)
    ).all()
    active_out = []
    for i in active:
        d = incident_to_dict(i)
        lat, lng = _incident_position(i)
        d.update(lat=lat, lng=lng)
        active_out.append(d)
    return {"sections": sections, "cameras": cams, "active_incidents": active_out}


def _incident_position(i: Incident) -> tuple[float, float]:
    """Approximate geo-position: the camera position pushed along the line by the distance ahead."""
    cam = i.camera
    poly = i.section.polyline or [[cam.lat, cam.lng]]
    # direction of the section near the camera
    if len(poly) >= 2:
        (la1, lo1), (la2, lo2) = poly[0], poly[-1]
        norm = math.hypot(la2 - la1, lo2 - lo1) or 1.0
        dla, dlo = (la2 - la1) / norm, (lo2 - lo1) / norm
    else:
        dla, dlo = 0.0, 1.0
    deg = (i.distance_m or 0) / 111_000
    side = ((i.id * 7919) % 100 - 50) / 50 * 0.0004  # deterministic lateral spread
    return round(cam.lat + dla * deg - dlo * side, 6), round(cam.lng + dlo * deg + dla * side, 6)


@router.get("/heatmap")
def heatmap(days: int = Query(30, ge=1, le=180), _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    incs = _window(db, days)
    grid: dict[tuple[float, float], dict] = {}
    for i in incs:
        lat, lng = _incident_position(i)
        key = (round(lat, 3), round(lng, 3))
        cell = grid.setdefault(key, {"lat": key[0], "lng": key[1], "count": 0, "weight": 0.0, "critical": 0})
        cell["count"] += 1
        cell["weight"] += i.risk_score / 100
        cell["critical"] += i.risk_level == "CRITICAL"
    sections = db.scalars(select(Section).order_by(Section.id)).all()
    matrix = []
    for s in sections:
        row = [0] * 24
        for i in incs:
            if i.section_id == s.id:
                row[(i.detected_at + IST).hour] += 1
        matrix.append({"section_id": s.id, "name": s.name, "hours": row, "total": sum(row)})
    classes = sorted({i.hazard_class for i in incs})
    class_matrix = [
        {"section_id": s.id, "name": s.name, "counts": {_label(c): sum(1 for i in incs if i.section_id == s.id and i.hazard_class == c) for c in classes}}
        for s in sections
    ]
    density = sorted(
        (
            {
                "section_id": s.id,
                "name": s.name,
                "incidents": sum(1 for i in incs if i.section_id == s.id),
                "per_km": round(sum(1 for i in incs if i.section_id == s.id) / max(s.km_end - s.km_start, 1), 2),
                "lat": s.lat,
                "lng": s.lng,
                "polyline": s.polyline,
            }
            for s in sections
        ),
        key=lambda r: r["per_km"],
        reverse=True,
    )
    return {"days": days, "points": list(grid.values()), "hour_matrix": matrix, "class_labels": [_label(c) for c in classes], "class_matrix": class_matrix, "density": density}


@router.get("/sections/health")
def sections_health(days: int = Query(7, ge=1, le=90), _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return all_sections_health(db, days)


@router.get("/sections/{section_id}/health")
def one_section_health(section_id: str, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.get(Section, section_id)
    if s is None:
        raise HTTPException(404, "Section not found")
    d = section_health(db, s)
    d["trend"] = section_health_trend(db, s)
    d["section"] = section_to_dict(s)
    return d
