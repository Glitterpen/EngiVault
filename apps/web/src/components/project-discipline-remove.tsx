"use client";

import {useActionState,useEffect,useId,useRef,useState} from "react";
import {AlertTriangle,Trash2,X} from "lucide-react";
import {inspectProjectDisciplineRemoval,removeProjectDiscipline,type DisciplineState} from "@/app/app/project-discipline-actions";
import type {DisciplineRemovalImpact} from "@/lib/project-disciplines";

type Props={organisationId:string;projectId:string;name:string;permanentOnly?:boolean};
export function ProjectDisciplineRemove(props:Props){
  const [open,setOpen]=useState(false);
  return <><button type="button" onClick={()=>setOpen(true)} aria-label={`${props.permanentOnly?"Delete unused":"Remove"} ${props.name}`} aria-haspopup="dialog" className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#a53724] hover:bg-[#fff0eb]"><Trash2 size={13}/>{props.permanentOnly?"Delete if unused":"Remove"}</button>
    {open&&<RemovalDialog {...props} close={()=>setOpen(false)}/>}</>;
}

function RemovalDialog({organisationId,projectId,name,permanentOnly=false,close}:Props&{close:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),titleId=useId();
  const [loaded,setLoaded]=useState<DisciplineState>();
  const [state,action,pending]=useActionState<DisciplineState,FormData>(removeProjectDiscipline,undefined);
  useEffect(()=>{dialog.current?.showModal();},[]);
  useEffect(()=>{
    let active=true;
    const form=new FormData();Object.entries({organisationId,projectId,name}).forEach(([key,value])=>form.set(key,value));
    inspectProjectDisciplineRemoval(form).then(result=>{if(active)setLoaded(result||{message:"The warning could not be loaded. Please retry."});}).catch(()=>{if(active)setLoaded({message:"The warning could not be loaded. Please retry."});});
    return()=>{active=false;};
  },[organisationId,projectId,name]);
  const impact=state?.impact??loaded?.impact;
  const permanent=impact?.canDeletePermanently===true;
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={event=>{event.preventDefault();if(!pending)close();}} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-[#dce2e9] bg-white p-5 text-[#10243e] shadow-2xl backdrop:bg-[#06172b]/60 sm:p-6">
    <header className="flex items-start justify-between gap-3"><h2 id={titleId} className="min-w-0 break-words text-xl font-semibold">{permanent?"Permanently delete":"Remove"} {name}?</h2><button type="button" aria-label="Close discipline removal" disabled={pending} onClick={close} className="grid min-h-10 min-w-10 place-items-center rounded-full hover:bg-[#f2f5f4]"><X size={18}/></button></header>
    {impact&&<p className="mt-3 text-sm leading-6 text-[#617083]">{permanent?"This discipline has no engineer assignments or linked engineering history. It and its unused resource plan will be permanently removed from this project, with no entry in Removed disciplines. The organisation's shared category and the audit record are kept.":"This removes the discipline from new project selections. Existing engineer access, MDR deliverables, files, invitations and history stay intact. You can restore it later."}</p>}
    {!loaded&&!impact&&<p role="status" className="mt-4 text-sm">Checking assigned engineers and linked work…</p>}
    {loaded?.message&&!impact&&<p role="alert" className="mt-4 text-sm text-[#a53724]">{loaded.message}</p>}
    {impact&&<Impact impact={impact}/>}
    {state?.message&&<p role={state.ok?"status":"alert"} className={`mt-4 text-sm ${state.ok?"text-[#0c5b45]":"text-[#a53724]"}`}>{state.message}</p>}
    {permanentOnly&&impact&&!permanent&&<p role="alert" className="mt-4 text-sm text-[#a53724]">Permanent deletion is unavailable because this discipline has linked work or history. Its removed entry must be retained.</p>}
    {!state?.ok&&impact&&(!permanentOnly||permanent)?<form key={permanent?"permanent":"archive"} action={action} className="mt-5 space-y-4">
      <input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="name" value={name}/><input type="hidden" name="confirmed" value="true"/><input type="hidden" name="expectedEngineerCount" value={impact.engineerCount}/>
      <input type="hidden" name="mode" value={permanent?"permanent":"archive"}/>
      {permanent&&<label className="flex items-start gap-3 rounded-lg bg-[#fff5ec] p-3 text-sm leading-5"><input type="checkbox" name="confirmedPermanent" value="true" required disabled={pending} className="mt-1 size-4 shrink-0"/><span>I understand this permanently removes the unused discipline and {impact.plannedPositions} planned position{impact.plannedPositions===1?"":"s"}. This cannot be restored.</span></label>}
      {impact.engineerCount>0&&<label key={impact.engineerCount} className="flex items-start gap-3 rounded-lg bg-[#fff5ec] p-3 text-sm leading-5"><input type="checkbox" name="confirmedAssigned" value="true" required disabled={pending} className="mt-1 size-4 shrink-0"/><span>I understand that {impact.engineerCount} assigned engineer{impact.engineerCount===1?"":"s"} will retain their existing discipline access.</span></label>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className="ev-button-secondary" onClick={close} disabled={pending}>Keep discipline</button><button className="ev-button bg-[#a53724]" disabled={pending}>{pending?"Removing…":permanent?"Delete permanently":"Confirm removal"}</button></div>
    </form>:<button type="button" className="ev-button-secondary mt-5" onClick={close}>Close</button>}
  </dialog>;
}
function Impact({impact}:{impact:DisciplineRemovalImpact}){
  return <div className="mt-4 space-y-3 text-sm">
    {impact.engineerCount>0?<p role="alert" className="flex gap-2 rounded-lg border border-[#efc6b4] bg-[#fff9f5] p-3 text-[#8b3d1f]"><AlertTriangle size={18} className="shrink-0"/>{impact.engineerCount} engineer{impact.engineerCount===1?" is":"s are"} already assigned to this discipline. Their existing access will not be removed.</p>:<p>No active engineers are assigned to this discipline.</p>}
    {!impact.canDeletePermanently&&<p className="text-[#617083]">Linked work retained: {impact.documentCount} active MDR deliverable{impact.documentCount===1?"":"s"}, {impact.invitationCount} pending invitation{impact.invitationCount===1?"":"s"} and {impact.plannedPositions} planned position{impact.plannedPositions===1?"":"s"}. Existing work or history prevents permanent deletion even when no engineer is currently active.</p>}
  </div>;
}
