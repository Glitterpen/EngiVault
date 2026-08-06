import hashlib
from pathlib import Path
from zipfile import ZipFile

from app.packages import build_package


class FakeGateway:
    def __init__(self):
        self.names=[];self.finished=None
    def package_data(self,package_id):
        source=b"controlled engineering content"
        package={"id":package_id,"organisation_id":"org","project_id":"project","package_number":"FWP-001","version":1}
        items=[{"revision_id":"rev","inclusion_state":"included","discipline":"Process","document_type":"Drawing","issue_status":"Issued for Construction","document_number":"DOC-001","revision_code":"C01"},{"revision_id":None,"inclusion_state":"missing_revision","discipline":"Piping","document_type":"Calculation","issue_status":None,"document_number":"DOC-002","revision_code":None}]
        revisions={"rev":{"storage_key":"source","original_filename":"drawing.pdf","sha256":hashlib.sha256(source).hexdigest()}}
        return package,items,revisions
    def download_key(self,storage_key,target:Path):target.write_bytes(b"controlled engineering content");return target.stat().st_size
    def upload_package(self,storage_key,archive:Path):
        with ZipFile(archive) as package:self.names=package.namelist()
    def finish_package(self,package_id,storage_key,manifest,failure_code=None):self.finished=(package_id,storage_key,manifest,failure_code)


def test_package_contains_control_files_and_frozen_revision():
    gateway=FakeGateway();result=build_package(gateway,"package-id")
    assert result["archive_files"]==1
    assert "00 - Package Control/package-manifest.json" in gateway.names
    assert "00 - Package Control/file-checksums.sha256" in gateway.names
    assert "00 - Package Control/Master Document Register.csv" in gateway.names
    assert any(name.startswith("Process/Drawing/Issued for Construction/DOC-001_REV-C01") for name in gateway.names)
    assert gateway.finished[0]=="package-id"
