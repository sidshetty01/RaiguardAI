from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import audit, get_current_user, require_operator
from ..database import get_db
from ..models import Camera, Incident, User, utcnow
from ..schemas import CameraUpdateIn, camera_to_dict
from ..services.stream_manager import stream_manager

router = APIRouter(prefix="/api/cameras", tags=["cameras"])


def _runtime(cid: str) -> dict | None:
    rt = stream_manager.runtimes.get(cid)
    return rt.summary() if rt else None


@router.get("")
def list_cameras(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Incident.camera_id, func.count(Incident.id)).group_by(Incident.camera_id)).all())
    now = utcnow()
    out = []
    for c in db.scalars(select(Camera).order_by(Camera.id)):
        d = camera_to_dict(c, _runtime(c.id))
        d["incident_count"] = counts.get(c.id, 0)
        if c.status == "ONLINE":
            d["last_heartbeat"] = now.isoformat(timespec="seconds") + "Z"
        out.append(d)
    return out


@router.get("/{camera_id}")
def get_camera(camera_id: str, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.get(Camera, camera_id)
    if c is None:
        raise HTTPException(404, "Camera not found")
    return camera_to_dict(c, _runtime(c.id))


@router.patch("/{camera_id}")
def update_camera(camera_id: str, body: CameraUpdateIn, user: User = Depends(require_operator), db: Session = Depends(get_db)):
    c = db.get(Camera, camera_id)
    if c is None:
        raise HTTPException(404, "Camera not found")
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(c, k, v or None if k == "stream_url" else v)
    audit(db, user, "CAMERA_UPDATE", camera_id, str(changes))
    db.commit()
    if "status" in changes:
        stream_manager.set_camera_status(camera_id, c.status)
    return camera_to_dict(c, _runtime(c.id))
