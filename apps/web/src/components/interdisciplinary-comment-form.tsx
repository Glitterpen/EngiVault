"use client";

import {startTransition,useActionState,useId,useState} from "react";
import {recordInterdisciplinaryComment} from "@/app/app/interdisciplinary-actions";

export function InterdisciplinaryCommentForm({organisationId,projectId,revisionId,compact=false}:{organisationId:string;projectId:string;revisionId:string;compact?:boolean}){
  const [state,action,pending]=useActionState(recordInterdisciplinaryComment,{});
  const [body,setBody]=useState("");
  const [kind,setKind]=useState("comment");
  const id=useId();
  const form=<form action={action} onSubmit={event=>{
    // Preserve the draft and message type on a rejected action rather than
    // allowing the native post-action form reset to discard either value.
    event.preventDefault();const data=new FormData(event.currentTarget);startTransition(()=>action(data));
  }} aria-label="Add interdisciplinary comment or query" className="space-y-3">
    <input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="revisionId" value={revisionId}/>
    <fieldset disabled={pending} className="min-w-0 space-y-3">
      <fieldset><legend className="ev-label">Message type</legend><div className="flex flex-wrap gap-x-5"><label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="radio" name="kind" value="comment" checked={kind==="comment"} onChange={()=>setKind("comment")}/>Comment / reply</label><label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="radio" name="kind" value="query" checked={kind==="query"} onChange={()=>setKind("query")}/>Query — response requested</label></div></fieldset>
      <label className="block" htmlFor={`${id}-body`}><span className="ev-label">Comment or query</span><textarea id={`${id}-body`} name="body" aria-describedby={`${id}-scope`} className="ev-input min-h-28 py-3" required minLength={5} maxLength={2000} value={body} onChange={event=>setBody(event.target.value)}/></label>
      <p id={`${id}-scope`} className="text-xs leading-5 text-[#617083]">The document team receives this message. Comments do not change DCC approval or record a formal sign-off.</p>
      <button className="ev-button min-h-11 w-full sm:w-auto" type="submit">{pending?"Sending…":"Send message"}</button>
    </fieldset>
    {state.message&&<p role={state.ok?"status":"alert"} className={`text-sm leading-6 ${state.ok?"text-[#10243e]":"text-[#a5452f]"}`}>{state.message}</p>}
  </form>;
  if(compact)return <details className="mt-3 min-w-0 rounded-xl border border-[#d6e0ed] bg-white"><summary className="flex min-h-11 cursor-pointer items-center px-3 py-2 text-sm font-semibold text-[#10243e]">Add comment or query</summary><div className="border-t border-[#d6e0ed] p-3">{form}</div></details>;
  return <section className="ev-card min-w-0 p-5 sm:p-6"><h2 className="mb-4 font-semibold">Add comment or query</h2>{form}</section>;
}
