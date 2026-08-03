from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

def test_liveness() -> None:
    assert client.get("/internal/v1/health/live").json() == {"status": "ok"}

def test_processing_requires_service_credential() -> None:
    response = client.post("/internal/v1/process-revision", json={})
    assert response.status_code == 401
