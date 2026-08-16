from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import tempfile
import zipfile
from pathlib import Path

from .gateway import GatewayError, SupabaseGateway


def _safe(value: object, fallback: str = "Unclassified") -> str:
    clean = re.sub(r"[^A-Za-z0-9_. -]", "_", str(value or fallback)).strip(" .")
    return clean[:180] or fallback


def build_project_backup(gateway: SupabaseGateway, backup_id: str) -> dict[str, object]:
    gateway.mark_backup_building(backup_id)
    try:
        job, project, datasets = gateway.project_backup_data(backup_id)
        documents = datasets["documents"]
        revisions = datasets["revisions"]
        document_index = {str(item["id"]): item for item in documents}
        project_code = _safe(project.get("code"), "PROJECT")
        storage_key = f"organisations/{job['organisation_id']}/projects/{job['project_id']}/backups/{backup_id}/{project_code}_Project_Backup.zip"
        checksums: list[str] = []
        included = 0
        skipped = 0
        with tempfile.TemporaryDirectory(prefix="engicite-backup-") as temporary:
            root = Path(temporary)
            archive = root / "project-backup.zip"
            with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as output:
                output.writestr("00 - Backup Control/project.json", json.dumps(project, default=str, indent=2))
                for name, rows in datasets.items():
                    output.writestr(f"00 - Backup Control/{name}.json", json.dumps(rows, default=str, indent=2))
                register = io.StringIO()
                fieldnames = ["document_number", "title", "discipline", "document_type", "planned_submission_date", "lifecycle_status"]
                writer = csv.DictWriter(register, fieldnames=fieldnames, extrasaction="ignore")
                writer.writeheader()
                writer.writerows(documents)
                output.writestr("00 - Backup Control/Master Document Register.csv", register.getvalue())
                for index, revision in enumerate(revisions):
                    storage_source = revision.get("storage_key")
                    document = document_index.get(str(revision.get("document_id")))
                    if not storage_source or not document or revision.get("state") == "pending_upload":
                        skipped += 1
                        continue
                    source = root / f"revision-{index}"
                    gateway.download_key(str(storage_source), source, max_bytes=5_368_709_120)
                    digest = hashlib.sha256(source.read_bytes()).hexdigest()
                    expected = revision.get("sha256")
                    if expected and digest != expected:
                        raise GatewayError("Project backup source checksum mismatch.")
                    filename = _safe(revision.get("original_filename"), "document")
                    archive_name = "/".join([
                        "Documents", _safe(document.get("discipline")), _safe(document.get("document_number")),
                        f"Revision {_safe(revision.get('revision_code'), 'UNKNOWN')}", filename,
                    ])
                    output.write(source, archive_name)
                    checksums.append(f"{digest}  {archive_name}")
                    included += 1
                output.writestr("00 - Backup Control/file-checksums.sha256", "\n".join(checksums))
            archive_size = archive.stat().st_size
            archive_digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            gateway.upload_backup(storage_key, archive)
        manifest = {
            "format": "engicite-portable-project-backup-v1",
            "documents": len(documents), "revision_files": included, "skipped_revision_files": skipped,
            "audit_events": len(datasets["audit_events"]), "archive_bytes": archive_size,
            "provider": job["provider"],
            "external_delivery": "complete" if job["provider"] == "engicite" else "awaiting_configured_connector",
        }
        gateway.finish_backup(backup_id, storage_key, archive_digest, archive_size, manifest)
        return manifest
    except Exception:
        try:
            gateway.finish_backup(backup_id, None, None, None, {}, failure_code="BACKUP_BUILD_ERROR")
        except GatewayError:
            pass
        raise
