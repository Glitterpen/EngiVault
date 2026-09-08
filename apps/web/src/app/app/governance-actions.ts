"use server";
import { supportReference } from "@/lib/customer-messages";


import {redirect} from "next/navigation";
import {z} from "zod";
import {requireUser} from "@/lib/auth";
import {projectHomePath} from "@/lib/role-experience";
import {writeAdminPreview,type AdminPreview} from "@/lib/admin-preview";

export async function enterAdminRolePreview(_previous:{message:string}|undefined,form:FormData):Promise<{message:string}|undefined>{
  const parsed=z.object({organisationId:z.uuid(),projectId:z.uuid(),memberId:z.uuid(),reason:z.string().trim().min(5).max(500)}).safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"Select a team member and enter a support reason (5–500 characters)."};
  const {supabase}=await requireUser();
  const {data:organisation}=await supabase.rpc("get_my_organisations").eq("organisation_id",parsed.data.organisationId).eq("role","organisation_admin").maybeSingle();
  if(!organisation)return {message:"Organisation administrator permission is required."};
  const {data:project}=await supabase.from("projects").select("id").eq("organisation_id",parsed.data.organisationId).eq("id",parsed.data.projectId).maybeSingle();
  if(!project)return {message:"Project unavailable."};
  const {data,error}=await supabase.rpc("start_project_member_preview",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,target_member:parsed.data.memberId,preview_reason:parsed.data.reason});
  if(error||!data)return {message:`Preview could not be started. Check that the member is active. If this continues, contact EngiCite support. Reference: ${supportReference(error?.code??"PREVIEW_UNAVAILABLE")}.`};
  const preview=data as AdminPreview;
  await writeAdminPreview(preview);
  redirect(projectHomePath(preview.organisationId,preview.projectId,preview.role));
}
