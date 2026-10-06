"""Runs the RailGuard pipeline continuously for every camera and persists its outcomes.

* Simulated cameras are stepped together by one background thread at ``simulation_fps``.
* Uploaded videos and cameras with a ``stream_url`` each get a worker thread running YOLOv8.
* Every analysed frame is pushed to WebSocket subscribers via :mod:`hub`.
* The incident recorder opens an incident the first time a tracked object reaches MEDIUM
  risk (or is predicted to enter the track), keeps its peak-risk evidence, and the alert
  engine raises / upgrades / escalates alerts that are persisted and broadcast.
"""
from __future__ import annotations

import base64
import logging
import math
import threading
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from sqlalchemy import select

from ..config import settings
from ..database import SessionLocal
from ..models import Alert, AppSetting, Camera, Incident, utcnow
from ..vision.alert_engine import AlertEngine, DecisionKind
from ..vision.detector import get_detector
from ..vision.geometry import CameraModel
from ..vision.hazard_classes import HAZARD_CLASSES
from ..vision.pipeline import FrameAnalysis, VisionPipeline
from ..vision.simulator import SCENARIO_KEYS, SceneSimulator
from .hub import hub
from .serializers import iso

log = logging.getLogger("railguard.streams")

INCIDENT_THRESHOLD = 41.0
FREQUENCY_IDLE = {"LOW": (180.0, 420.0), "NORMAL": (60.0, 150.0), "HIGH": (8.0, 20.0)}


@dataclass
class _TrackRecord:
    incident_id: int
    peak: float
    last_update: float
    alert_ids: list[int] = field(default_factory=list)


@dataclass
class CameraRuntime:
    id: str
    name: str
    section_id: str | None
    mode: str  # SIMULATION | VIDEO | CAMERA
    camera: CameraModel
    pipeline: VisionPipeline
    simulator: SceneSimulator | None = None
    status: str = "ONLINE"
    source_name: str | None = None
    running: bool = True
    finished: bool = False
    error: str | None = None
    frames: int = 0
    started_at: float = field(default_factory=time.time)
    fps_window: deque = field(default_factory=lambda: deque(maxlen=30))
    latency_window: deque = field(default_factory=lambda: deque(maxlen=60))
    latest: dict | None = None
    tracks: dict[int, _TrackRecord] = field(default_factory=dict)
    progress: float | None = None
    thread: threading.Thread | None = None

    @property
    def fps(self) -> float:
        w = self.fps_window
        if len(w) < 2:
            return 0.0
        return (len(w) - 1) / max(w[-1] - w[0], 1e-6)

    @property
    def avg_latency_ms(self) -> float:
        return sum(self.latency_window) / len(self.latency_window) if self.latency_window else 0.0

    def summary(self) -> dict:
        latest = self.latest or {}
        return {
            "id": self.id,
            "name": self.name,
            "section_id": self.section_id,
            "mode": self.mode,
            "status": self.status,
            "source_name": self.source_name,
            "running": self.running,
            "finished": self.finished,
            "error": self.error,
            "frames": self.frames,
            "fps": round(self.fps, 1),
            "latency_ms": round(self.avg_latency_ms, 2),
            "progress": self.progress,
            "safety_score": latest.get("safety_score", 100.0),
            "max_risk": latest.get("max_risk", 0.0),
            "level": latest.get("level", "SAFE"),
            "object_count": len(latest.get("objects", [])),
            "simulation": self.simulator.status() if self.simulator else None,
        }


def _setting(db, key: str, default):
    row = db.get(AppSetting, key)
    return default if row is None else row.value


class StreamManager:
    def __init__(self) -> None:
        self.runtimes: dict[str, CameraRuntime] = {}
        self.alert_engine = AlertEngine()
        self._lock = threading.RLock()
        self._stop = threading.Event()
        self._sim_thread: threading.Thread | None = None
        self.started_at = time.time()
        self.simulation_paused = False
        self.auto_scenarios = True
        self.frequency = "NORMAL"
        self.counters = {"frames": 0, "incidents": 0, "alerts": 0}

    # ------------------------------------------------------------------ lifecycle
    def start(self) -> None:
        self._stop.clear()
        with SessionLocal() as db:
            self.simulation_paused = not bool(_setting(db, "simulation_enabled", settings.simulation_enabled))
            self.auto_scenarios = bool(_setting(db, "auto_scenarios", True))
            self.frequency = str(_setting(db, "scenario_frequency", "NORMAL"))
            cams = db.scalars(select(Camera).order_by(Camera.id)).all()
            for i, cam in enumerate(cams):
                self._add_camera_runtime(cam, seed=1000 + i)
        self._sim_thread = threading.Thread(target=self._sim_loop, name="railguard-sim", daemon=True)
        self._sim_thread.start()
        log.info("Stream manager started with %d cameras", len(self.runtimes))

    def stop(self) -> None:
        self._stop.set()
        for rt in list(self.runtimes.values()):
            rt.running = False

    def _camera_model(self, cam: Camera) -> CameraModel:
        w, h = (int(v) for v in (cam.resolution or "1280x720").lower().split("x"))
        return CameraModel(width=w, height=h, focal_px=cam.focal_length_px, horizon_y=h * 0.4167, mount_height_m=cam.mount_height_m)

    def _add_camera_runtime(self, cam: Camera, seed: int) -> None:
        model = self._camera_model(cam)
        if cam.stream_url:
            rt = CameraRuntime(cam.id, cam.name, cam.section_id, "CAMERA", model, VisionPipeline(model), status=cam.status, source_name=cam.stream_url)
            self.runtimes[cam.id] = rt
            if cam.status == "ONLINE":
                self._start_video_worker(rt, cam.stream_url, loop=True)
            return
        sim = SceneSimulator(model, cam.scenario_profile, seed=seed, idle_range=FREQUENCY_IDLE.get(self.frequency, FREQUENCY_IDLE["NORMAL"]))
        self.runtimes[cam.id] = CameraRuntime(cam.id, cam.name, cam.section_id, "SIMULATION", model, VisionPipeline(model), simulator=sim, status=cam.status)

    def set_camera_status(self, camera_id: str, status: str) -> None:
        rt = self.runtimes.get(camera_id)
        if rt:
            rt.status = status
            if status != "ONLINE":
                self._reset_runtime(rt)

    def _reset_runtime(self, rt: CameraRuntime) -> None:
        for tid in list(rt.tracks):
            self._finalize_track(rt, tid)
        rt.pipeline.reset()
        if rt.simulator:
            rt.simulator.stop()
        rt.latest = None

    # ------------------------------------------------------------------ settings
    def configure(self, *, simulation_enabled: bool | None = None, auto_scenarios: bool | None = None, frequency: str | None = None) -> None:
        if simulation_enabled is not None:
            self.simulation_paused = not simulation_enabled
        if auto_scenarios is not None:
            self.auto_scenarios = auto_scenarios
        if frequency and frequency in FREQUENCY_IDLE:
            self.frequency = frequency
            for rt in self.runtimes.values():
                if rt.simulator:
                    rt.simulator.idle_range = FREQUENCY_IDLE[frequency]
                    rt.simulator.idle_left = min(rt.simulator.idle_left, FREQUENCY_IDLE[frequency][1])

    def trigger_scenario(self, camera_id: str, key: str) -> dict:
        rt = self.runtimes.get(camera_id)
        if rt is None or rt.simulator is None:
            raise KeyError(camera_id)
        if key not in SCENARIO_KEYS:
            raise ValueError(key)
        with self._lock:
            self._reset_runtime(rt)
            sc = rt.simulator.trigger(key)
        return {"camera_id": camera_id, "scenario": sc.key, "title": sc.title}

    def clear_scene(self, camera_id: str) -> None:
        rt = self.runtimes.get(camera_id)
        if rt is None:
            raise KeyError(camera_id)
        with self._lock:
            self._reset_runtime(rt)

    # ------------------------------------------------------------------ simulation loop
    def _sim_loop(self) -> None:
        period = 1.0 / settings.simulation_fps
        last = time.time()
        last_telemetry = 0.0
        while not self._stop.is_set():
            now = time.time()
            dt = min(now - last, 0.5)
            last = now
            if not self.simulation_paused:
                for rt in list(self.runtimes.values()):
                    if rt.mode != "SIMULATION" or rt.status != "ONLINE" or rt.simulator is None:
                        continue
                    try:
                        with self._lock:
                            if not self.auto_scenarios and rt.simulator.scenario is None:
                                rt.simulator.idle_left = max(rt.simulator.idle_left, 1.0)
                            dets = rt.simulator.step(dt)
                            fa = rt.pipeline.process(dets, now)
                            self._handle(rt, fa, env=rt.simulator.environment())
                    except Exception:  # keep the loop alive no matter what one camera does
                        log.exception("simulation step failed for %s", rt.id)
            if now - last_telemetry >= 1.0:
                last_telemetry = now
                hub.publish("telemetry", {"type": "telemetry", "ts": now, "cameras": [rt.summary() for rt in self.runtimes.values()]})
            self._stop.wait(max(0.0, period - (time.time() - now)))

    # ------------------------------------------------------------------ video / camera workers
    def start_video(self, path: Path, display_name: str, loop: bool = False) -> CameraRuntime:
        det = get_detector()
        if not det.load():
            raise RuntimeError(f"YOLOv8 detector unavailable: {det.error}")
        import cv2  # local import keeps API start-up light

        cap = cv2.VideoCapture(str(path))
        ok, frame = cap.read()
        cap.release()
        if not ok:
            raise ValueError("Could not read video file")
        h, w = frame.shape[:2]
        model = CameraModel(width=w, height=h, focal_px=w * 0.78, horizon_y=h * 0.42, mount_height_m=5.0)
        rid = f"VID-{uuid.uuid4().hex[:6].upper()}"
        rt = CameraRuntime(rid, f"Upload: {display_name}", None, "VIDEO", model, VisionPipeline(model), source_name=display_name)
        self.runtimes[rid] = rt
        self._start_video_worker(rt, str(path), loop=loop)
        return rt

    def stop_video(self, runtime_id: str) -> None:
        rt = self.runtimes.get(runtime_id)
        if rt is None or rt.mode == "SIMULATION":
            raise KeyError(runtime_id)
        rt.running = False
        if rt.mode == "VIDEO":
            self.runtimes.pop(runtime_id, None)

    def _start_video_worker(self, rt: CameraRuntime, source: str, loop: bool) -> None:
        rt.thread = threading.Thread(target=self._video_worker, args=(rt, source, loop), name=f"railguard-{rt.id}", daemon=True)
        rt.thread.start()

    def _video_worker(self, rt: CameraRuntime, source: str, loop: bool) -> None:
        import cv2

        det = get_detector()
        if not det.load():
            rt.error = f"YOLOv8 detector unavailable: {det.error}"
            rt.running = False
            return
        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            rt.error = f"Cannot open source {source}"
            rt.running = False
            return
        src_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        stride = max(1, math.ceil(src_fps / settings.video_max_fps))
        idx = 0
        t_start = time.time()
        base_ts = time.time()
        try:
            while rt.running and not self._stop.is_set():
                ok, frame = cap.read()
                if not ok:
                    if loop and rt.mode == "CAMERA":
                        cap.release()
                        time.sleep(2)
                        cap = cv2.VideoCapture(source)
                        continue
                    if loop:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        rt.pipeline.reset()
                        idx = 0
                        t_start = time.time()
                        base_ts = time.time()
                        continue
                    break
                idx += 1
                if idx % stride:
                    continue
                if rt.status != "ONLINE":
                    time.sleep(0.2)
                    continue
                video_ts = base_ts + idx / src_fps  # motion uses media time, not wall time
                t0 = time.perf_counter()
                dets = det.detect(frame)
                fa = rt.pipeline.process(dets, video_ts)
                fa.latency_ms = (time.perf_counter() - t0) * 1000  # detection + reasoning
                if total:
                    rt.progress = round(idx / total, 3)
                small = frame
                if frame.shape[1] > 960:
                    scale = 960 / frame.shape[1]
                    small = cv2.resize(frame, (960, int(frame.shape[0] * scale)))
                ok_enc, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 70])
                image_b64 = base64.b64encode(buf.tobytes()).decode() if ok_enc else None
                with self._lock:
                    self._handle(rt, fa, env={"time_of_day": "LIVE", "weather": "N/A"}, image_b64=image_b64, frame=frame)
                # pace to real time for files
                if rt.mode == "VIDEO":
                    target = t_start + idx / src_fps
                    delay = target - time.time()
                    if delay > 0:
                        time.sleep(delay)
        except Exception as exc:
            log.exception("video worker %s crashed", rt.id)
            rt.error = str(exc)
        finally:
            cap.release()
            for tid in list(rt.tracks):
                self._finalize_track(rt, tid)
            rt.finished = True
            rt.running = False
            hub.publish(f"camera:{rt.id}", {"type": "end", "camera_id": rt.id, "error": rt.error})

    # ------------------------------------------------------------------ frame handling
    def _frame_payload(self, rt: CameraRuntime, fa: FrameAnalysis, env: dict, image_b64: str | None) -> dict:
        return {
            "type": "frame",
            "camera_id": rt.id,
            "camera_name": rt.name,
            "mode": rt.mode,
            "ts": fa.ts,
            "frame_no": fa.frame_no,
            "camera": rt.camera.to_dict(),
            "roi": rt.pipeline.roi.to_dict(),
            "objects": [o.to_dict() for o in fa.objects],
            "max_risk": fa.max_risk,
            "safety_score": fa.safety_score,
            "level": fa.level,
            "latency_ms": round(fa.latency_ms, 2),
            "fps": round(rt.fps, 1),
            "env": env,
            "scenario": rt.simulator.status()["active_scenario"] if rt.simulator else None,
            "progress": rt.progress,
            "image": image_b64,
        }

    def _handle(self, rt: CameraRuntime, fa: FrameAnalysis, env: dict, image_b64: str | None = None, frame=None) -> None:
        rt.frames += 1
        self.counters["frames"] += 1
        rt.fps_window.append(time.time())
        rt.latency_window.append(fa.latency_ms)
        payload = self._frame_payload(rt, fa, env, image_b64)
        rt.latest = {k: v for k, v in payload.items() if k != "image"}

        now = time.time()
        for obj in fa.objects:
            rec = rt.tracks.get(obj.track_id)
            predicted = bool(obj.motion.get("predicted_threat"))
            if rec is None and (obj.risk_score >= INCIDENT_THRESHOLD or predicted):
                rec = self._open_incident(rt, obj, payload, frame)
                rt.tracks[obj.track_id] = rec
            elif rec is not None and (obj.risk_score > rec.peak + 0.5 and now - rec.last_update >= 1.0):
                self._update_incident(rt, rec, obj, payload, frame)
            if rec is not None:
                for d in self.alert_engine.evaluate(rt.id, obj.track_id, obj.risk_score, predicted, now):
                    self._persist_alert(rt, rec, obj, d)

        for tid in fa.lost_track_ids:
            self._finalize_track(rt, tid)

        hub.publish(f"camera:{rt.id}", payload)

    def _snapshot(self, payload: dict, focus_track: int) -> dict:
        return {
            "camera": payload["camera"],
            "roi": payload["roi"],
            "objects": payload["objects"],
            "env": payload["env"],
            "frame_no": payload["frame_no"],
            "focus_track_id": focus_track,
            "captured_at": datetime.now().isoformat(timespec="seconds"),
        }

    def _save_frame(self, frame, incident_id: int) -> str | None:
        if frame is None:
            return None
        import cv2

        path = settings.snapshots_dir / f"incident_{incident_id}.jpg"
        cv2.imwrite(str(path), frame)
        return path.name

    def _open_incident(self, rt: CameraRuntime, obj, payload: dict, frame) -> _TrackRecord:
        with SessionLocal() as db:
            inc = Incident(
                code=f"TMP-{uuid.uuid4().hex}",
                camera_id=rt.id if rt.mode != "VIDEO" else self._fallback_camera(db),
                section_id=rt.section_id or self._fallback_section(db),
                track_id=obj.track_id,
                source=rt.mode,
                status="OPEN",
            )
            self._apply_obj(inc, obj)
            inc.snapshot = self._snapshot(payload, obj.track_id)
            if rt.mode == "VIDEO":
                inc.operator_notes = f"Detected in uploaded video '{rt.source_name}'."
            db.add(inc)
            db.flush()
            inc.code = f"INC-{datetime.now().year}-{inc.id:06d}"
            inc.snapshot_path = self._save_frame(frame, inc.id)
            db.commit()
            self.counters["incidents"] += 1
            hub.publish("events", {"type": "incident_opened", "incident": _incident_brief(inc)})
            return _TrackRecord(inc.id, obj.risk_score, time.time())

    def _update_incident(self, rt: CameraRuntime, rec: _TrackRecord, obj, payload: dict, frame) -> None:
        with SessionLocal() as db:
            inc = db.get(Incident, rec.incident_id)
            if inc is None:
                return
            self._apply_obj(inc, obj)
            inc.snapshot = self._snapshot(payload, obj.track_id)
            if frame is not None:
                inc.snapshot_path = self._save_frame(frame, inc.id)
            db.commit()
        rec.peak = obj.risk_score
        rec.last_update = time.time()

    @staticmethod
    def _apply_obj(inc: Incident, obj) -> None:
        inc.hazard_class = obj.cls
        inc.risk_score = obj.risk["risk_score"]
        inc.risk_level = obj.risk["risk_level"]
        inc.summary_reason = obj.risk["summary_reason"]
        inc.factors = obj.risk["contributing_factors"]
        inc.zone = obj.zone
        inc.distance_m = round(obj.distance_m, 1)
        inc.edge_distance_m = round(obj.edge_distance_m, 1)
        inc.confidence = round(obj.confidence, 3)
        inc.motion_direction = obj.motion["direction"]
        inc.speed_mps = obj.motion["speed_mps"]
        inc.predicted_entry_s = obj.motion["eta_s"]
        inc.predicted_threat = inc.predicted_threat or bool(obj.motion["predicted_threat"])
        inc.frames_persisted = obj.persisted_frames

    @staticmethod
    def _fallback_camera(db) -> str:
        return db.scalars(select(Camera.id).order_by(Camera.id)).first()

    @staticmethod
    def _fallback_section(db) -> str:
        cam = db.scalars(select(Camera).order_by(Camera.id)).first()
        return cam.section_id

    def _persist_alert(self, rt: CameraRuntime, rec: _TrackRecord, obj, d) -> None:
        hz = HAZARD_CLASSES[obj.cls]
        where = rt.name
        if d.kind == DecisionKind.PREDICTED:
            title = f"PREDICTED THREAT: {hz.label} approaching track"
            msg = f"{hz.label} #{obj.track_id} predicted to enter track in {obj.motion['eta_s']}s at {where} ({obj.distance_m:.0f} m ahead)."
        elif d.kind == DecisionKind.ESCALATED:
            title = f"ESCALATED to {d.escalated_to}: {hz.label} ({d.level.value})"
            msg = f"Unacknowledged {d.level.value} alert at {where} escalated to stage {d.stage} - {d.escalated_to}. {obj.risk['summary_reason']}"
        elif d.kind == DecisionKind.UPGRADED:
            title = f"{d.level.value}: {hz.label} risk increased to {obj.risk_score:.0f}"
            msg = f"{obj.risk['summary_reason']} at {where}, {obj.distance_m:.0f} m ahead."
        else:
            title = f"{d.level.value}: {hz.label} detected"
            msg = f"{obj.risk['summary_reason']} at {where}, {obj.distance_m:.0f} m ahead."
        with SessionLocal() as db:
            inc = db.get(Incident, rec.incident_id)
            alert = Alert(
                incident_id=rec.incident_id,
                camera_id=inc.camera_id if inc else rt.id,
                level=d.level.value,
                kind=d.kind.value,
                title=title,
                message=msg,
                predicted=d.predicted,
                escalation_stage=d.stage,
                escalated_to=d.escalated_to,
                risk_score=obj.risk_score,
            )
            if inc is not None and inc.status in ("ACKNOWLEDGED", "AUTO_CLEARED") and d.kind == DecisionKind.UPGRADED:
                inc.status = "OPEN"  # condition worsened after acknowledgement
            db.add(alert)
            db.commit()
            rec.alert_ids.append(alert.id)
            self.counters["alerts"] += 1
            hub.publish("alerts", {"type": "alert", "alert": alert_to_dict(alert, inc)})

    def _finalize_track(self, rt: CameraRuntime, track_id: int) -> None:
        rec = rt.tracks.pop(track_id, None)
        self.alert_engine.forget((rt.id, track_id))
        if rec is None:
            return
        with SessionLocal() as db:
            inc = db.get(Incident, rec.incident_id)
            if inc and inc.status == "OPEN" and inc.risk_score < 61:
                # moderate hazards that left the scene on their own are closed automatically
                inc.status = "AUTO_CLEARED"
                inc.resolved_at = utcnow()
                db.commit()

    # ------------------------------------------------------------------ operator actions
    def acknowledge_incident(self, incident_id: int) -> None:
        for rt in self.runtimes.values():
            for tid, rec in rt.tracks.items():
                if rec.incident_id == incident_id:
                    self.alert_engine.acknowledge((rt.id, tid))

    # ------------------------------------------------------------------ reporting
    def overview(self) -> dict:
        rts = list(self.runtimes.values())
        online = [r for r in rts if r.status == "ONLINE" and r.mode != "VIDEO"]
        return {
            "uptime_s": round(time.time() - self.started_at),
            "simulation_paused": self.simulation_paused,
            "auto_scenarios": self.auto_scenarios,
            "frequency": self.frequency,
            "cameras_online": len(online),
            "cameras_total": len([r for r in rts if r.mode != "VIDEO"]),
            "avg_fps": round(sum(r.fps for r in online) / len(online), 1) if online else 0.0,
            "avg_latency_ms": round(sum(r.avg_latency_ms for r in online) / len(online), 2) if online else 0.0,
            "active_hazards": sum(len((r.latest or {}).get("objects", [])) for r in rts),
            "counters": dict(self.counters),
            "ws_clients": hub.subscriber_count(),
        }


def _incident_brief(inc: Incident) -> dict:
    return {
        "id": inc.id,
        "code": inc.code,
        "camera_id": inc.camera_id,
        "hazard_class": inc.hazard_class,
        "risk_score": inc.risk_score,
        "risk_level": inc.risk_level,
        "zone": inc.zone,
        "status": inc.status,
        "detected_at": iso(inc.detected_at),
    }


def alert_to_dict(a: Alert, inc: Incident | None = None) -> dict:
    return {
        "id": a.id,
        "incident_id": a.incident_id,
        "incident_code": inc.code if inc else None,
        "hazard_class": inc.hazard_class if inc else None,
        "camera_id": a.camera_id,
        "level": a.level,
        "kind": a.kind,
        "title": a.title,
        "message": a.message,
        "predicted": a.predicted,
        "escalation_stage": a.escalation_stage,
        "escalated_to": a.escalated_to,
        "risk_score": a.risk_score,
        "acknowledged": a.acknowledged,
        "acknowledged_by": a.acknowledged_by,
        "acknowledged_at": iso(a.acknowledged_at),
        "created_at": iso(a.created_at),
    }


stream_manager = StreamManager()
