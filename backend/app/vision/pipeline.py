"""Per-camera orchestration of stages 2-6.

``VisionPipeline.process(detections, ts)`` turns raw detections (from YOLO or from the
synthetic stream generator) into fully reasoned, explainable objects.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

from .distance import DistanceEstimator
from .geometry import CameraModel
from .hazard_classes import HAZARD_CLASSES
from .motion import MotionAnalyzer
from .risk_engine import RiskEngine, RiskInput, risk_level
from .roi import TrackROI, Zone
from .tracker import CentroidIoUTracker, Detection, Track


@dataclass
class AnalyzedObject:
    track_id: int
    cls: str
    bbox: tuple[float, float, float, float]
    confidence: float
    zone: str
    distance_m: float
    edge_distance_m: float
    lateral_m: float
    persisted_frames: int
    persisted_s: float
    motion: dict
    risk: dict

    @property
    def risk_score(self) -> float:
        return self.risk["risk_score"]

    def to_dict(self) -> dict:
        hz = HAZARD_CLASSES[self.cls]
        return {
            "track_id": self.track_id,
            "cls": self.cls,
            "label": hz.label,
            "icon": hz.icon,
            "category": hz.category,
            "bbox": [round(v, 1) for v in self.bbox],
            "confidence": round(self.confidence, 3),
            "zone": self.zone,
            "distance_m": round(self.distance_m, 1),
            "edge_distance_m": round(self.edge_distance_m, 1),
            "lateral_m": round(self.lateral_m, 2),
            "persisted_frames": self.persisted_frames,
            "persisted_s": round(self.persisted_s, 1),
            "motion": self.motion,
            "risk": self.risk,
        }


@dataclass
class FrameAnalysis:
    ts: float
    frame_no: int
    objects: list[AnalyzedObject]
    lost_track_ids: list[int]
    latency_ms: float
    max_risk: float = 0.0
    safety_score: float = 100.0
    level: str = "SAFE"
    extra: dict = field(default_factory=dict)


class VisionPipeline:
    def __init__(self, camera: CameraModel, roi: TrackROI | None = None):
        self.camera = camera
        self.roi = roi or TrackROI.from_camera(camera)
        self.tracker = CentroidIoUTracker()
        self.distance = DistanceEstimator(camera)
        self.motion = MotionAnalyzer()
        self.risk = RiskEngine()
        self.frame_no = 0

    def reset(self) -> None:
        self.tracker.reset()
        self.motion.reset()
        self.frame_no = 0

    def _analyze(self, tr: Track, ts: float) -> AnalyzedObject:
        zr = self.roi.classify(tr.bbox)
        depth = self.distance.estimate(tr.cls, tr.bbox)
        edge_m = self.distance.px_to_m(zr.edge_distance_px, depth)
        gx, _gy = TrackROI.ground_point(tr.bbox)
        lateral_m = (gx - self.camera.cx) * depth / self.camera.focal_px
        cx, cy = tr.centroid
        ms = self.motion.update(tr.track_id, ts, edge_m, (cx, cy), lateral_m, depth, zr.zone == Zone.CRITICAL)
        if zr.zone == Zone.CRITICAL or HAZARD_CLASSES[tr.cls].category == "BENIGN":
            ms.predicted_threat = False
            if zr.zone == Zone.CRITICAL:
                ms.eta_s = None
        assessment = self.risk.assess(
            RiskInput(
                cls=tr.cls,
                zone=zr.zone,
                edge_distance_m=edge_m,
                confidence=tr.smoothed_confidence,
                persisted_frames=tr.hits,
                persisted_s=tr.age_s,
                motion=ms,
            )
        )
        return AnalyzedObject(
            track_id=tr.track_id,
            cls=tr.cls,
            bbox=tr.bbox,
            confidence=tr.smoothed_confidence,
            zone=zr.zone.value,
            distance_m=depth,
            edge_distance_m=edge_m,
            lateral_m=lateral_m,
            persisted_frames=tr.hits,
            persisted_s=tr.age_s,
            motion=ms.to_dict(),
            risk=assessment.to_dict(),
        )

    def process(self, detections: list[Detection], ts: float) -> FrameAnalysis:
        t0 = time.perf_counter()
        self.frame_no += 1
        active = self.tracker.update(detections, ts)
        objs = [self._analyze(tr, ts) for tr in active]
        lost = [t.track_id for t in self.tracker.lost]
        for tid in lost:
            self.motion.forget(tid)
        objs.sort(key=lambda o: o.risk_score, reverse=True)
        max_risk = objs[0].risk_score if objs else 0.0
        return FrameAnalysis(
            ts=ts,
            frame_no=self.frame_no,
            objects=objs,
            lost_track_ids=lost,
            latency_ms=(time.perf_counter() - t0) * 1000,
            max_risk=max_risk,
            safety_score=round(100 - max_risk, 1),
            level=risk_level(max_risk),
        )
