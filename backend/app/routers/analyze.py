import asyncio
import time

import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile

from ..vision.detector import get_detector
from ..vision.geometry import CameraModel
from ..vision.pipeline import VisionPipeline

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
    # same forward-facing track-camera assumption as uploaded videos
    cam = CameraModel(width=w, height=h, focal_px=w * 0.78, horizon_y=h * 0.42, mount_height_m=5.0)
    pipe = VisionPipeline(cam)
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
        "detect_ms": round(detect_ms, 1),
        "reasoning_ms": round(fa.latency_ms, 2),
        "detector": det.weights,
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
