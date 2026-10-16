"use client";
import {FieldWithHelp} from "@/components/field-with-help";
import {HelpTip} from "@/components/help-tip";
import {disciplineLabel} from "@/lib/project-disciplines";

import {useActionState,useEffect,useId,useRef,useState} from "react";
import {AlertTriangle,CalendarRange,Pencil,ShieldCheck,UsersRound,X} from "lucide-react";
import {createProjectIssue,updateProjectBrief,upsertResourcePlan,type WorkflowState} from "@/app/app/workflow-actions";
import {PROJECT_DELIVERY_STAGES,projectDeliveryStageLabel,projectTerminalIssueStatus,type ProjectDeliveryStage} from "@/lib/project-delivery-stage";

type Base={organisationId:string;projectId:string};
type Discipline={code:string;name:string};
type ProjectBriefProps=Base&{introduction:string;objectives:string[];startDate:string;endDate:string;deliveryStage:ProjectDeliveryStage|null};

export function EditableProjectBrief({organisationId,projectId,introduction,objectives,startDate,endDate,deliveryStage,dccCount,editable=true,embedded=false}:ProjectBriefProps&{dccCount:number|null;editable?:boolean;embedded?:boolean}){
  const [editing,setEditing]=useState(false);
  return <article className={embedded?"min-w-0":"ev-card p-5 sm:p-6"}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="ev-label">Project brief</p><h2 className="mt-1 text-lg font-semibold">Introduction and key objectives</h2></div>
      {editable&&<button className="ev-button-secondary" type="button" onClick={()=>setEditing(value=>!value)} aria-expanded={editing}>
        {editing?<><X size={16}/> Close editor</>:<><Pencil size={16}/> Edit project brief</>}
      </button>}
    </div>
    {editing?<ProjectBriefForm organisationId={organisationId} projectId={projectId} introduction={introduction} objectives={objectives} startDate={startDate} endDate={endDate} deliveryStage={deliveryStage} embedded/>:<>
      <div className="mt-5 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="ev-label">Project introduction</p>
          <p className="mt-3 max-w-4xl whitespace-pre-line text-sm leading-7 text-[#24384f]">{introduction||"No project introduction has been recorded."}</p>
          <div className="mt-5"><p className="ev-label">Key objectives</p>{objectives.length?<ol className="mt-3 grid gap-2 text-sm text-[#24384f] sm:grid-cols-2">{objectives.map((objective,index)=><li className="flex gap-2" key={`${index}-${objective}`}><span className="font-bold text-[#e8733f]">{index+1}.</span><span>{objective}</span></li>)}</ol>:<p className="mt-2 text-sm text-[#617083]">No key objectives have been recorded.</p>}</div>
        </div>
        <ShieldCheck className="shrink-0 text-[#10243e]" aria-hidden="true"/>
      </div>
      <div className="mt-5 grid gap-3 border-t border-[#d6e0ed] pt-5 sm:grid-cols-2 xl:grid-cols-4"><BriefDatum label="Delivery stage" value={projectDeliveryStageLabel(deliveryStage)} warn={!deliveryStage}/><BriefDatum label="100% issue milestone" value={projectTerminalIssueStatus(deliveryStage)} warn={!deliveryStage}/><BriefDatum label="Planned start" value={formatDisplayDate(startDate)}/><BriefDatum label="Planned completion" value={formatDisplayDate(endDate)}/><BriefDatum label="DCC appointed" value={dccCount===null?"Unavailable":dccCount?`${dccCount} active`:"Not appointed"} warn={dccCount===0}/></div>
    </>}
  </article>;
}

export function ProjectBriefForm({organisationId,projectId,introduction,objectives,startDate,endDate,deliveryStage,embedded=false}:ProjectBriefProps&{embedded?:boolean}){
  const [state,action,pending]=useActionState<WorkflowState,FormData>(updateProjectBrief,undefined);
  return <form action={action} className={embedded?"mt-5 border-t border-[#d6e0ed] pt-5":"ev-card p-5 sm:p-6"}>
    <Hidden organisationId={organisationId} projectId={projectId}/>
    {!embedded&&<div className="flex items-center gap-2"><CalendarRange size={18} className="text-[#e8733f]"/><h2 className="font-semibold">Project brief and timeline</h2></div>}
    <FieldWithHelp className={embedded?"block":"mt-4 block"} label={<>Engineering delivery stage</>} helpLabel="Engineering delivery stage" help={<>This controls revision credit throughout project dashboards and reports. Review and Approval remain partial progress unless they are the project&apos;s terminal milestone.</>}><select className="ev-input" name="deliveryStage" defaultValue={deliveryStage??""} required><option value="" disabled>Select Concept, FEED or DED</option>{PROJECT_DELIVERY_STAGES.map(stage=><option value={stage.value} key={stage.value}>{stage.label} — 100% at {stage.terminalIssueStatus}</option>)}</select></FieldWithHelp>
    <FieldWithHelp className="mt-4 block" label={<>Project introduction</>} helpLabel="Project introduction guidance" help={<>This is the first project context shown to the Document Controller and invited engineers.</>}><textarea className="ev-input min-h-28 resize-y" name="introduction" defaultValue={introduction} placeholder="Briefly explain the project background, scope and intended outcome." minLength={20} maxLength={4000} required/></FieldWithHelp>
    <FieldWithHelp className="mt-4 block" label={<>Key objectives</>} helpLabel="Key objectives guidance" help={<>Enter one clear objective per line, up to 12 objectives.</>}><textarea className="ev-input min-h-36 resize-y" name="keyObjectives" defaultValue={objectives.join("\n")} placeholder={"Complete the conductor engineering assessment\nIssue approved discipline deliverables\nClose all identified design risks"} maxLength={6500} required/></FieldWithHelp>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><Date name="startDate" label="Planned start" value={startDate}/><Date name="endDate" label="Planned completion" value={endDate}/></div>
    <Status state={state}/><button className="ev-button mt-5" disabled={pending}>{pending?"Saving…":"Save project brief"}</button>
  </form>;
}

export function ResourcePlanForm({organisationId,projectId,disciplines,embedded=false}:Base&{disciplines:Discipline[];embedded?:boolean}){
  const [state,action,pending]=useActionState<WorkflowState,FormData>(upsertResourcePlan,undefined);
  const form=useRef<HTMLFormElement>(null);
  const titleId=useId();
  function revealDisclosure(){
    const disclosure=form.current?.closest("details");
    if(disclosure)disclosure.open=true;
  }
  useEffect(()=>{
    if(!state?.message)return;
    const disclosure=form.current?.closest("details");
    if(disclosure)disclosure.open=true;
  },[state]);
  return <form ref={form} action={action} aria-labelledby={titleId} aria-busy={pending} onInvalidCapture={revealDisclosure} className={embedded?"min-w-0":"ev-card min-w-0 p-4 sm:p-5"}>
    <Hidden organisationId={organisationId} projectId={projectId}/>
    <div className="flex min-w-0 items-center gap-2"><UsersRound size={18} className="shrink-0 text-[#10243e]" aria-hidden="true"/><h2 id={titleId} className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">Plan discipline resources</h2><HelpTip label="Resource planning">Set how many engineers the project needs, then use the invitation button at the top of this page to fill the requirement.</HelpTip></div>
    {!disciplines.length&&<p className="mt-3 rounded-lg bg-[#f4f7fb] p-3 text-sm text-[#617083]">Add a project discipline before planning its resources.</p>}
    <div className="mt-4 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,.65fr)]">
      <label className="min-w-0"><span className="ev-label">Discipline</span><select className="ev-input min-h-11 w-full" name="discipline" required defaultValue=""><option value="" disabled>Select discipline</option>{disciplines.map(item=><option key={item.name} value={item.name}>{disciplineLabel(item)}</option>)}</select></label>
      <label className="min-w-0"><span className="ev-label">Required engineers</span><input className="ev-input min-h-11 w-full" name="requiredCount" type="number" min="0" max="100" defaultValue="1" required/></label>
      <label className="min-w-0 sm:col-span-2"><span className="ev-label">Notes</span><input className="ev-input min-h-11 w-full" name="notes" maxLength={500} placeholder="Lead, seniority or mobilisation notes"/></label>
    </div>
    <Status state={state}/><button className="ev-button mt-4 min-h-11 w-full sm:w-auto" disabled={pending||!disciplines.length}>{pending?"Saving…":"Save resource requirement"}</button>
  </form>;
}

export function ProjectIssueForm({organisationId,projectId,embedded=false}:Base&{embedded?:boolean}){
  const [state,action,pending]=useActionState<WorkflowState,FormData>(createProjectIssue,undefined);
  return <form action={action} className={embedded?"p-4 sm:p-5":"ev-card p-5 sm:p-6"}><Hidden organisationId={organisationId} projectId={projectId}/><div className="flex items-center gap-2"><AlertTriangle size={18} className="text-[#e8733f]"/><h2 className="font-semibold">Report project issue</h2></div><label className="mt-4 block"><span className="ev-label">Issue title</span><input className="ev-input" name="title" minLength={2} maxLength={160} required/></label><label className="mt-4 block"><span className="ev-label">Description</span><textarea className="ev-input min-h-24 resize-y" name="description" maxLength={2000}/></label><div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="ev-label">Severity</span><select className="ev-input" name="severity" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label><Date name="dueDate" label="Target resolution" value=""/></div><label className="mt-4 block"><span className="ev-label">Issue owner</span><input className="ev-input" name="owner" maxLength={100} placeholder="Responsible person or team"/></label><Status state={state}/><button className="ev-button mt-5" disabled={pending}>{pending?"Reporting…":"Report issue"}</button></form>;
}

function Hidden({organisationId,projectId}:Base){return <><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/></>}
function Date({name,label,value}:{name:string;label:string;value:string}){return <label><span className="ev-label">{label}</span><input className="ev-input" name={name} type="date" defaultValue={value}/></label>}
function Status({state}:{state:WorkflowState}){return state?.message?<p className={`mt-4 text-xs ${state.ok?"text-[#10243e]":"text-[#a5452f]"}`} role={state.ok?"status":"alert"}>{state.message}</p>:null}
function BriefDatum({label,value,warn=false}:{label:string;value:string;warn?:boolean}){return <div><p className="ev-label">{label}</p><p className={`mt-1 text-sm font-semibold ${warn?"text-[#a5452f]":""}`}>{value}</p></div>}
function formatDisplayDate(value:string){if(!value)return "Not planned";const date=new globalThis.Date(`${value}T00:00:00Z`);return Number.isNaN(date.getTime())?"Not planned":date.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"})}
