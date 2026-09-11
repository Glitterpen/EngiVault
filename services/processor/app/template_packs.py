"""Validate, scan and publish immutable project template snapshots."""
from __future__ import annotations

import hashlib
import stat
import tempfile
from pathlib import Path, PurePosixPath
from zipfile import BadZipFile, ZipFile

from .gateway import GatewayError, StorageObjectNotFound, SupabaseGateway
from .malware import MalwareScanner, MalwareScannerUnavailable

MAX_ZIP_BYTES = 50 * 1024 * 1024
MAX_EXPANDED_BYTES = 100 * 1024 * 1024
MAX_FILES = 250
ALLOWED = {".pdf", ".dwg", ".dwt", ".dxf", ".docx", ".dotx", ".xlsx", ".xltx", ".txt"}
OFFICE = {".docx", ".dotx", ".xlsx", ".xltx"}


class TemplatePackError(ValueError):
    pass


def _members(archive: ZipFile, limit: int) -> list:
    members = archive.infolist()
    if len(members) > limit or sum(item.file_size for item in members) > MAX_EXPANDED_BYTES:
        raise TemplatePackError("Template ZIP exceeds the expanded-size or file-count limit.")
    seen = set()
    for item in members:
        path = PurePosixPath(item.filename)
        name = path.as_posix().casefold().rstrip("/")
        if (path.is_absolute() or ".." in path.parts or "\\" in item.orig_filename
                or ":" in item.filename or any(ord(c) < 32 for c in item.orig_filename)
                or any(part.endswith((".", " ")) for part in path.parts)
                or any(c in item.filename for c in '<>|?*')
                or name in seen or item.flag_bits & 1
                or stat.S_ISLNK(item.external_attr >> 16)
                or item.compress_type not in (0, 8)):
            raise TemplatePackError("ZIP contains unsafe paths, duplicates or encrypted files.")
        seen.add(name)
    return members


def validate_template_zip(source: Path, scanner: MalwareScanner) -> int:
    if not 0 < source.stat().st_size <= MAX_ZIP_BYTES:
        raise TemplatePackError("Upload a ZIP no larger than 50 MB.")
    # Disabled/development scanners must never approve a downloadable template pack.
    if scanner.scan(source).status != "clean":
        raise MalwareScannerUnavailable("A clean security scan is required.")
    try:
        with ZipFile(source) as archive, tempfile.TemporaryDirectory(prefix="engicite-templates-") as directory:
            members = _members(archive, MAX_FILES * 2)
            files = [item for item in members if not item.is_dir()]
            if not 1 <= len(files) <= MAX_FILES:
                raise TemplatePackError("Include between 1 and 250 template files.")
            expanded = sum(item.file_size for item in files)
            for index, item in enumerate(files):
                suffix = PurePosixPath(item.filename).suffix.lower()
                if suffix not in ALLOWED:
                    raise TemplatePackError("Use PDF, DWG/DWT/DXF, DOCX/DOTX, XLSX/XLTX or TXT templates; no nested ZIPs or macros.")
                # Never extract user-controlled paths into the filesystem.
                target = Path(directory) / f"file-{index}{suffix}"
                data = archive.read(item)  # Bounded by checked ZIP metadata; also verifies CRC.
                if not data:
                    raise TemplatePackError("Empty template files are not accepted.")
                target.write_bytes(data)
                if suffix in OFFICE:
                    with ZipFile(target) as office:
                        parts = _members(office, 2000)
                        expanded += sum(part.file_size for part in parts)
                        if expanded > MAX_EXPANDED_BYTES:
                            raise TemplatePackError("Expanded templates exceed 100 MB.")
                        names = {part.filename.lower() for part in parts}
                        expected = "word/document.xml" if suffix in {".docx", ".dotx"} else "xl/workbook.xml"
                        if "[content_types].xml" not in names or expected not in names or any("vbaproject" in name for name in names):
                            raise TemplatePackError("Office templates must be valid macro-free documents.")
                        if office.testzip() is not None:
                            raise TemplatePackError("An Office template is damaged.")
                if scanner.scan(target).status != "clean":
                    raise MalwareScannerUnavailable("A clean security scan is required for every template.")
            return len(files)
    except (BadZipFile, RuntimeError, NotImplementedError) as error:
        if isinstance(error, MalwareScannerUnavailable):
            raise
        raise TemplatePackError("The ZIP is damaged, encrypted or unsupported.") from error


def publish_template_pack(gateway: SupabaseGateway, pack_id: str, scanner: MalwareScanner) -> int:
    response = gateway.client.get("/rest/v1/project_template_packs", params={"id": f"eq.{pack_id}", "select": "*"})
    gateway._raise(response, "Template pack unavailable.")
    rows = response.json()
    if len(rows) != 1 or rows[0]["state"] != "pending":
        raise TemplatePackError("This upload is no longer pending. Refresh the project templates.")
    pack = rows[0]
    size = int(pack["byte_size"])
    if not 0 < size <= MAX_ZIP_BYTES:
        raise TemplatePackError("Invalid template size.")
    prefix = f"{pack['organisation_id']}/{pack['project_id']}/{pack['id']}"
    with tempfile.TemporaryDirectory(prefix="engicite-template-scan-") as directory:
        source = Path(directory) / "templates.zip"
        # Gateway is constructed specifically for the private template bucket.
        try:
            gateway._download_processing_object(f"{prefix}/upload.zip", size, source)
        except StorageObjectNotFound as error:
            raise TemplatePackError(
                "The ZIP upload did not complete. Select the ZIP and upload it again before retrying security checks."
            ) from error
        with source.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        if digest != pack["sha256"]:
            raise TemplatePackError("The uploaded ZIP differs from the selected file. Upload it again.")
        count = validate_template_zip(source, scanner)
        # Upload the scanned snapshot, not a server-side copy of a mutable source.
        stored = gateway.client.post(f"/storage/v1/object/project-templates/{prefix}/published.zip",
                                     content=source.read_bytes(), headers={"content-type": "application/zip", "x-upsert": "true"})
        gateway._raise(stored, "Scanned template snapshot could not be stored.")
        result = gateway.client.post("/rest/v1/rpc/publish_project_template_pack",
                                     json={"target_pack": pack_id, "scanned_sha256": digest, "scanned_file_count": count})
        if not result.is_success:
            raise GatewayError("Template publication could not be completed. Refresh and retry.")
        return count
