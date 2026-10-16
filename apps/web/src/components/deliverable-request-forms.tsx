"use client";

import {FieldWithHelp} from "@/components/field-with-help";
import {HelpTip} from "@/components/help-tip";
import {useActionState,useEffect,useRef,useState} from "react";
import {ChevronDown,Plus} from "lucide-react";
import {DocumentTypeInput} from "@/components/document-type-input";
import {submitDeliverableRequest,decideDeliverableRequest,cancelDeliverableRequest,type DeliverableRequestState} from "@/app/app/deliverable-request-actions";
import type {DeliverableRequest} from "@/lib/deliverable-requests";

export type RequestDocument={id:string;document_number:string;title:string;due_date:string};
type Scope={organisationId:string;projectId:string};
export function NewDeliverableRequestForm({organisationId,projectId,documents,disciplines,documentTypes,selectedDocument}:{organisationId:string;projectId:string;documents:RequestDocument[];disciplines:string[];documentTypes:{code:string;name:string}[];selectedDocument?:string}){
  const [kind,setKind]=useState("date_change");
  const [state,action,pending]=useActionState(submitDeliverableRequest,{});
  const disclosure=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{if((pending||state.message)&&disclosure.current)disclosure.current.open=true;},[pending,state.message]);
  const today=new Date().toISOString().slice(0,10);
  return <details ref={disclosure} id="new-request" open={Boolean(selectedDocument)} className="ev-card group/new-request min-w-0 scroll-mt-24" onInvalidCapture={()=>{if(disclosure.current)disclosure.current.open=true;}}>
    <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-2xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0c5b45] sm:px-5 [&::-webkit-details-marker]:hidden">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f0f4f3] text-[#0c5b45]"><Plus size={17} aria-hidden="true"/></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">New request</span><span className="mt-0.5 block text-xs text-[#617083]">{pending?"Sending request…":"Submission date or additional deliverable"}</span></span>
      <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-[#617083] transition-transform group-open/new-request:rotate-180 motion-reduce:transition-none"/>
    </summary>
    <form action={action} aria-label="New deliverable request" aria-busy={pending} className="min-w-0 space-y-4 border-t border-[#e6ecea] p-4 sm:p-5">
      <ScopeFields organisationId={organisationId} projectId={projectId}/>
      <label className="block min-w-0"><span className="ev-label">Request type</span><select className="ev-input min-h-11 w-full" name="kind" value={kind} onChange={event=>setKind(event.target.value)}><option value="date_change">Change a submission date</option><option value="additional_deliverable">Add an additional deliverable</option></select></label>
      {kind==="date_change"?<>
        <label className="block min-w-0"><span className="ev-label">Assigned deliverable</span><select className="ev-input min-h-11 w-full" name="documentId" required defaultValue={documents.some(doc=>doc.id===selectedDocument)?selectedDocument:""}><option value="" disabled>Select a deliverable</option>{documents.map(doc=><option value={doc.id} key={doc.id}>{doc.document_number} · {doc.title} · Due {doc.due_date}</option>)}</select></label>
        {!documents.length&&<p className="text-sm text-[#617083]">No assigned deliverables currently have a changeable submission deadline.</p>}
        <div className="flex items-center gap-2 text-xs text-[#526675]"><span>PM approval → DCC acceptance</span><HelpTip label="Submission-date approval workflow">Project Manager approval → DCC acceptance. Your existing deadline stays in force until both steps are complete.</HelpTip></div>
      </>:<>
        <label className="block min-w-0"><span className="ev-label">Deliverable title</span><input className="ev-input min-h-11 w-full" name="title" minLength={2} maxLength={240} required/></label>
        <div className="grid min-w-0 items-end gap-4 sm:grid-cols-2"><div className="min-w-0 [&>div]:mt-0 [&_input]:min-h-11"><DocumentTypeInput suggestions={documentTypes}/></div>
          <label className="block min-w-0"><span className="ev-label">Authorised discipline</span><select className="ev-input min-h-11 w-full" name="discipline" required defaultValue=""><option value="" disabled>Select your discipline</option>{disciplines.map(discipline=><option key={discipline}>{discipline}</option>)}</select></label>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#526675]"><span>DCC approval and numbering</span><HelpTip label="Additional deliverable approval">DCC assigns the document number on approval. The approved deliverable will be assigned to you.</HelpTip></div>
      </>}
      <div className="grid min-w-0 items-start gap-4 border-t border-[#e6ecea] pt-4 sm:grid-cols-[minmax(0,.65fr)_minmax(0,1fr)]">
        <label className="block min-w-0"><span className="ev-label">{kind==="date_change"?"Requested submission date":"Planned first-issue date"}</span><input className="ev-input min-h-11 w-full" name="requestedDate" type="date" min={today} required/></label>
        <label className="block min-w-0"><span className="ev-label">Reason for request</span><textarea className="ev-input min-h-24 w-full resize-y py-3" name="reason" minLength={5} maxLength={2000} required/></label>
      </div>
      <Result state={state}/>
      <button className="ev-button min-h-11 w-full sm:w-auto" disabled={pending||(kind==="date_change"?!documents.length:!disciplines.length)}>{pending?"Sending…":"Send request"}</button>
    </form>
  </details>;
}
export function DeliverableRequestReviewForm({organisationId,projectId,request}:{organisationId:string;projectId:string;request:DeliverableRequest}){
  const [state,action,pending]=useActionState(decideDeliverableRequest,{});
  const [decision,setDecision]=useState("approve");
  const disclosure=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{if((pending||state.message)&&disclosure.current)disclosure.current.open=true;},[pending,state.message]);
  const numbering=request.kind==="additional_deliverable";
  return <details ref={disclosure} className="group/review mt-4 min-w-0 rounded-xl border border-[#dfe7e3]" onInvalidCapture={()=>{if(disclosure.current)disclosure.current.open=true;}}>
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[#0c5b45] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0c5b45] [&::-webkit-details-marker]:hidden"><span>{pending?"Saving decision…":"Review request"}</span><ChevronDown size={16} aria-hidden="true" className="shrink-0 transition-transform group-open/review:rotate-180 motion-reduce:transition-none"/></summary>
    <form action={action} aria-label="Review deliverable request" aria-busy={pending} className="space-y-4 border-t border-[#dfe7e3] p-3 sm:p-4">
    <ScopeFields organisationId={organisationId} projectId={projectId}/><input name="requestId" type="hidden" value={request.id}/>
    <div className="grid min-w-0 items-end gap-4 sm:grid-cols-2"><label className={`block min-w-0 ${numbering&&decision==="approve"?"":"sm:col-span-2"}`}><span className="ev-label">Decision</span><select className="ev-input min-h-11 w-full" name="decision" value={decision} onChange={event=>setDecision(event.target.value)}><option value="approve">{request.status==="pending_pm"?"Approve and send to DCC":numbering?"Approve and register deliverable":"Accept new submission date"}</option><option value="reject">Reject request</option></select></label>
      {numbering&&decision==="approve"&&<FieldWithHelp className="block min-w-0" label={<>DCC-assigned document number</>} helpLabel="Document number uniqueness" help={<>Must be unique in the active project MDR. Letter case does not create a different number.</>}><input className="ev-input min-h-11 w-full" name="documentNumber" minLength={2} maxLength={80} required autoComplete="off"/></FieldWithHelp>}
    </div>
    <label className="block min-w-0"><span className="ev-label">{decision==="reject"?"Reason for rejection":"Review comment (optional)"}</span><textarea className="ev-input min-h-20 w-full resize-y py-3" name="comment" minLength={decision==="reject"?5:undefined} maxLength={2000} required={decision==="reject"}/></label>
    <Result state={state}/><button className="ev-button min-h-11 w-full sm:w-auto" disabled={pending}>{pending?"Saving…":"Confirm decision"}</button>
    </form>
  </details>;
}
export function CancelDeliverableRequestForm({organisationId,projectId,requestId}:Scope&{requestId:string}){
  const [state,action,pending]=useActionState(cancelDeliverableRequest,{});
  return <form action={action} aria-label="Cancel deliverable request" aria-busy={pending} className="mt-4 space-y-2"><ScopeFields organisationId={organisationId} projectId={projectId}/><input name="requestId" type="hidden" value={requestId}/><Result state={state}/><button className="ev-button-secondary min-h-11 w-full sm:w-auto" disabled={pending}>{pending?"Cancelling…":"Cancel request"}</button></form>;
}
function ScopeFields({organisationId,projectId}:Scope){return <><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/></>}
function Result({state}:{state:DeliverableRequestState}){return state.message?<p role={state.ok?"status":"alert"} className={`text-sm leading-6 ${state.ok?"text-[#0c5b45]":"text-[#a5452f]"}`}>{state.message}</p>:null}
