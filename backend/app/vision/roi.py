"""Stage 2 - Track Danger Zone Polygon Segmentor.

Splits the image into three zones around the rail corridor:

* ``CRITICAL`` - the kinematic envelope of the train (rails + clearance)
* ``WARNING``  - the cess / shoulder from which an object can reach the track in seconds
* ``SAFE``     - everything else (distant fields, forest edge, sky)

Detections are tested by their *ground contact point* (bottom-centre of the box) rather
than the box centre, so tall objects standing beside the track are not mis-assigned.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from .geometry import CameraModel, Point, distance_to_polygon, point_in_polygon


class Zone(str, Enum):
    SAFE = "SAFE"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


# Half-widths of the zones in metres from the track centre line.
CRITICAL_HALF_WIDTH_M = 2.6   # 1.676 m broad gauge + rolling-stock overhang + clearance
WARNING_HALF_WIDTH_M = 7.5


@dataclass
class ZoneResult:
    zone: Zone
    edge_distance_px: float  # pixel distance from ground point to the critical polygon (0 if inside)


class TrackROI:
    def __init__(self, critical: list[Point], warning: list[Point]):
        self.critical = critical
        self.warning = warning

    @classmethod
    def from_camera(cls, cam: CameraModel) -> TrackROI:
        return cls(
            critical=cam.corridor_polygon(CRITICAL_HALF_WIDTH_M),
            warning=cam.corridor_polygon(WARNING_HALF_WIDTH_M),
        )

    @classmethod
    def from_normalized(cls, critical: list[Point], warning: list[Point], width: int, height: int) -> TrackROI:
        def scale(poly: list[Point]) -> list[Point]:
            return [(x * width, y * height) for x, y in poly]

        return cls(scale(critical), scale(warning))

    @staticmethod
    def ground_point(bbox: tuple[float, float, float, float]) -> Point:
        x1, _y1, x2, y2 = bbox
        return ((x1 + x2) / 2, y2)

    def classify(self, bbox: tuple[float, float, float, float]) -> ZoneResult:
        gp = self.ground_point(bbox)
        x1, y1, x2, y2 = bbox
        # A wide object (fallen tree, debris) obstructs the track if *any* part of its base
        # lies inside the corridor, so test the base corners as well as the centre.
        base_pts = [gp, (x1 + (x2 - x1) * 0.15, y2), (x2 - (x2 - x1) * 0.15, y2)]
        if any(point_in_polygon(p, self.critical) for p in base_pts):
            return ZoneResult(Zone.CRITICAL, 0.0)
        edge = min(distance_to_polygon(p, self.critical) for p in base_pts)
        if any(point_in_polygon(p, self.warning) for p in base_pts):
            return ZoneResult(Zone.WARNING, edge)
        return ZoneResult(Zone.SAFE, edge)

    def to_dict(self) -> dict:
        return {
            "critical": [[round(x, 1), round(y, 1)] for x, y in self.critical],
            "warning": [[round(x, 1), round(y, 1)] for x, y in self.warning],
        }
