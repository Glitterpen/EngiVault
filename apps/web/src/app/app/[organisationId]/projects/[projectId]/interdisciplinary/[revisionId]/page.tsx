import Link from "next/link";
import {notFound} from "next/navigation";
import {requireProject} from "@/lib/auth";
import {HelpTip} from "@/components/help-tip";
import {InterdisciplinaryCheckForm} from "@/components/interdisciplinary-check-form";
import {scopedRoleLabel} from "@/lib/role-experience";
import {interdisciplinaryScope,referenceDate,interdisciplinaryDecisionLabel,type InterdisciplinaryRevision} from "@/lib/interdisciplinary-checks";
import {PageState} from "@/components/page-state";

export default async function InterdisciplinaryRevisionPage({params,searchParams}:{params:Promise<{organisationId:string;projectId:string;revisionId:string}>;searchParams?:Promise<{q?:string;page?:string}>}){
  const parsed=interdisciplinaryScope.safeParse(await params);if(!parsed.success)notFound();
  const {organisationId,projectId,revisionId}=parsed.data;
  const {supabase,preview}=await requireProject(organisationId,projectId);
  const base=`/app/${organisationId}/projects/${projectId}/interdisciplinary`;
  let result:{data:unknown;error:{code?:string}|null};
  try{
    result=await supabase.rpc("get_interdisciplinary_revision",{target_organisation:organisationId,target_project:projectId,target_revision:revisionId});
  }catch{
    result={data:null,error:{code:"READ_UNAVAILABLE"}};
  }
  const {data,error}=result;
  if(error?.code==="42501"||(!error&&!data))notFound();
  if(error){
    const search=await searchParams??{};
    const page=Math.max(1,Math.min(Number.parseInt(search.page??"1",10)||1,40000));
    const retryHref=`${base}/${revisionId}?${new URLSearchParams({q:(search.q??"").slice(0,200),page:String(page)})}`;
    return <PageState kind="error" title="Interdisciplinary check could not be loaded" headingLevel={1} className="ev-card mx-auto max-w-2xl"
      actions={<><a href={retryHref} data-preview-safe className="ev-button-secondary">Retry loading</a>{preview&&<form action="/api/admin-preview/exit" method="post" data-preview-safe><button type="submit" className="ev-button-secondary">Exit preview</button></form>}</>}>
      <p>This revision and its check history could not be verified. Try loading again. No documents or checks have been changed.</p>
      {preview&&<p>If this member preview has expired, exit it before continuing.</p>}
    </PageState>;
  }
  const revision=data as InterdisciplinaryRevision;
  const search=await searchParams??{};
  const page=Math.max(1,Math.min(Number.parseInt(search.page??"1",10)||1,40000));
  const folderUrl=`${base}?${new URLSearchParams({discipline:revision.discipline,q:(search.q??"").slice(0,200),page:String(page)})}`;
  const file=`/api/v1/organisations/${organisationId}/projects/${projectId}/interdisciplinary/${revisionId}/file`;
  return <div className="mx-auto min-w-0 max-w-[1250px]">
    <Link href={folderUrl} className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-[#10243e]">← {revision.discipline} folder</Link>
    <header className="ev-card mt-5 min-w-0 break-words p-5 sm:p-6">
      <p className="text-xs font-bold text-[#e8733f]">{revision.documentNumber} · Rev {revision.revisionCode}</p>
      <h1 className="mt-3 text-2xl font-semibold">{revision.title}</h1>
      <p className="mt-2 text-sm text-[#617083]">{revision.discipline} · {revision.documentType} · {revision.issueStatus}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#eef3fa] px-3 py-1 text-xs font-semibold text-[#10243e]">DCC approved</span><span className="text-sm">Issue date: {referenceDate(revision.issueDate)}</span><HelpTip label="Approval and sign-off scope">An interdisciplinary check records feedback on this revision only. It does not replace DCC approval or grant upload or editing access.</HelpTip></div>
      {!revision.isCurrent&&<p className="mt-3 text-sm font-semibold text-[#a5452f]">A newer approved revision exists. This revision is reference-only. Open the library to check the current revision.</p>}
      {preview&&<p className="mt-3 text-sm text-[#a5452f]">Live member preview · Read-only</p>}
      <div className="mt-5 flex flex-wrap gap-2"><a className="ev-button" href={file} target="_blank" rel="noopener noreferrer">View approved file ↗</a><a className="ev-button-secondary" href={`${file}?download=1`}>Download file</a>{revision.hasNative&&<a className="ev-button-secondary" href={`${file}?native=1&download=1`}>Download native file</a>}</div>
    </header>
    <div className="mt-6 grid items-start gap-5 lg:grid-cols-2">
      {revision.canSignOff&&!preview?<InterdisciplinaryCheckForm organisationId={organisationId} projectId={projectId} revisionId={revisionId}/>:<div className="ev-card p-5 text-sm text-[#617083]">Reference-only access. <HelpTip label="Who can record a check">Appointed engineers, Project Managers and DCCs can check the current approved revision submitted by another member in an active project. Administrators, read-only viewers and audited member previews cannot record checks.</HelpTip></div>}
      <section className="min-w-0"><h2 className="mb-4 font-semibold">Revision check history <HelpTip label="Check history guidance">The latest 200 entries are shown, including earlier decisions when a reviewer updates their check. Checks do not carry forward to a new revision.</HelpTip></h2><div className="space-y-3">{revision.checks.map(check=><article key={check.id} className="ev-card min-w-0 break-words p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className={`text-sm font-semibold ${check.decision==="signed_off"?"text-[#10243e]":"text-[#a5452f]"}`}>{interdisciplinaryDecisionLabel[check.decision]}</p>{!check.is_latest&&<span className="text-xs text-[#617083]">Earlier decision</span>}</div>
        <p className="mt-2 text-sm font-semibold">{check.reviewer_name}{check.is_mine?" (you)":""}</p><p className="mt-1 text-xs text-[#617083]">{scopedRoleLabel(check.reviewer_role,check.reviewer_disciplines)} · {referenceDate(check.created_at)}</p>
        {check.comment&&<p className="mt-3 whitespace-pre-wrap text-sm leading-6">{check.comment}</p>}
      </article>)}</div>{!revision.checks.length&&<p className="ev-card p-6 text-sm text-[#617083]">No interdisciplinary checks recorded for this revision.</p>}</section>
    </div>
  </div>;
}
