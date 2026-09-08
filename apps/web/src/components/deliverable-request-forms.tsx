"use client";

import {useActionState,useState} from "react";
import {DocumentTypeInput} from "@/components/document-type-input";
import {submitDeliverableRequest,decideDeliverableRequest,cancelDeliverableRequest,type DeliverableRequestState} from "@/app/app/deliverable-request-actions";
import type {DeliverableRequest} from "@/lib/deliverable-requests";

export type RequestDocument={id:string;document_number:string;title:string;due_date:string};
type Scope={organisationId:string;projectId:string};
export function NewDeliverableRequestForm({organisationId,projectId,documents,disciplines,documentTypes,selectedDocument}:{organisationId:string;projectId:string;documents:RequestDocument[];disciplines:string[];documentTypes:{code:string;name:string}[];selectedDocument?:string}){
  const [kind,setKind]=useState("date_change");
  const [state,action,pending]=useActionState(submitDeliverableRequest,{});
  const today=new Date().toISOString().slice(0,10);
  return <section id="new-request" className="ev-card p-5 sm:p-6">
    <h2 className="font-semibold">New request</h2>
    <form action={action} className="mt-4 space-y-4">
      <ScopeFields organisationId={organisationId} projectId={projectId}/>
      <label className="block"><span className="ev-label">Request type</span><select className="ev-input" name="kind" value={kind} onChange={event=>setKind(event.target.value)}><option value="date_change">Change a submission date</option><option value="additional_deliverable">Add an additional deliverable</option></select></label>
      {kind==="date_change"?<>
        <label className="block"><span className="ev-label">Assigned deliverable</span><select className="ev-input" name="documentId" required defaultValue={documents.some(doc=>doc.id===selectedDocument)?selectedDocument:""}><option value="" disabled>Select a deliverable</option>{documents.map(doc=><option value={doc.id} key={doc.id}>{doc.document_number} · {doc.title} · Due {doc.due_date}</option>)}</select></label>
        {!documents.length&&<p className="text-sm text-[#617083]">No assigned deliverables currently have a changeable submission deadline.</p>}
        <p className="text-xs leading-5 text-[#617083]">Project Manager approval → DCC acceptance. Your existing deadline stays in force until both steps are complete.</p>
      </>:<>
        <label className="block"><span className="ev-label">Deliverable title</span><input className="ev-input" name="title" minLength={2} maxLength={240} required/></label>
        <DocumentTypeInput suggestions={documentTypes}/>
        <label className="block"><span className="ev-label">Authorised discipline</span><select className="ev-input" name="discipline" required defaultValue=""><option value="" disabled>Select your discipline</option>{disciplines.map(discipline=><option key={discipline}>{discipline}</option>)}</select></label>
        <p className="text-xs leading-5 text-[#617083]">DCC assigns the document number on approval. The approved deliverable will be assigned to you.</p>
      </>}
      <label className="block"><span className="ev-label">{kind==="date_change"?"Requested submission date":"Planned first-issue date"}</span><input className="ev-input" name="requestedDate" type="date" min={today} required/></label>
      <label className="block"><span className="ev-label">Reason for request</span><textarea className="ev-input min-h-24 py-3" name="reason" minLength={5} maxLength={2000} required/></label>
      <Result state={state}/>
      <button className="ev-button" disabled={pending||(kind==="date_change"?!documents.length:!disciplines.length)}>{pending?"Sending…":"Send request"}</button>
    </form>
  </section>;
}
export function DeliverableRequestReviewForm({organisationId,projectId,request}:{organisationId:string;projectId:string;request:DeliverableRequest}){
  const [state,action,pending]=useActionState(decideDeliverableRequest,{});
  const [decision,setDecision]=useState("approve");
  const numbering=request.kind==="additional_deliverable";
  return <form action={action} className="mt-4 space-y-4 rounded-xl border border-[#dfe7e3] bg-[#f8fafb] p-4">
    <ScopeFields organisationId={organisationId} projectId={projectId}/><input name="requestId" type="hidden" value={request.id}/>
    <label className="block"><span className="ev-label">Decision</span><select className="ev-input" name="decision" value={decision} onChange={event=>setDecision(event.target.value)}><option value="approve">{request.status==="pending_pm"?"Approve and send to DCC":numbering?"Approve and register deliverable":"Accept new submission date"}</option><option value="reject">Reject request</option></select></label>
    {numbering&&decision==="approve"&&<label className="block"><span className="ev-label">DCC-assigned document number</span><input className="ev-input" name="documentNumber" minLength={2} maxLength={80} required autoComplete="off"/><span className="mt-1 block text-xs leading-5 text-[#617083]">Must be unique in the active project MDR. Letter case does not create a different number.</span></label>}
    <label className="block"><span className="ev-label">{decision==="reject"?"Reason for rejection":"Review comment (optional)"}</span><textarea className="ev-input min-h-20 py-3" name="comment" minLength={decision==="reject"?5:undefined} maxLength={2000} required={decision==="reject"}/></label>
    <Result state={state}/><button className="ev-button" disabled={pending}>{pending?"Saving…":"Confirm decision"}</button>
  </form>;
}
export function CancelDeliverableRequestForm({organisationId,projectId,requestId}:Scope&{requestId:string}){
  const [state,action,pending]=useActionState(cancelDeliverableRequest,{});
  return <form action={action} className="mt-4"><ScopeFields organisationId={organisationId} projectId={projectId}/><input name="requestId" type="hidden" value={requestId}/><Result state={state}/><button className="ev-button-secondary" disabled={pending}>{pending?"Cancelling…":"Cancel request"}</button></form>;
}
function ScopeFields({organisationId,projectId}:Scope){return <><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/></>}
function Result({state}:{state:DeliverableRequestState}){return state.message?<p role={state.ok?"status":"alert"} className={`text-sm leading-6 ${state.ok?"text-[#0c5b45]":"text-[#a5452f]"}`}>{state.message}</p>:null}
