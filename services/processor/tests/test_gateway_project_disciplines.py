import httpx

from app.gateway import SupabaseGateway


def test_project_backup_includes_scoped_discipline_catalogue() -> None:
    requested: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requested.append(request)
        if request.url.path == "/rest/v1/project_backups":
            return httpx.Response(200, json=[{"id": "backup", "project_id": "project-a"}])
        if request.url.path == "/rest/v1/projects":
            return httpx.Response(200, json=[{"id": "project-a"}])
        if request.url.path == "/rest/v1/project_disciplines":
            if request.url.params.get("offset") != "0":
                return httpx.Response(200, json=[])
            return httpx.Response(200, json=[{"name": "HVAC", "code": None, "source": "mdr"}])
        return httpx.Response(200, json=[])

    gateway = SupabaseGateway("https://example.test", "test-only-key", "documents", "test")
    gateway.client.close()
    gateway.client = httpx.Client(base_url="https://example.test", transport=httpx.MockTransport(respond))
    try:
        _, _, datasets = gateway.project_backup_data("backup")
        assert datasets["project_disciplines"] == [{"name": "HVAC", "code": None, "source": "mdr"}]
        discipline_request = next(item for item in requested if item.url.path == "/rest/v1/project_disciplines")
        assert discipline_request.url.params["project_id"] == "eq.project-a"
    finally:
        gateway.close()
