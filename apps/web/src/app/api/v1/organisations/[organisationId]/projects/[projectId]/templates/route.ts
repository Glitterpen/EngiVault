import {requireProject} from "@/lib/auth";
import {createAdminClient} from "@/lib/supabase/admin";
import {rateLimited} from "@/lib/rate-limit";
import {templateScope,templateUpload,templateFailure as fail} from "@/lib/project-template-packs";

type Context={params:Promise<{organisationId:string;projectId:string}>};
export async function GET(_request:Request,ctx:Context){
  const parsed=templateScope.safeParse(await ctx.params);
  if(!parsed.success)return fail(400,"Invalid project.");
  const {organisationId,projectId}=parsed.data;
  const {supabase}=await requireProject(organisationId,projectId);
  const {data,error}=await supabase.rpc("get_project_template_pack",{target_organisation:organisationId,target_project:projectId});
  if(error)return fail(503,"Project templates could not be loaded. Please retry shortly.");
  return Response.json(data,{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:Request,ctx:Context){
  const parsed=templateScope.safeParse(await ctx.params);
  if(!parsed.success)return fail(400,"Invalid project.");
  const {organisationId,projectId}=parsed.data;
  const {supabase,access,preview}=await requireProject(organisationId,projectId);
  if(preview||String(access.role)!=="project_admin")return fail(403,"Only the appointed Project Manager can upload project templates. Preview is read-only.");
  const body=templateUpload.safeParse(await request.json().catch(()=>null));
  if(!body.success)return fail(422,"Select a ZIP file no larger than 50 MB.");
  if(await rateLimited(supabase,organisationId,"project-template-upload",10,3600))return fail(429,"Template upload limit reached. Try again later.");
  const {data,error}=await supabase.rpc("begin_project_template_upload",{target_organisation:organisationId,target_project:projectId,
    new_filename:body.data.filename,new_size:body.data.size,new_sha256:body.data.sha256});
  if(error||!data)return fail(error?.code==="42501"?403:409,"The template upload could not be started. Check your project access and retry.");
  try{
    const {data:signed,error:signError}=await createAdminClient().storage.from("project-templates").createSignedUploadUrl(data.storageKey,{upsert:false});
    if(signError||!signed)return fail(503,"The secure upload link could not be created. Please retry.");
    return Response.json({id:data.id,path:signed.path,token:signed.token},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return fail(503,"Template uploads are temporarily unavailable.");}
}
