import { z } from "zod";
import { requireProject } from "@/lib/auth";
import { expectedMime,hasExpectedMime,MAX_UPLOAD_BYTES } from "@/lib/file-validation";
import { DOCUMENT_ISSUE_STATUS_VALUES } from "@/lib/document-issue-status";
import { rateLimited } from "@/lib/rate-limit";

const schema=z.object({revisionCode:z.string().trim().toUpperCase().min(1).max(20),issueStatus:z.enum(DOCUMENT_ISSUE_STATUS_VALUES),issueDate:z.iso.date().optional(),fileName:z.string().min(1).max(180),mimeType:z.string(),size:z.number().int().min(1).max(MAX_UPLOAD_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/)});

export async function POST(request:Request,ctx:{params:Promise<{organisationId:string;projectId:string;documentId:string}>}){
  const {organisationId,projectId,documentId}=await ctx.params;
  const {supabase,access}=await requireProject(organisationId,projectId);
  const role=String(access.role);
  if(role!=="engineer")return Response.json({error:{code:"FORBIDDEN",message:"Only an authorised discipline engineer may upload MDR revisions."}},{status:403});
  const {data:disciplineAccess,error:accessError}=await supabase.rpc("can_upload_document",{org:organisationId,project:projectId,document:documentId});
  if(accessError||!disciplineAccess)return Response.json({error:{code:"FORBIDDEN",message:"You can upload only to MDR documents in your authorised engineering discipline."}},{status:403});
  if(await rateLimited(supabase,organisationId,"upload-session",30,3600))return Response.json({error:{code:"RATE_LIMITED",message:"Upload session limit reached. Try again later."}},{status:429,headers:{"Retry-After":"3600"}});
  const body=schema.safeParse(await request.json().catch(()=>null));
  if(!body.success)return Response.json({error:{code:"VALIDATION_ERROR",message:"Upload metadata is invalid.",fieldErrors:body.error.flatten().fieldErrors}},{status:422});
  if(!expectedMime(body.data.fileName)||!hasExpectedMime(body.data.fileName,body.data.mimeType))return Response.json({error:{code:"UNSUPPORTED_FILE",message:"Only PDF, DOCX, XLSX and DWG files with matching MIME types are accepted."}},{status:415});
  const revisionId=crypto.randomUUID(); const safeName=body.data.fileName.replace(/[^A-Za-z0-9_.-]/g,"_");
  const storageKey=`organisations/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/${revisionId}/${safeName}`;
  const {error}=await supabase.from("document_revisions").insert({id:revisionId,organisation_id:organisationId,project_id:projectId,document_id:documentId,revision_code:body.data.revisionCode,issue_status:body.data.issueStatus,issue_date:body.data.issueDate||null,original_filename:safeName,declared_mime:body.data.mimeType,byte_size:body.data.size,sha256:body.data.sha256,storage_key:storageKey,control_status:"submitted"});
  if(error)return Response.json({error:{code:"REVISION_REGISTRATION_FAILED",message:error.code==="23505"?"This revision code already exists for the document.":`The revision could not be registered. Reference: ${error.code}.`}},{status:error.code==="23505"?409:500});
  const expiresAt=new Date(Date.now()+2*60*60*1000).toISOString();
  const {error:sessionError}=await supabase.from("upload_sessions").insert({organisation_id:organisationId,project_id:projectId,revision_id:revisionId,storage_key:storageKey,expected_size:body.data.size,expected_sha256:body.data.sha256,expires_at:expiresAt});
  if(sessionError)return Response.json({error:{code:"SESSION_ERROR",message:`The secure upload session could not be recorded. Reference: ${sessionError.code}.`}},{status:503});
  const {data:signed,error:signError}=await supabase.storage.from("documents").createSignedUploadUrl(storageKey,{upsert:false});
  if(signError)return Response.json({error:{code:"STORAGE_ERROR",message:`A secure storage link could not be created. Reference: ${signError.name}.`}},{status:503});
  return Response.json({revisionId,path:signed.path,token:signed.token,expiresIn:7200},{status:201});
}
