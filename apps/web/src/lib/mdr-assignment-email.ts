import "server-only";
import {formatOrganisationSender} from "@/lib/email-sender";
import {mdrAssignmentEmailContent,type MdrAssignmentEmailInput} from "@/lib/mdr-assignment-email-content";

export async function sendMdrAssignmentEmail(input:MdrAssignmentEmailInput){
  const apiKey=process.env.RESEND_API_KEY;
  const configuredFrom=process.env.NOTIFICATION_FROM_EMAIL??process.env.INVITATION_FROM_EMAIL;
  if(!apiKey||!configuredFrom)return {sent:false as const,reason:"not_configured" as const};
  const {subject,html}=mdrAssignmentEmailContent(input);
  try{
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json"},body:JSON.stringify({from:formatOrganisationSender(configuredFrom,input.organisationName),to:[input.recipientEmail],subject,html})});
    return response.ok?{sent:true as const}:{sent:false as const,reason:`provider_${response.status}` as const};
  }catch{
    return {sent:false as const,reason:"network_error" as const};
  }
}
