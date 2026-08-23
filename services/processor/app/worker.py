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


class ProcessingGateway(Protocol):
    def claim(self) -> ProcessingJob | None: ...
    def download(self, job: ProcessingJob, target: Path) -> None: ...
    def download_native(self, job: ProcessingJob, target: Path) -> None: ...
    def replace_units(self, job: ProcessingJob, result: ExtractionResult) -> None: ...
    def replace_search_chunks(self, job: ProcessingJob, result: ExtractionResult,
                              embeddings: list[list[float]], embedding_model: str | None) -> None: ...
    def finish(self, job: ProcessingJob, *, succeeded: bool, retryable: bool,
               detected_mime: str | None, failure_code: str | None,
               failure_detail: str | None, metrics: dict[str, object]) -> None: ...


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
            scan = scanner.scan(source)
            native_scan = None
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
                native_scan = scanner.scan(native_source)
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
                       "native_source_scanned": native_scan is not None,
                       "native_source_mime": native_detected_mime,
                       "native_malware_scan": native_scan.status if native_scan else None,
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
