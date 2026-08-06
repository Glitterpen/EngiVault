from fastapi.testclient import TestClient

from app.main import app


def test_processor_rejects_large_requests():
    response = TestClient(app).post(
        "/internal/v1/process-next",
        headers={"content-length": "1048577", "x-processor-secret": "invalid"},
    )
    assert response.status_code == 413


def test_processor_adds_security_headers():
    response = TestClient(app).get("/internal/v1/health/live")
    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"
