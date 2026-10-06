from __future__ import annotations

from datetime import datetime


def iso(dt: datetime | None) -> str | None:
    """Serialise naive-UTC database timestamps as explicit UTC ISO-8601 strings."""
    return dt.isoformat(timespec="seconds") + "Z" if dt else None
