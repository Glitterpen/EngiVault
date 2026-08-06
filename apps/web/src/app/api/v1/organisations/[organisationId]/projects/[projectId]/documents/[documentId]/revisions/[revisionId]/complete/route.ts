import { requireProject } from "@/lib/auth";
import { can } from "@/lib/permissions";

export async function POST(_:Request,ctx:{params:Promise<{organisationId:string;projectId:string;documentId:string;revisionId:string}>}){
  const {organisationId,projectId,documentId,revisionId}=await ctx.params;
  const {supabase,access}=await requireProject(organisationId,projectId);
  if(!can(String(access.role),"document:write"))return Response.json({error:{code:"FORBIDDEN",message:"Document upload permission is required."}},{status:403});
  const {data:revision}=await supabase.from("document_revisions").select("id").eq("id",revisionId).eq("organisation_id",organisationId).eq("project_id",projectId).eq("document_id",documentId).maybeSingle();
  if(!revision)return Response.json({error:{code:"NOT_FOUND",message:"Revision is unavailable."}},{status:404});
  const {error}=await supabase.rpc("complete_revision_upload",{target_revision:revisionId});
  if(error)return Response.json({error:{code:"UPLOAD_INCOMPLETE",message:`The uploaded file could not enter secure processing. Reference: ${error.code}.`}},{status:409});
  return Response.json({revisionId,state:"queued"});
}
