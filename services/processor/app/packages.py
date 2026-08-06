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


def build_package(gateway:SupabaseGateway,package_id:str)->dict[str,object]:
    package,items,revisions=gateway.package_data(package_id);safe_number=re.sub(r"[^A-Za-z0-9_-]","_",str(package["package_number"]));storage_key=f"organisations/{package['organisation_id']}/projects/{package['project_id']}/packages/{package_id}/{safe_number}_V{package['version']}.zip"
    checksums=[];included=0
    with tempfile.TemporaryDirectory(prefix="engicite-package-") as temporary:
        root=Path(temporary);archive=root/"package.zip";manifest_rows=[]
        with zipfile.ZipFile(archive,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as output:
            for item in items:
                manifest_rows.append({key:item.get(key) for key in("document_number","discipline","document_type","revision_code","issue_status","inclusion_state")})
                if item["inclusion_state"]!="included":continue
                revision=revisions.get(item["revision_id"])
                if not revision:raise GatewayError("Frozen revision unavailable.")
                source=root/f"source-{included}";gateway.download_key(str(revision["storage_key"]),source);hasher=hashlib.sha256()
                with source.open("rb") as stream:
                    for chunk in iter(lambda:stream.read(1024*1024),b""):hasher.update(chunk)
                digest=hasher.hexdigest()
                if digest!=revision["sha256"]:raise GatewayError("Frozen revision checksum mismatch.")
                folder=f"{item['discipline']}/{item['document_type']}/{item['issue_status'] or 'Unclassified'}";filename=f"{item['document_number']}_REV-{item['revision_code']}_{revision['original_filename']}";arcname=f"{folder}/{re.sub(r'[^A-Za-z0-9_. -]','_',filename)}";output.write(source,arcname);checksums.append(f"{digest}  {arcname}");included+=1
            output.writestr("00 - Package Control/package-manifest.json",json.dumps({"package":package,"documents":manifest_rows},default=str,indent=2));output.writestr("00 - Package Control/file-checksums.sha256","\n".join(checksums))
            register=io.StringIO();writer=csv.DictWriter(register,fieldnames=["document_number","discipline","document_type","revision_code","issue_status","inclusion_state"]);writer.writeheader();writer.writerows(manifest_rows);output.writestr("00 - Package Control/Master Document Register.csv",register.getvalue())
        archive_bytes=archive.stat().st_size;gateway.upload_package(storage_key,archive)
    result={"archive_files":included,"archive_bytes":archive_bytes,"checksum_count":len(checksums)};gateway.finish_package(package_id,storage_key,result);return result
