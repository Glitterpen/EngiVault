"use client";

import {useActionState,useState} from "react";
import {HelpTip} from "@/components/help-tip";
import {recordInterdisciplinaryCheck} from "@/app/app/interdisciplinary-actions";

export function InterdisciplinaryCheckForm({organisationId,projectId,revisionId}:{organisationId:string;projectId:string;revisionId:string}){
  const [state,action,pending]=useActionState(recordInterdisciplinaryCheck,{});
  const [decision,setDecision]=useState("signed_off");
  return <section className="ev-card p-5 sm:p-6">
    <h2 className="flex items-center gap-2 font-semibold">Record your check <HelpTip label="Interdisciplinary sign-off guidance">Check the approved file before submitting. Your sign-off applies only to this revision and never replaces DCC approval. Updated feedback is retained in the history; a new revision requires a new check.</HelpTip></h2>
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="revisionId" value={revisionId}/>
      <label className="block"><span className="ev-label">Interdisciplinary decision</span><select name="decision" className="ev-input" value={decision} onChange={event=>setDecision(event.target.value)}><option value="signed_off">Sign off — no objection</option><option value="changes_requested">Changes requested</option></select></label>
      <label className="block"><span className="ev-label">{decision==="changes_requested"?"Required changes":"Reference or comment (optional)"}</span><textarea name="comment" className="ev-input min-h-28 py-3" maxLength={2000} minLength={decision==="changes_requested"?5:undefined} required={decision==="changes_requested"}/></label>
      <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" name="reviewed" value="yes" required/>I have checked this approved revision.</label>
      {state.message&&<p role={state.ok?"status":"alert"} className={`text-sm leading-6 ${state.ok?"text-[#0c5b45]":"text-[#a5452f]"}`}>{state.message}</p>}
      <button className="ev-button" disabled={pending}>{pending?"Saving…":"Record interdisciplinary check"}</button>
    </form>
  </section>;
}
