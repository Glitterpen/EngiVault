import {createAdminClient} from "@/lib/supabase/admin";

export const dynamic="force-dynamic";
export const maxDuration=60;

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return Response.json({error:{code:"UNAUTHORIZED",message:"Valid cron authorization is required."}},{status:401});
  let admin;try{admin=createAdminClient()}catch{return Response.json({error:{code:"SERVICE_CONFIGURATION",message:"Weekly report service credentials are not configured."}},{status:503})}
  const {data,error}=await admin.rpc("generate_due_project_weekly_reports");
  if(error)return Response.json({error:{code:"REPORT_GENERATION_FAILED",message:"Scheduled project reports could not be generated.",reference:error.code}},{status:503});
  return Response.json({generated:Array.isArray(data)?data.length:0,reports:data??[]},{headers:{"cache-control":"no-store"}});
}
