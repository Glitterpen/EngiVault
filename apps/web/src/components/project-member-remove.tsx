"use client";

import {useActionState,useEffect,useId,useRef,useState} from "react";
import {Trash2,X} from "lucide-react";
import {removeProjectMember,type WorkflowState} from "@/app/app/workflow-actions";

export function ProjectMemberRemove({organisationId,projectId,member}:{organisationId:string;projectId:string;member:{userId:string;name:string;role:string}}){
  const [open,setOpen]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const titleId=useId();
  const [state,action,pending]=useActionState<WorkflowState,FormData>(removeProjectMember,undefined);
  useEffect(()=>{
    if(!open)return;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow=previousOverflow;};
  },[open]);
  return <>
    <button ref={trigger} type="button" aria-label={`Remove ${member.name} from project`} aria-haspopup="dialog" aria-expanded={open} aria-controls={`${titleId}-dialog`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[#a53724] transition hover:bg-[#fff0eb]" onClick={()=>{setOpen(true);dialog.current?.showModal();}}><Trash2 size={14} aria-hidden="true"/> Remove</button>
    <dialog ref={dialog} id={`${titleId}-dialog`} aria-labelledby={titleId} aria-describedby={`${titleId}-description`} onClose={()=>{setOpen(false);trigger.current?.focus();}} onCancel={event=>{if(pending)event.preventDefault();}} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-[#dce2e9] bg-white p-4 text-[#10243e] shadow-2xl backdrop:bg-[#06172b]/55 sm:p-6">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="ev-label text-[#a53724]">Remove project access</p><h2 id={titleId} className="mt-1 [overflow-wrap:anywhere] text-xl font-semibold">Remove {member.name}?</h2></div><button type="button" className="grid size-11 shrink-0 place-items-center rounded-full text-[#617083] hover:bg-[#f4f7fb] disabled:opacity-50" disabled={pending} onClick={()=>dialog.current?.close()} aria-label="Close removal confirmation"><X size={18} aria-hidden="true"/></button></div>
        <p id={`${titleId}-description`} className="mt-3 text-sm leading-6 text-[#617083]">Their access to this project will stop immediately. Uploaded files, decisions and audit history will remain intact.</p>
        {member.role==="project_admin"&&<p className="mt-3 rounded-lg border border-[#efc6b4] bg-[#fff9f5] p-3 text-xs leading-5 text-[#8b3d1f]">The final active Project Manager cannot be removed until a replacement has accepted an appointment.</p>}
        {state?.message&&<p className={`mt-4 rounded-lg p-3 text-sm ${state.ok?"bg-[#eef3fa] text-[#10243e]":"bg-[#fff0eb] text-[#a53724]"}`} role={state.ok?"status":"alert"}>{state.message}</p>}
        <form action={action} aria-label={`Remove project appointment for ${member.name}`} aria-busy={pending} className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="userId" value={member.userId}/><input type="hidden" name="memberRole" value={member.role}/>
          <button type="button" className="ev-button-secondary min-h-11" onClick={()=>dialog.current?.close()} disabled={pending}>Keep appointment</button>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#a53724] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#7f281b] disabled:cursor-not-allowed disabled:opacity-50" disabled={pending}><Trash2 size={16} aria-hidden="true"/>{pending?"Removing…":"Remove appointment"}</button>
        </form>
    </dialog>
  </>;
}
