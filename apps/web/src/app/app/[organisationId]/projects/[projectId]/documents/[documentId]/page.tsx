import {HelpTip} from "@/components/help-tip";
import {WorkspacePageHeading} from "@/components/workspace-page-heading";
import { processingFailureMessage } from "@/lib/customer-messages";
import Link from "next/link";
import {loadDocumentSchedules} from "@/lib/document-schedule";
import {DocumentIssueSchedule} from "@/components/document-issue-schedule";
import { notFound,redirect } from "next/navigation";
import { ArrowLeft,Bell,ClipboardCheck,Download,Eye,FileCog,FileText,History } from "lucide-react";
import { requireProject } from "@/lib/auth";
import { RevisionUpload } from "@/components/revision-upload";
import { IncompleteUploadRecovery } from "@/components/incomplete-upload-recovery";
import { RevisionProcessingStatus } from "@/components/revision-processing-status";
import { RevisionCompare } from "@/components/revision-compare";
import { DocumentAdminForm } from "@/components/record-admin-forms";
import { DocumentPlanForm } from "@/components/document-plan-form";
import {DocumentAssignmentManager,type AssignableEngineer} from "@/components/document-assignment-manager";
import {disciplineMatches} from "@/lib/discipline-access";
import {projectHomePath,workspacePersona} from "@/lib/role-experience";
import {projectDeliveryStageLabel,projectIssueProgressCredit,projectTerminalIssueStatus,type ProjectDeliveryStage} from "@/lib/project-delivery-stage";
import {ReadUnavailable} from "@/components/read-unavailable";
import {revisionControlDisplay} from "@/lib/revision-display-status";

export default async function DocumentPage({params}:{params:Promise<{organisationId:string;projectId:string;documentId:string}>}){
  const {organisationId,projectId,documentId}=await params;
  const {supabase,access,user,preview}=await requireProject(organisationId,projectId);
  const role=String(access.role);
  const canWrite=role==="document_controller";
  const isEngineer=role==="engineer";
  if(workspacePersona(role)==="management")redirect(projectHomePath(organisationId,projectId,role));

  const retryHref=`/app/${organisationId}/projects/${projectId}/documents/${documentId}`;
  const {data:doc,error:documentError}=await supabase.from("documents").select("*").eq("id",documentId).eq("organisation_id",organisationId).eq("project_id",projectId).maybeSingle();
  if(documentError)return <ReadUnavailable title="Document information is temporarily unavailable" href={retryHref}/>;
  if(!doc)notFound();
  const schedules=await loadDocumentSchedules(supabase,organisationId,projectId,[documentId]);
  const {data:project,error:projectError}=await supabase.from("projects").select("delivery_stage").eq("organisation_id",organisationId).eq("id",projectId).maybeSingle();
  if(projectError)return <ReadUnavailable title="Project issue requirements are temporarily unavailable" href={retryHref}/>;
  if(!project)notFound();
  const deliveryStage=((project?.delivery_stage as ProjectDeliveryStage|null)??"feed");
  const {data:disciplineAccess,error:permissionError}=role==="engineer"?await supabase.rpc("can_upload_document",{org:organisationId,project:projectId,document:documentId}):{data:false,error:null};
  if(permissionError)return <ReadUnavailable title="Document access could not be checked" href={retryHref}/>;
  if(role==="engineer"&&!disciplineAccess)notFound();

  const [{data:teamData,error:teamError},{data:assignmentData,error:assignmentError}]=canWrite?await Promise.all([
    supabase.rpc("get_project_team",{target_organisation:organisationId,target_project:projectId}),
    supabase.from("document_assignments").select("user_id,status").eq("organisation_id",organisationId).eq("project_id",projectId).eq("document_id",documentId),
  ]):[{data:[],error:null},{data:[],error:null}];
  if(teamError||assignmentError)return <ReadUnavailable title="Deliverable assignments are temporarily unavailable" href={retryHref}/>;
  const assignedUsers=new Set((assignmentData??[]).filter(assignment=>assignment.status==="active").map(assignment=>assignment.user_id));
  const assignableEngineers=((teamData??[]) as {user_id:string;display_name:string;email:string;role:string;disciplines:string[]}[])
    .filter(member=>member.role==="engineer"&&(member.disciplines??[]).some(discipline=>disciplineMatches(discipline,String(doc.discipline))))
    .map<AssignableEngineer>(member=>({userId:member.user_id,name:member.display_name,email:member.email,assigned:assignedUsers.has(member.user_id)}));

  const {data:revisions,error:revisionError}=await supabase.from("document_revisions").select("id,uploaded_by,revision_code,issue_status,issue_date,state,original_filename,byte_size,native_original_filename,native_byte_size,created_at,reviewed_at,control_status,review_comment,submission_version,overridden_by_revision_id").eq("document_id",documentId).order("created_at",{ascending:false});
  if(revisionError)return <ReadUnavailable title="Revision history is temporarily unavailable" href={retryHref}>Existing submissions could not be verified. Retry loading before starting another upload.</ReadUnavailable>;
  const revisionIds=(revisions??[]).map(revision=>revision.id);
  const {data:runs,error:processingError}=revisionIds.length?await supabase.from("processing_runs").select("revision_id,state,attempt,error_code,metrics,updated_at").in("revision_id",revisionIds):{data:[],error:null};
  if(processingError)return <ReadUnavailable title="Revision processing status is temporarily unavailable" href={retryHref}/>;
  const runByRevision=new Map((runs??[]).map(run=>[run.revision_id,run]));
  const canUpload=isEngineer&&Boolean(disciplineAccess);
  const completedIssueRevisions=(revisions??[])
    .filter(revision=>["ready","superseded"].includes(revision.state)&&revision.control_status==="accepted"&&revision.overridden_by_revision_id==null)
    .map(revision=>({issue_status:revision.issue_status,created_at:revision.created_at,reviewed_at:revision.reviewed_at,
      state:revision.state,control_status:revision.control_status,overridden_by_revision_id:revision.overridden_by_revision_id}));
  const completedIssueStatuses=[...new Set(completedIssueRevisions.map(revision=>revision.issue_status))];
  const readyRevisions=(revisions??[]).filter(revision=>revision.state==="ready");
  const schedule=schedules.get(documentId)!;

  return <div className="mx-auto min-w-0 max-w-6xl">
    <Link href={projectHomePath(organisationId,projectId,role)} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[#10243e]"><ArrowLeft size={16} aria-hidden="true"/>{isEngineer?"My deliverables":"Role workspace"}</Link>
    <header className="mt-1 min-w-0"><WorkspacePageHeading title={doc.title} context={<>{doc.document_number} · {doc.discipline} · {doc.document_type}</>} help={<HelpTip label="Document and revision guidance">{isEngineer?`Submit revisions for your authorised ${doc.discipline} discipline. Document Control accepts the revision or returns it with feedback. `:"View controlled revision files and their processing status. "}{projectDeliveryStageLabel(deliveryStage)} workflow · 100% completion requires {projectTerminalIssueStatus(deliveryStage)}.</HelpTip>}/></header>
    <nav aria-label="Document sections" className="mt-2 flex min-w-0 flex-wrap gap-x-5 text-sm font-semibold text-[#526675]">{canUpload&&<a href="#submit-revision" className="inline-flex min-h-11 items-center rounded-lg">Submit revision</a>}<a href="#revision-history" className="inline-flex min-h-11 items-center rounded-lg">Revision history <span className="ml-1 font-normal">({revisions?.length??0})</span></a><a href="#document-details" className="inline-flex min-h-11 items-center rounded-lg">Document details</a>{canWrite&&<a href="#document-management" className="inline-flex min-h-11 items-center rounded-lg">Manage deliverable</a>}</nav>
    <details id="document-details" className="mt-2 min-w-0 scroll-mt-24 overflow-hidden rounded-2xl border border-[#dde4eb] bg-white"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold sm:px-5">Document details &amp; issue schedule{schedule.next_submission_date&&<span className={`ml-2 inline-block text-xs font-medium ${schedule.overdue?"text-[#a5452f]":"text-[#526675]"}`}>{schedule.overdue?"Overdue":"Next due"} · {formatDate(schedule.next_submission_date)}</span>}{schedule.deadline_kind==="cycle_not_set"&&<span className="ml-2 inline-block text-xs font-medium text-[#a5452f]">Revision cycle not set</span>}</summary><div className="grid min-w-0 gap-4 border-t border-[#e7ecef] p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:p-5"><dl className="grid min-w-0 grid-cols-2 gap-4"><Meta l="Type" v={doc.document_type}/><Meta l="Discipline" v={doc.discipline}/><Meta l="Registered status" v={doc.status}/><Meta l="Required issue" v={doc.required_issue_status||"To be confirmed"}/><Meta l="100% milestone" v={projectTerminalIssueStatus(deliveryStage)}/></dl><DocumentIssueSchedule schedule={schedule}/></div></details>
    {canWrite&&<details id="document-management" className="mt-3 min-w-0 scroll-mt-24 overflow-hidden rounded-2xl border border-[#dde4eb] bg-white" open={doc.lifecycle_status==="archived"||undefined}><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold sm:px-5">Manage MDR deliverable · edit, plan or remove</summary><div className="space-y-4 border-t border-[#e7ecef] p-4 sm:p-5"><HelpTip label="Manage MDR deliverable">Correct the registered information or remove the deliverable from active MDR views. Controlled revisions and audit evidence are never discarded.</HelpTip><DocumentAdminForm record={doc}/><DocumentPlanForm record={doc}/></div></details>}

    <div className="mt-4 min-w-0 space-y-4">
      {canUpload&&<section id="submit-revision" aria-label="Submit revision" className="min-w-0 space-y-3">
        {!preview&&(revisions??[]).filter(revision=>revision.state==="pending_upload"&&revision.control_status==="submitted"&&revision.uploaded_by===user.id).map(revision=><section key={revision.id} className="min-w-0"><h2 className="break-words text-sm font-semibold">Resume revision {revision.revision_code} · {revision.issue_status}</h2><IncompleteUploadRecovery endpoint={`/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/${revision.id}/recovery`}/></section>)}
        <RevisionUpload organisationId={organisationId} projectId={projectId} documentId={documentId} deliveryStage={deliveryStage} completedIssueStatuses={completedIssueStatuses} completedIssueRevisions={completedIssueRevisions}/>
      </section>}
        <section id="revision-history" aria-labelledby="revision-history-heading" className="min-w-0 scroll-mt-24 overflow-hidden rounded-2xl border border-[#dde4eb] bg-white">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e7ecef] px-4 py-3 sm:px-5"><h2 id="revision-history-heading" className="inline-flex items-center gap-2 text-base font-semibold"><History size={17} aria-hidden="true" className="text-[#526675]"/>Revision history</h2><p className="text-xs text-[#526675]">Most recent first</p></header>
          {revisions?.length?revisions.map(revision=>{
            const run=runByRevision.get(revision.id)??null;
            const summary=processingSummary(run?.metrics);
            const displayStatus=revisionControlDisplay(revision);
            const endpoint=`/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/${revision.id}/processing`;
            return <article key={revision.id} className="grid min-w-0 gap-3 border-b border-[#e7ecef] p-4 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5">
              <div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2"><h3 className="break-words text-sm font-semibold">Revision {revision.revision_code}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${revision.control_status==="accepted"?"bg-[#eef3fa] text-[#10243e]":revision.control_status==="returned"?"bg-[#fff0e9] text-[#a5452f]":"bg-[#fff7dd] text-[#7a5a00]"}`}>{displayStatus.label}</span>{revision.submission_version>1&&<span className="text-xs text-[#526675]">Submission {revision.submission_version}</span>}{revision.control_status==="accepted"&&<span className="text-xs font-medium text-[#10243e]">{projectIssueProgressCredit(revision.issue_status,deliveryStage)}% progress credit</span>}</div>{displayStatus.description&&<p className="mt-2 break-words text-sm leading-6 text-[#8b431f]">{displayStatus.description}</p>}<p className="mt-1 break-words text-sm text-[#526675]">{revision.issue_status}</p><p className="mt-2 flex min-w-0 items-start gap-2 break-all text-xs leading-5 text-[#526675]"><FileText size={14} aria-hidden="true" className="mt-0.5 shrink-0"/><span>{revision.original_filename} · {formatBytes(revision.byte_size)}</span></p>{revision.native_original_filename&&<p className="mt-1 flex min-w-0 items-start gap-2 break-all text-xs leading-5 text-[#244b73]"><FileCog size={14} aria-hidden="true" className="mt-0.5 shrink-0"/><span>Editable source · {revision.native_original_filename} · {formatBytes(revision.native_byte_size??0)}</span></p>}{revision.review_comment&&<p className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-[#efc6b4] bg-[#fff8f4] p-3 text-sm leading-6 text-[#8b3d1f]">DCC comment: {revision.review_comment}</p>}{summary&&<p className="mt-2 text-xs text-[#10243e]">{summary}</p>}{run?.error_code&&<p className="mt-1 break-words text-xs leading-5 text-[#a5452f]">{processingFailureMessage(run.error_code)}</p>}{revision.overridden_by_revision_id?<p className="mt-2 text-xs leading-5 text-[#526675]">Replaced before transmittal. Original file retained for audit history.</p>:<RevisionProcessingStatus endpoint={endpoint} initialRevisionState={revision.state} initialRun={run} canRetry={canWrite}/>}</div>
              <div className="flex flex-wrap items-start gap-2 sm:justify-end">
              {revision.state==="ready"&&<Link href={`/app/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/${revision.id}/preview`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#d6e0ed] px-3 text-xs font-semibold text-[#10243e] hover:bg-[#eef3fa]" aria-label={`Preview revision ${revision.revision_code}`}><Eye size={16} aria-hidden="true"/>Preview</Link>}
              {["ready","superseded"].includes(revision.state)&&<a href={`/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/${revision.id}/download`} className="grid size-11 shrink-0 place-items-center rounded-lg border border-[#d6e0ed] text-[#10243e] hover:bg-[#eef3fa]" aria-label={`Download revision ${revision.revision_code}`} title="Download controlled file"><Download size={16} aria-hidden="true"/></a>}
              {revision.native_original_filename&&["ready","superseded"].includes(revision.state)&&<a href={`/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/${revision.id}/native-download`} className="grid size-11 shrink-0 place-items-center rounded-lg border border-[#d6e0ed] text-[#244b73] hover:bg-[#eaf0f7]" aria-label={`Download native source for revision ${revision.revision_code}`} title="Download editable native source"><FileCog size={16} aria-hidden="true"/></a>}
              </div>
            </article>;
          }):<p className="p-10 text-center text-[#617083]">No revisions uploaded.</p>}
        </section>
        {readyRevisions.length>=2&&<details className="min-w-0 overflow-hidden rounded-2xl border border-[#dde4eb] bg-white"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold sm:px-5">Compare revisions</summary><div className="border-t border-[#e7ecef] p-4 sm:p-5"><RevisionCompare endpoint={`/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${documentId}/comparisons`} revisions={readyRevisions}/></div></details>}
        {canWrite&&<div className="grid min-w-0 items-start gap-4 lg:grid-cols-2"><DocumentAssignmentManager organisationId={organisationId} projectId={projectId} documentId={documentId} discipline={String(doc.discipline)} engineers={assignableEngineers}/><section className="min-w-0 rounded-2xl border border-[#dde4eb] bg-white p-4 sm:p-5"><h2 className="flex items-center gap-2 text-sm font-semibold"><Bell size={16} aria-hidden="true"/>Submission notifications <HelpTip label="Submission notifications">Assigned engineer uploads enter the DCC review queue and generate an EngiCite notification.</HelpTip></h2><Link href={`/app/${organisationId}/projects/${projectId}/reviews`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[#10243e]"><ClipboardCheck size={16} aria-hidden="true"/>Open submission review</Link></section></div>}
    </div>
  </div>;
}

function Meta({l,v}:{l:string;v:string}){return <div className="min-w-0"><dt className="text-xs text-[#526675]">{l}</dt><dd className="mt-1 break-words text-sm font-medium">{v}</dd></div>;}
function formatDate(value:string){return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});}
function formatBytes(value:number){if(value<1024)return `${value} B`;if(value<1024*1024)return `${(value/1024).toFixed(1)} KB`;return `${(value/(1024*1024)).toFixed(1)} MB`;}
function processingSummary(value:unknown){if(!value||typeof value!=="object")return "";const metrics=value as Record<string,unknown>;if(typeof metrics.page_count==="number")return `${metrics.page_count} page${metrics.page_count===1?"":"s"} extracted`;if(typeof metrics.sheet_count==="number")return `${metrics.sheet_count} sheet${metrics.sheet_count===1?"":"s"} extracted`;if(metrics.mode==="validation_only")return "Validated original · CAD extraction pending";return "";}
