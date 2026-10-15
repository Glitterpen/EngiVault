import Link from "next/link";
import {Folder} from "lucide-react";
import {HelpTip} from "@/components/help-tip";
import {WorkspacePageHeading} from "@/components/workspace-page-heading";
import {requireProject} from "@/lib/auth";
import {referenceDate,type InterdisciplinaryLibrary} from "@/lib/interdisciplinary-checks";
import {groupSubmissions} from "@/lib/submission-groups";

export default async function InterdisciplinaryLibraryPage({params,searchParams}:{params:Promise<{organisationId:string;projectId:string}>;searchParams:Promise<{q?:string;discipline?:string;page?:string}>}){
  const [{organisationId,projectId},search]=await Promise.all([params,searchParams]);
  const {supabase,preview}=await requireProject(organisationId,projectId);
  const q=(search.q??"").slice(0,200),discipline=(search.discipline??"").slice(0,200);
  const page=discipline?Math.max(1,Math.min(Number.parseInt(search.page??"1",10)||1,40000)):1;
  const base=`/app/${organisationId}/projects/${projectId}/interdisciplinary`;
  const {data,error}=await supabase.rpc("get_interdisciplinary_documents",{target_organisation:organisationId,target_project:projectId,search_text:q,filter_discipline:discipline,page_offset:(page-1)*25});
  if(error||!data)throw new Error("The approved-document library could not be loaded. Please refresh or contact EngiCite support.");
  const library=data as InterdisciplinaryLibrary;
  const folders=[...library.disciplines].sort((a,b)=>a.localeCompare(b));
  const pageUrl=(number:number)=>`${base}?${new URLSearchParams({q,discipline,page:String(number)})}`;
  const folderUrl=(name:string)=>`${base}?${new URLSearchParams({q,discipline:name,page:"1"})}`;
  const folderOverviewUrl=q?`${base}?${new URLSearchParams({q})}`:base;
  const detailQuery=new URLSearchParams({q,page:String(page)});
  // The database filters by discipline before pagination and returns newest submissions first.
  const groups=groupSubmissions(library.documents.map((document,position)=>({latest:{issue_status:document.issue_status},document,position})))
    .sort((a,b)=>a.items[0].position-b.items[0].position);
  return <div className="mx-auto min-w-0 max-w-[1250px]">
    <WorkspacePageHeading title="Interdisciplinary check" context="Project reference library" help={<HelpTip label="Approved-document library guidance">Browse the latest available DCC-approved revision from every discipline in this project. Drafts and pending submissions are not shared here. Sign-offs and feedback are separate from final DCC approval; upload assignments are unchanged.</HelpTip>}/>
    {preview&&<p className="mt-3 text-sm text-[#a5452f]">Live member preview · Read-only</p>}
    {!discipline?<section className="mt-4" aria-labelledby="discipline-folders-heading">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="discipline-folders-heading" className="flex items-center gap-2 text-lg font-semibold">Discipline folders <HelpTip label="Discipline folder guidance">Open a discipline folder to browse its approved submissions by issue purpose. The most recently submitted groups and documents appear first. Search and pagination apply inside the selected folder.</HelpTip></h2><span className="text-sm text-[#617083]">{folders.length} {folders.length===1?"discipline":"disciplines"}</span></div>
      {q&&<p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#617083]">Search inside a folder: <span className="break-words font-semibold">{q}</span><Link href={base} className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-[#0c5b45]">Clear search</Link></p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{folders.map(name=><Link key={name} href={folderUrl(name)} aria-label={`Open ${name} discipline folder`} className="ev-card flex min-h-20 min-w-0 items-center gap-3 p-4 hover:border-[#0c5b45] hover:bg-[#f3f8f6]">
        <Folder className="size-6 shrink-0 text-[#0c5b45]" aria-hidden="true"/><span className="min-w-0 flex-1 break-words font-semibold">{name}</span><span className="text-[#0c5b45]" aria-hidden="true">→</span>
      </Link>)}</div>
      {!folders.length&&<p className="ev-card mt-3 px-4 py-5 text-center text-sm text-[#617083] sm:px-5">Discipline folders will appear when documents are approved by DCC.</p>}
    </section>:<>
    <Link href={folderOverviewUrl} className="mt-3 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-[#0c5b45]">← All discipline folders</Link>
    <h2 className="mt-1 flex min-w-0 items-center gap-2 text-xl font-semibold"><Folder className="size-5 shrink-0 text-[#0c5b45]" aria-hidden="true"/><span className="min-w-0 break-words">{discipline} folder</span></h2>
    <form action={base} method="get" className="ev-card mt-3 grid items-end gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:p-4">
      <label className="min-w-0"><span className="ev-label">Document number or title</span><input name="q" type="search" className="ev-input" defaultValue={q} maxLength={200}/></label>
      <label className="min-w-0"><span className="ev-label">Discipline</span><select name="discipline" className="ev-input" defaultValue={discipline}><option value="">All discipline folders</option>{folders.map(name=><option key={name}>{name}</option>)}</select></label>
      <button className="ev-button">Apply filters</button>
    </form>
    <div className="mt-3 flex items-center gap-2"><span className="rounded-full bg-[#eaf5ef] px-3 py-1 text-xs font-semibold text-[#0c5b45]">DCC approved</span><HelpTip label="Document grouping and order">Expand an issue purpose to browse this discipline’s approved documents. Groups are ordered by their newest submission, with newest documents first inside each group. Group counts refer to this page; older entries remain available on subsequent pages.</HelpTip></div>
    <div className="mt-3 grid gap-3">{groups.map((group,index)=><details key={group.label} open={index===0} className="min-w-0 rounded-2xl border border-[#dfe7e3] bg-[#f3f8f6]">
      <summary className="min-h-11 cursor-pointer break-words rounded-2xl px-3 py-3 font-semibold text-[#0c5b45] sm:px-4"><h3 className="inline text-sm">{group.label} <span className="ml-2 inline-block rounded-full bg-white px-2.5 py-1 text-xs">{group.items.length} {group.items.length===1?"document":"documents"}</span></h3></summary>
      <div className="grid gap-2 px-2 pb-2 sm:px-3 sm:pb-3">{group.items.map(({document})=><article key={document.document_id} className="min-w-0 rounded-xl border border-[#dde4eb] bg-white p-3 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:px-4">
      <div className="min-w-0"><p className="break-words text-xs font-bold text-[#a64019]">{document.document_number}</p>
      <h4 className="mt-1 break-words text-base font-semibold">{document.title}</h4>
      <p className="mt-1 text-sm text-[#617083]">{document.discipline} · {document.document_type}</p></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 sm:mt-0 sm:shrink-0 sm:flex-col sm:items-end"><p className="text-xs text-[#617083]">Rev {document.revision_code} · {document.submitted_at?`Submitted ${referenceDate(document.submitted_at)}`:`Issued ${referenceDate(document.issue_date)}`}</p>
      <Link href={`${base}/${document.revision_id}?${detailQuery}`} aria-label={`View approved file and checks for ${document.document_number}`} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[#0c5b45] hover:bg-[#eef5f1]">View file & checks <span aria-hidden="true">→</span></Link></div>
    </article>)}</div></details>)}</div>
    {!library.documents.length&&<p className="ev-card mt-4 px-4 py-5 text-center text-sm text-[#617083] sm:px-5">No approved documents match this selection.</p>}
    <nav aria-label="Approved document pages" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">{page>1?<Link className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-[#0c5b45]" href={pageUrl(page-1)}>← Previous</Link>:<span/>}<span>Page {page} · {library.total} approved documents</span>{page*25<library.total?<Link className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-[#0c5b45]" href={pageUrl(page+1)}>Next →</Link>:<span/>}</nav>
    </>}
  </div>;
}
