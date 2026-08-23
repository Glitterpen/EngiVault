from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from urllib.parse import quote

import httpx

from .extraction import ExtractionResult
from .worker import ProcessingJob


class GatewayError(RuntimeError):
    pass


class SupabaseGateway:
    def __init__(self, url: str, service_role_key: str, bucket: str, worker_name: str) -> None:
        headers = {"apikey": service_role_key, "authorization": f"Bearer {service_role_key}"}
        self.client = httpx.Client(base_url=url.rstrip("/"), headers=headers, timeout=60.0)
        self.base_url = url.rstrip("/")
        self.bucket = bucket
        self.worker_name = worker_name

    def close(self) -> None:
        self.client.close()

    def claim(self) -> ProcessingJob | None:
        response = self.client.post("/rest/v1/rpc/claim_processing_run_v2", json={"worker_name": self.worker_name})
        self._raise(response, "Job claim failed.")
        rows = response.json()
        return ProcessingJob(**rows[0]) if rows else None

    def download(self, job: ProcessingJob, target: Path) -> None:
        self._download_processing_object(job.storage_key, job.byte_size, target)

    def download_native(self, job: ProcessingJob, target: Path) -> None:
        if not job.native_storage_key or job.native_byte_size is None:
            raise GatewayError("Native source identity is incomplete.")
        self._download_processing_object(job.native_storage_key, job.native_byte_size, target)

    def _download_processing_object(self, storage_key: str, authorised_size: int, target: Path) -> None:
        object_path = quote(storage_key, safe="/")
        written = 0
        with self.client.stream("GET", f"/storage/v1/object/authenticated/{quote(self.bucket)}/{object_path}") as response:
            self._raise(response, "Object download failed.")
            with target.open("xb") as stream:
                for chunk in response.iter_bytes(1024 * 1024):
                    written += len(chunk)
                    if written > authorised_size:
                        raise GatewayError("Downloaded object exceeds its authorised size.")
                    stream.write(chunk)
        if written != authorised_size:
            raise GatewayError("Downloaded object size differs from its authorised size.")

    def replace_units(self, job: ProcessingJob, result: ExtractionResult) -> None:
        delete = self.client.delete("/rest/v1/extracted_units", params={"run_id": f"eq.{job.run_id}"})
        self._raise(delete, "Existing processing output could not be cleared.")
        if not result.units:
            return
        rows = []
        for unit in result.units:
            row = asdict(unit)
            row.update({"organisation_id": job.organisation_id, "project_id": job.project_id,
                        "revision_id": job.revision_id, "run_id": job.run_id})
            rows.append(row)
        insert = self.client.post("/rest/v1/extracted_units", json=rows,
                                  headers={"prefer": "return=minimal"})
        self._raise(insert, "Extracted processing output could not be stored.")

    def replace_search_chunks(self, job: ProcessingJob, result: ExtractionResult,
                              embeddings: list[list[float]], embedding_model: str | None) -> None:
        delete=self.client.delete("/rest/v1/search_chunks",params={"run_id":f"eq.{job.run_id}"});self._raise(delete,"Existing search index could not be cleared.")
        if not result.units:return
        document=self.client.get("/rest/v1/documents",params={"id":f"eq.{job.document_id}","select":"document_number,title,document_type,discipline"});self._raise(document,"Document metadata unavailable.")
        revision=self.client.get("/rest/v1/document_revisions",params={"id":f"eq.{job.revision_id}","select":"revision_code,issue_status"});self._raise(revision,"Revision metadata unavailable.")
        doc=document.json()[0];rev=revision.json()[0];rows=[]
        for index,unit in enumerate(result.units):
            row=asdict(unit);row.update({"organisation_id":job.organisation_id,"project_id":job.project_id,"document_id":job.document_id,"revision_id":job.revision_id,"run_id":job.run_id,"document_number":doc["document_number"],"title":doc["title"],"document_type":doc["document_type"],"discipline":doc["discipline"],"revision_code":rev["revision_code"],"issue_status":rev["issue_status"],"pipeline_version":job.pipeline_version,"embedding_model":embedding_model,"embedding":str(embeddings[index]) if index<len(embeddings) else None});rows.append(row)
        for start in range(0,len(rows),500):
            insert=self.client.post("/rest/v1/search_chunks",json=rows[start:start+500],headers={"prefer":"return=minimal"});self._raise(insert,"Search index could not be stored.")

    def comparison_units(self, revision_id: str) -> list[dict[str, object]]:
        response=self.client.get("/rest/v1/extracted_units",params={"revision_id":f"eq.{revision_id}","select":"ordinal,locator_type,page_number,paragraph_number,sheet_name,cell_range,content","order":"ordinal.asc"});self._raise(response,"Comparison source unavailable.");return response.json()

    def finish_comparison(self, comparison_id: str, summary: dict[str, object], changes: list[dict[str, object]], failure_code: str | None = None) -> None:
        response=self.client.post("/rest/v1/rpc/finish_revision_comparison",json={"target_comparison":comparison_id,"result_summary":summary,"result_changes":changes,"failure_code":failure_code});self._raise(response,"Comparison result could not be saved.")

    def package_data(self, package_id: str) -> tuple[dict[str, object], list[dict[str, object]], dict[str, dict[str, object]]]:
        package=self.client.get("/rest/v1/work_packages",params={"id":f"eq.{package_id}","select":"*"});self._raise(package,"Package unavailable.")
        if not package.json():raise GatewayError("Package unavailable.")
        items=self.client.get("/rest/v1/work_package_items",params={"work_package_id":f"eq.{package_id}","select":"*","order":"discipline.asc,document_number.asc"});self._raise(items,"Package items unavailable.")
        rows=items.json();ids=[row["revision_id"] for row in rows if row.get("revision_id") and row.get("inclusion_state")=="included"]
        revisions={}
        if ids:
            result=self.client.get("/rest/v1/document_revisions",params={"id":f"in.({','.join(ids)})","select":"id,storage_key,original_filename,byte_size,sha256,native_storage_key,native_original_filename,native_byte_size,native_sha256"});self._raise(result,"Package revisions unavailable.");revisions={row["id"]:row for row in result.json()}
        return package.json()[0],rows,revisions

    def download_key(self, storage_key: str, target: Path, max_bytes: int = 2_147_483_648) -> int:
        object_path=quote(storage_key,safe="/");written=0
        with self.client.stream("GET",f"/storage/v1/object/authenticated/{quote(self.bucket)}/{object_path}") as response:
            self._raise(response,"Package source download failed.")
            with target.open("xb") as stream:
                for chunk in response.iter_bytes(1024*1024):
                    written+=len(chunk)
                    if written>max_bytes:raise GatewayError("Package source exceeds size limit.")
                    stream.write(chunk)
        return written

    def upload_package(self, storage_key: str, archive: Path) -> None:
        with archive.open("rb") as stream:response=self.client.post(f"/storage/v1/object/work-packages/{quote(storage_key,safe='/')}",content=stream,headers={"content-type":"application/zip","x-upsert":"false"})
        self._raise(response,"Package upload failed.")

    def finish_package(self, package_id: str, storage_key: str | None, manifest: dict[str, object], failure_code: str | None = None) -> None:
        response=self.client.post("/rest/v1/rpc/finish_work_package",json={"target_package":package_id,"result_storage_key":storage_key,"result_manifest":manifest,"failure_code":failure_code});self._raise(response,"Package result could not be saved.")

    def package_download_url(self, package_id: str, expires_in: int = 300) -> str:
        response=self.client.get("/rest/v1/work_packages",params={"id":f"eq.{package_id}","state":"eq.ready","select":"storage_key"});self._raise(response,"Package lookup failed.")
        rows=response.json()
        if len(rows)!=1 or not rows[0].get("storage_key"):raise GatewayError("Ready package unavailable.")
        storage_key=quote(str(rows[0]["storage_key"]),safe="/");response=self.client.post(f"/storage/v1/object/sign/work-packages/{storage_key}",json={"expiresIn":expires_in});self._raise(response,"Package signing failed.")
        signed=response.json().get("signedURL")
        if not signed:raise GatewayError("Signed package URL unavailable.")
        return str(signed) if str(signed).startswith("http") else f"{self.base_url}/storage/v1{signed}"

    def project_backup_data(self, backup_id: str) -> tuple[dict[str, object], dict[str, object], dict[str, list[dict[str, object]]]]:
        backup=self.client.get("/rest/v1/project_backups",params={"id":f"eq.{backup_id}","select":"*"});self._raise(backup,"Backup job unavailable.")
        if not backup.json():raise GatewayError("Backup job unavailable.")
        job=backup.json()[0];project_id=str(job["project_id"])
        project=self.client.get("/rest/v1/projects",params={"id":f"eq.{project_id}","select":"*"});self._raise(project,"Backup project unavailable.")
        if not project.json():raise GatewayError("Backup project unavailable.")
        sources={
            "documents":("documents","*","document_number.asc"),
            "revisions":("document_revisions","*","created_at.asc"),
            "memberships":("project_memberships","id,user_id,role,status,created_at,updated_at","created_at.asc"),
            "disciplines":("project_member_disciplines","*","discipline.asc"),
            "resource_plans":("project_resource_plans","*","discipline.asc"),
            "issues":("project_issues","*","created_at.asc"),
            "invitations":("invitations","id,email,project_role,discipline,status,expires_at,created_at,accepted_at","created_at.asc"),
            "audit_events":("audit_events","id,actor_user_id,action,target_type,target_id,outcome,changes,created_at","created_at.asc"),
            "weekly_reports":("project_weekly_reports","*","period_end.asc"),
        }
        datasets:dict[str,list[dict[str,object]]]={}
        for name,(table,selection,order) in sources.items():
            response=self.client.get(f"/rest/v1/{table}",params={"project_id":f"eq.{project_id}","select":selection,"order":order});self._raise(response,f"Backup {name} unavailable.");datasets[name]=response.json()
        return job,project.json()[0],datasets

    def mark_backup_building(self, backup_id: str) -> None:
        response=self.client.post("/rest/v1/rpc/mark_project_backup_building",json={"target_backup":backup_id});self._raise(response,"Backup job could not be started.")

    def upload_backup(self, storage_key: str, archive: Path) -> None:
        with archive.open("rb") as stream:
            response=self.client.post(f"/storage/v1/object/project-backups/{quote(storage_key,safe='/')}",content=stream,headers={"content-type":"application/zip","x-upsert":"false"})
        self._raise(response,"Project backup upload failed.")

    def finish_backup(self, backup_id: str, storage_key: str | None, sha256: str | None, byte_size: int | None, manifest: dict[str, object], external_location: str | None = None, failure_code: str | None = None) -> None:
        response=self.client.post("/rest/v1/rpc/finish_project_backup",json={"target_backup":backup_id,"result_storage_key":storage_key,"result_sha256":sha256,"result_bytes":byte_size,"result_manifest":manifest,"result_external_location":external_location,"failure_code":failure_code});self._raise(response,"Backup result could not be saved.")

    def finish(self, job: ProcessingJob, *, succeeded: bool, retryable: bool, detected_mime: str | None,
               failure_code: str | None, failure_detail: str | None, metrics: dict[str, object]) -> None:
        response = self.client.post("/rest/v1/rpc/finish_processing_run", json={
            "target_run": job.run_id, "succeeded": succeeded, "retryable": retryable,
            "resolved_mime": detected_mime, "failure_code": failure_code,
            "failure_detail": failure_detail, "run_metrics": metrics,
        })
        self._raise(response, "Processing result could not be committed.")

    @staticmethod
    def _raise(response: httpx.Response, message: str) -> None:
        if response.is_error:
            raise GatewayError(f"{message} Status {response.status_code}.")
