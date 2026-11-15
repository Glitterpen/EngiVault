from collections.abc import Callable

import httpx
import pytest

from app.gateway import GatewayError, SupabaseGateway


def gateway_with_handler(handler: Callable[[httpx.Request], httpx.Response]) -> SupabaseGateway:
    gateway = SupabaseGateway("https://example.test", "test-only-key", "documents", "test")
    gateway.client.close()
    gateway.client = httpx.Client(
        base_url="https://example.test", transport=httpx.MockTransport(handler),
    )
    return gateway


def test_reads_entire_frozen_register_and_fetches_only_included_revisions_in_batches():
    frozen_revision_ids = [f"00000000-0000-4000-8000-{index:012d}" for index in range(1_101)]
    rows = [{"revision_id": rev_id, "inclusion_state": "included"} for rev_id in frozen_revision_ids]
    rows.insert(1000, {"revision_id": "not-selected", "inclusion_state": "excluded"})
    page_offsets = []
    batches = []

    def respond(request: httpx.Request) -> httpx.Response:
        query = request.url.params
        if request.url.path == "/rest/v1/work_packages":
            assert query["id"] == "eq.package-a"
            return httpx.Response(200, json=[{"id": "package-a"}])
        if request.url.path == "/rest/v1/work_package_items":
            assert query["work_package_id"] == "eq.package-a"
            assert query["order"] == "discipline.asc,document_number.asc,id.asc"
            offset = int(query["offset"])
            page_offsets.append(offset)
            # The server's ceiling can be lower than the requested page size.
            return httpx.Response(200, json=rows[offset:offset + min(int(query["limit"]), 300)])
        assert request.url.path == "/rest/v1/document_revisions"
        ids = query["id"].removeprefix("in.(").removesuffix(")").split(",")
        assert len(ids) <= 100
        assert len(str(request.url)) < 5000
        batches.extend(ids)
        return httpx.Response(200, json=[{"id": rev_id} for rev_id in ids])

    gateway = gateway_with_handler(respond)
    try:
        package, items, revisions = gateway.package_data("package-a")
    finally:
        gateway.close()

    assert package["id"] == "package-a"
    assert items == rows
    assert page_offsets == [0, 300, 600, 900, 1102]
    assert batches == frozen_revision_ids
    assert list(revisions) == frozen_revision_ids


def test_missing_selected_revision_fails_closed_instead_of_returning_partial_data():
    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/rest/v1/work_packages":
            return httpx.Response(200, json=[{"id": "package-a"}])
        if request.url.path == "/rest/v1/work_package_items" and request.url.params["offset"] == "0":
            return httpx.Response(200, json=[{"revision_id": "selected", "inclusion_state": "included"}])
        return httpx.Response(200, json=[])

    gateway = gateway_with_handler(respond)
    try:
        with pytest.raises(GatewayError, match="Frozen revision unavailable"):
            gateway.package_data("package-a")
    finally:
        gateway.close()
