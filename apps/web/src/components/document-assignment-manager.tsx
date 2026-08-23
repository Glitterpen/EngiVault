"use client";

import {useActionState} from "react";
import {CheckCircle2,UserCheck,UserMinus} from "lucide-react";
import {setDocumentAssignment,type WorkflowState} from "@/app/app/workflow-actions";

export type AssignableEngineer={userId:string;name:string;email:string;assigned:boolean};

export function DocumentAssignmentManager({organisationId,projectId,documentId,discipline,engineers}:{organisationId:string;projectId:string;documentId:string;discipline:string;engineers:AssignableEngineer[]}){
  return <div className="ev-card p-6">
    <div className="flex items-center gap-2"><UserCheck size={18} className="text-[#e8733f]"/><h2 className="font-bold">Assign discipline engineer</h2></div>
    <p className="mt-3 text-sm leading-6 text-[#617083]">Choose only from active <strong className="text-[#10243e]">{discipline}</strong> engineers already invited by the Project Manager. Assignment gives the engineer upload access to this MDR deliverable.</p>
    {engineers.length?<div className="mt-5 divide-y divide-[#edf1ef] rounded-xl border border-[#dfe7e3]">{engineers.map(engineer=><AssignmentControl key={engineer.userId} organisationId={organisationId} projectId={projectId} documentId={documentId} engineer={engineer}/>)}</div>:<div className="mt-5 rounded-xl border border-[#efc7bb] bg-[#fff7f4] p-4 text-sm leading-6 text-[#8b3d1f]"><strong>No eligible {discipline} engineer is available.</strong><br/>Ask the Project Manager to invite and authorise the discipline engineer first.</div>}
  </div>;
}

function AssignmentControl({organisationId,projectId,documentId,engineer}:{organisationId:string;projectId:string;documentId:string;engineer:AssignableEngineer}){
  const [state,action,pending]=useActionState<WorkflowState,FormData>(setDocumentAssignment,undefined);
  return <div className="p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold text-[#10243e]">{engineer.name}</p>{engineer.assigned&&<span className="inline-flex items-center gap-1 rounded-full bg-[#e8f1ed] px-2 py-1 text-[10px] font-bold uppercase text-[#0c5b45]"><CheckCircle2 size={12}/> Assigned</span>}</div><p className="mt-1 truncate text-xs text-[#617083]">{engineer.email}</p></div>
      <form action={action}><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="documentId" value={documentId}/><input type="hidden" name="userId" value={engineer.userId}/><input type="hidden" name="enabled" value={engineer.assigned?"false":"true"}/><button className={engineer.assigned?"ev-button-secondary":"ev-button"} disabled={pending}>{engineer.assigned?<><UserMinus size={15}/>{pending?"Removing…":"Remove"}</>:<><UserCheck size={15}/>{pending?"Assigning…":"Assign MDR"}</>}</button></form>
    </div>
    {state?.message&&<p className={`mt-3 rounded-lg border p-2.5 text-xs ${state.ok?"border-[#cfe1d8] bg-[#f3f8f5] text-[#0c5b45]":"border-[#efc7bb] bg-[#fff7f4] text-[#8b3d1f]"}`} role={state.ok?"status":"alert"}>{state.message}</p>}
  </div>;
}
