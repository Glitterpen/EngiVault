import httpx
import pytest

from app.gateway import GatewayError, SupabaseGateway


@pytest.mark.parametrize("fail_second_page", [False, True])
def test_backup_includes_all_scoped_deliverable_requests(fail_second_page: bool) -> None:
    requested: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requested.append(request)
        if request.url.path == "/rest/v1/project_backups":
            return httpx.Response(200, json=[{"id": "backup", "project_id": "project-a"}])
        if request.url.path == "/rest/v1/projects":
            return httpx.Response(200, json=[{"id": "project-a"}])
        if request.url.path == "/rest/v1/deliverable_requests":
            offset = int(request.url.params["offset"])
            if offset == 0:
                # Simulate a server row cap lower than the requested page size.
                return httpx.Response(200, json=[{"id": "request-1", "status": "accepted"}])
            if offset == 1:
                if fail_second_page:
                    return httpx.Response(503, json={"message": "Unavailable"})
                return httpx.Response(200, json=[{"id": "request-2", "status": "pending_pm"}])
        return httpx.Response(200, json=[])

    gateway = SupabaseGateway("https://example.test", "test-only-key", "documents", "test")
    gateway.client.close()
    gateway.client = httpx.Client(base_url="https://example.test", transport=httpx.MockTransport(respond))
    try:
        if fail_second_page:
            with pytest.raises(GatewayError, match="Backup deliverable_requests unavailable"):
                gateway.project_backup_data("backup")
        else:
            _, _, datasets = gateway.project_backup_data("backup")
            assert [row["id"] for row in datasets["deliverable_requests"]] == ["request-1", "request-2"]
        calls = [item for item in requested if item.url.path == "/rest/v1/deliverable_requests"]
        assert len(calls) == (2 if fail_second_page else 3)
        assert all(item.url.params["project_id"] == "eq.project-a" for item in calls)
        assert all(item.url.params["order"] == "created_at.asc,id.asc" for item in calls)
    finally:
        gateway.close()
