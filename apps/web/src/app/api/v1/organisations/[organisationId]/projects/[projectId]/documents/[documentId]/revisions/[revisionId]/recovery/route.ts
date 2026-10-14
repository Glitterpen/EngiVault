import {requireProject} from "@/lib/auth";
import {rateLimited} from "@/lib/rate-limit";
import {supportReference} from "@/lib/customer-messages";

type Params={organisationId:string;projectId:string;documentId:string;revisionId:string};
type RecoveryFile={kind:"primary"|"native";path:string;name:string;size:number;sha256:string;mime:string};

export async function POST(request:Request,ctx:{params:Promise<Params>}) {
  const p=await ctx.params;
  const {supabase,access,preview}=await requireProject(p.organisationId,p.projectId);
  if(preview||String(access.role)!=="engineer")return Response.json({error:{message:"Only the original engineer can recover an incomplete upload. Role previews are read-only."}},{status:403});
  const body=await request.json().catch(()=>null);
  if(body?.action!=="resume"&&body?.action!=="cancel")return Response.json({error:{message:"Choose resume or cancel."}},{status:422});
  if(await rateLimited(supabase,p.organisationId,"upload-recovery",30,3600))return Response.json({error:{message:"Too many recovery attempts. Try again later."}},{status:429});
  const {data,error}=await supabase.rpc("recover_incomplete_revision_upload",{
    target_organisation:p.organisationId,target_project:p.projectId,target_document:p.documentId,
    target_revision:p.revisionId,cancel_upload:body.action==="cancel",
  });
  if(error){
    console.error("[upload-recovery] Recovery refused",supportReference(error.code));
    return Response.json({error:{message:error.code==="23514"?"Stored file details do not match. Cancel this incomplete upload and start again.":"Recovery is unavailable. Only your own incomplete uploads can be resumed or cancelled. Refresh and try again.",reference:supportReference(error.code)}},{status:error.code==="42501"?403:409});
  }
  if(body.action==="cancel")return data?.cancelled===true?Response.json({cancelled:true}):Response.json({error:{message:"Cancellation could not be confirmed. Refresh before retrying."}},{status:503});
  if(!Array.isArray(data?.files))return Response.json({error:{message:"Stored files could not be checked. Retry shortly."}},{status:503});
  const files=[];
  for(const file of (data?.files??[]) as RecoveryFile[]){
    const {data:signed,error:signError}=await supabase.storage.from("documents").createSignedUploadUrl(file.path,{upsert:false});
    if(signError||!signed)return Response.json({error:{message:"A recovery upload link could not be prepared. Retry shortly."}},{status:503});
    files.push({...file,token:signed.token});
  }
  return Response.json({files},{headers:{"Cache-Control":"private, no-store"}});
}
