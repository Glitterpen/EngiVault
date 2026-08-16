import {requireProject} from "@/lib/auth";

export async function GET(request:Request,{params}:{params:Promise<{organisationId:string;projectId:string}>}){
 const {organisationId,projectId}=await params;
 const index=Number(new URL(request.url).searchParams.get("index")??"1");
 if(!Number.isInteger(index)||index<1||index>3)return Response.json({error:{code:"LOGO_INDEX_INVALID",message:"The requested client logo is unavailable."}},{status:400,headers:{"Cache-Control":"private, no-store"}});
 const {supabase}=await requireProject(organisationId,projectId);
 const {data:project}=await supabase.from("projects").select("client_logo_paths").eq("organisation_id",organisationId).eq("id",projectId).maybeSingle();
 const paths=Array.isArray(project?.client_logo_paths)?project.client_logo_paths.filter((value):value is string=>typeof value==="string"):[];
 const expected=`${organisationId}/${projectId}/branding/client-logo-${index}`;
 if(!paths.includes(expected))return Response.json({error:{code:"LOGO_MISSING",message:"This project has no client logo."}},{status:404,headers:{"Cache-Control":"private, no-store"}});
 const {data,error}=await supabase.storage.from("project-assets").download(expected);
 if(error||!data)return Response.json({error:{code:"LOGO_MISSING",message:"The private client logo could not be displayed."}},{status:404,headers:{"Cache-Control":"private, no-store"}});
 return new Response(data,{headers:{"Content-Type":data.type||"application/octet-stream","Content-Length":String(data.size),"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"}});
}
