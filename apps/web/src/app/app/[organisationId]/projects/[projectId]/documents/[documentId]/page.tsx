import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { ArrowLeft,Bell,ClipboardCheck,Download,Eye,FileCog,FileText,History,UserPlus } from "lucide-react";
import { requireProject } from "@/lib/auth";
import { RevisionUpload } from "@/components/revision-upload";
import { RevisionProcessingStatus } from "@/components/revision-processing-status";
import { RevisionCompare } from "@/components/revision-compare";
import { DocumentAdminForm } from "@/components/record-admin-forms";
import { DocumentPlanForm } from "@/components/document-plan-form";
import { ProjectInviteDialog } from "@/components/project-invite-dialog";
import {projectHomePath,workspacePersona} from "@/lib/role-experience";
import {projectDeliveryStageLabel,projectIssueProgressCredit,projectTerminalIssueStatus,type ProjectDeliveryStage} from "@/lib/project-delivery-stage";

export default async function DocumentPage({params}:{params:Promise<{organisationId:string;projectId:string;documentId:string}>}){
  const {organisationId,projectId,documentId}=await params;
  const {supabase,access}=await requireProject(organisationId,projectId);
  const role=String(access.role);
  const canWrite=role==="document_controller";
  const isEngineer=role==="engineer";
  if(workspacePersona(role)==="management")redirect(projectHomePath(organisationId,projectId,role));

  const {data:doc}=await supabase.from("documents").select("*").eq("id",documentId).eq("organisation_id",organisationId).eq("project_id",projectId).maybeSingle();
  if(!doc)notFound();
  const {data:project}=await supabase.from("projects").select("delivery_stage").eq("organisation_id",organisationId).eq("id",projectId).maybeSingle();
  const deliveryStage=((project?.delivery_stage as ProjectDeliveryStage|null)??"feed");
  const {data:disciplineAccess}=role==="engineer"?await supabase.rpc("can_upload_document",{org:organisationId,project:projectId,document:documentId}):{data:false};
  if(role==="engineer"&&!disciplineAccess)notFound();

  const {data:revisions}=await supabase.from("document_revisions").select("id,revision_code,issue_status,issue_date,state,original_filename,byte_size,native_original_filename,native_byte_size,created_at,control_status,review_comment").eq("document_id",documentId).order("created_at",{ascending:false});
  const revisionIds=(revisions??[]).map(revision=>revision.id);
  const {data:runs}=revisionIds.length?await supabase.from("processing_runs").select("revision_id,state,attempt,error_code,metrics,updated_at").in("revision_id",revisionIds):{data:[]};
  const runByRevision=new Map((runs??[]).map(run=>[run.revision_id,run]));
  const canUpload=isEngineer&&Boolean(disciplineAccess);
  const showAside=canUpload||canWrite;

  return <div className="mx-auto max-w-6xl">
    <Link href={projectHomePath(organisationId,projectId,role)} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45] transition hover:text-[#e8733f]"><ArrowLeft size={16}/>{isEngineer?"My deliverables":"Role workspace"}</Link>
    <p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#0c5b45]">{isEngineer?"Engineer deliverable":"Controlled document"} · {doc.document_number}</p>
    <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">{doc.title}</h1>
    {isEngineer&&<p className="mt-2 text-sm text-[#617083]">Submit revisions for your authorised {doc.discipline} discipline. Document Control will accept the revision or return it with feedback.</p>}
    <p className="mt-2 text-xs font-semibold text-[#0c5b45]">{projectDeliveryStageLabel(deliveryStage)} workflow · 100% completion requires {projectTerminalIssueStatus(deliveryStage)}.</p>
    {canWrite&&<details className="ev-card mt-5 p-5"><summary className="cursor-pointer font-semibold">Edit or archive document</summary><div className="mt-5 space-y-5"><DocumentAdminForm record={doc}/><DocumentPlanForm record={doc}/></div></details>}

    <div className={`mt-8 grid min-w-0 items-start gap-5 ${showAside?"lg:grid-cols-[minmax(0,1fr)_380px]":""}`}>
      <section className="min-w-0 space-y-5">
        <div className="ev-card grid min-w-0 gap-6 p-6 sm:grid-cols-2 xl:grid-cols-6"><Meta l="Type" v={doc.document_type}/><Meta l="Discipline" v={doc.discipline}/><Meta l="Status" v={doc.status}/><Meta l="Submission due" v={formatDate(doc.planned_submission_date)}/><Meta l="Required issue" v={doc.required_issue_status||"To be confirmed"}/><Meta l="100% milestone" v={projectTerminalIssueStatus(deliveryStage)}/></div>
        <div className="ev-card min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-[#dfe7e3] p-5"><History size={18} className="text-[#0c5b45]"/><h2 className="font-semibold">Revision history</h2></div>
          {revisions?.length?revisions.map(revision=>{
            const run=runByRevision.get(revision.id)??null;
            const summary=processingSummary(run?.metrics);
            const endpoint=`/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/${revision.id}/processing`;
            return <div key={revision.id} className="flex min-w-0 items-center gap-3 border-b border-[#edf1ef] p-4 last:border-0 sm:gap-4 sm:p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#e8f1ed] text-[#0c5b45]"><FileText size={17}/></span>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">Revision {revision.revision_code}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${revision.control_status==="accepted"?"bg-[#e8f1ed] text-[#0c5b45]":revision.control_status==="returned"?"bg-[#fff0e9] text-[#a5452f]":"bg-[#fff7dd] text-[#7a5a00]"}`}>{revision.control_status}</span>{revision.native_original_filename&&<span className="rounded-full bg-[#eaf0f7] px-2 py-0.5 text-[10px] font-bold uppercase text-[#244b73]">Native source attached</span>}</div><p className="mt-1 truncate text-xs text-[#65736f]">{revision.issue_status} · {revision.original_filename} · {formatBytes(revision.byte_size)}</p>{revision.native_original_filename&&<p className="mt-1 truncate text-xs text-[#244b73]">Editable source · {revision.native_original_filename} · {formatBytes(revision.native_byte_size??0)}</p>}{revision.review_comment&&<p className="mt-2 text-xs font-medium text-[#a5452f]">DCC comment: {revision.review_comment}</p>}{summary&&<p className="mt-1 text-xs text-[#0c5b45]">{summary}</p>}{run?.error_code&&<p className="mt-1 text-xs text-[#a5452f]">Processing stopped: {run.error_code}</p>}<RevisionProcessingStatus endpoint={endpoint} initialRevisionState={revision.state} initialRun={run} canRetry={canWrite}/></div>
              {revision.control_status==="accepted"&&<span className="self-center whitespace-nowrap rounded-full bg-[#fff0e9] px-2 py-1 text-[10px] font-bold text-[#a5452f]">{projectIssueProgressCredit(revision.issue_status,deliveryStage)}% progress credit</span>}
              {revision.state==="ready"&&<Link href={`/app/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/${revision.id}/preview`} className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#d8e0dc] text-[#0c5b45] hover:bg-[#eef4f1]" aria-label={`Preview revision ${revision.revision_code}`} title="Secure preview"><Eye size={16}/></Link>}
              {["ready","superseded"].includes(revision.state)&&<a href={`/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/${revision.id}/download`} className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#d8e0dc] text-[#0c5b45] hover:bg-[#eef4f1]" aria-label={`Download revision ${revision.revision_code}`} title="Secure download"><Download size={16}/></a>}
              {revision.native_original_filename&&["ready","superseded"].includes(revision.state)&&<a href={`/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/${revision.id}/native-download`} className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#d8e0dc] text-[#244b73] hover:bg-[#eaf0f7]" aria-label={`Download native source for revision ${revision.revision_code}`} title="Download editable native source"><FileCog size={16}/></a>}
            </div>;
          }):<p className="p-10 text-center text-[#65736f]">No revisions uploaded.</p>}
        </div>
      </section>
      <aside id="submit-revision" className={`min-w-0 space-y-5 ${canUpload?"order-first lg:order-none":""}`}>
        {canUpload&&<RevisionUpload organisationId={organisationId} projectId={projectId} documentId={documentId} deliveryStage={deliveryStage}/>}
        {canWrite&&<div className="ev-card p-6"><div className="flex items-center gap-2"><UserPlus size={18} className="text-[#e8733f]"/><h2 className="font-bold">Assign the discipline engineer</h2></div><p className="mt-3 text-sm leading-6 text-[#617083]">Invite an authorised <strong className="text-[#10243e]">{doc.discipline}</strong> engineer to submit this document. Document Control cannot upload revisions.</p><div className="mt-5"><ProjectInviteDialog organisationId={organisationId} projectId={projectId} disciplines={[{code:String(doc.discipline),name:String(doc.discipline)}]} allowedRoles={["engineer"]} lockedDiscipline={String(doc.discipline)} label={`Invite ${doc.discipline} engineer`}/></div><div className="mt-5 rounded-xl border border-[#dfe7e3] bg-[#f7faf8] p-4"><p className="flex items-center gap-2 text-sm font-semibold text-[#0c5b45]"><Bell size={16}/> Submission notification</p><p className="mt-2 text-xs leading-5 text-[#617083]">When the engineer uploads a revision, you will receive an EngiCite notification and the submission will enter the DCC review queue.</p><Link href={`/app/${organisationId}/projects/${projectId}/reviews`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45] hover:text-[#e8733f]"><ClipboardCheck size={16}/> Open submission review</Link></div></div>}
        <RevisionCompare endpoint={`/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${documentId}/comparisons`} revisions={(revisions??[]).filter(revision=>revision.state==="ready")}/>
      </aside>
    </div>
  </div>;
}

function Meta({l,v}:{l:string;v:string}){return <div><p className="ev-label">{l}</p><p className="font-semibold">{v}</p></div>;}
function formatBytes(value:number){if(value<1024)return `${value} B`;if(value<1024*1024)return `${(value/1024).toFixed(1)} KB`;return `${(value/(1024*1024)).toFixed(1)} MB`;}
function formatDate(value:string|null){if(!value)return "Not scheduled";return new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}T00:00:00Z`));}
function processingSummary(value:unknown){if(!value||typeof value!=="object")return "";const metrics=value as Record<string,unknown>;if(typeof metrics.page_count==="number")return `${metrics.page_count} page${metrics.page_count===1?"":"s"} extracted`;if(typeof metrics.sheet_count==="number")return `${metrics.sheet_count} sheet${metrics.sheet_count===1?"":"s"} extracted`;if(metrics.mode==="validation_only")return "Validated original · CAD extraction pending";return "";}
