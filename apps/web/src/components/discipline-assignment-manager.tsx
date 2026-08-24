"use client";

import {useActionState,useMemo,useState} from "react";
import {ChevronDown,Layers3,Mail,UserCheck} from "lucide-react";
import {assignDisciplineDocuments,type WorkflowState} from "@/app/app/workflow-actions";

export type DisciplineAssignmentEngineer={userId:string;name:string;email:string;disciplines:string[]};
export type DisciplineAssignmentScope={name:string;documentCount:number};

export function DisciplineAssignmentManager({organisationId,projectId,disciplines,engineers}:{organisationId:string;projectId:string;disciplines:DisciplineAssignmentScope[];engineers:DisciplineAssignmentEngineer[]}){
  const firstAvailable=disciplines.find(scope=>eligibleEngineers(engineers,scope.name).length>0)?.name??disciplines[0]?.name??"";
  const [discipline,setDiscipline]=useState(firstAvailable);
  const eligible=useMemo(()=>eligibleEngineers(engineers,discipline),[discipline,engineers]);
  const [engineerId,setEngineerId]=useState(eligible[0]?.userId??"");
  const [state,action,pending]=useActionState<WorkflowState,FormData>(assignDisciplineDocuments,undefined);
  const scope=disciplines.find(item=>normalise(item.name)===normalise(discipline));

  function changeDiscipline(value:string){
    setDiscipline(value);
    setEngineerId(eligibleEngineers(engineers,value)[0]?.userId??"");
  }

  return <details className="group ev-card mt-6 overflow-hidden" open>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-5">
      <div className="flex min-w-0 items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e8f1ed] text-[#0c5b45]"><Layers3 size={19}/></span><div><h2 className="font-semibold text-[#10243e]">Assign deliverables by discipline</h2><p className="mt-1 text-xs leading-5 text-[#617083]">Allocate every active MDR deliverable in a discipline at once. Only engineers already appointed by the Project Manager are available.</p></div></div>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#dce3e9] bg-[#f8fafb] text-[#617083]"><ChevronDown size={17} className="transition group-open:rotate-180"/></span>
    </summary>
    <form action={action} className="border-t border-[#e4e9ee] p-4 sm:p-5">
      <input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.35fr_auto] lg:items-end">
        <label><span className="ev-label">MDR discipline</span><select className="ev-input" name="discipline" value={discipline} onChange={event=>changeDiscipline(event.target.value)}>{disciplines.map(item=><option key={item.name} value={item.name}>{item.name} · {item.documentCount} deliverable{item.documentCount===1?"":"s"}</option>)}</select></label>
        <label><span className="ev-label">PM-appointed engineer</span><select className="ev-input" name="userId" value={engineerId} onChange={event=>setEngineerId(event.target.value)} disabled={!eligible.length}><option value="">{eligible.length?"Select engineer":"No eligible engineer in this discipline"}</option>{eligible.map(engineer=><option key={engineer.userId} value={engineer.userId}>{engineer.name} · {engineer.email}</option>)}</select></label>
        <button className="ev-button whitespace-nowrap" disabled={pending||!engineerId||!scope}><UserCheck size={16}/>{pending?"Assigning…":`Assign all ${scope?.documentCount??0}`}</button>
      </div>
      {!eligible.length&&discipline&&<p className="mt-3 rounded-xl border border-[#efc7bb] bg-[#fff7f4] p-3 text-xs leading-5 text-[#8b3d1f]">No active {discipline} engineer is available. Ask the Project Manager to appoint that engineer first.</p>}
      {state?.message&&<p className={`mt-3 rounded-xl border p-3 text-xs ${state.ok?"border-[#cfe1d8] bg-[#f3f8f5] text-[#0c5b45]":"border-[#efc7bb] bg-[#fff7f4] text-[#8b3d1f]"}`} role={state.ok?"status":"alert"}>{state.message}</p>}
      <p className="mt-4 flex items-center gap-2 text-xs text-[#617083]"><Mail size={14}/> A single consolidated email and in-app notification are sent for new assignments. Existing individual assignments are preserved.</p>
    </form>
  </details>;
}

function eligibleEngineers(engineers:DisciplineAssignmentEngineer[],discipline:string){return engineers.filter(engineer=>engineer.disciplines.some(value=>normalise(value)===normalise(discipline)))}
function normalise(value:string){return value.trim().replaceAll(/\s+/g," ").toLocaleLowerCase("en")}
