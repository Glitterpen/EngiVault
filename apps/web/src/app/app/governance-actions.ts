"use server";

import {redirect} from "next/navigation";
import {z} from "zod";
import {requireUser} from "@/lib/auth";
import {canPreviewProjectRole} from "@/lib/permissions";
import {projectHomePath} from "@/lib/role-experience";
import {writeAdminPreview} from "@/lib/admin-preview";

export async function enterAdminRolePreview(form:FormData){
  const parsed=z.object({organisationId:z.uuid(),projectId:z.uuid(),role:z.enum(["project_admin","document_controller","engineer"])}).safeParse(Object.fromEntries(form));
  if(!parsed.success)return;
  const {supabase}=await requireUser();
  const {data:organisation}=await supabase.rpc("get_my_organisations").eq("organisation_id",parsed.data.organisationId).eq("role","organisation_admin").maybeSingle();
  if(!organisation||!canPreviewProjectRole("organisation_admin",parsed.data.role))return;
  const {data:project}=await supabase.from("projects").select("id").eq("organisation_id",parsed.data.organisationId).eq("id",parsed.data.projectId).maybeSingle();
  if(!project)return;
  const {error}=await supabase.rpc("record_project_role_preview",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,preview_role:parsed.data.role,preview_event:"entered"});
  if(error)return;
  await writeAdminPreview(parsed.data);
  redirect(projectHomePath(parsed.data.organisationId,parsed.data.projectId,parsed.data.role));
}
