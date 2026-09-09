import {requireProject} from "@/lib/auth";
import {createAdminClient} from "@/lib/supabase/admin";
import {interdisciplinaryScope} from "@/lib/interdisciplinary-checks";

export async function GET(request:Request,ctx:{params:Promise<{organisationId:string;projectId:string;revisionId:string}>}){
  const fail=(status:number,message:string)=>Response.json({error:{message}},{status,headers:{"Cache-Control":"private, no-store"}});
  const parsed=interdisciplinaryScope.safeParse(await ctx.params);
  if(!parsed.success)return fail(400,"Invalid approved-file request.");
  const {organisationId,projectId,revisionId}=parsed.data;
  const {supabase}=await requireProject(organisationId,projectId);
  const search=new URL(request.url).searchParams;
  const {data,error}=await supabase.rpc("authorize_interdisciplinary_file",{target_organisation:organisationId,target_project:projectId,target_revision:revisionId,native_file:search.get("native")==="1"}).single();
  const authorised=data as {storage_key:string;original_filename:string}|null;
  if(error||!authorised)return fail(403,"This approved file is unavailable or you no longer have project access.");
  // Broad Storage RLS is deliberately NOT granted to engineers. Privileged
  // signing is permitted only after the database authorises this exact file.
  try{
    const {data:signed,error:signError}=await createAdminClient().storage.from("documents").createSignedUrl(authorised.storage_key,60,search.get("download")==="1"?{download:authorised.original_filename}:undefined);
    if(signError||!signed)return fail(503,"A secure file link could not be created. Please retry shortly.");
    return new Response(null,{status:302,headers:{Location:signed.signedUrl,"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
  }catch{return fail(503,"The approved file is temporarily unavailable. Please retry shortly.");}
}
