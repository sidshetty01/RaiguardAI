"""Scene-level hazard model for obstructions that box detectors miss.

Stock YOLO weights know people, animals and vehicles, but not "a fallen tree across the line",
"rocks on the track" or "a landslide covering the railway". These are shapeless, scene-level
hazards. RailGuard scores them with CLIP zero-shot classification: the image is compared with
plain-English descriptions of each derailment hazard and of a clear track. To localise the
hazard, the same scoring runs on a grid of overlapping tiles and the hottest tiles become the
hazard's bounding box.

Every description is phrased as the hazard *on / across / covering the railway track*, so a
positive verdict is treated as an on-track obstruction by the risk engine.
"""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass

from ..config import settings

log = logging.getLogger("railguard.scene")

# description sets; "clear" and "not_rail" are the safe answers
PROMPTS: dict[str, list[str]] = {
    "clear": [
        "a photo of a clear railway track with nothing on it",
        "an empty railway line through the countryside",
        "a clean railway track with ballast and sleepers",
        "trees and bushes growing beside a clear railway line",
        "a railway line in a cutting with green slopes",
        "a train running normally on a clear railway track",
    ],
    "not_rail": ["a photo of a forest or field with no railway", "a footpath through the countryside", "a city street with no railway"],
    # obstructions - a train hitting any of these can derail
    "fallen_tree": [
        "a fallen tree lying across a railway track",
        "tree branches and a trunk blocking the railway line",
        "a tree standing in the middle of the railway track between the rails",
    ],
    "boulder": ["large rocks and boulders lying on a railway track", "a rockfall covering the railway line", "stones and rocks fallen onto the rails"],
    "landslide_debris": ["a landslide covering the railway track with mud and soil", "earth and debris slid onto the railway line"],
    "flood_water": ["a flooded railway track under water", "water washing out the railway track"],
    "fire_smoke": ["a fire burning on or beside a railway track", "thick smoke over a railway line"],
    "track_damage": ["a broken, buckled or damaged railway track", "a derailed train off the rails", "a railway track with missing or bent rails"],
    "debris": ["debris and rubbish dumped on a railway track", "an object blocking the railway track", "a dead animal lying on the railway track"],
    # moving hazards: YOLOv8 boxes them; the scene model says whether they are ON the rails
    "animal_on": ["an animal standing on the railway track between the rails", "an elephant walking along the railway line", "a cow standing on the rails"],
    "animal_near": ["animals grazing beside a railway track, off the rails", "cows in a field next to a railway line"],
    "people_on": ["a person walking on the railway track between the rails"],
    "people_near": ["people standing beside a railway track", "railway workers next to the line"],
    "vehicle_on": ["a car or truck stuck on the railway tracks"],
    "vehicle_near": ["cars on a road next to a railway line"],
}
SAFE = {"clear", "not_rail"}
OBSTRUCTIONS = ["fallen_tree", "boulder", "landslide_debris", "flood_water", "fire_smoke", "track_damage", "debris"]
# on-track mover -> (RailGuard category it confirms, generic class to add when YOLO missed the object)
MOVERS = {"animal_on": ("ANIMAL", "animal"), "people_on": ("HUMAN", "person"), "vehicle_on": ("VEHICLE", "vehicle")}
HAZARD_LABELS = {
    "fallen_tree": "Fallen tree on track",
    "boulder": "Rocks / boulders on track",
    "landslide_debris": "Landslide on track",
    "flood_water": "Flooded track",
    "fire_smoke": "Fire near track",
    "track_damage": "Track damage / derailment",
    "debris": "Obstruction on track",
    "animal_on": "Animal on track",
    "animal_near": "Animal beside track",
    "people_on": "Person on track",
    "people_near": "People beside track",
    "vehicle_on": "Vehicle on track",
    "vehicle_near": "Vehicle beside track",
}

# obstructions are reported when their combined share beats this and beats the safe answers
MIN_OBSTRUCTION = 0.50
MIN_TOP_OBSTRUCTION = 0.25  # the strongest single description must also stand out (rejects diffuse noise)
SECOND_OBSTRUCTION = 0.35
MIN_ON_TRACK = 0.35
TILE_MIN = 0.30


@dataclass
class SceneHazard:
    cls: str
    label: str
    score: float
    bbox: tuple[float, float, float, float]


class SceneHazardModel:
    def __init__(self, model_name: str | None = None):
        self.model_name = model_name or settings.scene_model
        self._model = None
        self._preprocess = None
        self._text = None
        self._owner: list[str] = []
        self._lock = threading.Lock()
        self.error: str | None = None

    def load(self) -> bool:
        if self._model is not None:
            return True
        with self._lock:
            if self._model is not None:
                return True
            try:
                import clip  # type: ignore  (ultralytics' CLIP fork)
                import torch

                model, preprocess = clip.load(self.model_name, device="cpu")
                prompts = [p for v in PROMPTS.values() for p in v]
                self._owner = [k for k, v in PROMPTS.items() for _ in v]
                with torch.no_grad():
                    text = model.encode_text(clip.tokenize(prompts))
                    text /= text.norm(dim=-1, keepdim=True)
                self._model, self._preprocess, self._text = model, preprocess, text
                self.error = None
                log.info("Scene hazard model loaded: CLIP %s", self.model_name)
            except Exception as exc:  # pragma: no cover - environment dependent
                self.error = f"{type(exc).__name__}: {exc}"
                log.warning("Scene hazard model unavailable: %s", self.error)
                return False
        return True

    def _scores(self, images) -> list[dict[str, float]]:
        """Per image: probability mass of each class across its descriptions."""
        import torch

        with torch.no_grad():
            batch = torch.stack([self._preprocess(im) for im in images])
            feats = self._model.encode_image(batch)
            feats /= feats.norm(dim=-1, keepdim=True)
            probs = (100.0 * feats @ self._text.T).softmax(dim=-1)
        out = []
        for row in probs.tolist():
            agg: dict[str, float] = {}
            for p, k in zip(row, self._owner):
                agg[k] = agg.get(k, 0.0) + p
            out.append(agg)
        return out

    def analyze(self, bgr_image) -> tuple[list[SceneHazard], dict[str, float]]:
        """Return detected scene hazards (with tile-based boxes) and the whole-image class scores."""
        if not self.load():
            raise RuntimeError(f"Scene hazard model unavailable: {self.error}")
        from PIL import Image

        h, w = bgr_image.shape[:2]
        full = Image.fromarray(bgr_image[:, :, ::-1])
        # 3x3 overlapping tiles, each 1/2 of the image in each dimension
        tiles, boxes = [], []
        for gy in range(3):
            for gx in range(3):
                x1, y1 = int(gx * w / 4), int(gy * h / 4)
                x2, y2 = int(x1 + w / 2), int(y1 + h / 2)
                tiles.append(full.crop((x1, y1, x2, y2)))
                boxes.append((x1, y1, x2, y2))
        with self._lock:
            scores = self._scores([full, *tiles])
        whole, tile_scores = scores[0], scores[1:]

        def box_for(cls: str) -> tuple[float, float, float, float]:
            best = max(t.get(cls, 0) for t in tile_scores)
            hot = [bx for bx, ts in zip(boxes, tile_scores) if ts.get(cls, 0) >= max(TILE_MIN * best, 0.6 * best)]
            if not hot or best < 0.05:  # spread over the scene: mark the lower (track) half
                return (w * 0.1, h * 0.45, w * 0.9, h * 0.98)
            return (min(x[0] for x in hot), min(x[1] for x in hot), max(x[2] for x in hot), max(x[3] for x in hot))

        hazards: list[SceneHazard] = []
        safe = whole.get("clear", 0.0) + whole.get("not_rail", 0.0)
        # different descriptions of the same blockage ("rocks", "landslide", "debris") add up
        mass = sum(whole.get(c, 0.0) for c in OBSTRUCTIONS)
        ranked = sorted(OBSTRUCTIONS, key=lambda c: -whole.get(c, 0.0))
        if mass >= MIN_OBSTRUCTION and mass > safe and whole.get(ranked[0], 0.0) >= MIN_TOP_OBSTRUCTION:
            top = ranked[0]
            hazards.append(SceneHazard(top, HAZARD_LABELS[top], round(min(mass, 0.99), 3), box_for(top)))
            second = ranked[1]
            if whole.get(second, 0.0) >= SECOND_OBSTRUCTION:
                hazards.append(SceneHazard(second, HAZARD_LABELS[second], round(whole[second], 3), box_for(second)))
        for on, near in (("animal_on", "animal_near"), ("people_on", "people_near"), ("vehicle_on", "vehicle_near")):
            if whole.get(on, 0.0) >= MIN_ON_TRACK and whole.get(on, 0.0) > whole.get(near, 0.0):
                hazards.append(SceneHazard(on, HAZARD_LABELS[on], round(whole[on], 3), box_for(on)))
        return hazards, {k: round(v, 3) for k, v in sorted(whole.items(), key=lambda kv: -kv[1])}

    def status(self) -> dict:
        return {"model": f"CLIP {self.model_name}", "loaded": self._model is not None, "error": self.error}


def merge_detections(dets: list, hazards: list[SceneHazard], tracks_located: bool = False, track_map=None) -> list:
    """Combine YOLOv8 boxes with scene-model verdicts.

    Obstructions become on-track detections. For animals / people / vehicles that YOLO boxed, the
    position is decided geometrically against the detected tracks when ``tracks_located``; only
    when no track could be located does the scene model's "on the rails" verdict mark them. If YOLO
    missed the object entirely, a generic on-track object is added from the scene verdict.
    """
    from .hazard_classes import HAZARD_CLASSES
    from .tracker import Detection

    out = list(dets)
    for hz in hazards:
        if hz.cls in MOVERS:
            category, generic = MOVERS[hz.cls]
            matches = [d for d in out if d.source == "YOLOv8" and HAZARD_CLASSES[d.cls].category == category]
            if track_map is not None:
                # the track map weighs this verdict per object, only where track geometry is unclear
                track_map.scene_on_track[category] = hz.score
            elif not tracks_located:
                for d in matches:
                    d.on_track, d.source = True, "YOLOv8 + scene"
            if not matches:
                out.append(Detection(generic, hz.bbox, hz.score, on_track=True, source="Scene model"))
        else:
            out.append(Detection(hz.cls, hz.bbox, hz.score, on_track=True, source="Scene model"))
    return out


_scene: SceneHazardModel | None = None


def get_scene_model() -> SceneHazardModel:
    global _scene
    if _scene is None:
        _scene = SceneHazardModel()
    return _scene
