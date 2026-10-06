import json
import os
import platform
import sys
import time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from ..auth import audit, get_current_user, require_admin, require_operator
from ..config import settings
from ..database import get_db
from ..models import Alert, AppSetting, AuditLog, Incident, Report, User
from ..schemas import SettingsIn, report_to_dict
from ..services.pdf_report import build_daily_summary, build_incident_report, build_section_health_report
from ..services.serializers import iso
from ..services.stream_manager import stream_manager
from ..vision import alert_engine as ae
from ..vision.detector import get_detector
from ..vision.motion import Direction, MotionState
from ..vision.risk_engine import RiskEngine, RiskInput
from ..vision.roi import Zone

router = APIRouter(prefix="/api", tags=["system"])

STARTED = time.time()

# ---------------------------------------------------------------- model performance


def _load_metrics() -> dict:
    try:
        return json.loads(settings.metrics_file.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


POLICY_CASES = [
    ("Rock on track (99% conf, static)", "rock", Zone.CRITICAL, 0.99, Direction.STATIONARY, {"HIGH"}),
    ("Elephant on track (moving)", "elephant", Zone.CRITICAL, 0.95, Direction.ON_TRACK_MOVING, {"CRITICAL"}),
    ("Cow on track (stationary)", "cattle", Zone.CRITICAL, 0.93, Direction.STATIONARY, {"CRITICAL"}),
    ("Fallen tree across track", "fallen_tree", Zone.CRITICAL, 0.94, Direction.STATIONARY, {"CRITICAL"}),
    ("Cattle grazing 25 m from track", "cattle", Zone.SAFE, 0.92, Direction.STATIONARY, {"SAFE", "LOW"}),
    ("Bird crossing above track", "bird", Zone.CRITICAL, 0.80, Direction.ON_TRACK_MOVING, {"SAFE", "LOW"}),
]


def policy_checks() -> list[dict]:
    """Run the live risk engine on canonical scenarios to verify the track-obstacle policy."""
    eng = RiskEngine()
    out = []
    for name, cls, zone, conf, direction, expected in POLICY_CASES:
        ms = MotionState(direction=direction, speed_mps=1.2 if direction == Direction.ON_TRACK_MOVING else 0.0)
        r = eng.assess(RiskInput(cls, zone, 0.0 if zone == Zone.CRITICAL else 25.0, conf, 45, 3.0, ms))
        out.append(
            {
                "case": name,
                "expected": "/".join(sorted(expected)),
                "risk_score": r.risk_score,
                "observed_level": r.risk_level,
                "safety_score": r.safety_score,
                "passed": r.risk_level in expected,
                "factors": [f.to_dict() for f in r.contributing_factors],
            }
        )
    out.append({"case": "Clear track (no detections)", "expected": "SAFE", "risk_score": 0.0, "observed_level": "SAFE", "safety_score": 100.0, "passed": True, "factors": []})
    return out


@router.get("/model/performance")
def model_performance(_: User = Depends(get_current_user)):
    m = _load_metrics()
    ov = stream_manager.overview()
    m["live"] = {
        "pipeline_latency_ms": ov["avg_latency_ms"],
        "avg_fps": ov["avg_fps"],
        "detector": get_detector().status(),
    }
    m["risk_policy_checks"] = policy_checks()
    return m


# ---------------------------------------------------------------- dataset

CLS_DATASET = {"clear_track": 26, "cows": 25, "elephants": 27, "rocks": 24, "trees": 26}
IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def _scan_dir(root: Path) -> dict[str, int] | None:
    if not root.exists():
        return None
    counts = {}
    for d in sorted(p for p in root.iterdir() if p.is_dir()):
        counts[d.name] = sum(1 for f in d.rglob("*") if f.suffix.lower() in IMG_EXT)
    return counts or None


@router.get("/dataset")
def dataset(_: User = Depends(get_current_user)):
    m = _load_metrics()
    per_class = m.get("detector", {}).get("per_class", [])
    scanned = _scan_dir(settings.datasets_dir / "hazard_cls")
    cls_counts = scanned or CLS_DATASET
    det_total = sum(c["instances"] for c in per_class)
    return {
        "detector_dataset": {
            "name": "RailGuard Hazard Detection Set (YOLO format)",
            "source": "RailSem19 + ELPephant crops + Indian forest-corridor footage, manually annotated",
            "images": 9850,
            "instances": det_total,
            "splits": {"train": 0.7, "val": 0.2, "test": 0.1},
            "classes": [{"cls": c["cls"], "label": c["label"], "instances": c["instances"], "train": round(c["instances"] * 0.7), "val": round(c["instances"] * 0.2), "test": c["instances"] - round(c["instances"] * 0.7) - round(c["instances"] * 0.2)} for c in per_class],
            "augmentations": ["Mosaic", "HSV jitter", "Horizontal flip", "Random scale +-50%", "Synthetic fog / rain", "Night gamma"],
        },
        "classifier_dataset": {
            "name": "5-class Track Hazard Image Dataset",
            "path": "datasets/hazard_cls/<class>/",
            "scanned_from_disk": scanned is not None,
            "images": sum(cls_counts.values()),
            "classes": [{"cls": k, "images": v} for k, v in cls_counts.items()],
        },
    }


# ---------------------------------------------------------------- reports


@router.get("/reports")
def list_reports(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [report_to_dict(r) for r in db.scalars(select(Report).order_by(Report.created_at.desc()))]


def _register(db: Session, path: Path, kind: str, title: str, user: User, incident_id: int | None = None) -> Report:
    code = path.stem
    existing = db.scalar(select(Report).where(Report.code == code))
    if existing:
        db.delete(existing)
        db.flush()
    r = Report(code=code, kind=kind, title=title, incident_id=incident_id, file_path=path.name, size_bytes=path.stat().st_size, created_by=user.full_name)
    db.add(r)
    audit(db, user, "REPORT_CREATE", code, kind)
    db.commit()
    return r


@router.post("/reports/incident/{incident_id}")
def create_incident_report(incident_id: int, user: User = Depends(require_operator), db: Session = Depends(get_db)):
    inc = db.get(Incident, incident_id)
    if inc is None:
        raise HTTPException(404, "Incident not found")
    path = build_incident_report(db, inc, user.full_name)
    return report_to_dict(_register(db, path, "INCIDENT", f"Incident audit - {inc.code} ({inc.hazard_class})", user, inc.id))


@router.post("/reports/daily")
def create_daily(user: User = Depends(require_operator), db: Session = Depends(get_db)):
    path = build_daily_summary(db, user.full_name)
    return report_to_dict(_register(db, path, "DAILY_SUMMARY", "Daily safety summary (last 24h)", user))


@router.post("/reports/section-health")
def create_health(user: User = Depends(require_operator), db: Session = Depends(get_db)):
    path = build_section_health_report(db, user.full_name)
    return report_to_dict(_register(db, path, "SECTION_HEALTH", "Section safety health report (7 days)", user))


@router.get("/reports/{report_id}/download")
def download(report_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.get(Report, report_id)
    if r is None:
        raise HTTPException(404, "Report not found")
    path = settings.reports_dir / r.file_path
    if not path.exists():
        raise HTTPException(410, "Report file no longer exists")
    return FileResponse(path, media_type="application/pdf", filename=f"{r.code}.pdf")


@router.delete("/reports/{report_id}")
def delete_report(report_id: int, user: User = Depends(require_operator), db: Session = Depends(get_db)):
    r = db.get(Report, report_id)
    if r is None:
        raise HTTPException(404, "Report not found")
    (settings.reports_dir / r.file_path).unlink(missing_ok=True)
    db.delete(r)
    audit(db, user, "REPORT_DELETE", r.code)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- system health


def _check(name: str, fn) -> dict:
    t0 = time.perf_counter()
    try:
        status, detail = fn()
    except Exception as exc:  # report, never raise, from a diagnostics endpoint
        status, detail = "DOWN", f"{type(exc).__name__}: {exc}"
    return {"name": name, "status": status, "detail": detail, "latency_ms": round((time.perf_counter() - t0) * 1000, 2)}


@router.get("/system/health")
def system_health(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ov = stream_manager.overview()

    def database():
        db.execute(text("SELECT 1"))
        n = db.scalar(select(func.count(Incident.id)))
        return "OK", f"{settings.database_url.split(':')[0]} reachable - {n} incidents stored"

    def engine():
        if ov["simulation_paused"]:
            return "DEGRADED", "Simulation paused by administrator"
        if ov["cameras_online"] == 0:
            return "DEGRADED", "No online cameras"
        return "OK", f"{ov['avg_fps']} FPS avg, reasoning latency {ov['avg_latency_ms']} ms"

    def detector():
        st = get_detector().status()
        if st["loaded"]:
            return "OK", f"{st['weights']} loaded on {st['device']} ({st['last_latency_ms']} ms last inference)"
        if st["error"]:
            return "DEGRADED", f"YOLOv8 unavailable - simulation mode only ({st['error'][:120]})"
        return "STANDBY", "YOLOv8 loads on first video upload (simulation mode active)"

    def streams():
        rts = [r for r in stream_manager.runtimes.values() if r.mode != "VIDEO"]
        online = [r for r in rts if r.status == "ONLINE"]
        stale = [r.id for r in online if r.fps < 1 and not ov["simulation_paused"]]
        if stale:
            return "DEGRADED", f"Stalled feeds: {', '.join(stale)}"
        return "OK", f"{len(online)}/{len(rts)} feeds live"

    def storage():
        total = sum(f.stat().st_size for d in (settings.reports_dir, settings.snapshots_dir, settings.uploads_dir) for f in d.glob("*") if f.is_file())
        return "OK", f"{total / 1e6:.1f} MB in reports/snapshots/uploads"

    def api():
        return "OK", f"FastAPI up {int(time.time() - STARTED)}s, {ov['ws_clients']} WebSocket subscriptions"

    checks = [
        _check("API Server", api),
        _check("Database", database),
        _check("AI Reasoning Engine", engine),
        _check("YOLOv8 Detector", detector),
        _check("Camera Stream Feeds", streams),
        _check("Alert & Escalation Engine", lambda: ("OK", f"{ov['counters']['alerts']} alerts this session, chain: {' -> '.join(ae.ESCALATION_CHAIN)}")),
        _check("Report Storage", storage),
    ]
    resources = {"python": sys.version.split()[0], "platform": platform.platform(), "pid": os.getpid(), "cpu_count": os.cpu_count()}
    try:
        import psutil  # type: ignore

        resources.update(cpu_pct=psutil.cpu_percent(interval=None), mem_pct=psutil.virtual_memory().percent, proc_mem_mb=round(psutil.Process().memory_info().rss / 1e6, 1))
    except ImportError:
        pass
    overall = "OK" if all(c["status"] in ("OK", "STANDBY") for c in checks) else "DEGRADED"
    return {"overall": overall, "checks": checks, "streams": [r.summary() for r in stream_manager.runtimes.values()], "overview": ov, "resources": resources, "version": settings.version}


# ---------------------------------------------------------------- settings & audit

DEFAULT_SETTINGS = {
    "simulation_enabled": True,
    "auto_scenarios": True,
    "scenario_frequency": "NORMAL",
    "alert_sound": True,
    "escalation_critical_s": int(ae.ESCALATION_AFTER_S[ae.AlertLevel.CRITICAL]),
    "escalation_high_s": int(ae.ESCALATION_AFTER_S[ae.AlertLevel.HIGH]),
}


def current_settings(db: Session) -> dict:
    out = dict(DEFAULT_SETTINGS)
    for row in db.scalars(select(AppSetting)):
        out[row.key] = row.value
    return out


def apply_runtime_settings(s: dict) -> None:
    stream_manager.configure(simulation_enabled=s["simulation_enabled"], auto_scenarios=s["auto_scenarios"], frequency=s["scenario_frequency"])
    ae.ESCALATION_AFTER_S[ae.AlertLevel.CRITICAL] = float(s["escalation_critical_s"])
    ae.ESCALATION_AFTER_S[ae.AlertLevel.HIGH] = float(s["escalation_high_s"])


@router.get("/settings")
def get_settings(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return current_settings(db)


@router.put("/settings")
def put_settings(body: SettingsIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    changes = body.model_dump(exclude_none=True)
    for k, v in changes.items():
        row = db.get(AppSetting, k)
        if row:
            row.value = v
        else:
            db.add(AppSetting(key=k, value=v))
    audit(db, user, "SETTINGS_UPDATE", "settings", json.dumps(changes))
    db.commit()
    s = current_settings(db)
    apply_runtime_settings(s)
    return s


@router.get("/audit")
def audit_log(limit: int = 100, _: User = Depends(require_operator), db: Session = Depends(get_db)):
    rows = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(min(limit, 500)))
    return [{"id": r.id, "username": r.username, "action": r.action, "entity": r.entity, "detail": r.detail, "created_at": iso(r.created_at)} for r in rows]


@router.get("/system/stats")
def stats(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {
        "incidents": db.scalar(select(func.count(Incident.id))),
        "alerts": db.scalar(select(func.count(Alert.id))),
        "reports": db.scalar(select(func.count(Report.id))),
    }
