import {createAdminClient} from "@/lib/supabase/admin";
import {sendSubmissionReminderEmail} from "@/lib/submission-reminder-email";

export const dynamic="force-dynamic";
export const maxDuration=60;

type ReminderRow={reminder_id:string;recipient_email:string;recipient_name:string;project_name:string;document_number:string;document_title:string;discipline:string;planned_submission_date:string;href:string};

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return Response.json({error:{code:"UNAUTHORIZED",message:"Valid cron authorization is required."}},{status:401});
  let admin;try{admin=createAdminClient()}catch{return Response.json({error:{code:"SERVICE_CONFIGURATION",message:"Reminder service credentials are not configured."}},{status:503})}
  const {data,error}=await admin.rpc("claim_overdue_submission_reminders");
  if(error)return Response.json({error:{code:"REMINDER_QUERY_FAILED",message:"Overdue submission reminders could not be prepared.",reference:error.code}},{status:503});
  const rows=(data??[]) as ReminderRow[];let sent=0;let failed=0;const base=process.env.NEXT_PUBLIC_APP_URL??new URL(request.url).origin;
  for(const row of rows){const result=await sendSubmissionReminderEmail({recipientEmail:row.recipient_email,recipientName:row.recipient_name,projectName:row.project_name,documentNumber:row.document_number,documentTitle:row.document_title,discipline:row.discipline,plannedSubmissionDate:row.planned_submission_date,documentUrl:new URL(row.href,base).toString()});await admin.rpc("finish_submission_reminder_email",{target_reminder:row.reminder_id,delivered:result.sent,failure_code:result.sent?null:result.reason});if(result.sent)sent+=1;else failed+=1}
  return Response.json({processed:rows.length,emailSent:sent,emailFailed:failed},{headers:{"cache-control":"no-store"}});
}
