import Link from "next/link";
import { notFound } from "next/navigation";
import { Download,Eye,FileText,History } from "lucide-react";
import { requireProject } from "@/lib/auth";
import { RevisionUpload } from "@/components/revision-upload";
import { RevisionProcessingStatus } from "@/components/revision-processing-status";
import { RevisionCompare } from "@/components/revision-compare";
import { DocumentAdminForm } from "@/components/record-admin-forms";
import { DocumentPlanForm } from "@/components/document-plan-form";

export default async function DocumentPage({params}:{params:Promise<{organisationId:string;projectId:string;documentId:string}>}){
  const {organisationId,projectId,documentId}=await params;
  const {supabase,access}=await requireProject(organisationId,projectId);
  const {data:doc}=await supabase.from("documents").select("*").eq("id",documentId).eq("organisation_id",organisationId).eq("project_id",projectId).maybeSingle();
  if(!doc)notFound();
  const {data:revisions}=await supabase.from("document_revisions").select("id,revision_code,issue_status,issue_date,state,original_filename,byte_size,created_at").eq("document_id",documentId).order("created_at",{ascending:false});
  const revisionIds=(revisions??[]).map(r=>r.id);
  const {data:runs}=revisionIds.length?await supabase.from("processing_runs").select("revision_id,state,attempt,error_code,metrics,updated_at").in("revision_id",revisionIds):{data:[]};
  const runByRevision=new Map((runs??[]).map(run=>[run.revision_id,run]));
  const canWrite=["organisation_admin","project_admin","document_controller"].includes(String(access.role));
  return <div className="mx-auto max-w-6xl">
    <p className="text-xs font-bold uppercase tracking-[.16em] text-[#0c5b45]">{doc.document_number}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">{doc.title}</h1>{canWrite&&<details className="ev-card mt-5 p-5"><summary className="cursor-pointer font-semibold">Edit or archive document</summary><div className="mt-5 space-y-5"><DocumentAdminForm record={doc}/><DocumentPlanForm record={doc}/></div></details>}
    <div className={`mt-8 grid items-start gap-5 ${canWrite?"lg:grid-cols-[1fr_350px]":""}`}><section className="space-y-5">
      <div className="ev-card grid gap-6 p-6 sm:grid-cols-3"><Meta l="Type" v={doc.document_type}/><Meta l="Discipline" v={doc.discipline}/><Meta l="Status" v={doc.status}/></div>
      <div className="ev-card overflow-hidden"><div className="flex items-center gap-2 border-b border-[#dfe7e3] p-5"><History size={18} className="text-[#0c5b45]"/><h2 className="font-semibold">Revision history</h2></div>
      {revisions?.length?revisions.map(r=>{const run=runByRevision.get(r.id)??null;const summary=processingSummary(run?.metrics);const endpoint=`/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/${r.id}/processing`;return <div key={r.id} className="flex items-center gap-4 border-b border-[#edf1ef] p-5 last:border-0"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#e8f1ed] text-[#0c5b45]"><FileText size={17}/></span><div className="min-w-0 flex-1"><p className="font-semibold">Revision {r.revision_code}</p><p className="mt-1 truncate text-xs text-[#65736f]">{r.issue_status} · {r.original_filename} · {formatBytes(r.byte_size)}</p>{summary&&<p className="mt-1 text-xs text-[#0c5b45]">{summary}</p>}{run?.error_code&&<p className="mt-1 text-xs text-[#a5452f]">Processing stopped: {run.error_code}</p>}<RevisionProcessingStatus endpoint={endpoint} initialRevisionState={r.state} initialRun={run} canRetry={canWrite}/></div>{r.state==="ready"&&<Link href={`/app/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/${r.id}/preview`} className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#d8e0dc] text-[#0c5b45] hover:bg-[#eef4f1]" aria-label={`Preview revision ${r.revision_code}`} title="Secure preview"><Eye size={16}/></Link>}{r.state!=="pending_upload"&&<a href={`/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/${r.id}/download`} className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#d8e0dc] text-[#0c5b45] hover:bg-[#eef4f1]" aria-label={`Download revision ${r.revision_code}`} title="Secure download"><Download size={16}/></a>}</div>}):<p className="p-10 text-center text-[#65736f]">No revisions uploaded.</p>}</div>
    </section><aside className="space-y-5">{canWrite&&<RevisionUpload organisationId={organisationId} projectId={projectId} documentId={documentId}/>}<RevisionCompare endpoint={`/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${documentId}/comparisons`} revisions={(revisions??[]).filter(r=>r.state==="ready")}/></aside></div>
  </div>
}
function Meta({l,v}:{l:string;v:string}){return <div><p className="ev-label">{l}</p><p className="font-semibold">{v}</p></div>}
function formatBytes(value:number){if(value<1024)return `${value} B`;if(value<1024*1024)return `${(value/1024).toFixed(1)} KB`;return `${(value/(1024*1024)).toFixed(1)} MB`}
function processingSummary(value:unknown){if(!value||typeof value!=="object")return "";const metrics=value as Record<string,unknown>;if(typeof metrics.page_count==="number")return `${metrics.page_count} page${metrics.page_count===1?"":"s"} extracted`;if(typeof metrics.sheet_count==="number")return `${metrics.sheet_count} sheet${metrics.sheet_count===1?"":"s"} extracted`;if(metrics.mode==="validation_only")return "Validated original · CAD extraction pending";return ""}
