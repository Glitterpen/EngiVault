"use client";

import {useActionState,useState} from "react";
import {AlertTriangle,CalendarRange,Pencil,ShieldCheck,UsersRound,X} from "lucide-react";
import {createProjectIssue,updateProjectBrief,upsertResourcePlan,type WorkflowState} from "@/app/app/workflow-actions";

type Base={organisationId:string;projectId:string};
type Discipline={code:string;name:string};
type ProjectBriefProps=Base&{introduction:string;objectives:string[];startDate:string;endDate:string};

export function EditableProjectBrief({organisationId,projectId,introduction,objectives,startDate,endDate,dccCount}:ProjectBriefProps&{dccCount:number}){
  const [editing,setEditing]=useState(false);
  return <article className="ev-card p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="ev-label">Project brief</p><h2 className="mt-1 text-lg font-semibold">Introduction and key objectives</h2></div>
      <button className="ev-button-secondary" type="button" onClick={()=>setEditing(value=>!value)} aria-expanded={editing}>
        {editing?<><X size={16}/> Close editor</>:<><Pencil size={16}/> Edit project brief</>}
      </button>
    </div>
    {editing?<ProjectBriefForm organisationId={organisationId} projectId={projectId} introduction={introduction} objectives={objectives} startDate={startDate} endDate={endDate} embedded/>:<>
      <div className="mt-5 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="ev-label">Project introduction</p>
          <p className="mt-3 max-w-4xl whitespace-pre-line text-sm leading-7 text-[#24384f]">{introduction||"No project introduction has been recorded."}</p>
          <div className="mt-5"><p className="ev-label">Key objectives</p>{objectives.length?<ol className="mt-3 grid gap-2 text-sm text-[#24384f] sm:grid-cols-2">{objectives.map((objective,index)=><li className="flex gap-2" key={`${index}-${objective}`}><span className="font-bold text-[#e8733f]">{index+1}.</span><span>{objective}</span></li>)}</ol>:<p className="mt-2 text-sm text-[#617083]">No key objectives have been recorded.</p>}</div>
        </div>
        <ShieldCheck className="shrink-0 text-[#0c5b45]" aria-hidden="true"/>
      </div>
      <div className="mt-5 grid gap-3 border-t border-[#edf1ef] pt-5 sm:grid-cols-3"><BriefDatum label="Planned start" value={formatDisplayDate(startDate)}/><BriefDatum label="Planned completion" value={formatDisplayDate(endDate)}/><BriefDatum label="DCC appointed" value={dccCount?`${dccCount} active`:"Not appointed"} warn={!dccCount}/></div>
    </>}
  </article>;
}

export function ProjectBriefForm({organisationId,projectId,introduction,objectives,startDate,endDate,embedded=false}:ProjectBriefProps&{embedded?:boolean}){
  const [state,action,pending]=useActionState<WorkflowState,FormData>(updateProjectBrief,undefined);
  return <form action={action} className={embedded?"mt-5 border-t border-[#edf1ef] pt-5":"ev-card p-5 sm:p-6"}>
    <Hidden organisationId={organisationId} projectId={projectId}/>
    {!embedded&&<div className="flex items-center gap-2"><CalendarRange size={18} className="text-[#e8733f]"/><h2 className="font-semibold">Project brief and timeline</h2></div>}
    <label className={embedded?"block":"mt-4 block"}><span className="ev-label">Project introduction</span><textarea className="ev-input min-h-28 resize-y" name="introduction" defaultValue={introduction} placeholder="Briefly explain the project background, scope and intended outcome." minLength={20} maxLength={4000} required/><span className="mt-1 block text-xs leading-5 text-[#617083]">This is the first project context shown to the Document Controller and invited engineers.</span></label>
    <label className="mt-4 block"><span className="ev-label">Key objectives</span><textarea className="ev-input min-h-36 resize-y" name="keyObjectives" defaultValue={objectives.join("\n")} placeholder={"Complete the conductor engineering assessment\nIssue approved discipline deliverables\nClose all identified design risks"} maxLength={6500} required/><span className="mt-1 block text-xs leading-5 text-[#617083]">Enter one clear objective per line, up to 12 objectives.</span></label>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><Date name="startDate" label="Planned start" value={startDate}/><Date name="endDate" label="Planned completion" value={endDate}/></div>
    <Status state={state}/><button className="ev-button mt-5" disabled={pending}>{pending?"Saving…":"Save project brief"}</button>
  </form>;
}

export function ResourcePlanForm({organisationId,projectId,disciplines}:Base&{disciplines:Discipline[]}){
  const [state,action,pending]=useActionState<WorkflowState,FormData>(upsertResourcePlan,undefined);
  return <form action={action} className="ev-card p-5 sm:p-6"><Hidden organisationId={organisationId} projectId={projectId}/><div className="flex items-center gap-2"><UsersRound size={18} className="text-[#e8733f]"/><h2 className="font-semibold">Plan discipline resources</h2></div><p className="mt-2 text-xs leading-5 text-[#617083]">Set how many engineers the project needs. Invitations are sent separately after the requirement is saved.</p><label className="mt-4 block"><span className="ev-label">Discipline</span><select className="ev-input" name="discipline" required defaultValue=""><option value="" disabled>Select discipline</option>{disciplines.map(item=><option key={item.code} value={item.name}>{item.code} — {item.name}</option>)}</select></label><label className="mt-4 block"><span className="ev-label">Required engineers</span><input className="ev-input" name="requiredCount" type="number" min="0" max="100" defaultValue="1" required/></label><label className="mt-4 block"><span className="ev-label">Notes</span><input className="ev-input" name="notes" maxLength={500} placeholder="Lead, seniority or mobilisation notes"/></label><Status state={state}/><button className="ev-button mt-5" disabled={pending||!disciplines.length}>{pending?"Saving…":"Save resource requirement"}</button></form>;
}

export function ProjectIssueForm({organisationId,projectId}:Base){
  const [state,action,pending]=useActionState<WorkflowState,FormData>(createProjectIssue,undefined);
  return <form action={action} className="ev-card p-5 sm:p-6"><Hidden organisationId={organisationId} projectId={projectId}/><div className="flex items-center gap-2"><AlertTriangle size={18} className="text-[#e8733f]"/><h2 className="font-semibold">Report project issue</h2></div><label className="mt-4 block"><span className="ev-label">Issue title</span><input className="ev-input" name="title" minLength={2} maxLength={160} required/></label><label className="mt-4 block"><span className="ev-label">Description</span><textarea className="ev-input min-h-24 resize-y" name="description" maxLength={2000}/></label><div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="ev-label">Severity</span><select className="ev-input" name="severity" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label><Date name="dueDate" label="Target resolution" value=""/></div><label className="mt-4 block"><span className="ev-label">Issue owner</span><input className="ev-input" name="owner" maxLength={100} placeholder="Responsible person or team"/></label><Status state={state}/><button className="ev-button mt-5" disabled={pending}>{pending?"Reporting…":"Report issue"}</button></form>;
}

function Hidden({organisationId,projectId}:Base){return <><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/></>}
function Date({name,label,value}:{name:string;label:string;value:string}){return <label><span className="ev-label">{label}</span><input className="ev-input" name={name} type="date" defaultValue={value}/></label>}
function Status({state}:{state:WorkflowState}){return state?.message?<p className={`mt-4 text-xs ${state.ok?"text-[#0c5b45]":"text-[#a5452f]"}`} role={state.ok?"status":"alert"}>{state.message}</p>:null}
function BriefDatum({label,value,warn=false}:{label:string;value:string;warn?:boolean}){return <div><p className="ev-label">{label}</p><p className={`mt-1 text-sm font-semibold ${warn?"text-[#a5452f]":""}`}>{value}</p></div>}
function formatDisplayDate(value:string){return value?new globalThis.Date(`${value}T00:00:00`).toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"}):"Not planned"}
