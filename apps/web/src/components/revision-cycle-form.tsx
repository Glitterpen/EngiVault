"use client";

import {useActionState,useId,useState} from "react";
import {CircleHelp} from "lucide-react";
import {updateRevisionCycle} from "@/app/app/revision-cycle-actions";

export function RevisionCycleForm({organisationId,projectId,days,readOnly=false}:{organisationId:string;projectId:string;days:number|null;readOnly?:boolean}){
  const [state,action,pending]=useActionState(updateRevisionCycle,{});
  const helpId=useId();
  const [helpOpen,setHelpOpen]=useState(false);
  return <section className="ev-card p-5 sm:p-6">
    <div className="relative flex items-center gap-2">
      <h2 className="font-semibold">MDR revision cycle</h2>
      <div onMouseEnter={()=>setHelpOpen(true)} onMouseLeave={()=>setHelpOpen(false)} onFocus={()=>setHelpOpen(true)} onBlur={()=>setHelpOpen(false)} onKeyDown={event=>{if(event.key==="Escape"){setHelpOpen(false);event.stopPropagation();}}}>
        <button type="button" aria-label="About the MDR revision cycle" aria-describedby={helpOpen?helpId:undefined} onClick={()=>setHelpOpen(true)} className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#617083] hover:bg-[#edf2f7] hover:text-[#142d48] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#142d48]">
          <CircleHelp size={18} aria-hidden="true"/>
        </button>
        {helpOpen&&<div id={helpId} role="tooltip" className="absolute left-0 top-full z-20 w-96 max-w-full rounded-lg border border-[#d7e0e9] bg-white p-4 text-sm leading-6 text-[#617083] shadow-lg">
          <p>After the first issue, each next revision is due this many working days after the previous issue date. Monday–Friday only; public holidays are counted. The issue day is day zero.</p>
          <p className="mt-2">A 3-day cycle after Friday is due Wednesday and overdue Thursday. The first-issue plan stays unchanged.</p>
          <p className="mt-2">Changing this setting recalculates all open revision deadlines; older issues may become overdue immediately.</p>
        </div>}
      </div>
    </div>
    {readOnly?<p className="mt-3 text-sm font-semibold">{days?`${days} working days`:"Not yet set by the Project Manager"}</p>:<form action={action} className="mt-4">
      <input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/>
      <label className="block"><span className="ev-label">Revision cycle (working days)</span><input className="ev-input max-w-xs" name="workingDays" type="number" min={1} max={365} step={1} required defaultValue={days??""} placeholder="e.g. 3"/></label>
      {state.message&&<p role={state.ok?"status":"alert"} className={`mt-3 text-sm ${state.ok?"text-[#0c5b45]":"text-[#a5452f]"}`}>{state.message}</p>}
      <button className="ev-button mt-4" disabled={pending}>{pending?"Saving…":"Save revision cycle"}</button>
    </form>}
  </section>;
}
