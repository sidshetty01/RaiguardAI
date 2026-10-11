import asyncio
import time

import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile

from ..vision.detector import get_detector
from ..vision.geometry import CameraModel
from ..vision.pipeline import VisionPipeline
from ..vision.roi import TrackROI
from ..vision.scene_hazards import HAZARD_LABELS, get_scene_model, merge_detections
from ..vision.track_segmentation import get_track_segmenter

router = APIRouter(prefix="/api/analyze", tags=["analyze"])

MAX_BYTES = 25 * 1024 * 1024


def _run(data: bytes) -> dict:
    import cv2

    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image - upload a JPG, PNG, BMP or WEBP file")
    h, w = img.shape[:2]
    det = get_detector()
    if not det.load():
        raise RuntimeError(f"YOLOv8 detector unavailable: {det.error}")
    t0 = time.perf_counter()
    detections = det.detect(img)
    detect_ms = (time.perf_counter() - t0) * 1000
    # scene hazards (fallen trees, rocks, landslides, floods, track damage...) that YOLO cannot box
    t1 = time.perf_counter()
    scene = get_scene_model()
    hazards, scene_scores = scene.analyze(img)
    scene_ms = (time.perf_counter() - t1) * 1000
    # locate the actual tracks so objects are placed against real rails, not a fixed shape
    # same forward-facing track-camera assumption as uploaded videos (used when no rails are located)
    cam = CameraModel(width=w, height=h, focal_px=w * 0.78, horizon_y=h * 0.42, mount_height_m=5.0)
    t2 = time.perf_counter()
    track_map = get_track_segmenter().track_map(img, [d.bbox for d in detections], fallback=TrackROI.from_camera(cam))
    track_ms = (time.perf_counter() - t2) * 1000
    located = bool(track_map and (track_map.tracks or track_map.rail_mask is not None))
    detections = merge_detections(detections, hazards, tracks_located=located, track_map=track_map)
    pipe = VisionPipeline(cam, roi=track_map)
    fa = pipe.analyze_still(detections)
    return {
        "width": w,
        "height": h,
        "camera": cam.to_dict(),
        "roi": pipe.roi.to_dict(),
        "objects": [o.to_dict() for o in fa.objects],
        "max_risk": fa.max_risk,
        "level": fa.level,
        "safety_score": fa.safety_score,
        "detect_ms": round(detect_ms + scene_ms + track_ms, 1),
        "tracks_found": len(track_map.tracks) if track_map else 0,
        "rails_visible": track_map is not None,
        "scene": [
            {"key": k, "label": HAZARD_LABELS.get(k, "Clear track" if k == "clear" else "Not a railway scene"), "score": v, "hazard": k in HAZARD_LABELS and not k.endswith("_near")}
            for k, v in scene_scores.items()
        ][:5],
        "reasoning_ms": round(fa.latency_ms, 2),
        "detector": f"{det.weights} + CLIP {scene.model_name} + Mask2Former RailSem19",
    }


@router.post("/image")
async def analyze_image(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Image larger than 25 MB")
    try:
        return await asyncio.to_thread(_run, data)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
