import hashlib
from dataclasses import replace
from pathlib import Path
from unittest.mock import Mock

import pytest
from openpyxl import Workbook
from pypdf import PdfWriter

from app.extraction import ExtractionResult
from app.malware import MalwareDetected, MalwareScannerUnavailable, MalwareScanResult
from app.validation import MIME_PDF, MIME_XLSX
from app.worker import ProcessingJob, ScanReceipt, process_next


class FakeGateway:
    def __init__(self, content: bytes, job: ProcessingJob | None, native_content: bytes | None = None) -> None:
        self.content = content
        self.native_content = native_content
        self.job = job
        self.result: ExtractionResult | None = None
        self.finished: dict[str, object] | None = None
        self.receipts: dict[tuple[str, str, str], list[ScanReceipt]] = {}

    def claim(self) -> ProcessingJob | None:
        job, self.job = self.job, None
        return job

    def download(self, job: ProcessingJob, target: Path) -> None:
        target.write_bytes(self.content)

    def download_native(self, job: ProcessingJob, target: Path) -> None:
        assert self.native_content is not None
        target.write_bytes(self.native_content)

    def get_clean_scans(self, job: ProcessingJob) -> list[ScanReceipt]:
        return self.receipts.get((job.organisation_id, job.project_id, job.revision_id), [])

    def record_clean_scan(self, job: ProcessingJob, receipt: ScanReceipt) -> None:
        self.receipts.setdefault((job.organisation_id, job.project_id, job.revision_id), []).append(receipt)

    def replace_units(self, job: ProcessingJob, result: ExtractionResult) -> None:
        self.result = result

    def replace_search_chunks(self, job: ProcessingJob, result: ExtractionResult,
                              embeddings: list[list[float]], embedding_model: str | None) -> None:
        self.result=result

    def finish(self, job: ProcessingJob, **result: object) -> None:
        self.finished = result


def test_xlsx_submission_processes_from_extensionless_quarantine_file(tmp_path: Path) -> None:
    workbook = Workbook()
    workbook.active.append(["Document number", "Revision"])
    workbook.active.append(["ELE-001", "IFR"])
    path = tmp_path / "deliverable.xlsx"
    workbook.save(path)
    workbook.close()
    content = path.read_bytes()
    job = replace(job_for(content), declared_mime=MIME_XLSX)
    gateway = FakeGateway(content, job)

    class CleanScanner:
        def scan(self, _: Path) -> MalwareScanResult:
            return MalwareScanResult(status="clean", engine="test")

    assert process_next(gateway, malware_scanner=CleanScanner()) == "processed"
    assert gateway.finished is not None and gateway.finished["succeeded"] is True
    assert gateway.finished["metrics"]["malware_scan"] == "clean"
    assert gateway.result is not None
    assert gateway.result.units[1].locator_type == "sheet_range"
    assert "ELE-001" in gateway.result.units[1].content


def job_for(content: bytes) -> ProcessingJob:
    return ProcessingJob(run_id="10000000-0000-0000-0000-000000000001",
                         organisation_id="20000000-0000-0000-0000-000000000001",
                         project_id="30000000-0000-0000-0000-000000000001",
                         revision_id="40000000-0000-0000-0000-000000000001",
                         document_id="50000000-0000-0000-0000-000000000001",
                         storage_key="organisations/200/projects/300/revisions/400/drawing.pdf",
                         declared_mime=MIME_PDF, byte_size=len(content),
                         sha256=hashlib.sha256(content).hexdigest(), pipeline_version="v1", attempt=1)


def job_with_native(content: bytes, native: bytes) -> ProcessingJob:
    job = job_for(content)
    return replace(
        job,
        native_storage_key="organisations/200/projects/300/revisions/400/native/drawing.dwg",
        native_declared_mime="image/vnd.dwg",
        native_byte_size=len(native),
        native_sha256=hashlib.sha256(native).hexdigest(),
    )


def pdf_bytes(tmp_path: Path) -> bytes:
    path = tmp_path / "source.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    with path.open("wb") as stream:
        writer.write(stream)
    return path.read_bytes()


def test_process_next_commits_extracted_units(tmp_path: Path) -> None:
    content = pdf_bytes(tmp_path)
    gateway = FakeGateway(content, job_for(content))
    assert process_next(gateway) == "processed"
    assert gateway.result is not None
    assert gateway.result.units[0].page_number == 1
    assert gateway.finished is not None and gateway.finished["succeeded"] is True


def test_native_source_is_validated_and_malware_scanned(tmp_path: Path) -> None:
    class TrackingScanner:
        def __init__(self) -> None:
            self.scans = 0

        def scan(self, _: Path) -> MalwareScanResult:
            self.scans += 1
            return MalwareScanResult(status="clean", engine="test")

        def ready(self) -> None:
            return None

    content = pdf_bytes(tmp_path)
    native = b"AC1032 editable drawing source"
    scanner = TrackingScanner()
    gateway = FakeGateway(content, job_with_native(content, native), native)

    assert process_next(gateway, malware_scanner=scanner) == "processed"
    assert scanner.scans == 2
    assert gateway.finished is not None
    assert gateway.finished["metrics"]["native_source_scanned"] is True  # type: ignore[index]


def test_invalid_native_source_fails_the_complete_revision(tmp_path: Path) -> None:
    content = pdf_bytes(tmp_path)
    native = b"MZ renamed executable"
    gateway = FakeGateway(content, job_with_native(content, native), native)

    assert process_next(gateway) == "failed"
    assert gateway.finished is not None
    assert gateway.finished["failure_code"] == "UNSUPPORTED_SIGNATURE"


def test_invalid_signature_fails_without_storing_units() -> None:
    content = b"MZ\x90\x00renamed executable"
    gateway = FakeGateway(content, job_for(content))
    assert process_next(gateway) == "failed"
    assert gateway.result is None
    assert gateway.finished is not None
    assert gateway.finished["failure_code"] == "UNSUPPORTED_SIGNATURE"


def test_idle_queue_performs_no_mutation() -> None:
    gateway = FakeGateway(b"", None)
    assert process_next(gateway) == "idle"
    assert gateway.finished is None


def test_embedding_failure_still_completes_full_text_processing(tmp_path: Path) -> None:
    class FailedEmbedder:
        model = "unavailable-model"

        def embed(self, _: list[str]) -> list[list[float]]:
            raise RuntimeError("provider unavailable")

    content = pdf_bytes(tmp_path)
    gateway = FakeGateway(content, job_for(content))
    assert process_next(gateway, embedder=FailedEmbedder()) == "processed"
    assert gateway.finished is not None
    assert gateway.finished["succeeded"] is True
    assert gateway.finished["metrics"]["semantic_indexed"] is False  # type: ignore[index]


def test_detected_malware_never_reaches_document_parser(tmp_path: Path) -> None:
    class InfectedScanner:
        def scan(self, _: Path) -> MalwareScanResult:
            raise MalwareDetected("detected")

        def ready(self) -> None:
            return None

    content = pdf_bytes(tmp_path)
    gateway = FakeGateway(content, job_for(content))

    assert process_next(gateway, malware_scanner=InfectedScanner()) == "failed"
    assert gateway.result is None
    assert gateway.finished is not None
    assert gateway.finished["failure_code"] == "MALWARE_DETECTED"
    assert gateway.finished["retryable"] is False


def test_unavailable_scanner_keeps_revision_quarantined_for_retry(tmp_path: Path) -> None:
    class UnavailableScanner:
        def scan(self, _: Path) -> MalwareScanResult:
            raise MalwareScannerUnavailable("unavailable")

        def ready(self) -> None:
            return None

    content = pdf_bytes(tmp_path)
    gateway = FakeGateway(content, job_for(content))

    assert process_next(gateway, malware_scanner=UnavailableScanner()) == "retrying"
    assert gateway.result is None
    assert gateway.finished is not None
    assert gateway.finished["failure_code"] == "MALWARE_SCANNER_UNAVAILABLE"
    assert gateway.finished["retryable"] is True
    assert not gateway.receipts


def clamav_mock() -> Mock:
    scanner = Mock(spec=["scan"])
    scanner.scan.return_value = MalwareScanResult("clean", "clamav")
    return scanner


def test_retry_after_indexing_failure_reuses_both_clean_upload_scans(tmp_path, monkeypatch):
    content = pdf_bytes(tmp_path)
    native = b"AC1032 editable drawing source"
    job = job_with_native(content, native)
    gateway = FakeGateway(content, job, native)
    write_index = gateway.replace_search_chunks
    monkeypatch.setattr(gateway, "replace_search_chunks", Mock(side_effect=RuntimeError()))
    first_worker = clamav_mock()

    assert process_next(gateway, malware_scanner=first_worker) == "retrying"
    assert first_worker.scan.call_count == 2
    assert [proof.file_kind for proof in gateway.get_clean_scans(job)] == ["primary", "native"]

    # The proof is persisted outside either worker instance. Both downloads and
    # their integrity checks still run before the saved verdict is reused.
    gateway.job = replace(job, attempt=2)
    monkeypatch.setattr(gateway, "replace_search_chunks", write_index)
    retry_worker = clamav_mock()
    retry_worker.scan.side_effect = AssertionError("unexpected duplicate scan")
    assert process_next(gateway, malware_scanner=retry_worker) == "processed"
    retry_worker.scan.assert_not_called()
    assert gateway.finished["metrics"]["malware_scan_reused"] is True
    assert gateway.finished["metrics"]["native_malware_scan_reused"] is True


def test_native_scanner_failure_retries_only_the_unverified_file(tmp_path):
    content = pdf_bytes(tmp_path)
    native = b"AC1032 editable drawing source"
    job = job_with_native(content, native)
    gateway = FakeGateway(content, job, native)
    original = clamav_mock()
    original.scan.side_effect = [MalwareScanResult("clean", "clamav"), MalwareScannerUnavailable()]

    assert process_next(gateway, malware_scanner=original) == "retrying"
    assert [proof.file_kind for proof in gateway.get_clean_scans(job)] == ["primary"]
    assert gateway.result is None

    gateway.job = replace(job, attempt=2)
    retry = clamav_mock()
    assert process_next(gateway, malware_scanner=retry) == "processed"
    assert retry.scan.call_count == 1
    assert retry.scan.call_args.args[0].name == "native-source.bin"
    assert gateway.finished["metrics"]["malware_scan_reused"] is True
    assert gateway.finished["metrics"]["native_malware_scan_reused"] is False


@pytest.mark.parametrize("stale", [
    {"file_kind": "native"}, {"storage_key": "other-object"},
    {"sha256": "0" * 64}, {"byte_size": 1},
])
def test_stale_receipt_does_not_clear_an_upload(tmp_path, stale):
    content = pdf_bytes(tmp_path)
    job = job_for(content)
    gateway = FakeGateway(content, job)
    receipt = ScanReceipt("primary", job.storage_key, job.sha256, job.byte_size)
    gateway.record_clean_scan(job, replace(receipt, **stale))

    scanner = clamav_mock()
    assert process_next(gateway, malware_scanner=scanner) == "processed"
    assert scanner.scan.call_count == 1
    assert gateway.finished["metrics"]["malware_scan_reused"] is False


def test_valid_receipt_cannot_clear_altered_storage_bytes(tmp_path):
    content = pdf_bytes(tmp_path)
    job = job_for(content)
    altered = content[:-1] + b"X"
    gateway = FakeGateway(altered, job)
    gateway.record_clean_scan(job, ScanReceipt("primary", job.storage_key, job.sha256, job.byte_size))
    scanner = clamav_mock()

    assert process_next(gateway, malware_scanner=scanner) == "failed"
    assert gateway.finished["failure_code"] == "CHECKSUM_MISMATCH"
    assert gateway.result is None
    scanner.scan.assert_not_called()


def test_missing_receipt_cannot_be_created_by_a_disabled_scan(tmp_path):
    content = pdf_bytes(tmp_path)
    gateway = FakeGateway(content, job_for(content))
    assert process_next(gateway) == "processed"
    assert not gateway.receipts
    assert gateway.finished["metrics"]["malware_scan"] == "disabled"


def test_unexpected_scanner_status_never_reaches_extraction(tmp_path):
    content = pdf_bytes(tmp_path)
    gateway = FakeGateway(content, job_for(content))
    scanner = clamav_mock()
    scanner.scan.return_value = MalwareScanResult("unknown", "clamav")

    assert process_next(gateway, malware_scanner=scanner) == "retrying"
    assert gateway.result is None
    assert not gateway.receipts


def test_receipt_write_failure_keeps_unfinished_upload_quarantined(tmp_path, monkeypatch):
    content = pdf_bytes(tmp_path)
    job = job_for(content)
    gateway = FakeGateway(content, job)
    monkeypatch.setattr(gateway, "record_clean_scan", Mock(side_effect=RuntimeError()))
    scanner = clamav_mock()

    assert process_next(gateway, malware_scanner=scanner) == "retrying"
    assert gateway.finished["failure_code"] == "PROCESSOR_ERROR"
    assert gateway.result is None
    assert not gateway.receipts
