import {createAdminClient} from "@/lib/supabase/admin";
import {supportReference} from "@/lib/customer-messages";

export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"cache-control":"no-store"};

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return Response.json({error:{code:"UNAUTHORIZED",message:"Valid cron authorization is required."}},{status:401,headers});
  let admin;
  try{admin=createAdminClient();}catch{
    console.error("[progress-observations] Capture service unavailable",{reference:supportReference("service_configuration")});
    return Response.json({error:{code:"SERVICE_CONFIGURATION",message:"Progress capture service is not configured."}},{status:503,headers});
  }
  try{
    const {data,error}=await admin.rpc("capture_daily_project_progress");
    if(error)return failure(error.code);
    const stats=data&&typeof data==="object"&&!Array.isArray(data)?data as Record<string,unknown>:null;
    if(!stats||!count(stats.captured_count)||!count(stats.failed_count)||typeof stats.skipped_locked!=="boolean"
      ||(stats.skipped_locked?stats.remaining_count!==null:!count(stats.remaining_count))
      ||Number(stats.captured_count)+Number(stats.failed_count)>200
      ||stats.skipped_locked&&(stats.captured_count!==0||stats.failed_count!==0))return failure("invalid_capture_result");
    const captured=Number(stats.captured_count),failed=Number(stats.failed_count),remaining=stats.remaining_count as number|null,skippedLocked=stats.skipped_locked;
    const retryPending=skippedLocked||failed>0||(remaining!==null&&remaining>0);
    if(failed>0){
      console.error("[progress-observations] Some daily captures need retry",{failed,remaining});
      return Response.json({captured,failed,remaining,skippedLocked,retryPending,error:{code:"PROGRESS_CAPTURE_INCOMPLETE",message:"Some daily observations need a retry."}},{status:503,headers});
    }
    // A later scheduled invocation drains the next bounded batch. This does
    // not claim complete capture while remaining projects or a lock exist.
    return Response.json({captured,failed,remaining,skippedLocked,retryPending},{headers});
  }catch{return failure("capture_transport");}
}

function count(value:unknown):value is number{return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0;}
function failure(code:unknown){
  const reference=supportReference(code);
  console.error("[progress-observations] Daily capture could not finish",{reference});
  return Response.json({error:{code:"PROGRESS_CAPTURE_FAILED",message:"Daily progress capture could not finish.",reference},retryPending:true},{status:503,headers});
}
