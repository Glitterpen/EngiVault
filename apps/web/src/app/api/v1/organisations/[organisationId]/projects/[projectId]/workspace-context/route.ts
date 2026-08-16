import {requireProject} from "@/lib/auth";
import {scopedRoleLabel,workspacePersona} from "@/lib/role-experience";

export async function GET(_:Request,{params}:{params:Promise<{organisationId:string;projectId:string}>}){
  const {organisationId,projectId}=await params;
  const {supabase,user,access,actualRole}=await requireProject(organisationId,projectId);
  const role=String(access.role);
  const disciplineQuery=role==="engineer"&&actualRole==="engineer"
    ?supabase.from("project_member_disciplines").select("discipline").eq("organisation_id",organisationId).eq("project_id",projectId).eq("user_id",user.id).order("discipline")
    :Promise.resolve({data:[] as Array<{discipline:string}>});
  const [{data:project},{count:pendingReviewCount},{data:disciplineRows}]=await Promise.all([
    supabase.from("projects").select("code,name").eq("organisation_id",organisationId).eq("id",projectId).single(),
    supabase.from("document_revisions").select("id",{count:"exact",head:true}).eq("organisation_id",organisationId).eq("project_id",projectId).eq("control_status","submitted").neq("state","pending_upload"),
    disciplineQuery,
  ]);
  const disciplines=(disciplineRows??[]).map(item=>String(item.discipline));
  return Response.json({role,roleLabel:scopedRoleLabel(role,disciplines),persona:workspacePersona(role),project:{code:project?.code??"",name:project?.name??""},pendingReviewCount:pendingReviewCount??0},{headers:{"Cache-Control":"private, no-store"}});
}
