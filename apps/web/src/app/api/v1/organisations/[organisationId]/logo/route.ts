import {requireUser} from "@/lib/auth";

export async function GET(_:Request,{params}:{params:Promise<{organisationId:string}>}){
 const {organisationId}=await params;
 const {supabase}=await requireUser();
 const {data:membership}=await supabase.rpc("get_my_organisations").eq("organisation_id",organisationId).maybeSingle();
 if(!membership)return Response.json({error:{code:"NOT_FOUND",message:"Organisation logo is unavailable."}},{status:404,headers:{"Cache-Control":"private, no-store"}});
 const path=`${organisationId}/branding/company-logo`;
 const {data,error}=await supabase.storage.from("organisation-assets").download(path);
 if(error||!data)return Response.json({error:{code:"LOGO_MISSING",message:"The private company logo could not be displayed."}},{status:404,headers:{"Cache-Control":"private, no-store"}});
 return new Response(data,{headers:{"Content-Type":data.type||"application/octet-stream","Content-Length":String(data.size),"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"}});
}
