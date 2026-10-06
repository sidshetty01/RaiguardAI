"""Zero-hardware synthetic stream generator.

Hazards are scripted as actors moving through *world* coordinates (lateral offset X and
forward depth Z, in metres, relative to the camera on the track centre line). Each tick they
are projected through the same pinhole :class:`CameraModel` used by the vision pipeline and
emitted as noisy detector-style outputs (class, bbox, confidence) - including jitter, missed
detections and distance-dependent confidence - so the downstream tracker, distance estimator,
motion analyzer and risk engine run exactly as they would on real YOLO output.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import datetime

from .geometry import CameraModel
from .hazard_classes import HAZARD_CLASSES
from .tracker import Detection

Waypoint = tuple[float, float, float, float]  # (x_m, z_m, speed_mps to reach it, dwell_s after)


@dataclass
class Actor:
    cls: str
    path: list[Waypoint]
    start_delay: float = 0.0
    scale: float = 1.0  # size multiplier (calves, saplings...)
    base_conf: float = 0.9
    sway: float = 0.0  # lateral wander amplitude (grazing animals)

    # runtime
    x: float = field(init=False, default=0.0)
    z: float = field(init=False, default=0.0)
    seg: int = field(init=False, default=0)
    dwell_left: float = field(init=False, default=0.0)
    t: float = field(init=False, default=0.0)
    done: bool = field(init=False, default=False)

    def __post_init__(self) -> None:
        self.x, self.z = self.path[0][0], self.path[0][1]
        self.dwell_left = self.path[0][3]
        self.seg = 1

    @property
    def active(self) -> bool:
        return self.t >= self.start_delay and not self.done

    def step(self, dt: float) -> None:
        self.t += dt
        if self.t < self.start_delay or self.done:
            return
        if self.dwell_left > 0:
            self.dwell_left -= dt
            return
        if self.seg >= len(self.path):
            self.done = True
            return
        tx, tz, speed, dwell = self.path[self.seg]
        dx, dz = tx - self.x, tz - self.z
        dist = math.hypot(dx, dz)
        stepd = speed * dt
        if dist <= stepd or speed <= 0:
            self.x, self.z = tx, tz
            self.dwell_left = dwell
            self.seg += 1
        else:
            self.x += dx / dist * stepd
            self.z += dz / dist * stepd


@dataclass
class Scenario:
    key: str
    title: str
    description: str
    actors: list[Actor]
    max_duration: float = 90.0
    elapsed: float = 0.0

    @property
    def finished(self) -> bool:
        return self.elapsed >= self.max_duration or all(a.done for a in self.actors)


def _j(rng: random.Random, a: float, b: float) -> float:
    return rng.uniform(a, b)


def build_scenario(key: str, rng: random.Random) -> Scenario:
    side = rng.choice([-1, 1])
    if key == "elephant_crossing":
        z = _j(rng, 45, 75)
        return Scenario(
            key,
            "Elephant herd crossing",
            "Elephants emerge from the forest edge and cross the line; early-warning predicts track entry.",
            [
                Actor("elephant", [(side * 26, z, 0, 2), (side * 3.4, z, 1.3, 1.5), (-side * 1.0, z, 0.9, 6), (-side * 24, z + 4, 1.4, 0)], base_conf=0.93),
                Actor("elephant", [(side * 30, z + 6, 0, 0), (side * 3.0, z + 5, 1.3, 1), (-side * 1.5, z + 5, 1.0, 3), (-side * 26, z + 9, 1.4, 0)], start_delay=5, scale=0.62, base_conf=0.86),
            ],
            max_duration=95,
        )
    if key == "cattle_on_track":
        z = _j(rng, 30, 55)
        return Scenario(
            key,
            "Cattle straying onto track",
            "Grazing cattle drift from the cess onto the ballast and linger between the rails.",
            [
                Actor("cattle", [(side * 9, z, 0, 4), (side * 4.5, z, 0.5, 5), (side * 0.6, z + 1, 0.6, 9), (side * 10, z + 2, 0.8, 0)], base_conf=0.92, sway=0.15),
                Actor("cattle", [(side * 11, z + 7, 0, 6), (side * 6.5, z + 6, 0.4, 14), (side * 13, z + 6, 0.6, 0)], base_conf=0.88, sway=0.2),
            ],
        )
    if key == "fallen_tree":
        z = _j(rng, 55, 95)
        return Scenario(
            key,
            "Fallen tree across track",
            "A tree uprooted by monsoon winds lies across both rails - a static obstruction that will not self-clear.",
            [Actor("fallen_tree", [(side * 0.4, z, 0, 40)], base_conf=0.94)],
            max_duration=42,
        )
    if key == "rockfall":
        z = _j(rng, 35, 60)
        return Scenario(
            key,
            "Rockfall on track",
            "Loose rock from the cutting slope rolls down and comes to rest on the track bed.",
            [Actor("rock", [(side * 9, z, 0, 1), (side * 0.7, z, 2.6, 30)], base_conf=0.97)],
            max_duration=36,
        )
    if key == "boulder_landslide":
        z = _j(rng, 60, 100)
        return Scenario(
            key,
            "Landslide debris & boulder",
            "Heavy rain triggers a slip in the ghat section; debris and a boulder block the line.",
            [
                Actor("landslide_debris", [(side * 1.0, z, 0, 38)], base_conf=0.9),
                Actor("boulder", [(side * 12, z - 8, 0, 0), (side * 1.2, z - 8, 3.0, 30)], start_delay=3, base_conf=0.91),
            ],
            max_duration=44,
        )
    if key == "trespasser":
        z = _j(rng, 28, 40)
        return Scenario(
            key,
            "Trespasser walking along track",
            "A person climbs onto the cess and walks between the rails toward the camera.",
            [Actor("person", [(side * 8, z + 30, 0, 1), (side * 1.2, z + 28, 1.2, 0), (side * 0.5, z, 1.2, 2), (side * 9, z - 4, 1.3, 0)], base_conf=0.91)],
        )
    if key == "vehicle_level_crossing":
        z = _j(rng, 32, 50)
        return Scenario(
            key,
            "Vehicle at unmanned level crossing",
            "A tractor/jeep crosses the unmanned level crossing and stalls on the rails.",
            [Actor("vehicle", [(side * 28, z, 0, 0), (side * 0.3, z, 4.5, 7), (-side * 28, z, 3.5, 0)], base_conf=0.95)],
        )
    if key == "deer_dash":
        z = _j(rng, 35, 70)
        return Scenario(
            key,
            "Deer dashing across",
            "A spotted deer sprints across the line - fast closing speed, very short warning time.",
            [Actor("deer", [(side * 24, z, 0, 1), (-side * 24, z + 3, 6.5, 0)], base_conf=0.85)],
        )
    if key == "wild_boar":
        z = _j(rng, 25, 45)
        return Scenario(
            key,
            "Wild boar foraging near track",
            "A wild boar forages along the shoulder, then crosses the rails.",
            [Actor("wild_boar", [(side * 12, z, 0, 2), (side * 5.5, z - 3, 1.0, 6), (-side * 14, z - 4, 1.8, 0)], base_conf=0.83, sway=0.2)],
        )
    if key == "bear_crossing":
        z = _j(rng, 40, 65)
        return Scenario(
            key,
            "Sloth bear crossing at dusk",
            "A sloth bear ambles out of the undergrowth and crosses the track.",
            [Actor("bear", [(side * 20, z, 0, 2), (-side * 20, z + 2, 1.1, 0)], base_conf=0.82)],
        )
    if key == "flood_water":
        z = _j(rng, 45, 80)
        return Scenario(
            key,
            "Flood water over track",
            "Monsoon runoff submerges the track bed - ballast washout risk.",
            [Actor("flood_water", [(side * 0.5, z, 0, 40)], scale=1.0, base_conf=0.84)],
            max_duration=42,
        )
    if key == "fire_smoke":
        z = _j(rng, 50, 90)
        return Scenario(
            key,
            "Forest fire near line",
            "A forest fire smoulders beside the track in the warning buffer, reducing visibility.",
            [Actor("fire_smoke", [(side * 6.5, z, 0, 35)], base_conf=0.86, sway=0.1)],
            max_duration=36,
        )
    if key == "distant_wildlife":
        return Scenario(
            key,
            "Distant harmless activity",
            "Cattle grazing far from the line and a bird overhead - correctly scored SAFE (false-positive suppression).",
            [
                Actor("cattle", [(side * 24, 40, 0, 10), (side * 28, 44, 0.4, 12), (side * 22, 41, 0.4, 0)], base_conf=0.88, sway=0.25),
                Actor("bird", [(-side * 14, 30, 0, 0), (side * 0.0, 30, 3.0, 0), (side * 18, 32, 3.0, 0)], start_delay=4, base_conf=0.7),
            ],
            max_duration=38,
        )
    raise KeyError(key)


SCENARIO_KEYS = [
    "elephant_crossing",
    "cattle_on_track",
    "fallen_tree",
    "rockfall",
    "boulder_landslide",
    "trespasser",
    "vehicle_level_crossing",
    "deer_dash",
    "wild_boar",
    "bear_crossing",
    "flood_water",
    "fire_smoke",
    "distant_wildlife",
]

PROFILES: dict[str, list[tuple[str, int]]] = {
    "FOREST": [("elephant_crossing", 4), ("deer_dash", 2), ("wild_boar", 2), ("fallen_tree", 2), ("bear_crossing", 1), ("fire_smoke", 1), ("distant_wildlife", 2)],
    "GHAT": [("rockfall", 3), ("boulder_landslide", 2), ("fallen_tree", 2), ("elephant_crossing", 2), ("trespasser", 1), ("distant_wildlife", 2)],
    "COASTAL": [("flood_water", 2), ("cattle_on_track", 2), ("trespasser", 2), ("vehicle_level_crossing", 2), ("distant_wildlife", 2)],
    "RURAL": [("cattle_on_track", 4), ("vehicle_level_crossing", 2), ("trespasser", 2), ("wild_boar", 1), ("distant_wildlife", 2)],
}


def scenario_catalog() -> list[dict]:
    rng = random.Random(0)
    out = []
    for k in SCENARIO_KEYS:
        sc = build_scenario(k, rng)
        out.append({"key": k, "title": sc.title, "description": sc.description, "classes": sorted({a.cls for a in sc.actors})})
    return out


class SceneSimulator:
    """Drives scripted scenarios for one camera and emits detector-like outputs."""

    def __init__(self, camera: CameraModel, profile: str = "FOREST", seed: int | None = None, idle_range: tuple[float, float] = (25.0, 70.0)):
        self.camera = camera
        self.profile = profile if profile in PROFILES else "FOREST"
        self.rng = random.Random(seed)
        self.idle_range = idle_range
        self.scenario: Scenario | None = None
        self.idle_left = self.rng.uniform(2.0, 12.0)
        self.last_key: str | None = None
        self.weather = self.rng.choice(["CLEAR", "CLEAR", "CLEAR", "OVERCAST", "RAIN", "FOG"])

    def trigger(self, key: str) -> Scenario:
        self.scenario = build_scenario(key, self.rng)
        self.last_key = key
        return self.scenario

    def stop(self) -> None:
        self.scenario = None
        self.idle_left = self.rng.uniform(*self.idle_range)

    def _pick(self) -> str:
        pool = [(k, w) for k, w in PROFILES[self.profile] if k != self.last_key]
        total = sum(w for _, w in pool)
        r = self.rng.uniform(0, total)
        for k, w in pool:
            r -= w
            if r <= 0:
                return k
        return pool[-1][0]

    @staticmethod
    def time_of_day(now: datetime | None = None) -> str:
        h = (now or datetime.now()).hour
        if 6 <= h < 17:
            return "DAY"
        if 17 <= h < 19 or 5 <= h < 6:
            return "DUSK"
        return "NIGHT"

    def environment(self) -> dict:
        return {"time_of_day": self.time_of_day(), "weather": self.weather}

    def step(self, dt: float) -> list[Detection]:
        if self.scenario is None:
            self.idle_left -= dt
            if self.idle_left <= 0:
                self.trigger(self._pick())
                if self.rng.random() < 0.15:
                    self.weather = self.rng.choice(["CLEAR", "CLEAR", "OVERCAST", "RAIN", "FOG"])
            return []

        sc = self.scenario
        sc.elapsed += dt
        dets: list[Detection] = []
        night_penalty = 0.06 if self.time_of_day() == "NIGHT" else 0.0
        weather_penalty = {"RAIN": 0.04, "FOG": 0.08}.get(self.weather, 0.0)
        cam = self.camera
        for a in sc.actors:
            a.step(dt)
            if not a.active:
                continue
            x = a.x + (math.sin(a.t * 0.7 + a.start_delay) * a.sway if a.sway else 0.0)
            z = a.z
            if z < 9.5:
                continue
            hz = HAZARD_CLASSES[a.cls]
            u, v = cam.project(x, z)
            h = cam.focal_px * hz.height_m * a.scale / z
            w = h * hz.aspect
            if a.cls == "bird":  # birds fly, they do not touch the ground
                v -= cam.focal_px * 6.0 / z
            jit = 0.025 * h
            x1 = u - w / 2 + self.rng.gauss(0, jit)
            x2 = u + w / 2 + self.rng.gauss(0, jit)
            y1 = v - h + self.rng.gauss(0, jit)
            y2 = v + self.rng.gauss(0, jit * 0.5)
            if x2 < 0 or x1 > cam.width or y2 < 0 or y1 > cam.height:
                continue
            x1, x2 = max(0.0, x1), min(float(cam.width), x2)
            y1, y2 = max(0.0, y1), min(float(cam.height), y2)
            if x2 - x1 < 3 or y2 - y1 < 3:
                continue
            far = min(z / 160.0, 1.0)
            if self.rng.random() < 0.02 + 0.06 * far:  # missed detection
                continue
            conf = a.base_conf - 0.12 * far - night_penalty - weather_penalty + self.rng.gauss(0, 0.015)
            dets.append(Detection(a.cls, (x1, y1, x2, y2), max(0.3, min(0.995, conf))))
        if sc.finished:
            self.stop()
        return dets

    def status(self) -> dict:
        sc = self.scenario
        return {
            "profile": self.profile,
            "active_scenario": None if sc is None else {"key": sc.key, "title": sc.title, "description": sc.description, "elapsed_s": round(sc.elapsed, 1)},
            "next_scenario_in_s": None if sc else round(max(self.idle_left, 0), 1),
            **self.environment(),
        }
