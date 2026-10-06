from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..auth import audit, get_current_user, require_operator
from ..config import settings
from ..database import get_db
from ..models import Alert, Incident, User, utcnow
from ..schemas import IncidentUpdateIn, SignOffIn, incident_to_dict
from ..services.stream_manager import alert_to_dict, stream_manager

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

SORTABLE = {
    "detected_at": Incident.detected_at,
    "risk_score": Incident.risk_score,
    "hazard_class": Incident.hazard_class,
    "camera_id": Incident.camera_id,
    "status": Incident.status,
}


def _parse_date(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", ""))
    except ValueError:
        raise HTTPException(400, f"Invalid date '{s}'")


@router.get("")
def list_incidents(
    q: str | None = None,
    level: str | None = None,
    status: str | None = None,
    hazard_class: str | None = None,
    camera_id: str | None = None,
    section_id: str | None = None,
    predicted: bool | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    sort: str = "detected_at",
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Incident)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Incident.code.ilike(like), Incident.hazard_class.ilike(like), Incident.summary_reason.ilike(like), Incident.camera_id.ilike(like)))
    for col, val in ((Incident.risk_level, level), (Incident.status, status), (Incident.hazard_class, hazard_class), (Incident.camera_id, camera_id), (Incident.section_id, section_id)):
        if val:
            stmt = stmt.where(col.in_(val.split(",")))
    if predicted is not None:
        stmt = stmt.where(Incident.predicted_threat == predicted)
    if (d := _parse_date(date_from)) is not None:
        stmt = stmt.where(Incident.detected_at >= d)
    if (d := _parse_date(date_to)) is not None:
        stmt = stmt.where(Incident.detected_at <= d)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    col = SORTABLE.get(sort, Incident.detected_at)
    stmt = stmt.order_by(col.desc() if order == "desc" else col.asc(), Incident.id.desc())
    rows = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    return {"total": total, "page": page, "page_size": page_size, "items": [incident_to_dict(i) for i in rows]}


def _get(db: Session, incident_id: int) -> Incident:
    inc = db.get(Incident, incident_id)
    if inc is None:
        raise HTTPException(404, "Incident not found")
    return inc


@router.get("/{incident_id}")
def get_incident(incident_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    inc = _get(db, incident_id)
    d = incident_to_dict(inc, full=True)
    alerts = db.scalars(select(Alert).where(Alert.incident_id == inc.id).order_by(Alert.created_at)).all()
    d["alerts"] = [alert_to_dict(a, inc) for a in alerts]
    return d


def _mark_acknowledged(inc: Incident, user: User, db: Session) -> None:
    now = utcnow()
    if inc.acknowledged_at is None:
        inc.acknowledged_at = now
        inc.response_time_s = round((now - inc.detected_at).total_seconds(), 1)
    for a in db.scalars(select(Alert).where(Alert.incident_id == inc.id, Alert.acknowledged.is_(False))):
        a.acknowledged = True
        a.acknowledged_by = user.username
        a.acknowledged_at = now
    stream_manager.acknowledge_incident(inc.id)


@router.patch("/{incident_id}")
def update_incident(incident_id: int, body: IncidentUpdateIn, user: User = Depends(require_operator), db: Session = Depends(get_db)):
    inc = _get(db, incident_id)
    if body.status:
        inc.status = body.status
        if body.status in ("ACKNOWLEDGED", "RESOLVED", "FALSE_ALARM"):
            _mark_acknowledged(inc, user, db)
        if body.status in ("RESOLVED", "FALSE_ALARM"):
            inc.resolved_at = utcnow()
        elif body.status == "OPEN":
            inc.resolved_at = None
    if body.operator_notes is not None:
        inc.operator_notes = body.operator_notes
    audit(db, user, "INCIDENT_UPDATE", inc.code, body.model_dump_json(exclude_unset=True))
    db.commit()
    return incident_to_dict(inc, full=True)


@router.post("/{incident_id}/signoff")
def sign_off(incident_id: int, body: SignOffIn, user: User = Depends(require_operator), db: Session = Depends(get_db)):
    inc = _get(db, incident_id)
    _mark_acknowledged(inc, user, db)
    now = utcnow()
    if body.notes:
        stamp = now.strftime("%Y-%m-%d %H:%M UTC")
        inc.operator_notes = (inc.operator_notes + "\n" if inc.operator_notes else "") + f"[{stamp}] {user.full_name}: {body.notes}"
    inc.status = body.resolution
    inc.signed_off_by = user.full_name
    inc.signed_off_at = now
    inc.resolved_at = now
    audit(db, user, "INCIDENT_SIGNOFF", inc.code, body.resolution)
    db.commit()
    return incident_to_dict(inc, full=True)


@router.get("/{incident_id}/snapshot")
def snapshot(incident_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    inc = _get(db, incident_id)
    if not inc.snapshot_path:
        raise HTTPException(404, "No image snapshot for this incident")
    path = settings.snapshots_dir / inc.snapshot_path
    if not path.exists():
        raise HTTPException(404, "Snapshot file missing")
    return FileResponse(path, media_type="image/jpeg")
