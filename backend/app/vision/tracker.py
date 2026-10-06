"""Stage 3 - Centroid & IoU temporal object tracker.

Greedy association of new detections to existing tracks:
1. score every (track, detection) pair of the same class by IoU, falling back to
   normalised centroid distance when boxes do not overlap (fast movers / dropped frames);
2. assign best pairs first;
3. unmatched detections spawn new tracks, unmatched tracks age and are dropped after
   ``max_disappeared`` frames.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

from .geometry import iou

BBox = tuple[float, float, float, float]


@dataclass
class Detection:
    cls: str
    bbox: BBox
    confidence: float


@dataclass
class Track:
    track_id: int
    cls: str
    bbox: BBox
    confidence: float
    first_seen: float
    last_seen: float
    hits: int = 1
    missed: int = 0
    history: deque = field(default_factory=lambda: deque(maxlen=60))  # (ts, cx, cy, bbox)
    conf_history: deque = field(default_factory=lambda: deque(maxlen=30))

    @property
    def centroid(self) -> tuple[float, float]:
        x1, y1, x2, y2 = self.bbox
        return ((x1 + x2) / 2, (y1 + y2) / 2)

    @property
    def smoothed_confidence(self) -> float:
        if not self.conf_history:
            return self.confidence
        return sum(self.conf_history) / len(self.conf_history)

    @property
    def age_s(self) -> float:
        return self.last_seen - self.first_seen


class CentroidIoUTracker:
    def __init__(self, max_disappeared: int = 12, iou_threshold: float = 0.15, max_centroid_dist: float = 0.6):
        self.max_disappeared = max_disappeared
        self.iou_threshold = iou_threshold
        # centroid distance threshold expressed as a multiple of the track's box diagonal
        self.max_centroid_dist = max_centroid_dist
        self._next_id = 1
        self.tracks: dict[int, Track] = {}
        self.lost: list[Track] = []

    def reset(self) -> None:
        self.tracks.clear()
        self.lost.clear()

    def _score(self, track: Track, det: Detection) -> float:
        if track.cls != det.cls:
            return 0.0
        ov = iou(track.bbox, det.bbox)
        if ov >= self.iou_threshold:
            return 1.0 + ov
        tx, ty = track.centroid
        dx = (det.bbox[0] + det.bbox[2]) / 2 - tx
        dy = (det.bbox[1] + det.bbox[3]) / 2 - ty
        x1, y1, x2, y2 = track.bbox
        diag = max(((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5, 8.0)
        # allow a larger search radius after missed frames
        limit = diag * (self.max_centroid_dist + 0.35 * track.missed) + 6.0
        dist = (dx * dx + dy * dy) ** 0.5
        if dist > limit:
            return 0.0
        return 1.0 - dist / limit  # in (0, 1]

    def update(self, detections: list[Detection], ts: float) -> list[Track]:
        self.lost = []
        pairs: list[tuple[float, int, int]] = []
        track_ids = list(self.tracks)
        for ti in track_ids:
            for di, det in enumerate(detections):
                s = self._score(self.tracks[ti], det)
                if s > 0:
                    pairs.append((s, ti, di))
        pairs.sort(reverse=True)

        used_tracks: set[int] = set()
        used_dets: set[int] = set()
        for _s, ti, di in pairs:
            if ti in used_tracks or di in used_dets:
                continue
            used_tracks.add(ti)
            used_dets.add(di)
            det = detections[di]
            tr = self.tracks[ti]
            tr.bbox = det.bbox
            tr.confidence = det.confidence
            tr.conf_history.append(det.confidence)
            tr.last_seen = ts
            tr.hits += 1
            tr.missed = 0
            cx, cy = tr.centroid
            tr.history.append((ts, cx, cy, det.bbox))

        for di, det in enumerate(detections):
            if di in used_dets:
                continue
            tr = Track(self._next_id, det.cls, det.bbox, det.confidence, ts, ts)
            tr.conf_history.append(det.confidence)
            cx, cy = tr.centroid
            tr.history.append((ts, cx, cy, det.bbox))
            self.tracks[tr.track_id] = tr
            self._next_id += 1

        for ti in track_ids:
            if ti in used_tracks:
                continue
            tr = self.tracks[ti]
            tr.missed += 1
            if tr.missed > self.max_disappeared:
                self.lost.append(self.tracks.pop(ti))

        return [t for t in self.tracks.values() if t.missed == 0]
