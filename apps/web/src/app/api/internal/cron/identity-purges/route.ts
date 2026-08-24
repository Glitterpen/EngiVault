import {processQueuedIdentityPurges} from "@/lib/identity-purge";
import {createAdminClient} from "@/lib/supabase/admin";

export const dynamic="force-dynamic";
export const maxDuration=60;

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return Response.json({error:{code:"UNAUTHORIZED",message:"Valid cron authorization is required."}},{status:401});
  let admin;try{admin=createAdminClient()}catch{return Response.json({error:{code:"SERVICE_CONFIGURATION",message:"Identity purge service credentials are not configured."}},{status:503})}
  try{return Response.json(await processQueuedIdentityPurges(admin),{headers:{"cache-control":"no-store"}})}
  catch(error){console.error("[identity-purge] Scheduled queue processing failed",error);return Response.json({error:{code:"IDENTITY_PURGE_FAILED",message:"Identity purge queue could not be processed."}},{status:503})}
}
