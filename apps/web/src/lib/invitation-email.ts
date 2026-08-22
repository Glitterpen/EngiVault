import "server-only";
import {formatOrganisationSender,sanitiseEmailHeaderText} from "@/lib/email-sender";

type InvitationEmailInput={
  to:string;
  acceptUrl:string;
  projectName:string;
  organisationName:string;
  projectIntroduction?:string|null;
  keyObjectives?:string[]|null;
  plannedStart?:string|null;
  plannedEnd?:string|null;
  role:string;
  discipline?:string;
  reminder?:boolean;
};

export async function sendInvitationEmail(input:InvitationEmailInput){
  const apiKey=process.env.RESEND_API_KEY;
  const configuredFrom=process.env.INVITATION_FROM_EMAIL;
  if(!apiKey||!configuredFrom)return {sent:false,reason:"not_configured" as const};
  const role=input.role.replaceAll("_"," ");
  const organisationName=sanitiseEmailHeaderText(input.organisationName,"");
  if(!organisationName)return {sent:false,reason:"identity_unavailable" as const};
  const projectName=sanitiseEmailHeaderText(input.projectName,"your project");
  const from=formatOrganisationSender(configuredFrom,organisationName);
  const discipline=input.discipline?` for the ${input.discipline} discipline`:"";
  const accessNote=input.discipline?`<p>Your upload access is limited to <strong>${escapeHtml(input.discipline)}</strong> documents in the Master Document Register.</p>`:"";
  const introduction=input.projectIntroduction?`<p style="margin:8px 0 0;line-height:1.6">${escapeHtml(input.projectIntroduction)}</p>`:`<p style="margin:8px 0 0;color:#617083">The project introduction will be confirmed in EngiCite.</p>`;
  const objectives=input.keyObjectives?.length?`<div style="margin-top:14px"><strong>Key objectives</strong><ol style="padding-left:20px;line-height:1.6">${input.keyObjectives.map(objective=>`<li>${escapeHtml(objective)}</li>`).join("")}</ol></div>`:"";
  const brief=`<div style="margin:20px 0;padding:16px;background:#f4f7f6;border-left:4px solid #0c5b45"><strong>Project introduction</strong>${introduction}${objectives}</div>`;
  const timeline=input.plannedStart||input.plannedEnd?`<p><strong>Project timeline:</strong> ${escapeHtml(input.plannedStart||"To be confirmed")} to ${escapeHtml(input.plannedEnd||"To be confirmed")}</p>`:"";
  const heading=input.reminder?`${organisationName} project invitation reminder`:`${organisationName} project invitation`;
  const html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#10243e"><h1 style="font-size:24px">${escapeHtml(heading)}</h1><p><strong>${escapeHtml(organisationName)}</strong> has invited you to <strong>${escapeHtml(projectName)}</strong> as <strong>${escapeHtml(role)}</strong>${escapeHtml(discipline)}.</p>${brief}${timeline}${accessNote}<p><a href="${escapeHtml(input.acceptUrl)}" style="display:inline-block;background:#e8733f;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold">Accept invitation</a></p><p style="font-size:12px;color:#617083">This fresh secure link expires in seven days and replaces any earlier link. Sign in using the invited email address. This invitation was issued by <strong>${escapeHtml(organisationName)}</strong> through its secure EngiCite workspace.</p></div>`;
  const subject=input.reminder?`${organisationName}: reminder to join ${projectName}`:`${organisationName} invited you to ${projectName}`;
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json"},body:JSON.stringify({from,to:[input.to],subject,html})});
  return response.ok?{sent:true as const}:{sent:false as const,reason:"provider_error" as const};
}

function escapeHtml(value:string){return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");}
