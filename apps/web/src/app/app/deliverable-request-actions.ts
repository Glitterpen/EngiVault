"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requireProject} from "@/lib/auth";
import {supportReference} from "@/lib/customer-messages";
import {newDeliverableRequest,requestScope,reviewDeliverableRequestSchema} from "@/lib/deliverable-requests";

export type DeliverableRequestState={ok?:boolean;message?:string};
function refresh(org:string,project:string){revalidatePath(`/app/${org}/projects/${project}`,"layout");revalidatePath("/app/notifications");}
function failure(code:string,review=false):DeliverableRequestState{
  if(code==="23505")return {message:review?"That document number is already used in the active MDR. Choose a different number; nothing has been approved or added.":"An open request already exists for this deliverable. Check the request queue before trying again."};
  if(code==="42501")return {message:"This action is not permitted for your current project role or assignment."};
  if(code==="22023")return {message:"Check the date and request details. The request may already be decided, or its proposed date may have passed. Reject outdated requests and submit a fresh one."};
  return {message:`The request could not be saved. Try again shortly. Reference: ${supportReference(code)}.`};
}
export async function submitDeliverableRequest(_:DeliverableRequestState,form:FormData):Promise<DeliverableRequestState>{
  const parsed=newDeliverableRequest.safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"Enter the deliverable details, a valid submission date and a reason of 5–2,000 characters."};
  const value=parsed.data;
  const {supabase,access,preview}=await requireProject(value.organisationId,value.projectId);
  if(preview)return {message:"Member preview is read-only."};
  if(String(access.role)!=="engineer")return {message:"Only an appointed Discipline Engineer can submit this request."};
  const common={target_organisation:value.organisationId,target_project:value.projectId,new_date:value.requestedDate,request_reason:value.reason};
  const {error}=value.kind==="date_change"
    ?await supabase.rpc("request_submission_date_change",{...common,target_document:value.documentId})
    :await supabase.rpc("request_additional_deliverable",{...common,new_title:value.title,new_type:value.documentType,new_discipline:value.discipline});
  if(error)return failure(error.code);
  refresh(value.organisationId,value.projectId);
  return {ok:true,message:value.kind==="date_change"?"Date-change request sent to the Project Manager. The current deadline stays in place until PM approval and DCC acceptance.":"Additional deliverable requested. DCC will review it and assign a unique MDR document number."};
}
export async function decideDeliverableRequest(_:DeliverableRequestState,form:FormData):Promise<DeliverableRequestState>{
  const parsed=reviewDeliverableRequestSchema.safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"Check the review details. A rejection must include a reason of at least 5 characters."};
  const value=parsed.data;
  const {supabase,access,preview}=await requireProject(value.organisationId,value.projectId);
  if(preview)return {message:"Member preview is read-only."};
  if(!["project_admin","document_controller"].includes(String(access.role)))return {message:"Only the appointed PM or DCC reviewer can decide a request."};
  // The database rechecks tenant, request stage and live permissions atomically.
  const {data,error}=await supabase.rpc("review_deliverable_request",{target_organisation:value.organisationId,target_project:value.projectId,target_request:value.requestId,decision:value.decision,review_comment:value.comment,new_document_number:value.documentNumber||null});
  if(error)return failure(error.code,true);
  refresh(value.organisationId,value.projectId);
  if(data==="superseded")return {message:"The submission, schedule or engineer access changed. This request is now superseded; the engineer must send a fresh request."};
  return {ok:true,message:data==="pending_dcc"?"PM approved. DCC acceptance is still required before the deadline changes.":data==="accepted"?"Accepted. The MDR and engineer dashboard have been updated.":"Request rejected. The engineer will be notified."};
}
export async function cancelDeliverableRequest(_:DeliverableRequestState,form:FormData):Promise<DeliverableRequestState>{
  const parsed=requestScope.extend({requestId:z.uuid()}).safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"Invalid request."};
  const value=parsed.data;
  const {supabase,access,preview}=await requireProject(value.organisationId,value.projectId);
  if(preview)return {message:"Member preview is read-only."};
  if(String(access.role)!=="engineer")return {message:"Only the requesting engineer may cancel an open request."};
  const {error}=await supabase.rpc("cancel_deliverable_request",{target_organisation:value.organisationId,target_project:value.projectId,target_request:value.requestId});
  if(error)return failure(error.code);
  refresh(value.organisationId,value.projectId);
  return {ok:true,message:"Request cancelled. No MDR dates or deliverables were changed."};
}
