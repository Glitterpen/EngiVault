import Link from "next/link";
import {HelpTip} from "@/components/help-tip";
import {requireProject} from "@/lib/auth";
import {referenceDate,type InterdisciplinaryLibrary} from "@/lib/interdisciplinary-checks";
import {groupSubmissions} from "@/lib/submission-groups";

export default async function InterdisciplinaryLibraryPage({params,searchParams}:{params:Promise<{organisationId:string;projectId:string}>;searchParams:Promise<{q?:string;discipline?:string;page?:string}>}){
  const [{organisationId,projectId},search]=await Promise.all([params,searchParams]);
  const {supabase,preview}=await requireProject(organisationId,projectId);
  const page=Math.max(1,Math.min(Number.parseInt(search.page??"1",10)||1,40000));
  const q=(search.q??"").slice(0,200),discipline=(search.discipline??"").slice(0,200);
  const base=`/app/${organisationId}/projects/${projectId}/interdisciplinary`;
  const {data,error}=await supabase.rpc("get_interdisciplinary_documents",{target_organisation:organisationId,target_project:projectId,search_text:q,filter_discipline:discipline,page_offset:(page-1)*25});
  if(error||!data)throw new Error("The approved-document library could not be loaded. Please refresh or contact EngiCite support.");
  const library=data as InterdisciplinaryLibrary;
  const pageUrl=(number:number)=>`${base}?${new URLSearchParams({q,discipline,page:String(number)})}`;
  return <div className="mx-auto min-w-0 max-w-[1250px]">
    <p className="text-xs font-bold uppercase tracking-widest text-[#e8733f]">Project reference library</p>
    <h1 className="mt-2 flex flex-wrap items-center gap-2 text-3xl font-semibold">Interdisciplinary check <HelpTip label="Approved-document library guidance">Browse the latest available DCC-approved revision from every discipline in this project. Drafts and pending submissions are not shared here. Sign-offs and feedback are separate from final DCC approval; upload assignments are unchanged.</HelpTip></h1>
    {preview&&<p className="mt-3 text-sm text-[#a5452f]">Live member preview · Read-only</p>}
    <form action={base} method="get" className="ev-card mt-4 grid items-end gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:p-4">
      <label className="min-w-0"><span className="ev-label">Document number or title</span><input name="q" type="search" className="ev-input" defaultValue={q} maxLength={200}/></label>
      <label className="min-w-0"><span className="ev-label">Discipline</span><select name="discipline" className="ev-input" defaultValue={discipline}><option value="">All disciplines</option>{library.disciplines.map(name=><option key={name}>{name}</option>)}</select></label>
      <button className="ev-button">Apply filters</button>
    </form>
    <div className="mt-3 flex items-center gap-2"><span className="rounded-full bg-[#eaf5ef] px-3 py-1 text-xs font-semibold text-[#0c5b45]">DCC approved</span><HelpTip label="Document grouping and order">Expand an issue purpose to browse its approved documents. Newest submissions appear first within each group. Group counts refer to this page; older entries remain available on subsequent pages.</HelpTip></div>
    <div className="mt-3 grid gap-3">{groupSubmissions(library.documents.map(document=>({latest:{issue_status:document.issue_status},document}))).map((group,index)=><details key={group.label} open={index===0} className="min-w-0 rounded-2xl border border-[#dfe7e3] bg-[#f3f8f6]">
      <summary className="min-h-11 cursor-pointer break-words rounded-2xl px-3 py-3 font-semibold text-[#0c5b45] sm:px-4"><h2 className="inline text-sm">{group.label} <span className="ml-2 inline-block rounded-full bg-white px-2.5 py-1 text-xs">{group.items.length} {group.items.length===1?"document":"documents"}</span></h2></summary>
      <div className="grid gap-2 px-2 pb-2 sm:px-3 sm:pb-3">{group.items.map(({document})=><article key={document.document_id} className="min-w-0 rounded-xl border border-[#dde4eb] bg-white p-3 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:px-4">
      <div className="min-w-0"><p className="break-words text-xs font-bold text-[#a64019]">{document.document_number}</p>
      <h3 className="mt-1 break-words text-base font-semibold">{document.title}</h3>
      <p className="mt-1 text-sm text-[#617083]">{document.discipline} · {document.document_type}</p></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 sm:mt-0 sm:shrink-0 sm:flex-col sm:items-end"><p className="text-xs text-[#617083]">Rev {document.revision_code} · {referenceDate(document.issue_date)}</p>
      <Link href={`${base}/${document.revision_id}`} aria-label={`View approved file and checks for ${document.document_number}`} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[#0c5b45] hover:bg-[#eef5f1]">View file & checks <span aria-hidden="true">→</span></Link></div>
    </article>)}</div></details>)}</div>
    {!library.documents.length&&<p className="ev-card mt-5 p-8 text-center text-sm text-[#617083]">No approved documents match this selection.</p>}
    <nav aria-label="Approved document pages" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">{page>1?<Link className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-[#0c5b45]" href={pageUrl(page-1)}>← Previous</Link>:<span/>}<span>Page {page} · {library.total} approved documents</span>{page*25<library.total?<Link className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-[#0c5b45]" href={pageUrl(page+1)}>Next →</Link>:<span/>}</nav>
  </div>;
}
