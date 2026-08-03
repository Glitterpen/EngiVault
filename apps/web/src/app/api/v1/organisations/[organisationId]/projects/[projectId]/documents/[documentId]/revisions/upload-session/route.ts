import { z } from "zod";
import { requireProject } from "@/lib/auth";
import { can } from "@/lib/permissions";

const MAX=250*1024*1024;
const TYPES:Record<string,string>={pdf:"application/pdf",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"};
const schema=z.object({revisionCode:z.string().trim().toUpperCase().min(1).max(20),issueStatus:z.string().trim().min(2).max(60),issueDate:z.iso.date().optional(),fileName:z.string().min(1).max(180),mimeType:z.string(),size:z.number().int().min(1).max(MAX),sha256:z.string().regex(/^[a-f0-9]{64}$/)});

export async function POST(request:Request,ctx:{params:Promise<{organisationId:string;projectId:string;documentId:string}>}){
  const {organisationId,projectId,documentId}=await ctx.params;
  const {supabase,access}=await requireProject(organisationId,projectId);
  if(!can(String(access.role),"document:write"))return Response.json({error:{code:"FORBIDDEN",message:"Document upload permission is required."}},{status:403});
  const body=schema.safeParse(await request.json().catch(()=>null));
  if(!body.success)return Response.json({error:{code:"VALIDATION_ERROR",message:"Upload metadata is invalid.",fieldErrors:body.error.flatten().fieldErrors}},{status:422});
  const ext=body.data.fileName.split(".").pop()?.toLowerCase()??"";
  if(!TYPES[ext]||TYPES[ext]!==body.data.mimeType)return Response.json({error:{code:"UNSUPPORTED_FILE",message:"Only PDF, DOCX and XLSX files with matching MIME types are accepted."}},{status:415});
  const revisionId=crypto.randomUUID(); const safeName=body.data.fileName.replace(/[^A-Za-z0-9_.-]/g,"_");
  const storageKey=`organisations/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/${revisionId}/${safeName}`;
  const {error}=await supabase.from("document_revisions").insert({id:revisionId,organisation_id:organisationId,project_id:projectId,document_id:documentId,revision_code:body.data.revisionCode,issue_status:body.data.issueStatus,issue_date:body.data.issueDate||null,original_filename:safeName,declared_mime:body.data.mimeType,byte_size:body.data.size,sha256:body.data.sha256,storage_key:storageKey});
  if(error)return Response.json({error:{code:"REVISION_CONFLICT",message:"This revision could not be created."}},{status:409});
  const {data:signed,error:signError}=await supabase.storage.from("documents").createSignedUploadUrl(storageKey,{upsert:false});
  if(signError)return Response.json({error:{code:"STORAGE_ERROR",message:"A secure upload session could not be created."}},{status:503});
  return Response.json({revisionId,path:signed.path,token:signed.token,expiresIn:7200},{status:201});
}
