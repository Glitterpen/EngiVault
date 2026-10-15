import type {ReactNode} from "react";
import Link from "next/link";
import {ArrowLeft,Layers3,List,Search} from "lucide-react";
import {HelpTip} from "@/components/help-tip";
import {DocumentIssueSchedule} from "@/components/document-issue-schedule";
import {MdrDocumentActions} from "@/components/mdr-document-actions";
import type {DocumentSchedule} from "@/lib/document-schedule";

export type MdrFilters={q?:string;page?:string;discipline?:string;documentType?:string;status?:string;area?:string;view?:string;records?:string};
export type MdrDocument={schedule:DocumentSchedule;id:string;document_number:string;title:string;document_type:string;discipline:string;status:string;area:string|null;system:string|null;work_package:string|null;planned_submission_date:string|null;updated_at:string;lifecycle_status:string;document_revisions:{state:string}[]};
type Props={
  organisationId:string;projectId:string;backHref:string;backLabel:string;filters:MdrFilters;docs:MdrDocument[];
  total:number;page:number;canManage:boolean;canSeeRemoved:boolean;canUseAi:boolean;
  disciplineOptions:string[];typeOptions:string[];statusOptions:string[];areaOptions:string[];
  registerAction?:ReactNode;importAction?:ReactNode;assignmentPanel?:ReactNode;notice?:ReactNode;
};
export function mdrFilterUrl(filters:MdrFilters,changes:Partial<MdrFilters>={}){
  const values=Object.entries({...filters,...changes}).filter(([key,value])=>value&&(key!=="page"||value!=="1"));
  const query=new URLSearchParams(values as [string,string][]).toString();
  return query?`?${query}`:"?";
}

export function MdrRegisterWorkspace({organisationId,projectId,backHref,backLabel,filters,docs,total,page,canManage,canSeeRemoved,canUseAi,disciplineOptions,typeOptions,statusOptions,areaOptions,registerAction,importAction,assignmentPanel,notice}:Props){
  const base=`/app/${organisationId}/projects/${projectId}`;
  const archived=filters.records==="removed",grouped=filters.view!=="flat";
  const advanced=[filters.documentType,filters.status,filters.area].filter(Boolean).length;
  const filtered=Boolean(filters.q||filters.discipline||advanced);
  const groups=[...new Set(docs.map(document=>document.discipline))].sort();
  const url=(changes:Partial<MdrFilters>)=>mdrFilterUrl(filters,changes);
  const tab="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-[#617083] hover:bg-[#f3f7f5]";
  const active="bg-[#edf3f0] font-semibold text-[#0c5b45]";
  return <div className="mx-auto min-w-0 max-w-[1400px] space-y-4">
    <header>
      <Link href={backHref} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0c5b45]"><ArrowLeft size={16} aria-hidden="true"/>{backLabel}</Link>
      <div className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h1 className="flex min-w-0 flex-wrap items-center gap-x-2 text-3xl font-semibold tracking-tight">{archived?"Removed deliverables":"Master document register"}<HelpTip label="Master document register guidance">Browse the controlled register by discipline or as a flat list. Due dates remain visible; use each document’s details icon for schedule history and other metadata. Group counts refer to the current page. Removed records retain revision and audit history.</HelpTip></h1>
        {(registerAction||importAction)&&<div className="flex flex-wrap gap-2">{registerAction}{importAction}</div>}
      </div>
    </header>
    {notice}
    <form method="get" aria-label="Search the MDR" className="ev-card min-w-0 p-3 sm:p-4">
      <input type="hidden" name="view" value={grouped?"grouped":"flat"}/><input type="hidden" name="records" value={archived?"removed":""}/>
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]">
        <label className="min-w-0"><span className="ev-label">Document number or title</span><input className="ev-input" name="q" type="search" maxLength={100} defaultValue={filters.q??""} placeholder="Search the register"/></label>
        <Filter name="discipline" label="Discipline" value={filters.discipline??""} values={disciplineOptions}/>
        <button className="ev-button-secondary"><Search size={16} aria-hidden="true"/>Apply filters</button>
      </div>
      <details open={advanced>0||undefined} className="mt-2 min-w-0">
        <summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-[#526675]">More filters{advanced>0&&<span className="ml-2 font-normal">{advanced} active</span>}</summary>
        <div className="grid gap-3 border-t border-[#e7ecef] pt-3 sm:grid-cols-3">
          <Filter name="documentType" label="Document type" value={filters.documentType??""} values={typeOptions}/>
          <Filter name="status" label="Status" value={filters.status??""} values={statusOptions}/>
          <Filter name="area" label="Area" value={filters.area??""} values={areaOptions}/>
        </div>
      </details>
      {filtered&&<Link href={mdrFilterUrl({view:filters.view,records:filters.records})} className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-[#0c5b45]">Clear filters</Link>}
    </form>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[#dfe6e9] pb-2">
      <nav aria-label="Register records" className="flex flex-wrap gap-1">
        <Link href={url({records:"",page:"1"})} aria-current={!archived?"page":undefined} className={`${tab} ${!archived?active:""}`}>Active MDR</Link>
        {canSeeRemoved&&<Link href={url({records:"removed",page:"1"})} aria-current={archived?"page":undefined} className={`${tab} ${archived?active:""}`}>Removed deliverables</Link>}
      </nav>
      <nav aria-label="Register layout" className="flex flex-wrap gap-1">
        <Link href={url({view:"flat",page:"1"})} aria-current={!grouped?"page":undefined} className={`${tab} ${!grouped?active:""}`}><List size={15} aria-hidden="true"/>Flat register</Link>
        <Link href={url({view:"grouped",page:"1"})} aria-current={grouped?"page":undefined} className={`${tab} ${grouped?active:""}`}><Layers3 size={15} aria-hidden="true"/>Group by discipline</Link>
      </nav>
      <p className="py-2 text-xs text-[#617083]">{total} matching document{total===1?"":"s"}</p>
    </div>
    {assignmentPanel}
    <section aria-label="MDR documents" className="min-w-0 space-y-3">
      {grouped&&docs.length?groups.map((name,index)=><details key={name} open={index===0} className="ev-card min-w-0 overflow-hidden">
        <summary className="min-h-11 cursor-pointer break-words px-4 py-3 text-sm font-semibold"><h2 className="inline">{name}</h2><span className="ml-2 text-xs font-normal text-[#617083]">{docs.filter(document=>document.discipline===name).length} on this page</span></summary>
        <RegisterRows docs={docs.filter(document=>document.discipline===name)} organisationId={organisationId} projectId={projectId} canManage={canManage} title={name}/>
      </details>):<div className="ev-card min-w-0 overflow-hidden"><RegisterRows docs={docs} organisationId={organisationId} projectId={projectId} canManage={canManage}/></div>}
    </section>
    <Pagination page={page} total={total} href={url}/>
    <nav aria-label="Register reference tools" className="flex flex-wrap gap-4 text-xs font-semibold text-[#526675]">
      <Link href={`${base}/search`} className="inline-flex min-h-11 items-center rounded-lg">Engineering search</Link>
      {canUseAi&&<Link href={`${base}/chat`} className="inline-flex min-h-11 items-center rounded-lg">Ask EngiCite</Link>}
    </nav>
  </div>;
}

function RegisterRows({docs,organisationId,projectId,canManage,title}:{docs:MdrDocument[];organisationId:string;projectId:string;canManage:boolean;title?:string}){
  const base=`/app/${organisationId}/projects/${projectId}`;
  const actions=(document:MdrDocument)=><MdrDocumentActions organisationId={organisationId} projectId={projectId} documentId={document.id} documentNumber={document.document_number} archived={document.lifecycle_status==="archived"} compact/>;
  if(!docs.length)return <p className="p-6 text-center text-sm text-[#617083]">No documents match this register view.</p>;
  return <>
    <div className="divide-y divide-[#e7ecef] md:hidden">{docs.map(document=><article key={document.id} className="min-w-0 p-4">
      <DocumentLink document={document} href={`${base}/documents/${document.id}`}/>
      <div className="mt-1 flex min-w-0 items-center gap-1"><p className="min-w-0 break-words text-xs text-[#617083]">{document.discipline} · {document.document_type} · {document.status}</p><MetadataTip document={document}/></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><CompactSchedule schedule={document.schedule}/>{canManage&&actions(document)}</div>
    </article>)}</div>
    <div className="hidden min-w-0 overflow-x-auto md:block" role="region" aria-label={`Master document register${title?` — ${title}`:""} — scroll horizontally for all columns`} tabIndex={0}>
      <table className="min-w-[820px] w-full text-left text-sm">
        <caption className="sr-only">{title?`${title} MDR deliverables`:"MDR deliverables"}</caption>
        <thead className="border-y border-[#e7ecef] bg-[#f8faf9] text-xs font-medium text-[#617083]"><tr>
          <th scope="col" className="w-[42%] px-4 py-3">Document</th><th scope="col" className="px-4 py-3">Discipline</th><th scope="col" className="px-4 py-3">Next issue</th><th scope="col" className="px-4 py-3">Status</th>{canManage&&<th scope="col" className="px-4 py-3 text-right">Actions</th>}
        </tr></thead>
        <tbody>{docs.map(document=><tr key={document.id} className="border-b border-[#e7ecef] last:border-0">
          <td className="px-4 py-3"><DocumentLink document={document} href={`${base}/documents/${document.id}`}/><div className="flex items-center gap-1"><span className="break-words text-xs text-[#617083]">{document.document_type}</span><MetadataTip document={document}/></div></td>
          <td className="px-4 py-3 text-xs text-[#526675]">{document.discipline}</td><td className="px-4 py-3"><CompactSchedule schedule={document.schedule}/></td>
          <td className="px-4 py-3 text-xs text-[#526675]">{document.status}</td>{canManage&&<td className="px-4 py-3">{actions(document)}</td>}
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}
function DocumentLink({document,href}:{document:MdrDocument;href:string}){
  return <Link href={href} className="inline-flex min-h-11 min-w-0 flex-col justify-center gap-1 rounded-lg hover:underline"><span className="break-words text-xs font-semibold text-[#0c5b45]">{document.document_number}</span><span className="break-words text-sm font-medium text-[#24384f]">{document.title}</span></Link>;
}
function MetadataTip({document}:{document:MdrDocument}){
  return <HelpTip label={`Document details for ${document.document_number}`}><dl className="grid gap-2"><div><dt className="font-semibold">Area / system</dt><dd>{[document.area,document.system].filter(Boolean).join(" · ")||"Not recorded"}</dd></div>{document.work_package&&<div><dt className="font-semibold">Work package</dt><dd>{document.work_package}</dd></div>}<div><dt className="font-semibold">Updated</dt><dd>{formatDate(document.updated_at)}</dd></div></dl><div className="mt-3 border-t border-[#e7ecef] pt-3"><DocumentIssueSchedule schedule={document.schedule}/></div></HelpTip>;
}
function CompactSchedule({schedule}:{schedule:DocumentSchedule}){
  return <div className={`text-xs leading-5 ${schedule.overdue?"text-[#a5452f]":"text-[#526675]"}`}>
    <p>{schedule.next_submission_date?`Due ${formatDate(schedule.next_submission_date)}`:schedule.deadline_kind==="terminal_received"?"Terminal issue received":schedule.deadline_kind==="cycle_not_set"?"Revision cycle not set":"Date not planned"}</p>{schedule.overdue&&<p className="font-semibold">Overdue</p>}
  </div>;
}
function Filter({name,label,value,values}:{name:string;label:string;value:string;values:string[]}){
  return <label className="min-w-0"><span className="ev-label">{label}</span><select className="ev-input" name={name} defaultValue={value}><option value="">All</option>{[...new Set([...values,...(value?[value]:[])])].sort().map(item=><option key={item}>{item}</option>)}</select></label>;
}
function formatDate(value:string){return new Date(value.length===10?`${value}T00:00:00Z`:value).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});}
function Pagination({page,total,href}:{page:number;total:number;href:(changes:Partial<MdrFilters>)=>string}){
  const pages=Math.max(1,Math.ceil(total/25));
  return <nav aria-label="MDR pages" className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#617083]"><span>{total} document{total===1?"":"s"} · Page {page} of {pages}</span><div className="flex gap-2">{page>1?<Link className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-[#0c5b45]" href={href({page:String(page-1)})}>Previous</Link>:<span className="inline-flex min-h-11 items-center px-3">Previous</span>}{page<pages?<Link className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-[#0c5b45]" href={href({page:String(page+1)})}>Next</Link>:<span className="inline-flex min-h-11 items-center px-3">Next</span>}</div></nav>;
}
