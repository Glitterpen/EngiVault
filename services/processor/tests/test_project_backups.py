import hashlib
from pathlib import Path
from zipfile import ZipFile

from app.project_backups import build_project_backup


class FakeGateway:
    def __init__(self, target: Path):
        self.target = target
        self.finished = None
        self.sources = {
            "source.pdf": b"controlled engineering evidence",
            "source.dwg": b"AC1032 editable drawing evidence",
        }

    def mark_backup_building(self, backup_id):
        assert backup_id == "backup-1"

    def project_backup_data(self, backup_id):
        content = b"controlled engineering evidence"
        return (
            {"id": backup_id, "organisation_id": "org-1", "project_id": "project-1", "provider": "engicite"},
            {"id": "project-1", "code": "EPC-01", "name": "EPC Project"},
            {
                "documents": [{"id": "doc-1", "document_number": "EPC-PRO-001", "title": "Design Basis", "discipline": "Process", "document_type": "Report", "planned_submission_date": "2026-08-20", "lifecycle_status": "active"}],
                "revisions": [{"id": "rev-1", "document_id": "doc-1", "revision_code": "R01", "storage_key": "source.pdf", "original_filename": "basis.pdf", "state": "ready", "sha256": hashlib.sha256(content).hexdigest(), "native_storage_key": "source.dwg", "native_original_filename": "basis.dwg", "native_sha256": hashlib.sha256(self.sources["source.dwg"]).hexdigest()}],
                "memberships": [], "disciplines": [], "resource_plans": [], "issues": [], "invitations": [], "audit_events": [], "weekly_reports": [],
            },
        )

    def download_key(self, storage_key, target, max_bytes):
        target.write_bytes(self.sources[storage_key])

    def upload_backup(self, storage_key, archive):
        self.target.write_bytes(archive.read_bytes())

    def finish_backup(self, *args, **kwargs):
        self.finished = (args, kwargs)


def test_project_backup_contains_metadata_mdr_and_revision(tmp_path):
    output = tmp_path / "backup.zip"
    gateway = FakeGateway(output)
    manifest = build_project_backup(gateway, "backup-1")
    assert manifest["documents"] == 1
    assert manifest["revision_files"] == 1
    assert manifest["native_source_files"] == 1
    with ZipFile(output) as archive:
        names = archive.namelist()
        assert "00 - Backup Control/project.json" in names
        assert "00 - Backup Control/Master Document Register.csv" in names
        assert "Documents/Process/EPC-PRO-001/Revision R01/basis.pdf" in names
        assert archive.read("Documents/Process/EPC-PRO-001/Revision R01/basis.pdf") == b"controlled engineering evidence"
        assert archive.read("Documents/Process/EPC-PRO-001/Revision R01/Native Source/basis.dwg") == b"AC1032 editable drawing evidence"
