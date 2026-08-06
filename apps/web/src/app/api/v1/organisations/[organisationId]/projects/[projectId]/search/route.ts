import { requireProject } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { embedSearchQuery } from "@/lib/processor";
import { rateLimited } from "@/lib/rate-limit";
type Params={organisationId:string;projectId:string};
export async function POST(request:Request,ctx:{params:Promise<Params>}){
 const {organisationId,projectId}=await ctx.params;const {supabase,access}=await requireProject(organisationId,projectId);
 if(!can(String(access.role),"document:read"))return Response.json({error:{code:"FORBIDDEN",message:"Project document access is required."}},{status:403});
 if(await rateLimited(supabase,organisationId,"search",60,60))return Response.json({error:{code:"RATE_LIMITED",message:"Search rate exceeded. Try again shortly."}},{status:429,headers:{"Retry-After":"60"}});
 let body:unknown;try{body=await request.json()}catch{return Response.json({error:{code:"INVALID_JSON",message:"Search request is invalid."}},{status:400})}
 const value=(body??{}) as Record<string,unknown>;const query=typeof value.query==="string"?value.query.trim():"";
 if(query.length<2||query.length>500)return Response.json({error:{code:"INVALID_QUERY",message:"Enter between 2 and 500 characters."}},{status:422});
 const discipline=typeof value.discipline==="string"&&value.discipline?value.discipline:null;const documentType=typeof value.documentType==="string"&&value.documentType?value.documentType:null;const embedding=await embedSearchQuery(query);
 const {data,error}=await supabase.rpc("hybrid_search_project",{target_organisation:organisationId,target_project:projectId,query_text:query,query_embedding:embedding?`[${embedding.join(",")}]`:null,filter_discipline:discipline,filter_document_type:documentType,result_limit:25});
 if(error)return Response.json({error:{code:"SEARCH_FAILED",message:"Search could not be completed.",reference:error.code}},{status:503});return Response.json({mode:embedding?"hybrid":"full_text",results:data??[]},{headers:{"Cache-Control":"no-store"}})
}
