from fastapi.testclient import TestClient

from app.main import _requests, app


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


def test_rotating_invalid_credentials_cannot_bypass_rate_limit():
    _requests.clear()
    client = TestClient(app)

    for index in range(30):
        response = client.post(
            "/internal/v1/process-next",
            headers={"x-processor-secret": f"invalid-{index}"},
        )
        assert response.status_code == 401

    blocked = client.post(
        "/internal/v1/process-next",
        headers={"x-processor-secret": "another-invalid-value"},
    )

    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == "60"
    _requests.clear()
