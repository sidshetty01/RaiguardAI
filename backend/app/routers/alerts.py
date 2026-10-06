from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import audit, get_current_user, require_operator
from ..database import get_db
from ..models import Alert, Incident, User, utcnow
from ..services.stream_manager import alert_to_dict, stream_manager

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("")
def list_alerts(
    level: str | None = None,
    acknowledged: bool | None = None,
    kind: str | None = None,
    camera_id: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Alert, Incident).outerjoin(Incident, Alert.incident_id == Incident.id)
    if level:
        stmt = stmt.where(Alert.level.in_(level.split(",")))
    if acknowledged is not None:
        stmt = stmt.where(Alert.acknowledged == acknowledged)
    if kind:
        stmt = stmt.where(Alert.kind.in_(kind.split(",")))
    if camera_id:
        stmt = stmt.where(Alert.camera_id == camera_id)
    rows = db.execute(stmt.order_by(Alert.created_at.desc(), Alert.id.desc()).limit(limit)).all()
    return [alert_to_dict(a, i) for a, i in rows]


@router.get("/stats")
def alert_stats(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    unack = dict(db.execute(select(Alert.level, func.count(Alert.id)).where(Alert.acknowledged.is_(False)).group_by(Alert.level)).all())
    return {"unacknowledged": sum(unack.values()), "by_level": unack}


def _ack(a: Alert, user: User, db: Session) -> None:
    now = utcnow()
    a.acknowledged = True
    a.acknowledged_by = user.username
    a.acknowledged_at = now
    if a.incident_id:
        inc = db.get(Incident, a.incident_id)
        if inc:
            if inc.acknowledged_at is None:
                inc.acknowledged_at = now
                inc.response_time_s = round((now - inc.detected_at).total_seconds(), 1)
            if inc.status == "OPEN":
                inc.status = "ACKNOWLEDGED"
            stream_manager.acknowledge_incident(inc.id)


@router.post("/{alert_id}/ack")
def acknowledge(alert_id: int, user: User = Depends(require_operator), db: Session = Depends(get_db)):
    a = db.get(Alert, alert_id)
    if a is None:
        raise HTTPException(404, "Alert not found")
    _ack(a, user, db)
    audit(db, user, "ALERT_ACK", f"alert:{a.id}")
    db.commit()
    return alert_to_dict(a, db.get(Incident, a.incident_id) if a.incident_id else None)


@router.post("/ack-all")
def acknowledge_all(user: User = Depends(require_operator), db: Session = Depends(get_db)):
    alerts = db.scalars(select(Alert).where(Alert.acknowledged.is_(False))).all()
    for a in alerts:
        _ack(a, user, db)
    audit(db, user, "ALERT_ACK_ALL", "alerts", f"{len(alerts)} alerts")
    db.commit()
    return {"acknowledged": len(alerts)}
