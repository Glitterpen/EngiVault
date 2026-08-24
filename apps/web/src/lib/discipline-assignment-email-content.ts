import {sanitiseEmailHeaderText} from "@/lib/email-sender";

export type DisciplineAssignmentEmailInput={
  recipientEmail:string;
  recipientName:string;
  organisationName:string;
  projectCode:string;
  projectName:string;
  discipline:string;
  totalDocuments:number;
  newAssignments:number;
  assignmentsUrl:string;
};

export function disciplineAssignmentEmailContent(input:DisciplineAssignmentEmailInput){
  const organisationName=sanitiseEmailHeaderText(input.organisationName,"Your organisation");
  const projectName=sanitiseEmailHeaderText(input.projectName,"your project");
  const discipline=sanitiseEmailHeaderText(input.discipline,"Engineering");
  const subject=`${organisationName}: ${discipline} MDR deliverables assigned`;
  const html=`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#10243e"><p style="font-size:12px;font-weight:bold;letter-spacing:.12em;color:#e8733f">${escapeHtml(organisationName)} · ENGICITE DOCUMENT CONTROL</p><h1 style="font-size:24px">${escapeHtml(discipline)} deliverables assigned</h1><p>Hello ${escapeHtml(input.recipientName)},</p><p>Project Document Control has assigned the active <strong>${escapeHtml(discipline)}</strong> deliverables in the Master Document Register to you for controlled submission.</p><div style="border:1px solid #dfe7e3;border-radius:12px;padding:16px;margin:20px 0"><p style="margin:0 0 12px;color:#617083">${escapeHtml(input.projectCode)} · ${escapeHtml(projectName)}</p><p style="margin:0 0 6px"><strong>Discipline:</strong> ${escapeHtml(discipline)}</p><p style="margin:0 0 6px"><strong>New assignments:</strong> ${input.newAssignments}</p><p style="margin:0"><strong>Total active discipline deliverables:</strong> ${input.totalDocuments}</p></div><p><a href="${escapeHtml(input.assignmentsUrl)}" style="display:inline-block;background:#e8733f;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold">Open my assigned deliverables</a></p><p style="font-size:12px;line-height:1.6;color:#617083">Your access remains limited to the project discipline authorised by the Project Manager and the MDR deliverables allocated by Document Control.</p></div>`;
  return {subject,html};
}

function escapeHtml(value:string){return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
