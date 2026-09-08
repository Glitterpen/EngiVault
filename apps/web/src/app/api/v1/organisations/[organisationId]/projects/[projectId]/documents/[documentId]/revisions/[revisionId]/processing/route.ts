import { after } from "next/server";
import { requireProject } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { processNextDocumentRevision } from "@/lib/processor";
import { supportReference } from "@/lib/customer-messages";

export const maxDuration = 300;
type Params={organisationId:string;projectId:string;documentId:string;revisionId:string};

async function scope(p:Params){
  const auth=await requireProject(p.organisationId,p.projectId);
  const {data:revision,error}=await auth.supabase.from("document_revisions").select("id,state").eq("id",p.revisionId).eq("organisation_id",p.organisationId).eq("project_id",p.projectId).eq("document_id",p.documentId).maybeSingle();
  return {...auth,revision,error};
}
export async function GET(_:Request,ctx:{params:Promise<Params>}){
  const p=await ctx.params;
  const {supabase,access,revision,error}=await scope(p);
  if(!can(String(access.role),"document:read"))return Response.json({error:{code:"FORBIDDEN",message:"Document access is required."}},{status:403});
  if(error)return Response.json({error:{code:"STATUS_UNAVAILABLE",message:"Processing status could not be checked."}},{status:503});
  if(!revision)return Response.json({error:{code:"NOT_FOUND",message:"Revision unavailable."}},{status:404});
  const {data:run,error:runError}=await supabase.from("processing_runs").select("state,attempt,error_code,metrics,updated_at").eq("revision_id",revision.id).eq("organisation_id",p.organisationId).eq("project_id",p.projectId).order("updated_at",{ascending:false}).limit(1).maybeSingle();
  if(runError)return Response.json({error:{code:"STATUS_UNAVAILABLE",message:"Processing status could not be checked."}},{status:503});
  return Response.json({revisionState:revision.state,run:run??null},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(_:Request,ctx:{params:Promise<Params>}){
  const {supabase,access,preview,revision,error}=await scope(await ctx.params);
  if(preview||!can(String(access.role),"document:write"))return Response.json({error:{code:"FORBIDDEN",message:"Document control permission is required. Member preview is read-only."}},{status:403});
  if(error||!revision)return Response.json({error:{code:"NOT_FOUND",message:"Revision unavailable."}},{status:404});
  const {data,error:retryError}=await supabase.rpc("retry_revision_processing",{target_revision:revision.id});
  if(retryError)return Response.json({error:{code:"RETRY_UNAVAILABLE",message:"Processing could not be retried.",reference:supportReference(retryError.code)}},{status:409});
  after(async()=>{
    try{await processNextDocumentRevision()}
    catch{console.error("[document-processing] Retry queued; scheduled processing will retry.")}
  });
  return Response.json({runId:data,state:"queued"},{status:202});
}
