"""RailGuard AI - FastAPI application entry point.

Run:  python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select

from .config import ROOT_DIR, settings
from .database import SessionLocal, init_db
from .models import User
from .routers import alerts, analytics, analyze, auth, cameras, incidents, stream, system
from .services.hub import hub
from .services.stream_manager import stream_manager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("railguard")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    with SessionLocal() as db:
        empty = (db.scalar(select(func.count(User.id))) or 0) == 0
    if empty:
        log.info("Empty database - seeding demo data")
        from database.seed_data import seed

        seed(reset=False)
    with SessionLocal() as db:
        system.apply_runtime_settings(system.current_settings(db))
    hub.bind(asyncio.get_running_loop())
    stream_manager.start()
    yield
    stream_manager.stop()


app = FastAPI(
    title="RailGuard AI",
    version=settings.version,
    description=f"AI-Based Intelligent Framework for Autonomous Railway Track Safety Monitoring in Rural and Forest Areas. {settings.tagline}",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth.router, analyze.router, analytics.router, cameras.router, incidents.router, alerts.router, stream.router, system.router):
    app.include_router(r)


@app.get("/api/health", tags=["system"])
def health():
    return {"status": "ok", "app": settings.app_name, "version": settings.version}


# Serve the built dashboard (frontend/dist) when present, so one process can host everything.
_dist = ROOT_DIR / "frontend" / "dist"
if _dist.exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith(("api/", "ws/")):
            raise HTTPException(404, "Not found")
        target = _dist / full_path
        if full_path and target.is_file():
            return FileResponse(target)
        return FileResponse(_dist / "index.html")
