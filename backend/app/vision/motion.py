"""Stage 5 - Motion analyzer & early-warning threat predictor.

For each track we keep a short time series of (timestamp, edge distance to the critical
zone in metres, image velocity). A least-squares slope of the edge distance gives the
*closing speed*; dividing the remaining distance by it gives the predicted time until the
object enters the track corridor.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from enum import Enum


class Direction(str, Enum):
    STATIONARY = "STATIONARY"
    TOWARD_TRACK = "TOWARD_TRACK"
    AWAY_FROM_TRACK = "AWAY_FROM_TRACK"
    ALONG_TRACK = "ALONG_TRACK"
    ON_TRACK_MOVING = "ON_TRACK_MOVING"


class SpeedTrend(str, Enum):
    STEADY = "STEADY"
    ACCELERATING = "ACCELERATING"
    DECELERATING = "DECELERATING"


@dataclass
class MotionState:
    direction: Direction = Direction.STATIONARY
    speed_mps: float = 0.0
    closing_speed_mps: float = 0.0
    vx_px: float = 0.0
    vy_px: float = 0.0
    trend: SpeedTrend = SpeedTrend.STEADY
    eta_s: float | None = None
    predicted_threat: bool = False

    def to_dict(self) -> dict:
        return {
            "direction": self.direction.value,
            "speed_mps": round(self.speed_mps, 2),
            "closing_speed_mps": round(self.closing_speed_mps, 2),
            "vx": round(self.vx_px, 1),
            "vy": round(self.vy_px, 1),
            "trend": self.trend.value,
            "eta_s": None if self.eta_s is None else round(self.eta_s, 1),
            "predicted_threat": self.predicted_threat,
        }


def _slope(ts: list[float], vals: list[float]) -> float:
    n = len(ts)
    if n < 2:
        return 0.0
    mt = sum(ts) / n
    mv = sum(vals) / n
    den = sum((t - mt) ** 2 for t in ts)
    if den <= 1e-9:
        return 0.0
    return sum((t - mt) * (v - mv) for t, v in zip(ts, vals)) / den


@dataclass
class _Series:
    samples: deque = field(default_factory=lambda: deque(maxlen=40))  # (ts, edge_m, cx, cy, depth, x_m, z_m)
    depth_ema: float | None = None
    edge_ema: float | None = None


class MotionAnalyzer:
    STATIONARY_MPS = 0.25
    CLOSING_MPS = 0.2

    def __init__(self, window_s: float = 1.6, horizon_s: float = 12.0):
        self.window_s = window_s
        self.horizon_s = horizon_s
        self._series: dict[int, _Series] = {}

    def forget(self, track_id: int) -> None:
        self._series.pop(track_id, None)

    def reset(self) -> None:
        self._series.clear()

    def update(
        self,
        track_id: int,
        ts: float,
        edge_m: float,
        centroid: tuple[float, float],
        x_m: float,
        depth_m: float,
        in_critical: bool,
    ) -> MotionState:
        """``x_m`` is the lateral ground offset from the track centre, ``depth_m`` the forward distance."""
        s = self._series.setdefault(track_id, _Series())
        # monocular depth from box height is jittery; smooth it before differentiating
        s.depth_ema = depth_m if s.depth_ema is None else 0.8 * s.depth_ema + 0.2 * depth_m
        s.edge_ema = edge_m if s.edge_ema is None else 0.6 * s.edge_ema + 0.4 * edge_m
        x_s = x_m * s.depth_ema / max(depth_m, 1e-3)
        s.samples.append((ts, s.edge_ema, centroid[0], centroid[1], s.depth_ema, x_s, s.depth_ema))
        win = [p for p in s.samples if ts - p[0] <= self.window_s]
        if len(win) < 4:
            return MotionState()

        t = [p[0] for p in win]
        vx_px = _slope(t, [p[2] for p in win])
        vy_px = _slope(t, [p[3] for p in win])
        vx_m = _slope(t, [p[5] for p in win])
        vz_m = _slope(t, [p[6] for p in win])
        # monocular depth is noisier than lateral position, so damp its contribution
        speed = (vx_m**2 + (0.35 * vz_m) ** 2) ** 0.5
        closing = -_slope(t, [p[1] for p in win])

        # speed trend: compare first and second half of the window
        trend = SpeedTrend.STEADY
        if len(win) >= 8:
            half = len(win) // 2
            a, b = win[:half], win[half:]
            sa = abs(_slope([p[0] for p in a], [p[5] for p in a]))
            sb = abs(_slope([p[0] for p in b], [p[5] for p in b]))
            if sb > sa * 1.35 and sb - sa > 0.3:
                trend = SpeedTrend.ACCELERATING
            elif sa > sb * 1.35 and sa - sb > 0.3:
                trend = SpeedTrend.DECELERATING

        state = MotionState(speed_mps=speed, closing_speed_mps=closing, vx_px=vx_px, vy_px=vy_px, trend=trend)

        # noise floor grows with range: one pixel of jitter spans more metres far away
        stationary_floor = self.STATIONARY_MPS + 0.004 * s.depth_ema
        if speed < stationary_floor:
            state.direction = Direction.STATIONARY
        elif in_critical:
            state.direction = Direction.ON_TRACK_MOVING
        elif closing > self.CLOSING_MPS:
            state.direction = Direction.TOWARD_TRACK
        elif closing < -self.CLOSING_MPS:
            state.direction = Direction.AWAY_FROM_TRACK
        else:
            state.direction = Direction.ALONG_TRACK

        if state.direction == Direction.TOWARD_TRACK and edge_m > 0:
            state.eta_s = s.edge_ema / max(closing, 1e-3)
            state.predicted_threat = state.eta_s <= self.horizon_s
        return state
