"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {Download,Upload} from "lucide-react";
import {HelpTip} from "@/components/help-tip";
import {createClient} from "@/lib/supabase/browser";
import {TEMPLATE_PACK_MAX_BYTES,type TemplatePackStatus} from "@/lib/project-template-packs";

export function ProjectTemplatePack({organisationId,projectId,canManage=false}:{organisationId:string;projectId:string;canManage?:boolean}){
  const base=`/api/v1/organisations/${organisationId}/projects/${projectId}/templates`;
  const [pack,setPack]=useState<TemplatePackStatus|null>(null);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const load=useCallback(async()=>{
    const response=await fetch(base,{cache:"no-store"});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error?.message??"Project templates could not be loaded.");
    return data as TemplatePackStatus;
  },[base]);
  useEffect(()=>{
    let active=true;
    void load().then(data=>{if(active)setPack(data);}).catch(error=>{if(active)setError(error.message);});
    return()=>{active=false;};
  },[load]);
  async function publish(id:string){
    setMessage("Running security checks. Keep this page open…");
    const response=await fetch(`${base}/complete`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error?.message??"Template publication could not be confirmed. Refresh and retry.");
    setPack(await load());setMessage("Template ZIP published for the project team.");
  }
  async function run(action:()=>Promise<void>){
    setBusy(true);setError("");setMessage("");
    try{await action();}catch(error){setMessage("");setError(error instanceof Error?error.message:"Template upload failed. Please retry.");await load().then(setPack).catch(()=>undefined);}finally{setBusy(false);}
  }
  async function upload(event:React.FormEvent){
    event.preventDefault();const file=input.current?.files?.[0];
    if(!file||!file.name.toLowerCase().endsWith(".zip")||file.size===0||file.size>TEMPLATE_PACK_MAX_BYTES){setError("Select a ZIP file no larger than 50 MB.");return;}
    await run(async()=>{
      setMessage("Preparing secure upload…");
      const hash=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
      const sha256=Array.from(new Uint8Array(hash)).map(byte=>byte.toString(16).padStart(2,"0")).join("");
      const response=await fetch(base,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({filename:file.name,size:file.size,sha256})});
      const session=await response.json();
      if(!response.ok)throw new Error(session.error?.message??"Upload could not be started.");
      setMessage("Uploading template ZIP…");
      // Multipart uploads use the File's MIME type, not the SDK contentType option.
      // Normalise browser/Windows ZIP labels without changing the hashed bytes.
      const zip=new File([file],file.name,{type:"application/zip",lastModified:file.lastModified});
      const {error}=await createClient().storage.from("project-templates").uploadToSignedUrl(session.path,session.token,zip,{contentType:"application/zip",upsert:false});
      if(error)throw new Error("The ZIP upload did not complete. Select the ZIP and upload it again before retrying security checks.");
      await publish(session.id);if(input.current)input.current.value="";
    });
  }
  return <section className="ev-card min-w-0 p-5 sm:p-6" aria-label="Project template pack">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Project templates <HelpTip label="Project template pack guidance">Download the Project Manager’s approved drawing backsheet, list/MTO spreadsheet and Word templates together as one ZIP. Replacements become available only after security checks.</HelpTip></h2>
      {pack?.current&&<a className="ev-button-secondary" href={`${base}/download`}><Download size={16}/> Download all templates (.zip)</a>}</div>
    {pack?.current?<p className="mt-3 break-words text-sm text-[#617083]">{pack.current.filename} · {pack.current.fileCount} files · {(pack.current.byteSize/1024/1024).toFixed(1)} MB</p>:<p className="mt-3 text-sm text-[#617083]">{pack?"No template pack published yet.":"Loading project templates…"}</p>}
    {canManage&&<form className="mt-5 border-t border-[#edf1ef] pt-4" onSubmit={upload}>
      <label className="block"><span className="ev-label">Approved template ZIP (up to 50 MB)</span><input ref={input} className="ev-input mt-2 max-w-full" type="file" accept=".zip,application/zip" disabled={busy} required/></label>
      <HelpTip label="Preparing the template ZIP">Include drawing backsheet files (DWG, DWT, DXF or PDF), list and MTO spreadsheets (XLSX or XLTX), and Word templates (DOCX or DOTX). TXT instructions are supported. Up to 250 files and 100 MB expanded. No password protection, nested ZIPs, macros or executables.</HelpTip>
      <button className="ev-button mt-3" disabled={busy}><Upload size={16}/>{busy?"Processing…":pack?.current?"Upload replacement ZIP":"Upload template ZIP"}</button>
    </form>}
    {canManage&&pack?.pending&&!busy&&<div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><span className="break-words">Unpublished upload: {pack.pending.filename}</span><button type="button" className="ev-button-secondary" onClick={()=>void run(()=>publish(pack.pending!.id))}>Retry security checks</button></div>}
    {message&&<p className="mt-4 text-sm text-[#0c5b45]" role="status">{message}</p>}
    {error&&<p className="mt-4 text-sm text-[#a5452f]" role="alert">{error}</p>}
  </section>;
}
