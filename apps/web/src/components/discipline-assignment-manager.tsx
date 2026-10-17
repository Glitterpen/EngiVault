"use client";

import {HelpTip} from "@/components/help-tip";
import {useActionState,useState} from "react";
import {ChevronDown,UserCheck} from "lucide-react";
import {assignDisciplineDocuments,type WorkflowState} from "@/app/app/workflow-actions";
import type {DisciplineAssignmentScope} from "@/lib/discipline-assignment-scopes";

export function DisciplineAssignmentManager({organisationId,projectId,disciplines,readOnly=false,embedded=false}:{organisationId:string;projectId:string;disciplines:DisciplineAssignmentScope[];readOnly?:boolean;embedded?:boolean}){
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

  const Container=embedded?"section":"details";
  const Heading=embedded?"div":"summary";
  return <Container className="group ev-card min-w-0 overflow-hidden">
    <Heading className={`flex min-h-11 list-none items-center justify-between gap-3 px-4 py-2 sm:px-5 ${embedded?"":"cursor-pointer"}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2"><h2 className="text-sm font-semibold text-[#10243e]">Assign deliverables by discipline</h2><span className="text-xs text-[#617083]">{awaiting.length?`${awaiting.length} ${awaiting.length===1?"discipline":"disciplines"} outstanding`:"Up to date"}</span><HelpTip label="Discipline allocations">Choose a discipline and a Project Manager-appointed engineer to assign their remaining deliverables. Fully assigned combinations appear under View assigned allocations.</HelpTip></div>
      {!embedded&&<ChevronDown size={17} aria-hidden="true" className="shrink-0 text-[#617083] transition group-open:rotate-180"/>}
    </Heading>
    {readOnly?<div className="border-t border-[#e4e9ee] p-4 text-sm text-[#617083]"><p>Read-only preview. Assignment changes are unavailable.</p>{awaiting.length>0&&<ul className="mt-3 space-y-2">{awaiting.map(item=><li key={item.name} className="break-words"><span className="font-semibold">{item.name}</span> · {item.documentCount} deliverables · {item.engineers.length?item.engineers.map(member=>`${member.name}: ${member.remainingCount} remaining`).join("; "):"No appointed engineer"}</li>)}</ul>}</div>:awaiting.length?<form action={action} className="border-t border-[#e4e9ee] p-4 sm:p-5">
      <input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/>
      <div className={`grid gap-4 ${embedded?"sm:grid-cols-2":"lg:grid-cols-[1fr_1.35fr_auto] lg:items-end"}`}>
        <label className="min-w-0"><span className="ev-label">MDR discipline</span><select className="ev-input w-full min-w-0" name="discipline" value={discipline} disabled={pending} onChange={event=>changeDiscipline(event.target.value)}>{awaiting.map(item=><option key={item.name} value={item.name}>{item.name} · {item.documentCount} deliverable{item.documentCount===1?"":"s"}</option>)}</select></label>
        <label className="min-w-0"><span className="ev-label">PM-appointed engineer</span><select className="ev-input w-full min-w-0" name="userId" value={engineerId} onChange={event=>setEngineerId(event.target.value)} disabled={pending||!eligible.length}>{!eligible.length&&<option value="">No eligible engineer in this discipline</option>}{eligible.map(engineer=><option key={engineer.userId} value={engineer.userId}>{engineer.name} · {engineer.email} · {engineer.remainingCount} remaining</option>)}</select></label>
        <button className="ev-button whitespace-nowrap" disabled={pending||!engineerId||!scope}><UserCheck size={16}/>{pending?"Assigning…":`Assign remaining ${engineer?.remainingCount??0}`}</button>
      </div>
      {!eligible.length&&discipline&&<p className="mt-3 rounded-xl border border-[#efc7bb] bg-[#fff7f4] p-3 text-xs leading-5 text-[#8b3d1f]">No active {discipline} engineer is available. Ask the Project Manager to appoint that engineer first.</p>}
    </form>:<p className="border-t border-[#e4e9ee] p-5 text-sm text-[#10243e]" role="status">All current deliverables are assigned to the eligible engineers. New or unassigned deliverables will appear here when available.</p>}
    {state?.message&&<p className={`mx-5 mb-4 rounded-xl border p-3 text-xs ${state.ok?"border-[#d6e0ed] bg-[#f4f7fb] text-[#10243e]":"border-[#efc7bb] bg-[#fff7f4] text-[#8b3d1f]"}`} role={state.ok?"status":"alert"}>{state.message}</p>}
    {assigned.length>0&&<details className="border-t border-[#e4e9ee] px-4 py-2 sm:px-5"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-[#10243e]">View assigned allocations ({assigned.length})</summary><HelpTip label="Manage existing allocations">Open an individual MDR deliverable to review or remove its assignment.</HelpTip><ul className="mb-2 mt-3 grid gap-3 sm:grid-cols-2">{assigned.map(({scope,engineer})=><li key={`${scope.name}:${engineer.userId}`} className="min-w-0 rounded-xl bg-[#f4f7fb] p-3"><p className="break-words text-sm font-semibold">{scope.name} · {engineer.name}</p><p className="mt-1 break-all text-xs text-[#617083]">{engineer.email}</p><p className="mt-2 text-xs text-[#10243e]">{engineer.assignedCount} of {scope.documentCount} assigned · {engineer.remainingCount?`${engineer.remainingCount} remaining`:"Fully assigned"}</p></li>)}</ul></details>}
  </Container>;
}
