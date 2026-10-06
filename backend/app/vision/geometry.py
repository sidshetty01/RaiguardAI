"""Camera geometry shared by the ROI segmentor, the distance estimator and the simulator.

A forward-looking track camera is modelled as a pinhole camera mounted ``height_m`` above
flat ground with the optical axis parallel to the track. A ground point at lateral offset
``X`` (metres, + right of track centre) and depth ``Z`` projects to::

    u = cx + f * X / Z
    v = horizon + f * height / Z

An object of real height ``H`` at depth ``Z`` therefore spans ``f * H / Z`` pixels, which is
exactly the relation the pinhole distance estimator inverts.
"""
from __future__ import annotations

from dataclasses import dataclass

Point = tuple[float, float]

INDIAN_BROAD_GAUGE_M = 1.676


@dataclass(frozen=True)
class CameraModel:
    width: int = 1280
    height: int = 720
    focal_px: float = 1000.0
    horizon_y: float = 300.0
    mount_height_m: float = 5.0

    @property
    def cx(self) -> float:
        return self.width / 2

    def project(self, x_m: float, z_m: float) -> Point:
        z = max(z_m, 0.1)
        return (self.cx + self.focal_px * x_m / z, self.horizon_y + self.focal_px * self.mount_height_m / z)

    def depth_at_row(self, v: float) -> float:
        """Ground-plane depth for an image row below the horizon."""
        dv = max(v - self.horizon_y, 1e-3)
        return self.focal_px * self.mount_height_m / dv

    def corridor_polygon(self, half_width_m: float, z_near: float = 11.0, z_far: float = 220.0) -> list[Point]:
        nl = self.project(-half_width_m, z_near)
        nr = self.project(half_width_m, z_near)
        fr = self.project(half_width_m, z_far)
        fl = self.project(-half_width_m, z_far)
        return [nl, nr, fr, fl]

    def to_dict(self) -> dict:
        return {
            "width": self.width,
            "height": self.height,
            "focal_px": self.focal_px,
            "horizon_y": self.horizon_y,
            "mount_height_m": self.mount_height_m,
        }


def point_in_polygon(pt: Point, poly: list[Point]) -> bool:
    x, y = pt
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y):
            x_cross = xi + (y - yi) * (xj - xi) / (yj - yi)
            if x < x_cross:
                inside = not inside
        j = i
    return inside


def _point_segment_distance(p: Point, a: Point, b: Point) -> float:
    px, py = p
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    seg_len2 = dx * dx + dy * dy
    if seg_len2 == 0:
        return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg_len2))
    cx, cy = ax + t * dx, ay + t * dy
    return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5


def distance_to_polygon(pt: Point, poly: list[Point]) -> float:
    """Euclidean pixel distance from a point to a polygon boundary (0 when inside)."""
    if point_in_polygon(pt, poly):
        return 0.0
    n = len(poly)
    return min(_point_segment_distance(pt, poly[i], poly[(i + 1) % n]) for i in range(n))


def polygon_x_span(poly: list[Point], y: float) -> tuple[float, float] | None:
    """Left/right x where a horizontal line at ``y`` crosses the polygon."""
    xs = []
    n = len(poly)
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        if (y1 <= y <= y2) or (y2 <= y <= y1):
            if y1 == y2:
                xs.extend([x1, x2])
            else:
                xs.append(x1 + (y - y1) * (x2 - x1) / (y2 - y1))
    if not xs:
        return None
    return min(xs), max(xs)


def iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / union if union > 0 else 0.0
