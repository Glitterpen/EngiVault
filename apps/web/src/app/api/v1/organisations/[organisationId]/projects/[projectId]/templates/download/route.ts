import {requireProject} from "@/lib/auth";
import {createAdminClient} from "@/lib/supabase/admin";
import {templateScope,templateFailure as fail} from "@/lib/project-template-packs";

export async function GET(_request:Request,ctx:{params:Promise<{organisationId:string;projectId:string}>}){
  const parsed=templateScope.safeParse(await ctx.params);
  if(!parsed.success)return fail(400,"Invalid project.");
  const {organisationId,projectId}=parsed.data;
  const {supabase}=await requireProject(organisationId,projectId);
  const {data,error}=await supabase.rpc("authorize_project_template_download",{target_organisation:organisationId,target_project:projectId});
  if(error)return fail(403,"Project template access could not be verified.");
  if(!data)return fail(404,"The Project Manager has not published a template pack yet.");
  try{
    const {data:signed,error:signError}=await createAdminClient().storage.from("project-templates").createSignedUrl(data.storageKey,60,{download:data.filename});
    if(signError||!signed)return fail(503,"The template ZIP is temporarily unavailable.");
    return new Response(null,{status:302,headers:{Location:signed.signedUrl,"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
  }catch{return fail(503,"The template ZIP is temporarily unavailable.");}
}
