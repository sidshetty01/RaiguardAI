"""Railway Section Safety Health Score (0-100).

Explainable, penalty-based index computed over a rolling window (default 7 days):

    Health = 100 - hazard density - critical incidents - forest proximity
                 - response time - unresolved hazards - terrain risk

Each penalty is capped and reported with its reasoning, mirroring the XAI risk engine.
"""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Incident, Section, utcnow

GRADES = [(85, "A", "EXCELLENT"), (70, "B", "GOOD"), (55, "C", "FAIR"), (40, "D", "POOR"), (0, "E", "CRITICAL")]


def grade(score: float) -> tuple[str, str]:
    for lo, g, label in GRADES:
        if score >= lo:
            return g, label
    return "E", "CRITICAL"


def section_health(db: Session, sec: Section, days: int = 7) -> dict:
    since = utcnow() - timedelta(days=days)
    q = select(Incident).where(Incident.section_id == sec.id, Incident.detected_at >= since)
    incidents = db.scalars(q).all()
    length_km = max(sec.km_end - sec.km_start, 1.0)

    total = len(incidents)
    critical = sum(1 for i in incidents if i.risk_level == "CRITICAL")
    high = sum(1 for i in incidents if i.risk_level == "HIGH")
    unresolved = sum(1 for i in incidents if i.status in ("OPEN", "ACKNOWLEDGED") and i.risk_level in ("HIGH", "CRITICAL"))
    responses = [i.response_time_s for i in incidents if i.response_time_s is not None]
    avg_resp = sum(responses) / len(responses) if responses else None

    density = total / length_km / days  # incidents per km per day
    factors = []

    def add(name: str, pts: float, cap: float, desc: str) -> None:
        factors.append({"factor": name, "penalty": round(min(pts, cap), 1), "max_penalty": cap, "description": desc})

    add("Hazard Density", density * 40, 25, f"{total} incidents over {length_km:.0f} km in {days} days ({density:.2f}/km/day)")
    add("Critical Incidents", critical * 2.5 + high * 0.8, 20, f"{critical} critical and {high} high-risk incidents")
    add("Forest Proximity", sec.forest_proximity * 15, 15, f"Forest cover index {sec.forest_proximity:.2f}" + (" - elephant corridor" if sec.elephant_corridor else ""))
    if avg_resp is None:
        add("Response Time", 0, 15, "No acknowledged incidents in window")
    else:
        add("Response Time", max(0.0, (avg_resp - 45) / 20), 15, f"Mean operator response {avg_resp:.0f}s (target <= 45s)")
    add("Unresolved Hazards", unresolved * 4, 15, f"{unresolved} high/critical incidents still open")
    terrain_pen = (5 if sec.landslide_prone else 0) + (3 if sec.elephant_corridor else 0)
    add("Terrain Risk", terrain_pen, 8, ", ".join(t for t, f in (("Landslide-prone ghat", sec.landslide_prone), ("Elephant corridor", sec.elephant_corridor)) if f) or "No terrain hazards")

    score = max(0.0, 100 - sum(f["penalty"] for f in factors))
    g, label = grade(score)
    by_class: dict[str, int] = {}
    for i in incidents:
        by_class[i.hazard_class] = by_class.get(i.hazard_class, 0) + 1
    return {
        "section_id": sec.id,
        "name": sec.name,
        "terrain": sec.terrain,
        "km_start": sec.km_start,
        "km_end": sec.km_end,
        "score": round(score, 1),
        "grade": g,
        "rating": label,
        "window_days": days,
        "incidents": total,
        "critical": critical,
        "high": high,
        "unresolved": unresolved,
        "avg_response_s": None if avg_resp is None else round(avg_resp, 1),
        "top_hazards": sorted(by_class.items(), key=lambda kv: kv[1], reverse=True)[:3],
        "factors": factors,
    }


def all_sections_health(db: Session, days: int = 7) -> list[dict]:
    secs = db.scalars(select(Section).order_by(Section.id)).all()
    return [section_health(db, s, days) for s in secs]


def section_health_trend(db: Session, sec: Section, weeks: int = 6) -> list[dict]:
    """Weekly incident counts used to show whether a section is improving."""
    now = utcnow()
    out = []
    for w in range(weeks - 1, -1, -1):
        start, end = now - timedelta(days=7 * (w + 1)), now - timedelta(days=7 * w)
        n = db.scalar(
            select(func.count(Incident.id)).where(Incident.section_id == sec.id, Incident.detected_at >= start, Incident.detected_at < end)
        )
        out.append({"week": f"W-{w}" if w else "This week", "incidents": n or 0})
    return out
