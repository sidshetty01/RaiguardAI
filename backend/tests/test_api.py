"""API integration tests against a temporary SQLite database."""
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


def _token(client, user="admin", pw="admin123"):
    r = client.post("/api/auth/login", json={"username": user, "password": pw})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_login_rejects_bad_password(client):
    assert client.post("/api/auth/login", json={"username": "admin", "password": "nope"}).status_code == 401


def test_requires_auth(client):
    assert client.get("/api/incidents").status_code == 401


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
    ],
)
def test_read_endpoints(client, path):
    assert client.get(path, headers=_token(client)).status_code == 200


def test_incident_workflow_and_report(client):
    h = _token(client)
    items = client.get("/api/incidents?page_size=5&level=CRITICAL", headers=h).json()["items"]
    assert items
    iid = items[0]["id"]
    detail = client.get(f"/api/incidents/{iid}", headers=h).json()
    assert detail["factors"] and detail["snapshot"]
    r = client.post(f"/api/incidents/{iid}/signoff", json={"notes": "Track cleared", "resolution": "RESOLVED"}, headers=h)
    assert r.json()["status"] == "RESOLVED" and r.json()["signed_off_by"]
    rep = client.post(f"/api/reports/incident/{iid}", headers=h).json()
    pdf = client.get(f"/api/reports/{rep['id']}/download", headers=h)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"


def test_viewer_is_read_only(client):
    v = _token(client, "viewer", "viewer123")
    assert client.post("/api/alerts/ack-all", headers=v).status_code == 403
    assert client.put("/api/settings", json={"auto_scenarios": False}, headers=v).status_code == 403


def test_policy_checks_pass(client):
    checks = client.get("/api/model/performance", headers=_token(client)).json()["risk_policy_checks"]
    assert all(c["passed"] for c in checks)
