import { requireProject } from "@/lib/auth";
import { after } from "next/server";
import { processNextDocumentRevision } from "@/lib/processor";

export async function POST(_:Request,ctx:{params:Promise<{organisationId:string;projectId:string;documentId:string;revisionId:string}>}){
  const {organisationId,projectId,documentId,revisionId}=await ctx.params;
  const {supabase,access}=await requireProject(organisationId,projectId);
  if(String(access.role)!=="engineer")return Response.json({error:{code:"FORBIDDEN",message:"Only an authorised discipline engineer may complete MDR revision uploads."}},{status:403});
  const {data:disciplineAccess,error:accessError}=await supabase.rpc("can_upload_document",{org:organisationId,project:projectId,document:documentId});
  if(accessError||!disciplineAccess)return Response.json({error:{code:"FORBIDDEN",message:"You can complete uploads only for MDR documents in your authorised engineering discipline."}},{status:403});
  const {data:revision}=await supabase.from("document_revisions").select("id").eq("id",revisionId).eq("organisation_id",organisationId).eq("project_id",projectId).eq("document_id",documentId).maybeSingle();
  if(!revision)return Response.json({error:{code:"NOT_FOUND",message:"Revision is unavailable."}},{status:404});
  const {error}=await supabase.rpc("complete_revision_upload",{target_revision:revisionId});
  if(error)return Response.json({error:{code:"UPLOAD_INCOMPLETE",message:`The uploaded file could not enter secure processing. Reference: ${error.code}.`}},{status:409});
  after(async()=>{try{await processNextDocumentRevision()}catch{/* The queue remains available for the transmittal preparation worker. */}});
  return Response.json({revisionId,state:"queued"});
}
