"use server";

import {revalidatePath} from "next/cache";
import {requireProject} from "@/lib/auth";
import {interdisciplinaryCheckSchema,canRecordInterdisciplinaryCheck,interdisciplinaryCommentSchema,canCommentInterdisciplinary} from "@/lib/interdisciplinary-checks";
import {supportReference} from "@/lib/customer-messages";

export type InterdisciplinaryCheckState={ok?:boolean;message?:string};
export async function recordInterdisciplinaryCheck(_:InterdisciplinaryCheckState,form:FormData):Promise<InterdisciplinaryCheckState>{
  const parsed=interdisciplinaryCheckSchema.safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"Choose a sign-off decision. For changes requested, explain the changes in 5–2,000 characters."};
  const value=parsed.data;
  const {supabase,access,preview}=await requireProject(value.organisationId,value.projectId);
  if(preview)return {message:"Member preview is read-only."};
  if(!canRecordInterdisciplinaryCheck(String(access.role)))return {message:"Only appointed project team members can record an interdisciplinary check."};
  const {error}=await supabase.rpc("submit_interdisciplinary_check",{
    target_organisation:value.organisationId,target_project:value.projectId,target_revision:value.revisionId,
    check_decision:value.decision,check_comment:value.comment,
  });
  if(error){
    if(error.code==="42501")return {message:"You can only check an approved revision submitted by another team member. Refresh to check your current access."};
    if(error.code==="22023")return {message:"This revision or project is no longer current, or the feedback is incomplete. Refresh the approved-document library."};
    if(error.code==="54000")return {message:"Too many checks were recorded. Wait a minute, then retry."};
    return {message:`Your check could not be saved. Try again shortly. Reference: ${supportReference(error.code)}.`};
  }
  revalidatePath(`/app/${value.organisationId}/projects/${value.projectId}/interdisciplinary`);
  revalidatePath(`/app/${value.organisationId}/projects/${value.projectId}/interdisciplinary/${value.revisionId}`);
  revalidatePath("/app/notifications");
  return {ok:true,message:"Interdisciplinary check recorded. The document team has been notified; DCC approval is unchanged."};
}

export async function recordInterdisciplinaryComment(_:InterdisciplinaryCheckState,form:FormData):Promise<InterdisciplinaryCheckState>{
  const parsed=interdisciplinaryCommentSchema.safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"Choose comment or query and enter 5–2,000 characters."};
  const value=parsed.data;
  const {supabase,access,preview}=await requireProject(value.organisationId,value.projectId);
  if(preview)return {message:"Member preview is read-only."};
  if(!canCommentInterdisciplinary(String(access.role)))return {message:"Only appointed engineers, Project Managers and DCCs can add a comment or query."};
  let result:{error:{code?:string}|null};
  try{
    result=await supabase.rpc("submit_interdisciplinary_comment",{
      target_organisation:value.organisationId,target_project:value.projectId,target_revision:value.revisionId,
      comment_kind:value.kind,comment_body:value.body,
    });
  }catch{return {message:"Your comment could not be saved. Check your connection and retry. Your text has been kept."};}
  if(result.error){
    if(result.error.code==="42501")return {message:"An active project appointment and an approved revision are required. Refresh to check your access."};
    if(result.error.code==="22023")return {message:"The comment is incomplete or this project is no longer active. Refresh and retry."};
    if(result.error.code==="54000")return {message:"Too many comments were recorded. Wait a minute, then retry."};
    return {message:`Your comment could not be saved. Try again shortly. Reference: ${supportReference(result.error.code)}.`};
  }
  revalidatePath(`/app/${value.organisationId}/projects/${value.projectId}/interdisciplinary`);
  revalidatePath(`/app/${value.organisationId}/projects/${value.projectId}/interdisciplinary/${value.revisionId}`);
  revalidatePath("/app/notifications");
  return {ok:true,message:`${value.kind==="query"?"Query":"Comment"} recorded. The responsible document team has been notified; email delivery is queued subject to their email settings. DCC approval is unchanged.`};
}
