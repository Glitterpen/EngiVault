import json
from collections.abc import Callable

import httpx
import pytest

from app.gateway import GatewayError, SupabaseGateway
from app.worker import ProcessingJob, ScanReceipt

PRIMARY = {"file_kind": "primary", "storage_key": "test/source.pdf", "sha256": "a" * 64, "byte_size": 47}
NATIVE = {"file_kind": "native", "storage_key": "test/source.dwg", "sha256": "b" * 64, "byte_size": 33}
JOB = ProcessingJob(
    run_id="10000000-0000-4000-8000-000000000001", organisation_id="org", project_id="project",
    revision_id="revision", document_id="document", storage_key="test/source.pdf",
    declared_mime="application/pdf", byte_size=47, sha256="a" * 64, pipeline_version="v2-search",
    attempt=3, native_storage_key="test/source.dwg", native_declared_mime="image/vnd.dwg",
    native_byte_size=33, native_sha256="b" * 64,
)


def gateway_with_handler(handler: Callable[[httpx.Request], httpx.Response]) -> SupabaseGateway:
    gateway = SupabaseGateway("https://example.test", "test-service-key", "documents", "test")
    headers = gateway.client.headers
    gateway.client.close()
    gateway.client = httpx.Client(
        base_url="https://example.test", headers=headers, transport=httpx.MockTransport(handler),
    )
    return gateway


def test_clean_scan_receipts_use_service_rpcs_scoped_to_current_run_and_attempt() -> None:
    calls = []

    def respond(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.headers["authorization"] == "Bearer test-service-key"
        assert request.headers["apikey"] == "test-service-key"
        calls.append((request.url.path, json.loads(request.content)))
        if request.url.path.endswith("/get_revision_clean_scans"):
            return httpx.Response(200, json=[PRIMARY, NATIVE])
        assert request.url.path.endswith("/record_revision_clean_scan")
        return httpx.Response(204)

    gateway = gateway_with_handler(respond)
    try:
        receipts = gateway.get_clean_scans(JOB)
        assert receipts == [
            ScanReceipt("primary", "test/source.pdf", "a" * 64, 47),
            ScanReceipt("native", "test/source.dwg", "b" * 64, 33),
        ]
        gateway.record_clean_scan(JOB, receipts[1])
    finally:
        gateway.close()

    scope = {"target_run": JOB.run_id, "target_attempt": 3}
    assert calls == [
        ("/rest/v1/rpc/get_revision_clean_scans", scope),
        ("/rest/v1/rpc/record_revision_clean_scan", {
            **scope, "file_kind": "native", "verified_storage_key": "test/source.dwg",
            "verified_sha256": "b" * 64, "verified_byte_size": 33,
        }),
    ]


def test_clean_scan_receipts_can_be_absent() -> None:
    gateway = gateway_with_handler(lambda _: httpx.Response(200, json=[]))
    try:
        assert gateway.get_clean_scans(JOB) == []
    finally:
        gateway.close()


@pytest.mark.parametrize("body", [
    b"not JSON", b"null", b"{}", b"[1]",
    json.dumps([PRIMARY, PRIMARY]).encode(),
    json.dumps([PRIMARY, {**NATIVE, "storage_key": " "}]).encode(),
    json.dumps([{**PRIMARY, "file_kind": "main"}]).encode(),
    json.dumps([{**PRIMARY, "sha256": "not-a-sha-256"}]).encode(),
    json.dumps([{**PRIMARY, "byte_size": True}]).encode(),
    json.dumps([{**PRIMARY, "byte_size": -1}]).encode(),
])
def test_rejects_entire_malformed_receipt_response(body: bytes) -> None:
    gateway = gateway_with_handler(lambda _: httpx.Response(200, content=body))
    try:
        with pytest.raises(GatewayError, match="Invalid clean scan receipts"):
            gateway.get_clean_scans(JOB)
    finally:
        gateway.close()


@pytest.mark.parametrize("status", [302, 403, 409, 503])
def test_read_and_write_fail_on_unsuccessful_rpc_status_even_with_valid_body(status: int) -> None:
    gateway = gateway_with_handler(lambda _: httpx.Response(status, json=[PRIMARY]))
    try:
        with pytest.raises(GatewayError, match="Clean scan receipts could not be loaded"):
            gateway.get_clean_scans(JOB)
        with pytest.raises(GatewayError, match="Clean scan receipt could not be recorded"):
            gateway.record_clean_scan(JOB, ScanReceipt("primary", "test/source.pdf", "a" * 64, 47))
    finally:
        gateway.close()
