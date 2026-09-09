import Link from "next/link";
import {notFound} from "next/navigation";
import {requireProject} from "@/lib/auth";
import {HelpTip} from "@/components/help-tip";
import {InterdisciplinaryCheckForm} from "@/components/interdisciplinary-check-form";
import {scopedRoleLabel} from "@/lib/role-experience";
import {interdisciplinaryScope,referenceDate,interdisciplinaryDecisionLabel,type InterdisciplinaryRevision} from "@/lib/interdisciplinary-checks";

export default async function InterdisciplinaryRevisionPage({params}:{params:Promise<{organisationId:string;projectId:string;revisionId:string}>}){
  const parsed=interdisciplinaryScope.safeParse(await params);if(!parsed.success)notFound();
  const {organisationId,projectId,revisionId}=parsed.data;
  const {supabase,preview}=await requireProject(organisationId,projectId);
  const {data,error}=await supabase.rpc("get_interdisciplinary_revision",{target_organisation:organisationId,target_project:projectId,target_revision:revisionId});
  if(error?.code==="42501"||(!error&&!data))notFound();
  if(error)throw new Error("This interdisciplinary check could not be loaded. Please refresh.");
  const revision=data as InterdisciplinaryRevision;
  const base=`/app/${organisationId}/projects/${projectId}/interdisciplinary`;
  const file=`/api/v1/organisations/${organisationId}/projects/${projectId}/interdisciplinary/${revisionId}/file`;
  return <div className="mx-auto min-w-0 max-w-[1250px]">
    <Link href={base} className="text-sm font-semibold text-[#0c5b45]">← Approved documents</Link>
    <header className="ev-card mt-5 min-w-0 break-words p-5 sm:p-6">
      <p className="text-xs font-bold text-[#e8733f]">{revision.documentNumber} · Rev {revision.revisionCode}</p>
      <h1 className="mt-3 text-2xl font-semibold">{revision.title}</h1>
      <p className="mt-2 text-sm text-[#617083]">{revision.discipline} · {revision.documentType} · {revision.issueStatus}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#eaf5ef] px-3 py-1 text-xs font-semibold text-[#0c5b45]">DCC approved</span><span className="text-sm">Issue date: {referenceDate(revision.issueDate)}</span><HelpTip label="Approval and sign-off scope">The DCC approval remains unchanged. Interdisciplinary checks record coordination feedback against this exact revision; they do not grant permission to upload, edit or formally approve another member’s submission.</HelpTip></div>
      {!revision.isCurrent&&<p className="mt-3 text-sm font-semibold text-[#a5452f]">A newer approved revision exists. This revision is reference-only. Open the library to check the current revision.</p>}
      {preview&&<p className="mt-3 text-sm text-[#a5452f]">Live member preview · Read-only</p>}
      <div className="mt-5 flex flex-wrap gap-2"><a className="ev-button" href={file} target="_blank" rel="noopener noreferrer">View approved file ↗</a><a className="ev-button-secondary" href={`${file}?download=1`}>Download file</a>{revision.hasNative&&<a className="ev-button-secondary" href={`${file}?native=1&download=1`}>Download native file</a>}</div>
    </header>
    <div className="mt-6 grid items-start gap-5 lg:grid-cols-2">
      {revision.canSignOff&&!preview?<InterdisciplinaryCheckForm organisationId={organisationId} projectId={projectId} revisionId={revisionId}/>:<div className="ev-card p-5 text-sm text-[#617083]">Reference-only access. <HelpTip label="Who can record a check">Appointed engineers, Project Managers and DCCs can check the current approved revision submitted by another member in an active project. Administrators, read-only viewers and audited member previews cannot record checks.</HelpTip></div>}
      <section className="min-w-0"><h2 className="mb-4 font-semibold">Revision check history <HelpTip label="Check history guidance">Showing the latest 200 entries for this revision. An updated decision supersedes that reviewer’s previous entry without deleting it. Checks do not carry forward to newer revisions.</HelpTip></h2><div className="space-y-3">{revision.checks.map(check=><article key={check.id} className="ev-card min-w-0 break-words p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className={`text-sm font-semibold ${check.decision==="signed_off"?"text-[#0c5b45]":"text-[#a5452f]"}`}>{interdisciplinaryDecisionLabel[check.decision]}</p>{!check.is_latest&&<span className="text-xs text-[#617083]">Earlier decision</span>}</div>
        <p className="mt-2 text-sm font-semibold">{check.reviewer_name}{check.is_mine?" (you)":""}</p><p className="mt-1 text-xs text-[#617083]">{scopedRoleLabel(check.reviewer_role,check.reviewer_disciplines)} · {referenceDate(check.created_at)}</p>
        {check.comment&&<p className="mt-3 whitespace-pre-wrap text-sm leading-6">{check.comment}</p>}
      </article>)}</div>{!revision.checks.length&&<p className="ev-card p-6 text-sm text-[#617083]">No interdisciplinary checks recorded for this revision.</p>}</section>
    </div>
  </div>;
}
