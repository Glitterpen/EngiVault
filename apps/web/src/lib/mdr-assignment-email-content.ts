import {sanitiseEmailHeaderText} from "@/lib/email-sender";

export type MdrAssignmentEmailInput={
  recipientEmail:string;
  recipientName:string;
  organisationName:string;
  projectCode:string;
  projectName:string;
  documentNumber:string;
  documentTitle:string;
  discipline:string;
  plannedSubmissionDate?:string|null;
  requiredIssueStatus?:string|null;
  documentUrl:string;
};

export function mdrAssignmentEmailContent(input:MdrAssignmentEmailInput){
  const organisationName=sanitiseEmailHeaderText(input.organisationName,"Your organisation");
  const projectName=sanitiseEmailHeaderText(input.projectName,"your project");
  const documentNumber=sanitiseEmailHeaderText(input.documentNumber,"MDR deliverable");
  const subject=`${organisationName}: MDR assignment ${documentNumber}`;
  const due=input.plannedSubmissionDate?formatDate(input.plannedSubmissionDate):"To be confirmed";
  const requiredIssue=input.requiredIssueStatus||"To be confirmed";
  const html=`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#10243e"><p style="font-size:12px;font-weight:bold;letter-spacing:.12em;color:#e8733f">${escapeHtml(organisationName)} · ENGICITE DOCUMENT CONTROL</p><h1 style="font-size:24px">MDR deliverable assigned</h1><p>Hello ${escapeHtml(input.recipientName)},</p><p>Project Document Control has assigned the following engineering deliverable to you for controlled submission.</p><div style="border:1px solid #dfe7e3;border-radius:12px;padding:16px;margin:20px 0"><p style="margin:0 0 8px;color:#617083">${escapeHtml(input.projectCode)} · ${escapeHtml(projectName)}</p><p style="margin:0 0 8px"><strong>${escapeHtml(documentNumber)}</strong></p><p style="margin:0 0 12px">${escapeHtml(input.documentTitle)}</p><p style="margin:0 0 6px"><strong>Discipline:</strong> ${escapeHtml(input.discipline)}</p><p style="margin:0 0 6px"><strong>Submission due:</strong> ${escapeHtml(due)}</p><p style="margin:0"><strong>Required issue:</strong> ${escapeHtml(requiredIssue)}</p></div><p><a href="${escapeHtml(input.documentUrl)}" style="display:inline-block;background:#e8733f;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold">Open assigned MDR deliverable</a></p><p style="font-size:12px;line-height:1.6;color:#617083">Use the secure EngiCite workspace to upload the controlled revision. Your access remains limited to the project discipline authorised by the Project Manager and MDR deliverables assigned by Document Control.</p></div>`;
  return {subject,html};
}

function formatDate(value:string){return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"})}
function escapeHtml(value:string){return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
