"use client";

import {HelpTip} from "@/components/help-tip";
import {useActionState,useState} from "react";
import {ChevronDown,Layers3,Mail,UserCheck} from "lucide-react";
import {assignDisciplineDocuments,type WorkflowState} from "@/app/app/workflow-actions";
import type {DisciplineAssignmentScope} from "@/lib/discipline-assignment-scopes";

export function DisciplineAssignmentManager({organisationId,projectId,disciplines}:{organisationId:string;projectId:string;disciplines:DisciplineAssignmentScope[]}){
  const awaiting=disciplines.filter(scope=>!scope.engineers.length||scope.engineers.some(engineer=>engineer.remainingCount>0));
  const assigned=disciplines.flatMap(scope=>scope.engineers.filter(engineer=>engineer.assignedCount>0).map(engineer=>({scope,engineer})));
  const [selectedDiscipline,setDiscipline]=useState("");
  const [selectedEngineer,setEngineerId]=useState("");
  // Derive valid selections after the server refresh removes completed options.
  const scope=awaiting.find(item=>item.name===selectedDiscipline)??awaiting.find(item=>item.engineers.length>0)??awaiting[0];
  const discipline=scope?.name??"";
  const eligible=scope?.engineers.filter(engineer=>engineer.remainingCount>0)??[];
  const engineer=eligible.find(item=>item.userId===selectedEngineer)??eligible[0];
  const engineerId=engineer?.userId??"";
  const [state,action,pending]=useActionState<WorkflowState,FormData>(assignDisciplineDocuments,undefined);

  function changeDiscipline(value:string){
    setDiscipline(value);
    setEngineerId("");
  }

  return <details className="group ev-card mt-6 overflow-hidden" open>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-5">
      <div className="flex min-w-0 items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e8f1ed] text-[#0c5b45]"><Layers3 size={19}/></span><div><h2 className="font-semibold text-[#10243e]">Assign deliverables by discipline <HelpTip label="Discipline allocations">Only outstanding allocations to PM-appointed engineers appear below. Fully assigned engineer–discipline combinations leave this list automatically.</HelpTip></h2></div></div>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#dce3e9] bg-[#f8fafb] text-[#617083]"><ChevronDown size={17} className="transition group-open:rotate-180"/></span>
    </summary>
    {awaiting.length?<form action={action} className="border-t border-[#e4e9ee] p-4 sm:p-5">
      <input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.35fr_auto] lg:items-end">
        <label className="min-w-0"><span className="ev-label">MDR discipline</span><select className="ev-input w-full min-w-0" name="discipline" value={discipline} disabled={pending} onChange={event=>changeDiscipline(event.target.value)}>{awaiting.map(item=><option key={item.name} value={item.name}>{item.name} · {item.documentCount} deliverable{item.documentCount===1?"":"s"}</option>)}</select></label>
        <label className="min-w-0"><span className="ev-label">PM-appointed engineer</span><select className="ev-input w-full min-w-0" name="userId" value={engineerId} onChange={event=>setEngineerId(event.target.value)} disabled={pending||!eligible.length}>{!eligible.length&&<option value="">No eligible engineer in this discipline</option>}{eligible.map(engineer=><option key={engineer.userId} value={engineer.userId}>{engineer.name} · {engineer.email} · {engineer.remainingCount} remaining</option>)}</select></label>
        <button className="ev-button whitespace-nowrap" disabled={pending||!engineerId||!scope}><UserCheck size={16}/>{pending?"Assigning…":`Assign remaining ${engineer?.remainingCount??0}`}</button>
      </div>
      {!eligible.length&&discipline&&<p className="mt-3 rounded-xl border border-[#efc7bb] bg-[#fff7f4] p-3 text-xs leading-5 text-[#8b3d1f]">No active {discipline} engineer is available. Ask the Project Manager to appoint that engineer first.</p>}
      <HelpTip label="Assignment notifications"><Mail size={14}/> A single consolidated email and in-app notification are sent for new assignments. Existing individual assignments are preserved.</HelpTip>
    </form>:<p className="border-t border-[#e4e9ee] p-5 text-sm text-[#0c5b45]" role="status">All current deliverables are assigned to the eligible engineers. New or unassigned deliverables will appear here when available.</p>}
    {state?.message&&<p className={`mx-5 mb-4 rounded-xl border p-3 text-xs ${state.ok?"border-[#cfe1d8] bg-[#f3f8f5] text-[#0c5b45]":"border-[#efc7bb] bg-[#fff7f4] text-[#8b3d1f]"}`} role={state.ok?"status":"alert"}>{state.message}</p>}
    {assigned.length>0&&<details className="border-t border-[#e4e9ee] p-4 sm:p-5"><summary className="cursor-pointer text-sm font-semibold text-[#0c5b45]">View assigned allocations ({assigned.length})</summary><HelpTip label="Manage existing allocations">These assignments remain active. Open an individual MDR deliverable to review or remove its assignment.</HelpTip><ul className="mt-3 grid gap-3 sm:grid-cols-2">{assigned.map(({scope,engineer})=><li key={`${scope.name}:${engineer.userId}`} className="min-w-0 rounded-xl bg-[#f3f8f5] p-3"><p className="break-words text-sm font-semibold">{scope.name} · {engineer.name}</p><p className="mt-1 break-all text-xs text-[#617083]">{engineer.email}</p><p className="mt-2 text-xs text-[#0c5b45]">{engineer.assignedCount} of {scope.documentCount} assigned · {engineer.remainingCount?`${engineer.remainingCount} remaining`:"Fully assigned"}</p></li>)}</ul></details>}
  </details>;
}
