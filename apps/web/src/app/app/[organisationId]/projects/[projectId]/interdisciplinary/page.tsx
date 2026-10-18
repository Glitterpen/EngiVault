import Link from "next/link";
import {Folder} from "lucide-react";
import {HelpTip} from "@/components/help-tip";
import {InterdisciplinaryAsk} from "@/components/interdisciplinary-ask";
import {InterdisciplinaryCommentForm} from "@/components/interdisciplinary-comment-form";
import {WorkspacePageHeading} from "@/components/workspace-page-heading";
import {requireProject} from "@/lib/auth";
import {can} from "@/lib/permissions";
import {canCommentInterdisciplinary,referenceDate} from "@/lib/interdisciplinary-checks";
import {interdisciplinaryLibraryQuery,interdisciplinaryStageAnchor,interdisciplinaryStageLibrarySchema,interdisciplinaryStagePages,type InterdisciplinaryLibrarySearch,type InterdisciplinaryStage} from "@/lib/interdisciplinary-stage-library";
import {PageState} from "@/components/page-state";

export default async function InterdisciplinaryLibraryPage({params,searchParams}:{params:Promise<{organisationId:string;projectId:string}>;searchParams:Promise<InterdisciplinaryLibrarySearch>}){
  const [{organisationId,projectId},search]=await Promise.all([params,searchParams]);
  const {supabase,preview,access}=await requireProject(organisationId,projectId);
  const q=(typeof search.q==="string"?search.q:"").slice(0,200),discipline=(typeof search.discipline==="string"?search.discipline:"").slice(0,200);
  const requestedPages=interdisciplinaryStagePages(search);
  const base=`/app/${organisationId}/projects/${projectId}/interdisciplinary`;
  let result:{data:unknown;error:unknown};
  try{
    result=await supabase.rpc("get_interdisciplinary_stage_library",{target_organisation:organisationId,target_project:projectId,search_text:q,filter_discipline:discipline,stage_pages:requestedPages});
  }catch{
    result={data:null,error:true};
  }
  const parsed=interdisciplinaryStageLibrarySchema.safeParse(result.data);
  if(result.error||!parsed.success){
    const retryHref=`${base}?${interdisciplinaryLibraryQuery(q,discipline,requestedPages)}`;
    return <PageState kind="error" title="Approved-document library could not be loaded" headingLevel={1} className="ev-card mx-auto max-w-2xl"
      actions={<><a href={retryHref} data-preview-safe className="ev-button-secondary">Retry loading</a>{preview&&<form action="/api/admin-preview/exit" method="post" data-preview-safe><button type="submit" className="ev-button-secondary">Exit preview</button></form>}</>}>
      <p>Approved documents could not be verified. Try loading again. No documents or checks have been changed.</p>
      {preview&&<p>If this member preview has expired, exit it before continuing.</p>}
    </PageState>;
  }
  const library=parsed.data;
  const folders=[...library.disciplines].sort((a,b)=>a.discipline.localeCompare(b.discipline));
  const actualPages=Object.fromEntries(library.stages.map(stage=>[stage.code,stage.page]));
  const folderUrl=(name:string)=>`${base}?${interdisciplinaryLibraryQuery(q,name)}`;
  const folderOverviewUrl=q?`${base}?${interdisciplinaryLibraryQuery(q,"")}`:base;
  const stageUrl=(stage:InterdisciplinaryStage,page:number)=>{
    const query=interdisciplinaryLibraryQuery(q,discipline,{...actualPages,[stage.code]:page});query.set("stage",stage.code);
    return `${base}?${query}#${interdisciplinaryStageAnchor(stage.code)}`;
  };
  const firstNonempty=library.stages.find(stage=>stage.matchRevisionTotal>0)?.code;
  const focusedStage=typeof search.stage==="string"&&library.stages.some(stage=>stage.code===search.stage)?search.stage:firstNonempty;
  const canComment=library.projectActive&&!preview&&canCommentInterdisciplinary(String(access.role));
  return <div className="mx-auto min-w-0 max-w-[1250px]">
    <WorkspacePageHeading title="Interdisciplinary check" context="Project reference library" help={<HelpTip label="Approved-document library guidance">All DCC-approved issue stages are retained for reference, including earlier approved revisions. Drafts, incomplete uploads and overridden copies are excluded. Coordination feedback does not change DCC approval.</HelpTip>}/>
    {preview&&<p className="mt-3 text-sm text-[#a5452f]">Live member preview · Read-only</p>}
    <InterdisciplinaryAsk key={`${organisationId}-${projectId}-${discipline}`} organisationId={organisationId} projectId={projectId} discipline={discipline} canAsk={library.projectActive&&can(String(access.role),"ai:use")&&!preview} preview={Boolean(preview)}/>
    {!discipline?<section className="mt-4" aria-labelledby="discipline-folders-heading">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="discipline-folders-heading" className="text-lg font-semibold">Discipline folders</h2><span className="text-sm text-[#617083]">{folders.length} {folders.length===1?"discipline":"disciplines"} · {library.total} approved {library.total===1?"deliverable":"deliverables"}</span></div>
      {q&&<p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#617083]">Search inside a folder: <span className="break-words font-semibold">{q}</span><Link href={base} className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-[#10243e]">Clear search</Link></p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{folders.map(folder=><Link key={folder.discipline} href={folderUrl(folder.discipline)} aria-label={`Open ${folder.discipline} discipline folder`} className="ev-card min-w-0 p-4 hover:border-[#10243e] hover:bg-[#f4f7fb]">
        <div className="flex min-h-11 items-center gap-3"><Folder className="size-6 shrink-0 text-[#10243e]" aria-hidden="true"/><span className="min-w-0 flex-1 break-words font-semibold">{folder.discipline}</span><span aria-hidden="true">→</span></div>
        <p className="mt-1 text-sm text-[#617083]">{folder.total} approved {folder.total===1?"deliverable":"deliverables"} · {folder.revisionTotal} {folder.revisionTotal===1?"revision":"revisions"}</p>
        <div className="mt-3 flex flex-wrap gap-2">{folder.stages.map(stage=><span key={stage.code} className="rounded-md bg-[#eef3fa] px-2 py-1 text-xs text-[#10243e]">{stage.code.startsWith("purpose:")?stage.label:stage.code} <span className="font-semibold">{stage.total}</span></span>)}</div>
        {q&&<p className="mt-2 text-xs text-[#617083]">{folder.matchTotal} matching {folder.matchTotal===1?"deliverable":"deliverables"}</p>}
      </Link>)}</div>
      {!folders.length&&<p className="ev-card mt-3 px-4 py-5 text-center text-sm text-[#617083] sm:px-5">Discipline folders will appear when documents are approved by DCC.</p>}
    </section>:<>
      <Link href={folderOverviewUrl} className="mt-3 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-[#10243e]">← All discipline folders</Link>
      <div className="flex flex-wrap items-end justify-between gap-2"><h2 className="flex min-w-0 items-center gap-2 text-xl font-semibold"><Folder className="size-5 shrink-0 text-[#10243e]" aria-hidden="true"/><span className="min-w-0 break-words">{discipline} folder</span></h2><p className="text-sm text-[#617083]">{library.total} approved {library.total===1?"deliverable":"deliverables"} · {library.revisionTotal} {library.revisionTotal===1?"revision":"revisions"}</p></div>
      <form action={base} method="get" className="ev-card mt-3 grid items-end gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:p-4">
        <label className="min-w-0"><span className="ev-label">Document number or title</span><input name="q" type="search" className="ev-input" defaultValue={q} maxLength={200}/></label>
        <label className="min-w-0"><span className="ev-label">Discipline</span><select name="discipline" className="ev-input" defaultValue={discipline}><option value="">All discipline folders</option>{folders.map(folder=><option key={folder.discipline}>{folder.discipline}</option>)}</select></label>
        <button className="ev-button">Search library</button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#eef3fa] px-3 py-1 text-xs font-semibold text-[#10243e]">DCC approved</span><span className="text-xs text-[#617083]">Complete approved history · Newest first within each stage</span><HelpTip label="Approved stage counts">Each stage counts distinct deliverables across its complete approved history, not just this page. A deliverable may appear at more than one stage. Multiple approved revisions remain available and are paged separately within each stage.</HelpTip></div>
      {q&&<p className="mt-3 text-sm text-[#617083]">{library.matchTotal} matching {library.matchTotal===1?"deliverable":"deliverables"} · {library.matchRevisionTotal} matching {library.matchRevisionTotal===1?"revision":"revisions"} <Link href={`${base}?${interdisciplinaryLibraryQuery("",discipline)}`} className="ml-2 inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-[#10243e]">Clear search</Link></p>}
      <nav aria-label="Approved issue stages" className="mt-3 flex flex-wrap gap-2">{library.stages.map(stage=><Link key={stage.code} href={stageUrl(stage,stage.page)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#d6e0ed] bg-white px-3 text-sm font-semibold text-[#10243e]">{stage.code.startsWith("purpose:")?stage.label:stage.code}<span className="text-xs text-[#617083]">{stage.total}</span></Link>)}</nav>
      <div className="mt-4 grid gap-3">{library.stages.map(stage=><details key={stage.code} id={interdisciplinaryStageAnchor(stage.code)} open={stage.code===focusedStage} className="min-w-0 scroll-mt-24 rounded-2xl border border-[#d6e0ed] bg-[#f4f7fb]">
        <summary className="min-h-14 cursor-pointer break-words rounded-2xl px-3 py-3 font-semibold text-[#10243e] sm:px-4"><h3 className="inline text-sm">{stage.label} <span className="ml-2 inline-block rounded-full bg-white px-2.5 py-1 text-xs">{stage.total} approved {stage.total===1?"deliverable":"deliverables"}</span></h3><span className="ml-2 text-xs font-normal text-[#617083]">{stage.revisionTotal} {stage.revisionTotal===1?"revision":"revisions"}{q?` · ${stage.matchRevisionTotal} matching`:""}</span></summary>
        <div className="grid gap-2 px-2 pb-2 sm:px-3 sm:pb-3">{stage.documents.map(document=><article key={document.revision_id} className="min-w-0 rounded-xl border border-[#dde4eb] bg-white p-3 sm:px-4">
          <div className="sm:flex sm:items-center sm:justify-between sm:gap-4"><div className="min-w-0"><p className="break-words text-xs font-bold text-[#a64019]">{document.document_number}</p>
            <h4 className="mt-1 break-words text-base font-semibold">{document.title}</h4><p className="mt-1 text-sm text-[#617083]">{document.discipline} · {document.document_type}</p></div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 sm:mt-0 sm:shrink-0 sm:flex-col sm:items-end"><p className="text-xs text-[#617083]">Rev {document.revision_code} · {document.submitted_at?`Submitted ${referenceDate(document.submitted_at)}`:`Issued ${referenceDate(document.issue_date)}`}</p>
              <Link href={`${base}/${document.revision_id}?${new URLSearchParams({q,page:String(stage.page)})}`} aria-label={`View approved file and checks for ${document.document_number}, revision ${document.revision_code}`} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[#10243e] hover:bg-[#eef3fa]">View file & discussion <span aria-hidden="true">→</span></Link></div>
          </div>
          {canComment&&<InterdisciplinaryCommentForm key={document.revision_id} organisationId={organisationId} projectId={projectId} revisionId={document.revision_id} compact/>}
        </article>)}</div>
        {!stage.documents.length&&<p className="px-4 pb-4 text-sm text-[#617083]">{stage.revisionTotal===0?"No DCC-approved deliverables at this stage yet.":"No approved revisions match this search at this stage."}</p>}
        {stage.matchRevisionTotal>0&&<nav aria-label={`${stage.label} revision pages`} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#dde4eb] px-3 py-2 text-sm sm:px-4">
          {stage.page>1?<Link className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-[#10243e]" href={stageUrl(stage,stage.page-1)}>← Previous {stage.code.startsWith("purpose:")?"revisions":stage.code}</Link>:<span/>}
          <span className="text-xs text-[#617083]">Showing {(stage.page-1)*stage.pageSize+1}–{Math.min(stage.page*stage.pageSize,stage.matchRevisionTotal)} of {stage.matchRevisionTotal} {q?"matching ":""}revisions · Page {stage.page} of {Math.ceil(stage.matchRevisionTotal/stage.pageSize)}</span>
          {stage.page*stage.pageSize<stage.matchRevisionTotal?<Link className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-[#10243e]" href={stageUrl(stage,stage.page+1)}>Next {stage.code.startsWith("purpose:")?"revisions":stage.code} →</Link>:<span/>}
        </nav>}
      </details>)}</div>
      {!library.matchRevisionTotal&&<p className="ev-card mt-4 px-4 py-5 text-center text-sm text-[#617083] sm:px-5">{q?"No approved documents match this selection.":"No approved deliverables are available in this discipline yet."}</p>}
    </>}
  </div>;
}
