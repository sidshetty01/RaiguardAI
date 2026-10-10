import asyncio
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect

from ..auth import get_current_user, require_operator
from ..config import settings
from ..models import User
from ..schemas import ScenarioIn
from ..services.hub import hub
from ..services.stream_manager import stream_manager
from ..vision.detector import get_detector
from ..vision.hazard_classes import HAZARD_CLASSES
from ..vision.simulator import scenario_catalog

router = APIRouter(tags=["stream"])

ALLOWED_VIDEO = {".mp4", ".avi", ".mov", ".mkv", ".webm"}


@router.get("/api/stream/scenarios")
def scenarios(_: User = Depends(get_current_user)):
    return scenario_catalog()


@router.get("/api/stream/classes")
def classes(_: User = Depends(get_current_user)):
    return [
        {"key": c.key, "label": c.label, "severity": c.severity, "height_m": c.height_m, "category": c.category, "icon": c.icon}
        for c in HAZARD_CLASSES.values()
    ]


@router.get("/api/stream/runtimes")
def runtimes(_: User = Depends(get_current_user)):
    return [rt.summary() for rt in stream_manager.runtimes.values()]


@router.get("/api/stream/{runtime_id}/latest")
def latest(runtime_id: str, _: User = Depends(get_current_user)):
    rt = stream_manager.runtimes.get(runtime_id)
    if rt is None:
        raise HTTPException(404, "Stream not found")
    return rt.latest or {}


@router.post("/api/stream/{camera_id}/scenario")
def trigger(camera_id: str, body: ScenarioIn, _: User = Depends(require_operator)):
    try:
        return stream_manager.trigger_scenario(camera_id, body.scenario)
    except KeyError:
        raise HTTPException(404, "Simulated camera not found")
    except ValueError:
        raise HTTPException(400, "Unknown scenario")


@router.post("/api/stream/{camera_id}/clear")
def clear(camera_id: str, _: User = Depends(require_operator)):
    try:
        stream_manager.clear_scene(camera_id)
    except KeyError:
        raise HTTPException(404, "Stream not found")
    return {"ok": True}


@router.get("/api/stream/detector")
def detector_status(_: User = Depends(get_current_user)):
    return get_detector().status()


@router.post("/api/stream/upload")
async def upload(file: UploadFile = File(...), loop: bool = Query(False), _: User = Depends(require_operator)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_VIDEO:
        raise HTTPException(400, f"Unsupported video type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_VIDEO))}")
    dest = settings.uploads_dir / f"{uuid.uuid4().hex}{ext}"
    with dest.open("wb") as fh:
        shutil.copyfileobj(file.file, fh)
    try:
        rt = await asyncio.to_thread(stream_manager.start_video, dest, file.filename or dest.name, loop)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return rt.summary()


@router.delete("/api/stream/{runtime_id}")
def stop(runtime_id: str, _: User = Depends(require_operator)):
    try:
        stream_manager.stop_video(runtime_id)
    except KeyError:
        raise HTTPException(404, "Video stream not found")
    return {"ok": True}


async def _pump(ws: WebSocket, channels: list[str]) -> None:
    queues = [(c, hub.subscribe(c)) for c in channels]
    try:

        async def forward(q: asyncio.Queue):
            while True:
                await ws.send_json(await q.get())

        async def receive():
            while True:
                await ws.receive_text()  # keepalive pings; raises on disconnect

        tasks = [asyncio.create_task(forward(q)) for _, q in queues] + [asyncio.create_task(receive())]
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
        for t in done:
            exc = t.exception()
            if exc and not isinstance(exc, WebSocketDisconnect):
                raise exc
    except WebSocketDisconnect:
        pass
    finally:
        for c, q in queues:
            hub.unsubscribe(c, q)


@router.websocket("/ws/stream/{runtime_id}")
async def ws_stream(ws: WebSocket, runtime_id: str):
    await ws.accept()
    rt = stream_manager.runtimes.get(runtime_id)
    if rt and rt.latest:
        await ws.send_json({**rt.latest, "image": None})
    await _pump(ws, [f"camera:{runtime_id}"])


@router.websocket("/ws/events")
async def ws_events(ws: WebSocket):
    await ws.accept()
    await _pump(ws, ["alerts", "events", "telemetry"])
