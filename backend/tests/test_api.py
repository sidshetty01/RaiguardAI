"""API integration tests against a temporary SQLite database (single-user mode, no login)."""
import os
import tempfile

import pytest

_tmp = tempfile.mkdtemp(prefix="railguard-test-")
os.environ["RAILGUARD_DATA_DIR"] = _tmp
os.environ["RAILGUARD_DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"

from fastapi.testclient import TestClient  # noqa: E402

from backend.app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_no_login_required(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 200 and r.json()["role"] == "ADMIN"


@pytest.mark.parametrize(
    "path",
    [
        "/api/dashboard/summary",
        "/api/analytics",
        "/api/map",
        "/api/heatmap",
        "/api/sections/health",
        "/api/model/performance",
        "/api/dataset",
        "/api/system/health",
        "/api/cameras",
        "/api/incidents",
        "/api/alerts",
        "/api/settings",
        "/api/stream/scenarios",
        "/api/stream/runtimes",
    ],
)
def test_read_endpoints(client, path):
    assert client.get(path).status_code == 200


def test_incident_workflow_and_report(client):
    items = client.get("/api/incidents?page_size=5&level=CRITICAL").json()["items"]
    assert items
    iid = items[0]["id"]
    detail = client.get(f"/api/incidents/{iid}").json()
    assert detail["factors"] and detail["snapshot"]
    r = client.post(f"/api/incidents/{iid}/signoff", json={"notes": "Track cleared", "resolution": "RESOLVED"})
    assert r.json()["status"] == "RESOLVED" and r.json()["signed_off_by"]
    rep = client.post(f"/api/reports/incident/{iid}").json()
    pdf = client.get(f"/api/reports/{rep['id']}/download")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"


def test_alert_ack_all(client):
    assert client.post("/api/alerts/ack-all").status_code == 200


def test_policy_checks_pass(client):
    checks = client.get("/api/model/performance").json()["risk_policy_checks"]
    assert all(c["passed"] for c in checks)


def test_analyze_image_rejects_non_image(client):
    r = client.post("/api/analyze/image", files={"file": ("notes.txt", b"not an image", "text/plain")})
    assert r.status_code == 400


def test_analyze_image_blank_track_is_safe(client):
    pytest.importorskip("ultralytics")
    import cv2
    import numpy as np

    img = np.full((360, 640, 3), (70, 110, 70), np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    r = client.post("/api/analyze/image", files={"file": ("track.jpg", buf.tobytes(), "image/jpeg")})
    if r.status_code == 503:  # weights not downloadable in this environment
        pytest.skip(r.json()["detail"])
    body = r.json()
    assert r.status_code == 200 and body["level"] == "SAFE" and body["safety_score"] == 100
