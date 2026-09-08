"use client";

import {useActionState} from "react";
import {updateRevisionCycle} from "@/app/app/revision-cycle-actions";

export function RevisionCycleForm({organisationId,projectId,days,readOnly=false}:{organisationId:string;projectId:string;days:number|null;readOnly?:boolean}){
  const [state,action,pending]=useActionState(updateRevisionCycle,{});
  return <section className="ev-card p-5 sm:p-6">
    <h2 className="font-semibold">MDR revision cycle</h2>
    <p className="mt-2 text-sm leading-6 text-[#617083]">After the first issue, each next revision is due this many working days after the previous issue date. Monday–Friday only; public holidays are counted. The issue day is day zero.</p>
    {readOnly?<p className="mt-3 text-sm font-semibold">{days?`${days} working days`:"Not yet set by the Project Manager"}</p>:<form action={action} className="mt-4">
      <input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/>
      <label className="block"><span className="ev-label">Revision cycle (working days)</span><input className="ev-input max-w-xs" name="workingDays" type="number" min={1} max={365} step={1} required defaultValue={days??""} placeholder="e.g. 3"/></label>
      <p className="mt-2 text-xs leading-5 text-[#617083]">A 3-day cycle after Friday is due Wednesday and overdue Thursday. The first-issue plan stays unchanged. Changing this setting recalculates all open revision deadlines; older issues may become overdue immediately.</p>
      {state.message&&<p role={state.ok?"status":"alert"} className={`mt-3 text-sm ${state.ok?"text-[#0c5b45]":"text-[#a5452f]"}`}>{state.message}</p>}
      <button className="ev-button mt-4" disabled={pending}>{pending?"Saving…":"Save revision cycle"}</button>
    </form>}
  </section>;
}
