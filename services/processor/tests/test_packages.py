import hashlib
from pathlib import Path
from zipfile import ZipFile

from app.packages import build_package
from app.transmittals import build_transmittal_pdf


class FakeGateway:
    def __init__(self):
        self.names=[];self.finished=None
        self.sources={"source":b"controlled engineering content","native":b"AC1032 editable drawing"}
    def package_data(self,package_id):
        source=b"controlled engineering content"
        package={"id":package_id,"organisation_id":"org","project_id":"project","package_number":"FWP-001","version":1}
        items=[{"revision_id":"rev","inclusion_state":"included","discipline":"Process","document_type":"Drawing","issue_status":"Issued for Construction","document_number":"DOC-001","revision_code":"C01"},{"revision_id":None,"inclusion_state":"missing_revision","discipline":"Piping","document_type":"Calculation","issue_status":None,"document_number":"DOC-002","revision_code":None}]
        native=self.sources["native"]
        revisions={"rev":{"storage_key":"source","original_filename":"drawing.pdf","sha256":hashlib.sha256(source).hexdigest(),"native_storage_key":"native","native_original_filename":"drawing.dwg","native_sha256":hashlib.sha256(native).hexdigest()}}
        return package,items,revisions
    def download_key(self,storage_key,target:Path,max_bytes=2_147_483_648):target.write_bytes(self.sources[storage_key]);return target.stat().st_size
    def upload_package(self,storage_key,archive:Path):
        with ZipFile(archive) as package:self.names=package.namelist()
    def finish_package(self,package_id,storage_key,manifest,failure_code=None):self.finished=(package_id,storage_key,manifest,failure_code)


class FakeQualifiedSealer:
    enabled=True
    def seal(self,pdf):
        return pdf+b"\n% QUALIFIED-SEAL",{"status":"qualified_electronic_seal","qualification":"provider_verified","trust_service_provider":"Intesi Group"}


def test_package_contains_control_files_and_frozen_revision():
    gateway=FakeGateway();result=build_package(gateway,"package-id")
    assert result["archive_files"]==1
    assert "00 - Package Control/package-manifest.json" in gateway.names
    assert "00 - Package Control/file-checksums.sha256" in gateway.names
    assert "00 - Package Control/Master Document Register.csv" in gateway.names
    assert any(name.startswith("Process/Drawing/Issued for Construction/DOC-001_REV-C01") for name in gateway.names)
    assert any("/Native Source/" in name and name.endswith("drawing.dwg") for name in gateway.names)
    assert result["native_source_files"]==1
    assert gateway.finished[0]=="package-id"


def test_transmittal_contains_signed_cover_and_acknowledgement():
    gateway=FakeGateway()
    original=gateway.package_data
    def transmittal_data(package_id):
        package,items,revisions=original(package_id)
        package["manifest"]={
            "kind":"document_transmittal",
            "issued_at":"2026-08-11T12:00:00+00:00",
            "document_count":1,
            "recipient":{"company":"North Sea Energy","contact":"Client DCC","email":"dcc@example.com"},
            "issuer":{"user_id":"dcc-user","name":"A. Controller","email":"dcc@engicite.test"},
            "project":{"code":"ENG-01","name":"Export System","organisation":"Engineering Company"},
        }
        package["purpose"]="Issued for Review"
        return package,items,revisions
    gateway.package_data=transmittal_data
    build_package(gateway,"transmittal-id")
    assert "00 - Transmittal Control/EngiCite-Transmittal-FWP-001.pdf" in gateway.names
    assert not any(name.endswith(".csv") for name in gateway.names)
    assert not any(name.endswith(".json") for name in gateway.names)
    assert not any(name.endswith(".sha256") for name in gateway.names)
    assert any(name.startswith("Process/Drawing/Issued for Construction/DOC-001_REV-C01") for name in gateway.names)


def test_transmittal_records_qualified_seal_evidence():
    gateway=FakeGateway()
    original=gateway.package_data
    def transmittal_data(package_id):
        package,items,revisions=original(package_id)
        package["manifest"]={"kind":"document_transmittal","issuer":{"name":"DCC"}}
        return package,items,revisions
    gateway.package_data=transmittal_data
    result=build_package(gateway,"transmittal-id",FakeQualifiedSealer())
    assert result["electronic_seal"]["status"]=="qualified_electronic_seal"
    assert gateway.finished[2]["electronic_seal"]["trust_service_provider"]=="Intesi Group"


def test_transmittal_pdf_identifies_attestation_and_client_acknowledgement():
    package={
        "id":"transmittal-id",
        "package_number":"TR-ENG-001",
        "purpose":"Issued for Approval",
        "manifest":{
            "issued_at":"2026-08-11T12:00:00+00:00",
            "document_count":1,
            "recipient":{"company":"Client Company"},
            "issuer":{"user_id":"dcc-user","name":"A. Controller"},
            "project":{"code":"ENG-01","name":"Export System","organisation":"Engineering Company"},
        },
    }
    documents=[{"revision_id":"revision-id","document_number":"DOC-001","discipline":"Process","revision_code":"C01","issue_status":"Issued for Approval"}]
    pdf=build_transmittal_pdf(package,documents)
    assert pdf.startswith(b"%PDF-1.4")
    assert b"ENGICITE SYSTEM-ISSUED ATTESTATION" in pdf
    assert b"CLIENT ACKNOWLEDGEMENT" in pdf
