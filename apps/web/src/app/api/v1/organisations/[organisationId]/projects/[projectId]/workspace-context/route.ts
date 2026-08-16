import {requireProject} from "@/lib/auth";
import {roleLabel,workspacePersona} from "@/lib/role-experience";

export async function GET(_:Request,{params}:{params:Promise<{organisationId:string;projectId:string}>}){
  const {organisationId,projectId}=await params;
  const {supabase,access}=await requireProject(organisationId,projectId);
  const role=String(access.role);
  const [{data:project},{count:pendingReviewCount}]=await Promise.all([
    supabase.from("projects").select("code,name").eq("organisation_id",organisationId).eq("id",projectId).single(),
    supabase.from("document_revisions").select("id",{count:"exact",head:true}).eq("organisation_id",organisationId).eq("project_id",projectId).eq("control_status","submitted").neq("state","pending_upload"),
  ]);
  return Response.json({role,roleLabel:roleLabel(role),persona:workspacePersona(role),project:{code:project?.code??"",name:project?.name??""},pendingReviewCount:pendingReviewCount??0},{headers:{"Cache-Control":"private, no-store"}});
}
