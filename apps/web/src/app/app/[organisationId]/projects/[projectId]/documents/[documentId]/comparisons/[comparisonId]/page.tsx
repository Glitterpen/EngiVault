import Link from "next/link";
import {notFound} from "next/navigation";
import {ArrowLeft} from "lucide-react";
import {requireProject} from "@/lib/auth";
import {ReadUnavailable} from "@/components/read-unavailable";

export default async function ComparisonPage({params}:{params:Promise<{organisationId:string;projectId:string;documentId:string;comparisonId:string}>}){
  const {organisationId,projectId,documentId,comparisonId}=await params;
  const {supabase}=await requireProject(organisationId,projectId);
  const retryHref=`/app/${organisationId}/projects/${projectId}/documents/${documentId}/comparisons/${comparisonId}`;
  const {data:comparison,error:comparisonError}=await supabase.from("revision_comparisons").select("id,state,summary,base_revision_id,target_revision_id").eq("id",comparisonId).eq("document_id",documentId).maybeSingle();
  if(comparisonError)return <ReadUnavailable title="Comparison information is temporarily unavailable" href={retryHref}/>;
  if(!comparison)notFound();
  const {data:revisions,error:revisionError}=await supabase.from("document_revisions").select("id,revision_code").in("id",[comparison.base_revision_id,comparison.target_revision_id]);
  if(revisionError)return <ReadUnavailable title="Comparison revision details are temporarily unavailable" href={retryHref}/>;
  const labels=new Map((revisions??[]).map(r=>[r.id,r.revision_code]));
  const {data:changes,error:changesError}=comparison.state==="ready"?await supabase.from("comparison_changes").select("id,ordinal,change_type,locator,base_content,target_content").eq("comparison_id",comparisonId).order("ordinal"):{data:[],error:null};
  if(changesError)return <ReadUnavailable title="Comparison results are temporarily unavailable" href={retryHref}>The change list could not be loaded. No change counts or conclusions are shown until the results can be verified.</ReadUnavailable>;
  const summary=comparison.summary as Record<string,unknown>|null;
  const baseLabel=labels.get(comparison.base_revision_id)??"unavailable";
  const targetLabel=labels.get(comparison.target_revision_id)??"unavailable";
  return <div className="mx-auto max-w-7xl">
    <Link href={`/app/${organisationId}/projects/${projectId}/documents/${documentId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#10243e]"><ArrowLeft size={16}/> Back to revision history</Link>
    <h1 className="mt-6 text-3xl font-semibold">Extracted-content comparison</h1>
    <p className="mt-2 text-sm text-[#617083]">Revision {baseLabel} compared with {targetLabel}. Drawing geometry and graphical markups are not yet included.</p>
    {comparison.state!=="ready"?<section role={comparison.state==="failed"?"alert":"status"} className="ev-card mt-6 p-8 text-center">
      <h2 className="font-semibold">{comparison.state==="failed"?"Comparison could not be completed":comparison.state==="queued"?"Comparison queued":"Comparison processing"}</h2>
      <p className="mt-2 text-sm leading-6 text-[#617083]">{comparison.state==="failed"?"No verified comparison results are available. Refresh the status to check for an update, or contact EngiCite support if the problem continues.":"Results will appear after secure processing completes. Zero counts are not shown until then."}</p>
      <a href={retryHref} data-preview-safe className="ev-button-secondary mt-4">Refresh comparison status</a>
    </section>:<>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">{["added","removed","changed"].map(key=><div key={key} className="ev-card p-4"><p className="ev-label">{key}</p><p className="text-2xl font-semibold">{changeCount(summary?.[key])}</p></div>)}</div>
      <div className="mt-6 space-y-3">{changes?.map(change=><article key={change.id} className="ev-card overflow-hidden"><div className="flex items-center justify-between border-b border-[#d6e0ed] px-4 py-3"><span className="text-xs font-bold text-[#e8733f]">{change.locator}</span><span className="rounded-full bg-[#eef3fa] px-2 py-1 text-xs font-semibold capitalize">{change.change_type}</span></div><div className="grid md:grid-cols-2"><div className="border-b p-4 md:border-b-0 md:border-r"><p className="ev-label">Base · {baseLabel}</p><p className="whitespace-pre-wrap text-sm leading-6">{change.base_content??"—"}</p></div><div className="p-4"><p className="ev-label">Target · {targetLabel}</p><p className="whitespace-pre-wrap text-sm leading-6">{change.target_content??"—"}</p></div></div></article>)}{!changes?.length&&<div className="ev-card p-10 text-center text-[#617083]">No extracted-text changes detected. The uploaded files may be identical, or their differences may be graphical.</div>}</div>
    </>}
  </div>;
}

function changeCount(value:unknown){return typeof value==="number"&&Number.isFinite(value)&&value>=0?value:"Not available";}
