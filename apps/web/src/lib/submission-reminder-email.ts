import "server-only";

type Reminder={recipientEmail:string;recipientName:string;projectName:string;documentNumber:string;documentTitle:string;discipline:string;plannedSubmissionDate:string;documentUrl:string};

export async function sendSubmissionReminderEmail(input:Reminder){
  const apiKey=process.env.RESEND_API_KEY;const from=process.env.NOTIFICATION_FROM_EMAIL??process.env.INVITATION_FROM_EMAIL;
  if(!apiKey||!from)return {sent:false as const,reason:"not_configured"};
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json"},body:JSON.stringify({from,to:[input.recipientEmail],subject:`Submission overdue: ${input.documentNumber}`,html:`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#10243e"><p style="font-size:12px;font-weight:bold;letter-spacing:.12em;color:#e8733f">ENGICITE DOCUMENT CONTROL</p><h1 style="font-size:24px">Engineering submission overdue</h1><p>Hello ${escapeHtml(input.recipientName)},</p><p>No controlled revision has been received for the following MDR deliverable by its agreed submission date.</p><div style="border:1px solid #dfe7e3;border-radius:12px;padding:16px;margin:20px 0"><p style="margin:0 0 8px;color:#617083">${escapeHtml(input.projectName)}</p><p style="margin:0 0 8px"><strong>${escapeHtml(input.documentNumber)}</strong></p><p style="margin:0 0 8px">${escapeHtml(input.documentTitle)}</p><p style="margin:0;color:#617083">${escapeHtml(input.discipline)} · Due ${escapeHtml(formatDate(input.plannedSubmissionDate))}</p></div><p><a href="${escapeHtml(input.documentUrl)}" style="display:inline-block;background:#e8733f;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold">Open MDR document</a></p><p style="font-size:12px;color:#617083">This automatic EngiCite reminder is sent to the responsible discipline engineers and project Document Controller.</p></div>`})});
  return response.ok?{sent:true as const}:{sent:false as const,reason:`provider_${response.status}`};
}

function formatDate(value:string){return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"})}
function escapeHtml(value:string){return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
