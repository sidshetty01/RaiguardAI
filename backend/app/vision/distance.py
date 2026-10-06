"""Stage 4 - Pinhole camera distance estimator.

    D = (H_real * f) / h_pixels

where ``H_real`` is the class's typical physical height, ``f`` the focal length in pixels
and ``h_pixels`` the bounding-box height. For flat, low objects (flood water, debris) the
box height is unreliable, so the ground-plane row of the contact point is used instead and
the two estimates are blended.
"""
from __future__ import annotations

from .geometry import CameraModel
from .hazard_classes import HAZARD_CLASSES

LOW_PROFILE = {"flood_water", "rock", "landslide_debris"}


class DistanceEstimator:
    def __init__(self, camera: CameraModel, min_m: float = 2.0, max_m: float = 400.0):
        self.camera = camera
        self.min_m = min_m
        self.max_m = max_m

    def pinhole(self, cls: str, bbox_h_px: float) -> float:
        h_real = HAZARD_CLASSES[cls].height_m
        return h_real * self.camera.focal_px / max(bbox_h_px, 1.0)

    def ground_plane(self, contact_y: float) -> float | None:
        if contact_y <= self.camera.horizon_y + 2:
            return None
        return self.camera.depth_at_row(contact_y)

    def estimate(self, cls: str, bbox: tuple[float, float, float, float]) -> float:
        _x1, y1, _x2, y2 = bbox
        d_pin = self.pinhole(cls, y2 - y1)
        d_ground = self.ground_plane(y2)
        if d_ground is None:
            d = d_pin
        elif cls in LOW_PROFILE:
            d = 0.25 * d_pin + 0.75 * d_ground
        else:
            d = 0.7 * d_pin + 0.3 * d_ground
        return max(self.min_m, min(self.max_m, d))

    def px_to_m(self, px: float, depth_m: float) -> float:
        """Convert a lateral pixel distance at a given depth to metres."""
        return px * depth_m / self.camera.focal_px
