from __future__ import annotations

import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from .extraction import ExtractionResult, extract_document
from .malware import (
    DisabledMalwareScanner,
    MalwareDetected,
    MalwareScanner,
    MalwareScannerUnavailable,
    MalwareScanResult,
)
from .validation import FileValidationError, validate_file


@dataclass(frozen=True)
class ProcessingJob:
    run_id: str
    organisation_id: str
    project_id: str
    revision_id: str
    document_id: str
    storage_key: str
    declared_mime: str
    byte_size: int
    sha256: str
    pipeline_version: str
    attempt: int
    native_storage_key: str | None = None
    native_declared_mime: str | None = None
    native_byte_size: int | None = None
    native_sha256: str | None = None


@dataclass(frozen=True)
class ScanReceipt:
    """A processor-recorded clean ClamAV verdict for one validated upload object."""

    file_kind: str
    storage_key: str
    sha256: str
    byte_size: int


class ProcessingGateway(Protocol):
    def claim(self) -> ProcessingJob | None: ...
    def download(self, job: ProcessingJob, target: Path) -> None: ...
    def download_native(self, job: ProcessingJob, target: Path) -> None: ...
    def get_clean_scans(self, job: ProcessingJob) -> list[ScanReceipt]: ...
    def record_clean_scan(self, job: ProcessingJob, receipt: ScanReceipt) -> None: ...
    def replace_units(self, job: ProcessingJob, result: ExtractionResult) -> None: ...
    def replace_search_chunks(self, job: ProcessingJob, result: ExtractionResult,
                              embeddings: list[list[float]], embedding_model: str | None) -> None: ...
    def finish(self, job: ProcessingJob, *, succeeded: bool, retryable: bool,
               detected_mime: str | None, failure_code: str | None,
               failure_detail: str | None, metrics: dict[str, object]) -> None: ...


def _clear_upload(
    gateway: ProcessingGateway,
    job: ProcessingJob,
    scanner: MalwareScanner,
    source: Path,
    identity: ScanReceipt,
    previously_clean: set[ScanReceipt],
) -> tuple[MalwareScanResult, bool]:
    # Callers must validate the actual bytes before matching this identity. No
    # download, comparison or export uses this upload-worker-only checkpoint.
    if identity in previously_clean:
        return MalwareScanResult(status="clean", engine="clamav"), True
    result = scanner.scan(source)
    if isinstance(scanner, DisabledMalwareScanner):
        return result, False  # Never checkpoint a development bypass.
    if result.status != "clean":
        raise MalwareScannerUnavailable("A clean security scan is required.")
    if result.engine == "clamav":
        # Persist the verdict before any later file, parser or indexing step can
        # fail. A network or worker failure without a receipt must never skip a scan.
        gateway.record_clean_scan(job, identity)
    return result, False


def process_next(
    gateway: ProcessingGateway,
    *,
    max_file_bytes: int = 262_144_000,
    embedder: object | None = None,
    malware_scanner: MalwareScanner | None = None,
) -> str:
    job = gateway.claim()
    if job is None:
        return "idle"
    started = time.monotonic()
    detected_mime: str | None = None
    scanner = malware_scanner or DisabledMalwareScanner()
    try:
        with tempfile.TemporaryDirectory(prefix="engicite-processing-") as directory:
            source = Path(directory) / "source.bin"
            gateway.download(job, source)
            validated = validate_file(source, declared_mime=job.declared_mime,
                                      expected_size=job.byte_size, expected_sha256=job.sha256,
                                      max_file_bytes=max_file_bytes)
            detected_mime = validated.detected_mime
            previously_clean = (
                set() if isinstance(scanner, DisabledMalwareScanner) else set(gateway.get_clean_scans(job))
            )
            scan, reused_primary = _clear_upload(
                gateway, job, scanner, source,
                ScanReceipt("primary", job.storage_key, validated.sha256, validated.byte_size),
                previously_clean,
            )
            native_scan = None
            reused_native = None
            native_detected_mime = None
            if job.native_storage_key:
                if not job.native_declared_mime or job.native_byte_size is None or not job.native_sha256:
                    raise FileValidationError(
                        "NATIVE_METADATA_INCOMPLETE",
                        "Editable native source metadata is incomplete.",
                    )
                native_source = Path(directory) / "native-source.bin"
                gateway.download_native(job, native_source)
                native_validated = validate_file(
                    native_source,
                    declared_mime=job.native_declared_mime,
                    expected_size=job.native_byte_size,
                    expected_sha256=job.native_sha256,
                    max_file_bytes=max_file_bytes,
                )
                native_detected_mime = native_validated.detected_mime
                native_scan, reused_native = _clear_upload(
                    gateway, job, scanner, native_source,
                    ScanReceipt("native", job.native_storage_key, native_validated.sha256,
                                native_validated.byte_size),
                    previously_clean,
                )
            result = extract_document(source, validated.detected_mime)
            gateway.replace_units(job, result)
            embeddings: list[list[float]] = []
            embedding_model: str | None = None
            if embedder and result.units:
                try:
                    embeddings = embedder.embed([unit.content for unit in result.units])  # type: ignore[attr-defined]
                    embedding_model = getattr(embedder, "model", None)
                except Exception:  # noqa: BLE001
                    # Extraction and full-text indexing remain available during provider outages/quota exhaustion.
                    embeddings = []
            gateway.replace_search_chunks(job,result,embeddings,embedding_model)
            metrics = {**result.metrics, "preview_strategy": result.preview_strategy,
                       "semantic_indexed": bool(embeddings),
                       "malware_scan": scan.status, "malware_engine": scan.engine,
                       "malware_scan_reused": reused_primary,
                       "native_source_scanned": native_scan is not None,
                       "native_source_mime": native_detected_mime,
                       "native_malware_scan": native_scan.status if native_scan else None,
                       "native_malware_scan_reused": reused_native,
                       "duration_ms": round((time.monotonic() - started) * 1000)}
            gateway.finish(job, succeeded=True, retryable=False, detected_mime=validated.detected_mime,
                           failure_code=None, failure_detail=None, metrics=metrics)
        return "processed"
    except MalwareDetected:
        gateway.finish(job, succeeded=False, retryable=False, detected_mime=detected_mime,
                       failure_code="MALWARE_DETECTED",
                       failure_detail="The uploaded file failed the malware scan.",
                       metrics={"malware_scan": "infected",
                                "duration_ms": round((time.monotonic() - started) * 1000)})
        return "failed"
    except MalwareScannerUnavailable:
        gateway.finish(job, succeeded=False, retryable=True, detected_mime=detected_mime,
                       failure_code="MALWARE_SCANNER_UNAVAILABLE",
                       failure_detail="The security scan could not be completed.",
                       metrics={"malware_scan": "unavailable",
                                "duration_ms": round((time.monotonic() - started) * 1000)})
        return "retrying"
    except FileValidationError as error:
        gateway.finish(job, succeeded=False, retryable=False, detected_mime=None,
                       failure_code=error.code, failure_detail=error.detail,
                       metrics={"duration_ms": round((time.monotonic() - started) * 1000)})
        return "failed"
    # A worker boundary must contain unexpected third-party parser/storage failures so the
    # dispatcher survives; only a fixed safe error is persisted, never the exception text.
    except Exception:  # noqa: BLE001
        gateway.finish(job, succeeded=False, retryable=True, detected_mime=None,
                       failure_code="PROCESSOR_ERROR", failure_detail="A transient processing error occurred.",
                       metrics={"duration_ms": round((time.monotonic() - started) * 1000)})
        return "retrying"
