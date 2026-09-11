import hashlib
import io
import stat
from types import SimpleNamespace
from unittest.mock import Mock
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

import httpx
import pytest
from fastapi.testclient import TestClient

from app.gateway import GatewayError, SupabaseGateway
from app.malware import (
    DisabledMalwareScanner,
    MalwareDetected,
    MalwareScannerUnavailable,
    MalwareScanResult,
)
from app.template_packs import TemplatePackError, publish_template_pack, validate_template_zip


class CleanScanner:
    def scan(self, path):
        if b"MALWARE" in path.read_bytes():
            raise MalwareDetected("infected")
        return MalwareScanResult("clean", "test")


def archive(files):
    content = io.BytesIO()
    with ZipFile(content, "w", ZIP_DEFLATED) as target:
        for name, data in files:
            if isinstance(name, str):
                info = ZipInfo(name)
                info.filename = name  # Preserve unsafe names even on Windows.
                info.compress_type = ZIP_DEFLATED
            else:
                info = name
            target.writestr(info, data)
    return content.getvalue()


def source(tmp_path, files):
    path = tmp_path / "pack.zip"
    path.write_bytes(archive(files))
    return path


def test_template_pack_accepts_all_requested_categories(tmp_path):
    word = archive([("[Content_Types].xml", b"types"), ("word/document.xml", b"document")])
    sheet = archive([("[Content_Types].xml", b"types"), ("xl/workbook.xml", b"workbook")])
    path = source(tmp_path, [("Drawing/backsheet.dwt", b"AC1027"), ("Word/report.dotx", word),
                             ("Lists/list.xlsx", sheet), ("MTO/MTO.xltx", sheet)])
    assert validate_template_zip(path, CleanScanner()) == 4


@pytest.mark.parametrize("name", ["../escape.txt", "/root.txt", "c:/file.txt", "dir\\file.txt",
                                 "file.exe", "inner.zip", "macros.xlsm", "dir./file.txt", "file.txt "])
def test_rejects_unsafe_archive_entries(tmp_path, name):
    with pytest.raises(TemplatePackError):
        validate_template_zip(source(tmp_path, [(name, b"content")]), CleanScanner())


def test_duplicate_names_and_symlinks_are_rejected(tmp_path):
    with pytest.raises(TemplatePackError):
        validate_template_zip(source(tmp_path, [("File.txt", b"a"), ("file.txt", b"b")]), CleanScanner())
    link = ZipInfo("link.txt")
    link.create_system = 3
    link.external_attr = (stat.S_IFLNK | 0o777) << 16
    with pytest.raises(TemplatePackError):
        validate_template_zip(source(tmp_path, [(link, b"target")]), CleanScanner())


def test_archive_must_be_scanned_fail_closed(tmp_path):
    path = source(tmp_path, [("readme.txt", b"guide")])
    with pytest.raises(MalwareScannerUnavailable):
        validate_template_zip(path, DisabledMalwareScanner())
    with pytest.raises(MalwareDetected):
        validate_template_zip(source(tmp_path, [("readme.txt", b"MALWARE")]), CleanScanner())


def test_office_macros_and_corruption_rejected(tmp_path):
    macro = archive([("[Content_Types].xml", b"types"), ("word/document.xml", b"doc"), ("word/vbaProject.bin", b"macro")])
    for value in (macro, b"not an Office file"):
        with pytest.raises(TemplatePackError):
            validate_template_zip(source(tmp_path, [("report.docx", value)]), CleanScanner())


def test_empty_excess_files_and_expanded_limit(tmp_path, monkeypatch):
    with pytest.raises(TemplatePackError):
        validate_template_zip(source(tmp_path, []), CleanScanner())
    with pytest.raises(TemplatePackError):
        validate_template_zip(source(tmp_path, [(f"{n}.txt", b"guide") for n in range(251)]), CleanScanner())
    monkeypatch.setattr("app.template_packs.MAX_EXPANDED_BYTES", 10)
    with pytest.raises(TemplatePackError):
        validate_template_zip(source(tmp_path, [("readme.txt", b"x" * 11)]), CleanScanner())


def gateway_fixture(content, *, state="pending", digest=None, download_error=None):
    events = []
    def handler(request):
        events.append(request)
        if request.url.path == "/rest/v1/project_template_packs":
            return httpx.Response(200, json=[{"id": "pack", "organisation_id": "org", "project_id": "project",
                  "state": state, "byte_size": len(content), "sha256": digest or hashlib.sha256(content).hexdigest()}])
        if request.method == "GET":
            if download_error is not None:
                status, body = download_error
                return httpx.Response(status, json=body)
            return httpx.Response(200, content=content)
        return httpx.Response(200, json=None)
    gateway = SupabaseGateway("https://example.test", "secret", "project-templates", "test")
    gateway.client.close()
    gateway.client = httpx.Client(base_url="https://example.test", transport=httpx.MockTransport(handler))
    return gateway, events


def test_publishes_exact_scanned_snapshot_not_mutable_source():
    content = archive([("guide.txt", b"approved")])
    gateway, events = gateway_fixture(content)
    try:
        assert publish_template_pack(gateway, "pack", CleanScanner()) == 1
        posts = [event for event in events if event.method == "POST"]
        assert posts[0].url.path.endswith("/published.zip")
        assert posts[0].content == content
        assert posts[1].url.path.endswith("/publish_project_template_pack")
    finally:
        gateway.close()


@pytest.mark.parametrize("options", [{"state": "cancelled"}, {"digest": "0" * 64}])
def test_stale_or_changed_upload_is_never_published(options):
    gateway, events = gateway_fixture(archive([("guide.txt", b"approved")]), **options)
    try:
        with pytest.raises(TemplatePackError):
            publish_template_pack(gateway, "pack", CleanScanner())
        assert not any(event.method == "POST" for event in events)
    finally:
        gateway.close()


MISSING_STORAGE_OBJECT = {
    "statusCode": "404", "error": "not_found", "message": "Object not found", "code": "NoSuchKey",
}


@pytest.mark.parametrize("download_error", [(400, MISSING_STORAGE_OBJECT), (404, {"message": "Not found"})])
def test_missing_upload_requires_reupload_without_scanning_or_publishing(download_error):
    gateway, events = gateway_fixture(archive([("guide.txt", b"approved")]), download_error=download_error)
    scanner = Mock(spec=["scan"])
    try:
        with pytest.raises(TemplatePackError, match="Select the ZIP and upload it again"):
            publish_template_pack(gateway, "pack", scanner)
        scanner.scan.assert_not_called()
        assert not any(event.method == "POST" for event in events)
    finally:
        gateway.close()


@pytest.mark.parametrize("download_error", [
    (403, {"message": "Forbidden"}),
    (500, {"message": "Service unavailable"}),
    (400, {"statusCode": "403", "error": "Unauthorized", "message": "Access denied"}),
    (400, {"statusCode": "404", "error": "not_found", "message": "Bucket not found"}),
    (400, {"statusCode": "400", "message": "Invalid request"}),
    (400, "Bad request"),
])
def test_storage_errors_are_not_misreported_as_missing_uploads(download_error):
    gateway, events = gateway_fixture(archive([("guide.txt", b"approved")]), download_error=download_error)
    scanner = Mock(spec=["scan"])
    try:
        with pytest.raises(GatewayError, match="Object download failed"):
            publish_template_pack(gateway, "pack", scanner)
        scanner.scan.assert_not_called()
        assert not any(event.method == "POST" for event in events)
    finally:
        gateway.close()


@pytest.mark.parametrize("download_error,expected_status", [
    ((400, MISSING_STORAGE_OBJECT), 422),
    ((404, {"message": "Not found"}), 422),
    ((403, {"message": "Forbidden"}), 503),
    ((500, {"message": "Service unavailable"}), 503),
])
def test_template_endpoint_distinguishes_missing_bytes_from_service_failures(monkeypatch, download_error, expected_status):
    from app import main

    gateway, events = gateway_fixture(archive([("guide.txt", b"approved")]), download_error=download_error)
    scanner = Mock(spec=["scan"])
    secret = "test-template-service-secret-32-characters"
    monkeypatch.setattr(main, "settings", lambda: SimpleNamespace(
        processor_shared_secret=secret, supabase_url="https://example.test", supabase_service_role_key="test-key",
        worker_name="test", malware_scan_mode="clamav", clamav_host="scanner.test", clamav_port=3310,
        clamav_timeout_seconds=120,
    ))
    monkeypatch.setattr(main, "SupabaseGateway", lambda *_args: gateway)
    monkeypatch.setattr(main, "build_malware_scanner", lambda *_args, **_kwargs: scanner)
    response = TestClient(main.app).post(
        "/internal/v1/publish-template-pack",
        headers={"x-processor-secret": secret},
        json={"pack_id": "11111111-1111-4111-8111-111111111111"},
    )
    assert response.status_code == expected_status
    if expected_status == 422:
        assert "Select the ZIP and upload it again" in response.json()["detail"]
    else:
        assert "Select the ZIP" not in response.json()["detail"]
    scanner.scan.assert_not_called()
    assert not any(event.method == "POST" for event in events)
    assert gateway.client.is_closed
