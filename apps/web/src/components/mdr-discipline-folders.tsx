"use client";

import {useEffect,useRef,useState} from "react";
import {ChevronDown,Folder,FolderOpen,FoldVertical,ArrowLeft} from "lucide-react";
import {MdrDocumentRows} from "@/components/mdr-document-rows";
import type {MdrDisciplineSummary,MdrFolderPage} from "@/lib/mdr-register-types";
import {disciplineFolderColour} from "@/lib/discipline-folder-colour";

type Props={organisationId:string;projectId:string;disciplines:MdrDisciplineSummary[];search:string;records:string;canManage:boolean;refreshKey?:string};
export function MdrDisciplineFolders(props:Props){
  const [active,setActive]=useState<string|null>(null);
  const disciplines=[...props.disciplines].sort((a,b)=>a.name.localeCompare(b.name));
  return <section aria-label="MDR disciplines" className="min-w-0 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-[#24384f]">Discipline folders</h2>{disciplines.length>0&&<button type="button" data-preview-safe onClick={()=>setActive(null)} aria-label="Collapse all disciplines" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-[#526675]"><FoldVertical size={15} aria-hidden="true"/>Collapse all</button>}</div>
    {disciplines.length?disciplines.map(discipline=><DisciplineFolder key={discipline.name} {...props} discipline={discipline} open={active===discipline.name} onOpenChange={open=>setActive(current=>open?discipline.name:current===discipline.name?null:current)}/>):<p className="ev-card p-6 text-sm text-[#617083]">{props.search?"No documents match your search.":"No deliverables are registered in this MDR view yet."}</p>}
  </section>;
}
function DisciplineFolder({discipline,open,onOpenChange,...props}:Props&{discipline:MdrDisciplineSummary;open:boolean;onOpenChange:(open:boolean)=>void}){
  const summary=useRef<HTMLElement>(null);
  const Icon=open?FolderOpen:Folder;
  return <details open={open} onToggle={event=>onOpenChange(event.currentTarget.open)} className="ev-card min-w-0 overflow-hidden">
    <summary ref={summary} className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
      <Icon size={19} aria-hidden="true" className="shrink-0" style={{color:disciplineFolderColour(discipline.name)}}/>
      <h3 className="min-w-0 flex-1 break-words text-sm font-semibold text-[#24384f]">{discipline.name}</h3>
      <span className="shrink-0 text-xs text-[#617083]">{discipline.count}<span className="sr-only sm:not-sr-only"> document{discipline.count===1?"":"s"}</span></span>
      <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-[#617083] ${open?"rotate-180":""}`}/>
    </summary>
    {open&&<FolderDocuments {...props} discipline={discipline} onClose={()=>{onOpenChange(false);summary.current?.focus();}}/>}
  </details>;
}
function FolderDocuments({organisationId,projectId,discipline,search,records,canManage,refreshKey,onClose}:Omit<Props,"disciplines">&{discipline:MdrDisciplineSummary;onClose:()=>void}){
  const [page,setPage]=useState(1),[retry,setRetry]=useState(0);
  const results=useRef<HTMLDivElement>(null);
  const [result,setResult]=useState<{key:string;data?:MdrFolderPage;failed?:boolean}|null>(null);
  const query=new URLSearchParams({discipline:discipline.name,page:String(page)});
  if(search)query.set("q",search);
  if(records)query.set("records",records);
  const endpoint=`/api/v1/organisations/${organisationId}/projects/${projectId}/documents/register?${query}`;
  const requestKey=`${endpoint}:${refreshKey??""}:${retry}`;
  useEffect(()=>{
    const controller=new AbortController();
    void (async()=>{
      try{
        const response=await fetch(endpoint,{cache:"no-store",credentials:"same-origin",signal:controller.signal});
        if(!response.ok)throw new Error("Folder unavailable");
        const data:unknown=await response.json();
        if(!validPage(data,discipline.name))throw new Error("Folder unavailable");
        if(!controller.signal.aborted)setResult({key:requestKey,data});
      }catch{if(!controller.signal.aborted)setResult({key:requestKey,failed:true});}
    })();
    return()=>controller.abort();
  },[endpoint,requestKey,discipline.name]);
  const current=result?.key===requestKey?result:undefined;
  const data=current?.data,pages=data?Math.max(1,Math.ceil(data.total/data.pageSize)):1;
  const goToPage=(value:number)=>{setPage(value);results.current?.focus();};
  return <div ref={results} role="region" aria-label={`${discipline.name} documents`} tabIndex={-1} className="min-w-0 border-t border-[#e7ecef]" aria-busy={!current}>
    {!current?<p role="status" className="p-5 text-sm text-[#617083]">Loading {discipline.name} documents…</p>:current.failed?<div role="alert" className="p-5 text-sm text-[#617083]"><p>This discipline could not be loaded. No records have been changed.</p><button type="button" data-preview-safe aria-label={`Retry ${discipline.name}`} className="ev-button-secondary mt-3" onClick={()=>setRetry(value=>value+1)}>Retry</button></div>:data&&<>
      <MdrDocumentRows docs={data.documents} organisationId={organisationId} projectId={projectId} canManage={canManage&&data.canManage} title={discipline.name}/>
      <nav aria-label={`${discipline.name} document pages`} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e7ecef] px-4 py-2 text-xs text-[#617083]">
        <span role="status">{data.total} document{data.total===1?"":"s"} · Page {data.page} of {pages}</span>
        {pages>1&&<div className="flex gap-2"><button type="button" data-preview-safe aria-label={`Previous page in ${discipline.name}`} disabled={data.page<=1} onClick={()=>goToPage(data.page-1)} className="min-h-11 rounded-lg px-3 font-semibold text-[#10243e] disabled:opacity-40">Previous</button><button type="button" data-preview-safe aria-label={`Next page in ${discipline.name}`} disabled={data.page>=pages} onClick={()=>goToPage(data.page+1)} className="min-h-11 rounded-lg px-3 font-semibold text-[#10243e] disabled:opacity-40">Next</button></div>}
      </nav>
    </>}
    <div className="border-t border-[#e7ecef] px-4 py-1"><button type="button" data-preview-safe aria-label={`Close ${discipline.name} folder`} onClick={onClose} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-xs font-semibold text-[#10243e]"><ArrowLeft size={14} aria-hidden="true"/>Back to disciplines</button></div>
  </div>;
}
function validPage(value:unknown,discipline:string):value is MdrFolderPage{
  if(!value||typeof value!=="object")return false;
  const data=value as Partial<MdrFolderPage>;
  if(typeof data.total!=="number"||!Number.isSafeInteger(data.total)||data.total<0||typeof data.page!=="number"||!Number.isSafeInteger(data.page)||data.page<1||data.pageSize!==25||data.page>Math.max(1,Math.ceil(data.total/25))||typeof data.canManage!=="boolean"||!Array.isArray(data.documents))return false;
  const maximum=Math.min(25,Math.max(0,data.total-(data.page-1)*25));
  return data.documents.length<=maximum&&(maximum===0||data.documents.length>0)&&data.documents.every(row=>row&&typeof row.id==="string"&&typeof row.document_number==="string"&&typeof row.title==="string"&&typeof row.document_type==="string"&&row.discipline===discipline&&typeof row.status==="string"&&typeof row.updated_at==="string"&&row.schedule&&typeof row.schedule.overdue==="boolean");
}
