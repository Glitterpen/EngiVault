import {z} from "zod";
import {requireProject} from "@/lib/auth";
import {resolveProcessorConfig} from "@/lib/processor";
import {rateLimited} from "@/lib/rate-limit";
import {templateScope,templateFailure as fail,type TemplatePackStatus} from "@/lib/project-template-packs";

export const maxDuration=300;
export async function POST(request:Request,ctx:{params:Promise<{organisationId:string;projectId:string}>}){
  const parsed=templateScope.safeParse(await ctx.params);
  if(!parsed.success)return fail(400,"Invalid project.");
  const {organisationId,projectId}=parsed.data;
  const {supabase,access,preview}=await requireProject(organisationId,projectId);
  if(preview||String(access.role)!=="project_admin")return fail(403,"Only the appointed Project Manager can publish templates. Preview is read-only.");
  const body=z.object({id:z.uuid()}).safeParse(await request.json().catch(()=>null));
  if(!body.success)return fail(422,"Invalid template upload.");
  const {data,error}=await supabase.rpc("get_project_template_pack",{target_organisation:organisationId,target_project:projectId});
  const pack=data as TemplatePackStatus|null;
  if(error||!pack)return fail(403,"Template upload access could not be verified.");
  if(pack.current?.id===body.data.id)return Response.json({state:"ready"});
  if(pack.pending?.id!==body.data.id)return fail(409,"This upload is no longer pending. Refresh project templates.");
  if(await rateLimited(supabase,organisationId,"project-template-scan",10,3600))return fail(429,"Template security-check limit reached. Try again later.");
  try{
    const {base,secret}=resolveProcessorConfig();
    const response=await fetch(`${base}/internal/v1/publish-template-pack`,{method:"POST",headers:{"content-type":"application/json","x-processor-secret":secret},
      body:JSON.stringify({pack_id:body.data.id}),cache:"no-store",signal:AbortSignal.timeout(280000)});
    const result=await response.json().catch(()=>null) as {detail?:string;state?:string}|null;
    if(!response.ok||result?.state!=="ready")return fail(response.status===422?422:503,
      response.status===422&&result?.detail?result.detail:"Security checks or publication could not finish. Your previous pack remains available. Retry shortly.");
    return Response.json({state:"ready"},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return fail(503,"Template publication is not yet confirmed. Refresh or retry security checks; the last published pack remains available.");}
}
