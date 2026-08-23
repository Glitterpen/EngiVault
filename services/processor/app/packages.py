from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import tempfile
import zipfile
from pathlib import Path

from .electronic_seal import ElectronicSealer
from .gateway import GatewayError, SupabaseGateway
from .transmittals import build_transmittal_pdf


def _safe_filename(value: object) -> str:
    return re.sub(r"[^A-Za-z0-9_. -]", "_", str(value))


def _verified_source(
    gateway: SupabaseGateway,
    storage_key: str,
    expected_sha256: str,
    target: Path,
    *,
    max_bytes: int = 2_147_483_648,
) -> str:
    gateway.download_key(storage_key, target, max_bytes=max_bytes)
    hasher = hashlib.sha256()
    with target.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    digest = hasher.hexdigest()
    if digest != expected_sha256:
        raise GatewayError("Frozen revision checksum mismatch.")
    return digest


def build_package(
    gateway: SupabaseGateway,
    package_id: str,
    electronic_sealer: ElectronicSealer | None = None,
) -> dict[str, object]:
    package, items, revisions = gateway.package_data(package_id)
    safe_number = re.sub(r"[^A-Za-z0-9_-]", "_", str(package["package_number"]))
    storage_key = (
        f"organisations/{package['organisation_id']}/projects/{package['project_id']}/"
        f"packages/{package_id}/{safe_number}_V{package['version']}.zip"
    )
    manifest_value = package.get("manifest")
    manifest: dict[str, object] = manifest_value if isinstance(manifest_value, dict) else {}
    is_transmittal = manifest.get("kind") == "document_transmittal"
    control_folder = "00 - Transmittal Control" if is_transmittal else "00 - Package Control"
    checksums: list[str] = []
    included = 0
    native_sources = 0
    seal_evidence: dict[str, object] | None = None

    with tempfile.TemporaryDirectory(prefix="engicite-package-") as temporary:
        root = Path(temporary)
        archive = root / "package.zip"
        manifest_rows = []
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as output:
            for item in items:
                manifest_rows.append(
                    {key: item.get(key) for key in (
                        "document_id", "revision_id", "document_number", "discipline",
                        "document_type", "revision_code", "issue_status", "inclusion_state",
                    )}
                )
                if item["inclusion_state"] != "included":
                    continue
                revision = revisions.get(str(item["revision_id"]))
                if not revision:
                    raise GatewayError("Frozen revision unavailable.")

                folder = f"{item['discipline']}/{item['document_type']}/{item['issue_status'] or 'Unclassified'}"
                source = root / f"source-{included}"
                digest = _verified_source(
                    gateway,
                    str(revision["storage_key"]),
                    str(revision["sha256"]),
                    source,
                )
                filename = f"{item['document_number']}_REV-{item['revision_code']}_{revision['original_filename']}"
                arcname = f"{folder}/{_safe_filename(filename)}"
                output.write(source, arcname)
                checksums.append(f"{digest}  {arcname}")

                if revision.get("native_storage_key"):
                    native_source = root / f"native-source-{included}"
                    native_digest = _verified_source(
                        gateway,
                        str(revision["native_storage_key"]),
                        str(revision["native_sha256"]),
                        native_source,
                    )
                    native_name = (
                        f"{item['document_number']}_REV-{item['revision_code']}_"
                        f"{revision['native_original_filename']}"
                    )
                    native_arcname = f"{folder}/Native Source/{_safe_filename(native_name)}"
                    output.write(native_source, native_arcname)
                    checksums.append(f"{native_digest}  {native_arcname}")
                    native_sources += 1
                included += 1

            if is_transmittal:
                seal_expected = bool(electronic_sealer and electronic_sealer.enabled)
                cover_name = f"{control_folder}/EngiCite-Transmittal-{safe_number}.pdf"
                cover = build_transmittal_pdf(
                    package,
                    manifest_rows,
                    electronic_seal_expected=seal_expected,
                )
                if electronic_sealer and electronic_sealer.enabled:
                    cover, seal_evidence = electronic_sealer.seal(cover)
                else:
                    seal_evidence = {
                        "status": "system_attested",
                        "qualification": "not_qualified",
                        "platform": "EngiCite",
                    }
                output.writestr(cover_name, cover)
                checksums.append(f"{hashlib.sha256(cover).hexdigest()}  {cover_name}")
            else:
                output.writestr(
                    f"{control_folder}/package-manifest.json",
                    json.dumps({"package": package, "documents": manifest_rows}, default=str, indent=2),
                )
                output.writestr(f"{control_folder}/file-checksums.sha256", "\n".join(checksums))
                register = io.StringIO()
                writer = csv.DictWriter(
                    register,
                    fieldnames=[
                        "document_number", "discipline", "document_type", "revision_code",
                        "issue_status", "inclusion_state",
                    ],
                    extrasaction="ignore",
                )
                writer.writeheader()
                writer.writerows(manifest_rows)
                output.writestr(f"{control_folder}/Master Document Register.csv", register.getvalue())
        archive_bytes = archive.stat().st_size
        gateway.upload_package(storage_key, archive)

    result: dict[str, object] = {
        "archive_files": included,
        "native_source_files": native_sources,
        "archive_bytes": archive_bytes,
        "checksum_count": len(checksums),
    }
    if seal_evidence is not None:
        result["electronic_seal"] = seal_evidence
    gateway.finish_package(package_id, storage_key, result)
    return result
