from __future__ import annotations

import hashlib
import hmac
import zipfile
from dataclasses import dataclass
from pathlib import Path

MIME_PDF = "application/pdf"
MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MIME_DWG = "image/vnd.dwg"


class FileValidationError(ValueError):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class ValidatedFile:
    detected_mime: str
    byte_size: int
    sha256: str


def validate_file(path: Path, *, declared_mime: str, expected_size: int, expected_sha256: str,
                  max_file_bytes: int = 262_144_000, max_uncompressed_bytes: int = 1_073_741_824) -> ValidatedFile:
    size = path.stat().st_size
    if size != expected_size or size < 1 or size > max_file_bytes:
        raise FileValidationError("SIZE_MISMATCH", "File size is invalid or differs from upload metadata.")
    digest = _sha256(path)
    if not hmac.compare_digest(digest, expected_sha256.lower()):
        raise FileValidationError("CHECKSUM_MISMATCH", "File checksum differs from upload metadata.")
    detected = _detect_mime(_header(path))
    if detected is None:
        raise FileValidationError("UNSUPPORTED_SIGNATURE", "File signature is unsupported.")
    if declared_mime in (MIME_DOCX, MIME_XLSX):
        if detected != "application/zip":
            raise FileValidationError("MIME_MISMATCH", "Office file is not a valid ZIP container.")
        _validate_office_container(path, declared_mime, max_uncompressed_bytes)
        detected = declared_mime
    elif detected != declared_mime:
        raise FileValidationError("MIME_MISMATCH", "Detected file type differs from upload metadata.")
    return ValidatedFile(detected_mime=detected, byte_size=size, sha256=digest)


def _header(path: Path) -> bytes:
    with path.open("rb") as stream:
        return stream.read(8)


def _detect_mime(header: bytes) -> str | None:
    if header.startswith(b"%PDF-"): return MIME_PDF
    if header.startswith(b"AC10"): return MIME_DWG
    if header.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")): return "application/zip"
    return None


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _validate_office_container(path: Path, declared_mime: str, max_uncompressed: int) -> None:
    try:
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            if len(entries) > 10_000: raise FileValidationError("ARCHIVE_LIMIT", "Office archive contains too many entries.")
            names = {entry.filename for entry in entries}
            required_prefix = "word/" if declared_mime == MIME_DOCX else "xl/"
            if "[Content_Types].xml" not in names or not any(name.startswith(required_prefix) for name in names):
                raise FileValidationError("OFFICE_STRUCTURE", "Office archive structure does not match its type.")
            total = 0
            for entry in entries:
                total += entry.file_size
                if total > max_uncompressed: raise FileValidationError("ARCHIVE_LIMIT", "Office archive exceeds decompression limits.")
                if entry.compress_size and entry.file_size / entry.compress_size > 100:
                    raise FileValidationError("ARCHIVE_RATIO", "Office archive compression ratio is unsafe.")
    except zipfile.BadZipFile as exc:
        raise FileValidationError("INVALID_ARCHIVE", "Office file is not a valid archive.") from exc
