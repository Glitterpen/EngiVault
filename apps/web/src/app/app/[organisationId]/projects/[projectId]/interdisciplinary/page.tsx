import Link from "next/link";
import {HelpTip} from "@/components/help-tip";
import {requireProject} from "@/lib/auth";
import {referenceDate,type InterdisciplinaryLibrary} from "@/lib/interdisciplinary-checks";

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
    <form action={base} method="get" className="ev-card mt-6 grid items-end gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <label className="min-w-0"><span className="ev-label">Document number or title</span><input name="q" type="search" className="ev-input" defaultValue={q} maxLength={200}/></label>
      <label className="min-w-0"><span className="ev-label">Discipline</span><select name="discipline" className="ev-input" defaultValue={discipline}><option value="">All disciplines</option>{library.disciplines.map(name=><option key={name}>{name}</option>)}</select></label>
      <button className="ev-button">Apply filters</button>
    </form>
    <div className="mt-5 grid gap-4 lg:grid-cols-2">{library.documents.map(document=><article key={document.document_id} className="ev-card min-w-0 break-words p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold text-[#e8733f]">{document.document_number}</p><span className="rounded-full bg-[#eaf5ef] px-3 py-1 text-xs font-semibold text-[#0c5b45]">DCC approved</span></div>
      <h2 className="mt-3 text-lg font-semibold">{document.title}</h2>
      <p className="mt-2 text-sm text-[#617083]">{document.discipline} · {document.document_type}</p>
      <p className="mt-3 text-sm">Rev {document.revision_code} · {document.issue_status} · {referenceDate(document.issue_date)}</p>
      <Link href={`${base}/${document.revision_id}`} className="ev-button-secondary mt-4">View approved file & checks →</Link>
    </article>)}</div>
    {!library.documents.length&&<p className="ev-card mt-5 p-8 text-center text-sm text-[#617083]">No approved documents match this selection.</p>}
    <nav aria-label="Approved document pages" className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">{page>1?<Link href={pageUrl(page-1)}>← Previous</Link>:<span/>}<span>Page {page} · {library.total} approved documents</span>{page*25<library.total?<Link href={pageUrl(page+1)}>Next →</Link>:<span/>}</nav>
  </div>;
}
