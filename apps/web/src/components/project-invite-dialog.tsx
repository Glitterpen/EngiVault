"use client";

import { useEffect, useId, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { ProjectInvite,type InvitableRole } from "@/components/project-invite";

type Discipline={code:string;name:string};

export function ProjectInviteDialog({organisationId,projectId,disciplines,allowedRoles,label="Invite member",lockedDiscipline}:{organisationId:string;projectId:string;disciplines:Discipline[];allowedRoles?:InvitableRole[];label?:string;lockedDiscipline?:string}){
  const [open,setOpen]=useState(false);
  const titleId=useId();
  useEffect(()=>{
    if(!open)return;
    const previousOverflow=document.body.style.overflow;
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)};
    document.body.style.overflow="hidden";
    document.addEventListener("keydown",closeOnEscape);
    return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener("keydown",closeOnEscape)};
  },[open]);
  return <>
    <button type="button" onClick={()=>setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className="ev-button-secondary inline-flex items-center gap-2 px-4"><UserPlus size={16}/> {label}</button>
    {open?<div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[#10243e]/65 p-4 backdrop-blur-sm" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="my-auto w-[min(92vw,520px)] overflow-hidden rounded-2xl border border-[#dce2e9] bg-white text-[#10243e] shadow-[0_28px_90px_rgba(16,36,62,.32)]">
        <div className="flex items-center justify-between border-b border-[#dfe7e3] px-6 py-4"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#e8733f]">Project access</p><h2 className="mt-1 font-semibold" id={titleId}>Invite project member</h2><p className="mt-1 text-sm text-[#617083]">Invite by project role and controlled discipline.</p></div><button type="button" onClick={()=>setOpen(false)} className="grid size-9 place-items-center rounded-lg border border-[#dce2e9] text-[#617083] hover:border-[#e8733f] hover:text-[#e8733f]" aria-label="Close invitation dialog"><X size={16}/></button></div>
        <div className="max-h-[calc(100vh-9rem)] overflow-y-auto p-6"><ProjectInvite organisationId={organisationId} projectId={projectId} disciplines={disciplines} allowedRoles={allowedRoles} lockedDiscipline={lockedDiscipline} bare/></div>
      </section>
    </div>:null}
  </>
}
