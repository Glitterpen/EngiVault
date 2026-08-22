"use client";

import {useActionState,useState} from "react";
import {Trash2,X} from "lucide-react";
import {removeProjectMember,type WorkflowState} from "@/app/app/workflow-actions";

export function ProjectMemberRemove({organisationId,projectId,member}:{organisationId:string;projectId:string;member:{userId:string;name:string;role:string}}){
  const [open,setOpen]=useState(false);
  const [state,action,pending]=useActionState<WorkflowState,FormData>(removeProjectMember,undefined);
  return <>
    <button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-[#a53724] transition hover:bg-[#fff0eb]" onClick={()=>setOpen(true)}><Trash2 size={14}/> Remove</button>
    {open&&<div className="fixed inset-0 z-50 grid place-items-center bg-[#06172b]/55 p-4" role="dialog" aria-modal="true" aria-labelledby={`remove-${member.userId}`}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><p className="ev-label text-[#a53724]">Remove project access</p><h2 id={`remove-${member.userId}`} className="mt-1 text-xl font-semibold">Remove {member.name}?</h2></div><button type="button" className="grid size-9 place-items-center rounded-full text-[#617083] hover:bg-[#f2f5f4]" onClick={()=>setOpen(false)} aria-label="Close removal confirmation"><X size={18}/></button></div>
        <p className="mt-3 text-sm leading-6 text-[#617083]">Their access to this project will stop immediately. Uploaded files, decisions and audit history will remain intact.</p>
        {member.role==="project_admin"&&<p className="mt-3 rounded-lg border border-[#efc6b4] bg-[#fff9f5] p-3 text-xs leading-5 text-[#8b3d1f]">The final active Project Manager cannot be removed until a replacement has accepted an appointment.</p>}
        {state?.message&&<p className={`mt-4 rounded-lg p-3 text-sm ${state.ok?"bg-[#e8f1ed] text-[#0c5b45]":"bg-[#fff0eb] text-[#a53724]"}`} role="status">{state.message}</p>}
        <form action={action} className="mt-5 flex flex-wrap justify-end gap-2">
          <input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="userId" value={member.userId}/><input type="hidden" name="memberRole" value={member.role}/>
          <button type="button" className="ev-button-secondary" onClick={()=>setOpen(false)} disabled={pending}>Keep appointment</button>
          <button className="inline-flex items-center gap-2 rounded-lg bg-[#a53724] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#7f281b] disabled:cursor-not-allowed disabled:opacity-50" disabled={pending}><Trash2 size={16}/>{pending?"Removing…":"Remove appointment"}</button>
        </form>
      </div>
    </div>}
  </>;
}
