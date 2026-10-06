"""Hazard taxonomy used across the RailGuard pipeline.

``severity`` (0..1) feeds the 25% Hazard Severity component of the risk score.
``height_m`` is the typical real-world height used by the pinhole distance estimator.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class HazardClass:
    key: str
    label: str
    severity: float
    height_m: float
    aspect: float  # bbox width / height
    category: str  # ANIMAL | OBSTRUCTION | HUMAN | VEHICLE | ENVIRONMENT | BENIGN
    icon: str


HAZARD_CLASSES: dict[str, HazardClass] = {
    c.key: c
    for c in [
        HazardClass("elephant", "Elephant", 0.95, 2.8, 1.35, "ANIMAL", "🐘"),
        HazardClass("cattle", "Cattle", 0.80, 1.5, 1.45, "ANIMAL", "🐄"),
        HazardClass("deer", "Deer", 0.65, 1.1, 1.20, "ANIMAL", "🦌"),
        HazardClass("wild_boar", "Wild Boar", 0.60, 0.9, 1.50, "ANIMAL", "🐗"),
        HazardClass("bear", "Sloth Bear", 0.75, 1.2, 1.30, "ANIMAL", "🐻"),
        HazardClass("dog", "Stray Dog", 0.35, 0.6, 1.40, "ANIMAL", "🐕"),
        HazardClass("person", "Trespasser", 0.85, 1.7, 0.40, "HUMAN", "🚶"),
        HazardClass("vehicle", "Vehicle", 0.90, 1.6, 2.20, "VEHICLE", "🚙"),
        HazardClass("motorcycle", "Motorcycle", 0.78, 1.2, 1.40, "VEHICLE", "🏍️"),
        HazardClass("fallen_tree", "Fallen Tree", 0.95, 1.8, 3.00, "OBSTRUCTION", "🌳"),
        HazardClass("boulder", "Boulder", 0.92, 1.2, 1.30, "OBSTRUCTION", "🪨"),
        HazardClass("rock", "Rock", 0.48, 0.4, 1.40, "OBSTRUCTION", "🪨"),
        HazardClass("landslide_debris", "Landslide Debris", 0.93, 1.5, 2.60, "OBSTRUCTION", "⛰️"),
        HazardClass("flood_water", "Flood Water", 0.85, 0.3, 4.00, "ENVIRONMENT", "🌊"),
        HazardClass("fire_smoke", "Fire / Smoke", 0.88, 3.0, 1.60, "ENVIRONMENT", "🔥"),
        HazardClass("bird", "Bird", 0.08, 0.3, 1.60, "BENIGN", "🐦"),
    ]
}

# Classes that, when lying on the track corridor, never clear by themselves.
STATIC_OBSTRUCTIONS = {"fallen_tree", "boulder", "rock", "landslide_debris", "flood_water"}

# Map raw detector labels (COCO or custom-trained weights) onto the RailGuard taxonomy.
LABEL_ALIASES: dict[str, str] = {
    "elephant": "elephant",
    "elephants": "elephant",
    "cow": "cattle",
    "cows": "cattle",
    "cattle": "cattle",
    "sheep": "cattle",
    "horse": "cattle",
    "buffalo": "cattle",
    "deer": "deer",
    "wild_boar": "wild_boar",
    "boar": "wild_boar",
    "bear": "bear",
    "dog": "dog",
    "cat": "dog",
    "person": "person",
    "trespasser": "person",
    "car": "vehicle",
    "truck": "vehicle",
    "bus": "vehicle",
    "vehicle": "vehicle",
    "tractor": "vehicle",
    "motorcycle": "motorcycle",
    "bicycle": "motorcycle",
    "tree": "fallen_tree",
    "trees": "fallen_tree",
    "fallen_tree": "fallen_tree",
    "boulder": "boulder",
    "rock": "rock",
    "rocks": "rock",
    "landslide": "landslide_debris",
    "landslide_debris": "landslide_debris",
    "flood": "flood_water",
    "flood_water": "flood_water",
    "fire": "fire_smoke",
    "smoke": "fire_smoke",
    "fire_smoke": "fire_smoke",
    "bird": "bird",
}


def resolve_label(raw: str) -> str | None:
    return LABEL_ALIASES.get(raw.strip().lower().replace(" ", "_"))


def get_class(key: str) -> HazardClass:
    return HAZARD_CLASSES[key]
