"""Central configuration for RailGuard AI.

Every value can be overridden with an environment variable prefixed ``RAILGUARD_``
(e.g. ``RAILGUARD_DATABASE_URL=postgresql+psycopg://...``).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("RAILGUARD_DATA_DIR", ROOT_DIR / "data"))


def _env(name: str, default: str) -> str:
    return os.getenv(f"RAILGUARD_{name}", default)


@dataclass(frozen=True)
class Settings:
    app_name: str = "RailGuard AI"
    version: str = "2.0.0"
    tagline: str = "See the Risk. Predict the Threat. Protect the Track."

    database_url: str = field(default_factory=lambda: _env("DATABASE_URL", f"sqlite:///{(DATA_DIR / 'railguard.db').as_posix()}"))
    jwt_secret: str = field(default_factory=lambda: _env("JWT_SECRET", "railguard-dev-secret-change-me-in-production"))
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = field(default_factory=lambda: int(_env("JWT_EXPIRY_MINUTES", "720")))

    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: tuple(_env("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173").split(","))
    )

    # Vision engine
    simulation_enabled: bool = field(default_factory=lambda: _env("SIMULATION", "1") == "1")
    simulation_fps: float = field(default_factory=lambda: float(_env("SIMULATION_FPS", "10")))
    yolo_weights: str = field(default_factory=lambda: _env("YOLO_WEIGHTS", "yolov8n.pt"))
    yolo_confidence: float = field(default_factory=lambda: float(_env("YOLO_CONFIDENCE", "0.35")))
    video_max_fps: float = field(default_factory=lambda: float(_env("VIDEO_MAX_FPS", "12")))

    data_dir: Path = DATA_DIR
    uploads_dir: Path = DATA_DIR / "uploads"
    snapshots_dir: Path = DATA_DIR / "snapshots"
    reports_dir: Path = DATA_DIR / "reports"
    metrics_file: Path = ROOT_DIR / "ml" / "metrics" / "model_metrics.json"
    datasets_dir: Path = ROOT_DIR / "datasets"


settings = Settings()

for _d in (settings.data_dir, settings.uploads_dir, settings.snapshots_dir, settings.reports_dir):
    _d.mkdir(parents=True, exist_ok=True)
