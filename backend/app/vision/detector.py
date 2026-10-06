"""Stage 1 - YOLOv8 hazard detector.

Wraps Ultralytics YOLOv8. Works with the stock COCO weights (elephant, cow, sheep, horse, bear,
dog, person, car/truck/bus, motorcycle, bicycle, bird are mapped onto the RailGuard taxonomy)
or with custom weights trained on the RailGuard hazard dataset (see ``ml/train_yolov8.py``),
whose class names are resolved through :data:`hazard_classes.LABEL_ALIASES`.

Ultralytics/PyTorch are imported lazily so the API and the simulation mode run without them.
"""
from __future__ import annotations

import logging
import threading
import time
from pathlib import Path

from ..config import ROOT_DIR, settings
from .hazard_classes import resolve_label
from .tracker import Detection

log = logging.getLogger("railguard.detector")


class YoloDetector:
    def __init__(self, weights: str | None = None, confidence: float | None = None):
        self.weights = weights or settings.yolo_weights
        self.confidence = confidence if confidence is not None else settings.yolo_confidence
        self._model = None
        self._lock = threading.Lock()
        self.error: str | None = None
        self.last_latency_ms: float = 0.0
        self.device = "cpu"

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def _resolve_weights(self) -> str:
        for cand in (Path(self.weights), ROOT_DIR / self.weights, ROOT_DIR / "ml" / "weights" / Path(self.weights).name):
            if cand.exists():
                return str(cand)
        return self.weights  # let ultralytics download the official checkpoint

    def load(self) -> bool:
        if self._model is not None:
            return True
        with self._lock:
            if self._model is not None:
                return True
            try:
                from ultralytics import YOLO  # type: ignore
                import torch  # type: ignore

                self.device = "cuda:0" if torch.cuda.is_available() else "cpu"
                self._model = YOLO(self._resolve_weights())
                self.error = None
                log.info("YOLO weights loaded: %s on %s", self.weights, self.device)
            except Exception as exc:  # pragma: no cover - environment dependent
                self.error = f"{type(exc).__name__}: {exc}"
                log.warning("YOLO unavailable: %s", self.error)
                return False
        return True

    def detect(self, frame) -> list[Detection]:
        if not self.load():
            raise RuntimeError(f"YOLO detector unavailable ({self.error})")
        t0 = time.perf_counter()
        with self._lock:
            result = self._model.predict(frame, conf=self.confidence, verbose=False, device=self.device)[0]
        self.last_latency_ms = (time.perf_counter() - t0) * 1000
        names = result.names
        dets: list[Detection] = []
        for box in result.boxes:
            cls_key = resolve_label(str(names[int(box.cls)]))
            if cls_key is None:
                continue
            x1, y1, x2, y2 = (float(v) for v in box.xyxy[0].tolist())
            dets.append(Detection(cls_key, (x1, y1, x2, y2), float(box.conf)))
        return dets

    def status(self) -> dict:
        return {
            "weights": self.weights,
            "loaded": self.loaded,
            "device": self.device,
            "error": self.error,
            "last_latency_ms": round(self.last_latency_ms, 1),
        }


_detector: YoloDetector | None = None


def get_detector() -> YoloDetector:
    global _detector
    if _detector is None:
        _detector = YoloDetector()
    return _detector
