"""Track localisation: find the actual rails in an image, then place objects relative to them.

A Mask2Former model fine-tuned on RailSem19 (a railway-scene dataset) labels every pixel; we keep
the rail and in-track classes. Individual tracks are separated by following each track's
cross-section ("run") row by row from the bottom of the image upwards, and each track's left and
right edges are fitted with a smooth curve so it can be evaluated even where an object hides it.

An object is then judged by its *feet* (the bottom of its box), using the known rail gauge as a
ruler: Indian broad gauge is 1.676 m, so the pixel width of a track at any row gives metres per
pixel at that row.

    CRITICAL  feet on the track (between / on the rails)
    WARNING   within the train's swept envelope plus a safety margin
    SAFE      further away
"""
from __future__ import annotations

import logging
import math
import threading
from dataclasses import dataclass

import numpy as np

from .geometry import INDIAN_BROAD_GAUGE_M, Point, distance_to_polygon, point_in_polygon
from .hazard_classes import HAZARD_CLASSES
from .roi import Zone, ZoneResult

log = logging.getLogger("railguard.tracks")

MODEL_ID = "BhavanaMalla/Mask2Former_Finetuning_cityscapes_swin_railSem19_50epchs_1ptch_1024"
RAIL, TRACK, TRAIN = 3, 7, 9  # RailSem19 label ids in this model

ENVELOPE_M = 0.76  # rolling stock overhangs each rail by ~0.76 m (3.2 m wide coach on 1.676 m gauge)
SAFETY_M = 1.5  # extra margin beyond the envelope that still counts as "warning"
RAILS_UNDER_MIN = 0.08  # share of rail pixels between the legs that means "standing over the track"
MIN_RAIL_PIXELS = 0.005  # below this share of the image, no railway is considered visible


@dataclass
class TrackLine:
    """One track: left/right edge as polynomials x(y), valid between y0 and y1."""

    left: np.ndarray
    right: np.ndarray
    y0: float
    y1: float

    def span(self, y: float) -> tuple[float, float]:
        return float(np.polyval(self.left, y)), float(np.polyval(self.right, y))


class TrackMap:
    """Zone classifier built from detected tracks; same interface as :class:`roi.TrackROI`."""

    def __init__(self, tracks: list[TrackLine], width: int, height: int, rail_mask: np.ndarray | None = None, fallback=None):
        self.tracks = tracks
        self.width = width
        self.height = height
        self.rail_mask = rail_mask  # per-pixel rail / in-track mask
        self.fallback = fallback  # zone classifier to use when no track outline could be fitted
        # categories (ANIMAL / HUMAN / VEHICLE) the scene model judged to be on the rails
        self.scene_on_track: dict[str, float] = {}

    def rails_under(self, bbox: tuple[float, float, float, float]) -> float:
        """Share of rail / track pixels visible between the object's legs (lower-middle of its box).

        Close-up and side-on photos often hide most of the track behind the animal, so no track
        outline can be fitted - but the rails still show between its legs.
        """
        if self.rail_mask is None:
            return 0.0
        x1, y1, x2, y2 = bbox
        bw, bh = x2 - x1, y2 - y1
        xa, xb = int(max(0, x1 + 0.2 * bw)), int(min(self.width, x2 - 0.2 * bw))
        ya, yb = int(max(0, y1 + 0.6 * bh)), int(min(self.height, y2 + 0.02 * self.height))
        if xb <= xa or yb <= ya:
            return 0.0
        return float(self.rail_mask[ya:yb, xa:xb].mean())

    def _px_per_m(self, t: TrackLine, y: float) -> float:
        """Pixels per metre at row y, using the rail gauge measured across the track."""
        y = min(max(y, t.y0), t.y1)
        L, R = t.span(y)
        if (R - L) > 0.6 * self.width and (t.y1 - t.y0) < 0.35 * self.height:
            # track runs across the picture (side view): its gauge shows up vertically
            return max(t.y1 - t.y0, 4.0) / (INDIAN_BROAD_GAUGE_M * 1.2)
        slope = float(np.polyval(np.polyder((t.left + t.right) / 2), y))
        return max((R - L) / math.sqrt(1 + slope * slope), 2.0) / INDIAN_BROAD_GAUGE_M

    def _credible(self, t: TrackLine, bbox, cls: str | None) -> bool:
        """Is this track really the ground the object stands on?

        1. the track is actually seen at the depth of the object's feet, and
        2. the track's scale (rail gauge) agrees with the object's scale (its known height).
        """
        x1, y1, x2, y2 = bbox
        if not (t.y0 - 0.05 * self.height <= y2 <= t.y1 + 0.08 * self.height):
            return False
        if cls is None or cls not in HAZARD_CLASSES:
            return True
        obj_px_per_m = (y2 - y1) / HAZARD_CLASSES[cls].height_m
        ratio = obj_px_per_m / self._px_per_m(t, y2)
        return 0.4 <= ratio <= 2.5

    def classify(self, bbox: tuple[float, float, float, float], cls: str | None = None) -> ZoneResult:
        if self.rails_under(bbox) >= RAILS_UNDER_MIN:
            return ZoneResult(Zone.CRITICAL, 0.0, 0.0, basis="rails visible under the object")
        x1, _y1, x2, y2 = bbox
        bw = x2 - x1
        feet = [(x1 + 0.15 * bw, y2), ((x1 + x2) / 2, y2), (x2 - 0.15 * bw, y2)]  # feet, not the whole body
        best: ZoneResult | None = None
        for t in self.tracks:
            if not self._credible(t, bbox, cls):
                continue
            crit = self._poly(t, 0.1 * INDIAN_BROAD_GAUGE_M)
            if any(point_in_polygon(p, crit) for p in feet):
                res = ZoneResult(Zone.CRITICAL, 0.0, 0.0)
            else:
                gap_px = min(distance_to_polygon(p, crit) for p in feet)
                gap_m = gap_px / self._px_per_m(t, y2)
                zone = Zone.WARNING if gap_m <= ENVELOPE_M + SAFETY_M else Zone.SAFE
                res = ZoneResult(zone, gap_px, round(gap_m, 2))
            if best is None or _rank(res) < _rank(best):
                best = res
        if best is not None:
            best.basis = "feet on the located track" if best.zone == Zone.CRITICAL else "measured against the located track"
            return best
        # no credible track geometry for this object: use the scene model's verdict, then the fixed zone
        category = HAZARD_CLASSES[cls].category if cls in HAZARD_CLASSES else None
        if category in self.scene_on_track:
            return ZoneResult(Zone.CRITICAL, 0.0, 0.0, basis=f"scene model: on the rails ({self.scene_on_track[category] * 100:.0f}%)")
        if self.fallback is not None:
            res = self.fallback.classify(bbox)
            res.basis = "fixed zone (rails not clearly visible)"
            return res
        return ZoneResult(Zone.SAFE, float(self.width), 99.0, basis="not level with any visible track")

    def _poly(self, t: TrackLine, extra_m: float, steps: int = 14) -> list[Point]:
        ys = np.linspace(t.y0, min(t.y1 + 0.15 * self.height, self.height - 1), steps)
        left, right = [], []
        for y in ys:
            L, R = t.span(y)
            m = extra_m * (R - L) / INDIAN_BROAD_GAUGE_M
            left.append((round(L - m, 1), round(float(y), 1)))
            right.append((round(R + m, 1), round(float(y), 1)))
        return left + right[::-1]

    def to_dict(self) -> dict:
        tracks = [{"critical": self._poly(t, 0.1 * INDIAN_BROAD_GAUGE_M), "warning": self._poly(t, ENVELOPE_M + SAFETY_M)} for t in self.tracks]
        if not tracks and self.fallback is not None:
            return {**self.fallback.to_dict(), "source": "fixed (rails visible but no track outline fitted)"}
        first = tracks[0] if tracks else {"critical": [], "warning": []}
        return {"critical": first["critical"], "warning": first["warning"], "tracks": tracks, "source": "segmentation"}


def _rank(z: ZoneResult) -> tuple[int, float]:
    order = {Zone.CRITICAL: 0, Zone.WARNING: 1, Zone.SAFE: 2}
    return order[z.zone], z.edge_distance_px


def _runs(row: np.ndarray, min_len: int) -> list[tuple[int, int]]:
    """Contiguous True intervals in a boolean row."""
    padded = np.concatenate([[False], row, [False]])
    d = np.diff(padded.astype(np.int8))
    starts, ends = np.where(d == 1)[0], np.where(d == -1)[0] - 1
    return [(int(s), int(e)) for s, e in zip(starts, ends) if e - s + 1 >= min_len]


def tracks_from_mask(mask: np.ndarray, occluders: list[tuple[float, float, float, float]] | None = None) -> list[TrackLine]:
    """Separate individual tracks in a binary rail/track mask and fit their edges.

    ``occluders`` are detected object boxes: where an object stands on a track it hides the middle
    of the track, so two pieces of track separated only by an object are joined back together.
    """
    occluders = occluders or []
    import cv2

    h, w = mask.shape
    k = max(3, int(0.012 * w)) | 1
    m = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))) > 0
    step = max(1, h // 240)
    active: list[dict] = []  # each: {"rows": [(y, l, r)], "alive": bool}
    finished: list[dict] = []
    for y in range(h - 1, -1, -step):
        runs = _runs(m[y], max(3, w // 200))
        boxes = [(bx1, bx2) for bx1, by1, bx2, by2 in occluders if by1 <= y <= by2 + 0.02 * h]
        if boxes and len(runs) > 1:
            merged = [runs[0]]
            for l, r in runs[1:]:
                pl, pr = merged[-1]
                if any(bx1 <= pr + 2 and bx2 >= l - 2 for bx1, bx2 in boxes):
                    merged[-1] = (pl, r)
                else:
                    merged.append((l, r))
            runs = merged
        claimed: dict[int, list[int]] = {}
        for ri, (l, r) in enumerate(runs):
            for ti, t in enumerate(active):
                ly, ll, lr = t["rows"][-1]
                tol = max(4, 0.15 * (lr - ll))
                if ly - y <= 8 * step and l <= lr + tol and r >= ll - tol:
                    claimed.setdefault(ri, []).append(ti)
        used = set()
        for ri, (l, r) in enumerate(runs):
            owners = claimed.get(ri, [])
            if len(owners) == 1 and owners[0] not in used:
                t = active[owners[0]]
                ly, ll, lr = t["rows"][-1]
                # a run suddenly far wider than the track is two tracks merging toward the horizon
                if (r - l) > 1.8 * (lr - ll) + 6:
                    if len(t["rows"]) < 10:
                        t["rows"] = [(y, l, r)]  # the track was seeded by a fragment: restart from the real width
                    else:
                        t["alive"] = False
                elif (r - l) < 0.55 * (lr - ll) and (lr - ll) > 10:
                    pass  # partial view of the track (one rail, or cut by an object): skip this row
                else:
                    t["rows"].append((y, l, r))
                used.add(owners[0])
            elif len(owners) > 1:
                for ti in owners:
                    active[ti]["alive"] = False
            else:
                active.append({"rows": [(y, l, r)], "alive": True})
        keep = []
        for t in active:
            if t["alive"] and t["rows"][-1][0] - y <= 8 * step:
                keep.append(t)
            else:
                finished.append(t)
        active = keep
    finished.extend(active)

    out: list[TrackLine] = []
    for t in finished:
        rows = t["rows"]
        ys = np.array([r[0] for r in rows], float)
        if len(rows) < 8 or ys.max() - ys.min() < 0.06 * h:
            log.debug("track rejected: too short (%d rows, %.0f px)", len(rows), ys.max() - ys.min() if len(rows) else 0)
            continue
        ls = np.array([r[1] for r in rows], float)
        rs = np.array([r[2] for r in rows], float)
        if np.median(rs - ls) < 4:
            continue
        deg = 2 if ys.max() - ys.min() > 0.3 * h else 1
        pl, pr = np.polyfit(ys, ls, deg), np.polyfit(ys, rs, deg)
        # reject fits that don't describe a track: edges crossing, or poorly following the mask
        fl, fr = np.polyval(pl, ys), np.polyval(pr, ys)
        width = np.median(rs - ls)
        resid = np.mean(np.abs(fl - ls) + np.abs(fr - rs))
        if np.any(fr - fl < 2) or resid > 0.35 * width:
            log.debug("track rejected: bad fit (min width %.1f, width %.1f, residual %.1f)", float(np.min(fr - fl)), width, resid)
            continue
        # a real track narrows toward the horizon (perspective): wider at the bottom than the top
        if (np.polyval(pr, ys.max()) - np.polyval(pl, ys.max())) < 0.6 * (np.polyval(pr, ys.min()) - np.polyval(pl, ys.min())):
            log.debug("track rejected: does not narrow toward the horizon")
            continue
        out.append(TrackLine(pl, pr, float(ys.min()), float(ys.max())))
    # widest (nearest) tracks first
    out.sort(key=lambda t: -(t.span(t.y1)[1] - t.span(t.y1)[0]))
    return out[:6]


class TrackSegmenter:
    def __init__(self, model_id: str = MODEL_ID):
        self.model_id = model_id
        self._proc = None
        self._model = None
        self._lock = threading.Lock()
        self.error: str | None = None

    def load(self) -> bool:
        if self._model is not None:
            return True
        with self._lock:
            if self._model is not None:
                return True
            try:
                from transformers import AutoImageProcessor, Mask2FormerForUniversalSegmentation
                from transformers.utils import logging as hf_logging

                hf_logging.disable_progress_bar()
                hf_logging.set_verbosity_error()

                self._proc = AutoImageProcessor.from_pretrained(self.model_id)
                self._model = Mask2FormerForUniversalSegmentation.from_pretrained(self.model_id).eval()
                self.error = None
                log.info("Track segmentation model loaded: %s", self.model_id)
            except Exception as exc:  # pragma: no cover - environment dependent
                self.error = f"{type(exc).__name__}: {exc}"
                log.warning("Track segmentation unavailable: %s", self.error)
                return False
        return True

    def segment(self, bgr_image) -> np.ndarray:
        import cv2
        import torch
        from PIL import Image

        h, w = bgr_image.shape[:2]
        scale = min(1.0, 800 / max(h, w))  # segment at <= 800 px for speed, map back to full size
        small = cv2.resize(bgr_image, (int(w * scale), int(h * scale))) if scale < 1 else bgr_image
        img = Image.fromarray(small[:, :, ::-1])
        with self._lock:
            inputs = self._proc(images=img, return_tensors="pt")
            with torch.no_grad():
                out = self._model(**inputs)
            seg = self._proc.post_process_semantic_segmentation(out, target_sizes=[img.size[::-1]])[0].numpy().astype(np.uint8)
        if scale < 1:
            seg = cv2.resize(seg, (w, h), interpolation=cv2.INTER_NEAREST)
        return seg

    def track_map(self, bgr_image, occluders=None, fallback=None) -> TrackMap | None:
        """Locate tracks; returns None when no rails are visible at all (callers fall back).

        The map may have no fitted track outlines (close-up / side-on photos) but still carries the
        rail mask, so "standing over the rails" can be checked; other objects then use ``fallback``.
        """
        if not self.load():
            return None
        seg = self.segment(bgr_image)
        h, w = seg.shape
        mask = np.isin(seg, [RAIL, TRACK])
        if mask.mean() < MIN_RAIL_PIXELS:
            return None
        return TrackMap(tracks_from_mask(mask, occluders), w, h, rail_mask=mask, fallback=fallback)

    def status(self) -> dict:
        return {"model": "Mask2Former (RailSem19)", "loaded": self._model is not None, "error": self.error}


_seg: TrackSegmenter | None = None


def get_track_segmenter() -> TrackSegmenter:
    global _seg
    if _seg is None:
        _seg = TrackSegmenter()
    return _seg
