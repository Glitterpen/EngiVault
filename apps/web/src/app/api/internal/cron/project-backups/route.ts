import {createAdminClient} from "@/lib/supabase/admin";
import {buildProjectBackup} from "@/lib/processor";

export const dynamic="force-dynamic";
export const maxDuration=300;

export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return Response.json({error:{code:"UNAUTHORIZED",message:"Valid cron authorization is required."}},{status:401});
 let admin;try{admin=createAdminClient()}catch{return Response.json({error:{code:"SERVICE_CONFIGURATION",message:"Project backup service credentials are not configured."}},{status:503})}
 const {data,error}=await admin.rpc("queue_due_project_backups");
 if(error)return Response.json({error:{code:"BACKUP_QUEUE_FAILED",message:"Scheduled project backups could not be queued.",reference:error.code}},{status:503});
 const jobs=(data??[]).slice(0,5) as Array<{backup_id:string}>;const results=[];
 for(const job of jobs)results.push({backupId:job.backup_id,completed:await buildProjectBackup(job.backup_id)});
 return Response.json({queued:jobs.length,results},{headers:{"cache-control":"no-store"}});
}
