import { requireProject } from "@/lib/auth";
import { can } from "@/lib/permissions";

export async function GET(request:Request,ctx:{params:Promise<{organisationId:string;projectId:string;documentId:string;revisionId:string}>}){
  const {organisationId,projectId,documentId,revisionId}=await ctx.params;
  const {supabase,access}=await requireProject(organisationId,projectId);
  if(!can(String(access.role),"document:read"))return Response.json({error:{code:"FORBIDDEN",message:"Document access is required."}},{status:403});
  const {data:revision}=await supabase.from("document_revisions").select("id,original_filename").eq("id",revisionId).eq("organisation_id",organisationId).eq("project_id",projectId).eq("document_id",documentId).eq("state","ready").maybeSingle();
  if(!revision)return Response.json({error:{code:"NOT_FOUND",message:"A ready revision is unavailable."}},{status:404});
  const {data,error}=await supabase.rpc("authorize_revision_preview",{target_revision:revisionId}).single();
  const authorised=data as {storage_key:string;mime_type:string}|null;
  if(error||!authorised)return Response.json({error:{code:"PREVIEW_DENIED",message:"The revision could not be authorised for preview."}},{status:403});
  if(authorised.mime_type!=="application/pdf")return Response.json({error:{code:"PREVIEW_FORMAT",message:"Inline binary preview is currently available for PDF revisions only."}},{status:415});
  const {data:signed,error:signError}=await supabase.storage.from("documents").createSignedUrl(authorised.storage_key,300);
  if(signError||!signed)return Response.json({error:{code:"PREVIEW_UNAVAILABLE",message:"A secure preview link could not be created."}},{status:503});
  const range=request.headers.get("range");
  const upstream=await fetch(signed.signedUrl,{headers:range?{Range:range}:undefined,cache:"no-store"});
  if(!upstream.ok&&!([200,206].includes(upstream.status)))return Response.json({error:{code:"PREVIEW_FETCH_FAILED",message:"The secured document could not be streamed."}},{status:502});
  const headers=new Headers({
    "Content-Type":"application/pdf",
    "Content-Disposition":`inline; filename*=UTF-8''${encodeURIComponent(revision.original_filename)}`,
    "Cache-Control":"private, no-store, max-age=0",
    "X-Content-Type-Options":"nosniff",
    "X-Frame-Options":"SAMEORIGIN",
    "Content-Security-Policy":"default-src 'none'; frame-ancestors 'self'; sandbox allow-same-origin allow-scripts allow-downloads",
    "Accept-Ranges":upstream.headers.get("accept-ranges")??"bytes",
  });
  for(const name of ["content-length","content-range","etag"]){const value=upstream.headers.get(name);if(value)headers.set(name,value)}
  return new Response(upstream.body,{status:upstream.status,headers});
}
