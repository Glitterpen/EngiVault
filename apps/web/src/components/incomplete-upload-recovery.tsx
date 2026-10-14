"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/browser";
import {customerErrorMessage} from "@/lib/customer-messages";

type RecoveryFile={kind:"primary"|"native";path:string;name:string;size:number;sha256:string;mime:string;token:string};

export function IncompleteUploadRecovery({endpoint}:{endpoint:string}){
  const router=useRouter();
  const [files,setFiles]=useState<RecoveryFile[]|null>(null);
  const [selected,setSelected]=useState<Record<string,File>>({});
  const [busy,setBusy]=useState(false);
  const [confirmCancel,setConfirmCancel]=useState(false);
  const [message,setMessage]=useState("");
  async function recover(action:"resume"|"cancel"){
    setBusy(true);setMessage("");
    try{
      const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error?.message??"Recovery could not be prepared.");
      if(action==="cancel"){setMessage("Incomplete upload cancelled. You can start again with the same revision code.");setFiles(null);setConfirmCancel(false);router.refresh();}
      else {setFiles(result.files);setSelected({});setMessage(result.files.length?"Select the original missing files below. Already uploaded files will be preserved.":"Both files are stored. Continue to finish secure submission.");}
    }catch(error){setMessage(customerErrorMessage(error,"Recovery failed. Sign in again if your session expired."));}
    finally{setBusy(false);}
  }
  async function finish(){
    if(!files)return;
    setBusy(true);setMessage("Checking files and completing secure upload...");
    try{
      const storage=createClient().storage.from("documents");
      for(const required of files){
        const file=selected[required.kind];
        if(!file||file.size!==required.size)throw new Error(`Select the original ${required.kind} file (${required.name}).`);
        const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
        const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
        if(hash!==required.sha256)throw new Error(`The ${required.kind} file differs from the original. Select the original file or cancel and restart.`);
        const {error}=await storage.uploadToSignedUrl(required.path,required.token,new File([file],file.name,{type:required.mime}),{contentType:required.mime,upsert:false});
        if(error)throw error;
      }
      const response=await fetch(endpoint.replace(/\/recovery$/,"/complete"),{method:"POST"});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error?.message??"Upload completion failed.");
      setFiles(null);setMessage("Submission queued for security checks, then DCC review.");router.refresh();
    }catch(error){setFiles(null);setSelected({});setMessage(customerErrorMessage(error,"Upload could not finish.")+" Choose Resume again to recheck stored files.");}
    finally{setBusy(false);}
  }
  return <div className="mt-4 rounded-xl border border-[#efc6b4] bg-[#fff8f4] p-4">
    <p className="text-sm font-semibold">Incomplete submission</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className="ev-button-secondary" disabled={busy} onClick={()=>void recover("resume")}>Resume incomplete submission</button>
      <button type="button" className="ev-button-secondary" disabled={busy} onClick={()=>setConfirmCancel(true)}>Cancel incomplete upload</button>
    </div>
    {files?.map(file=><label key={file.kind} className="mt-3 block text-sm">{file.kind==="native"?"Missing native source":"Missing controlled file"}: {file.name}
      <input type="file" disabled={busy} className="ev-input mt-2 w-full" onChange={event=>{const chosen=event.target.files?.[0];if(chosen)setSelected(previous=>({...previous,[file.kind]:chosen}));}}/>
    </label>)}
    {files&&<button type="button" className="ev-button mt-3" disabled={busy||files.some(file=>!selected[file.kind])} onClick={()=>void finish()}>Complete secure submission</button>}
    {confirmCancel&&<div className="mt-3 text-sm"><p>Cancel only this incomplete registration? Uploaded files and audit evidence are retained. Completed revisions are not affected. You can then restart with the same revision code.</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" className="ev-button-secondary" disabled={busy} onClick={()=>void recover("cancel")}>Confirm cancellation</button><button type="button" className="ev-button-secondary" disabled={busy} onClick={()=>setConfirmCancel(false)}>Keep upload</button></div></div>}
    {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
  </div>;
}
