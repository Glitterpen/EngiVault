"use client";
import {useEffect,useId,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/browser";
import {customerErrorMessage} from "@/lib/customer-messages";
import {AlertTriangle} from "lucide-react";

type RecoveryFile={kind:"primary"|"native";path:string;name:string;size:number;sha256:string;mime:string;token:string};

export function IncompleteUploadRecovery({endpoint}:{endpoint:string}){
  const router=useRouter();
  const feedbackId=useId(),feedback=useRef<HTMLParagraphElement>(null),cancelButton=useRef<HTMLButtonElement>(null),confirmButton=useRef<HTMLButtonElement>(null);
  const [files,setFiles]=useState<RecoveryFile[]|null>(null);
  const [selected,setSelected]=useState<Record<string,File>>({});
  const [busy,setBusy]=useState(false);
  const [confirmCancel,setConfirmCancel]=useState(false);
  const [message,setMessage]=useState("");
  const [messageKind,setMessageKind]=useState<"status"|"success"|"error">("status");
  useEffect(()=>{if(messageKind==="error"&&message)feedback.current?.focus();},[messageKind,message]);
  useEffect(()=>{if(confirmCancel)confirmButton.current?.focus();},[confirmCancel]);
  async function recover(action:"resume"|"cancel"){
    setBusy(true);setMessage("");setMessageKind("status");
    try{
      const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error?.message??"Recovery could not be prepared.");
      if(action==="cancel"){setMessageKind("success");setMessage("Incomplete upload cancelled. You can start again with the same revision code.");setFiles(null);setConfirmCancel(false);router.refresh();}
      else {setFiles(result.files);setSelected({});setMessage(result.files.length?"Select the original missing files below. Already uploaded files will be preserved.":"Both files are stored. Continue to finish secure submission.");}
    }catch(error){setMessageKind("error");setMessage(customerErrorMessage(error,"Recovery failed. Sign in again if your session expired."));}
    finally{setBusy(false);}
  }
  async function finish(){
    if(!files)return;
    setBusy(true);setMessageKind("status");setMessage("Checking files and completing secure upload...");
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
      setFiles(null);setMessageKind("success");setMessage("Submission queued for security checks, then DCC review.");router.refresh();
    }catch(error){setFiles(null);setSelected({});setMessageKind("error");setMessage(customerErrorMessage(error,"Upload could not finish.")+" Choose Resume again to recheck stored files.");}
    finally{setBusy(false);}
  }
  return <section aria-label="Incomplete submission" aria-busy={busy} className="mt-4 min-w-0 rounded-xl border border-[#e7cbb9] bg-[#fffaf5] p-4">
    <p className="flex items-center gap-2 text-sm font-semibold text-[#7b3d22]"><AlertTriangle size={17} aria-hidden="true" className="shrink-0"/>Incomplete submission</p>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <button type="button" className="ev-button-secondary min-h-11 w-full sm:w-auto" disabled={busy} onClick={()=>void recover("resume")}>Resume incomplete submission</button>
      <button ref={cancelButton} type="button" className="ev-button-secondary min-h-11 w-full sm:w-auto" disabled={busy} onClick={()=>setConfirmCancel(true)}>Cancel incomplete upload</button>
    </div>
    {files?.map(file=><label key={file.kind} className="mt-4 block min-w-0 text-sm leading-6 text-[#405566]"><span className="font-semibold">{file.kind==="native"?"Missing native source":"Missing controlled file"}:</span> <span className="break-all">{file.name}</span>
      <input type="file" disabled={busy} aria-describedby={messageKind==="error"?feedbackId:undefined} className="ev-input mt-2 min-h-11 w-full min-w-0 max-w-full text-sm" onChange={event=>{const chosen=event.target.files?.[0];if(chosen)setSelected(previous=>({...previous,[file.kind]:chosen}));}}/>
    </label>)}
    {files&&<button type="button" className="ev-button mt-3 min-h-11 w-full sm:w-auto" disabled={busy||files.some(file=>!selected[file.kind])} onClick={()=>void finish()}>Complete secure submission</button>}
    {confirmCancel&&<div role="group" aria-label="Confirm incomplete upload cancellation" className="mt-4 border-t border-[#e7cbb9] pt-4 text-sm leading-6 text-[#405566]"><p>Cancel only this incomplete registration? Uploaded files and audit evidence are retained. Completed revisions are not affected. You can then restart with the same revision code.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap"><button ref={confirmButton} type="button" className="ev-button-secondary min-h-11 w-full sm:w-auto" disabled={busy} onClick={()=>void recover("cancel")}>Confirm cancellation</button><button type="button" className="ev-button-secondary min-h-11 w-full sm:w-auto" disabled={busy} onClick={()=>{setConfirmCancel(false);cancelButton.current?.focus();}}>Keep upload</button></div></div>}
    {message&&<p id={feedbackId} ref={feedback} tabIndex={messageKind==="error"?-1:undefined} role={messageKind==="error"?"alert":"status"} className={`mt-3 break-words rounded-lg text-sm leading-6 ${messageKind==="error"?"border border-[#e8bda8] bg-[#fff4ed] p-3 text-[#8b3d1f]":messageKind==="success"?"border border-[#cad8e9] bg-[#f4f7fb] p-3 text-[#10243e]":"text-[#405566]"}`}>{message}</p>}
  </section>;
}
