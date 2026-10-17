"use client";

import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {ChevronDown,Folder,FolderOpen,FoldVertical,ArrowLeft} from "lucide-react";
import {MdrDocumentRows} from "@/components/mdr-document-rows";
import type {MdrDisciplineSummary,MdrFolderPage} from "@/lib/mdr-register-types";
import {disciplineFolderColour} from "@/lib/discipline-folder-colour";
import {mdrBrowseQuery,mdrFolderPage} from "@/lib/mdr-browse-position";

type Props={organisationId:string;projectId:string;disciplines:MdrDisciplineSummary[];initialDiscipline?:string;initialPage?:number;search:string;records:string;canManage:boolean;refreshKey?:string};
const browseEvent="engicite:mdr-browse";
function subscribeToBrowsePosition(listener:()=>void){
  window.addEventListener("popstate",listener);
  window.addEventListener(browseEvent,listener);
  return()=>{window.removeEventListener("popstate",listener);window.removeEventListener(browseEvent,listener);};
}
const serverBrowsePosition=()=>null;
export function MdrDisciplineFolders(props:Props){
  const base=`/app/${props.organisationId}/projects/${props.projectId}/documents`;
  const [position,setPosition]=useState(()=>({active:props.disciplines.find(discipline=>discipline.name===props.initialDiscipline)?.name??null,pages:{} as Record<string,number>}));
  // URL/history belongs to this navigation entry, not a global/user-independent
  // storage cache. Document rows are always reauthorised and fetched again.
  const browserPosition=useSyncExternalStore(subscribeToBrowsePosition,()=>{
    if(window.location.pathname!==base)return null;
    const query=new URLSearchParams(window.location.search);
    if((query.get("q")??"")!==props.search||(query.get("records")??"")!==props.records)return null;
    return mdrBrowseQuery({folder:query.get("folder"),page:mdrFolderPage(query.get("folderPage"))});
  },serverBrowsePosition);
  const browserQuery=browserPosition===null?null:new URLSearchParams(browserPosition);
  const active=browserQuery?props.disciplines.find(discipline=>discipline.name===browserQuery.get("folder"))?.name??null:position.active;
  const pageFor=(discipline:MdrDisciplineSummary)=>mdrFolderPage(
    browserQuery&&active===discipline.name?browserQuery.get("folderPage")
      :position.pages[discipline.name]??(discipline.name===props.initialDiscipline?props.initialPage:1),discipline.count);
  const remember=(folder:string|null,page=1)=>{
    const current=props.disciplines.find(discipline=>discipline.name===active);
    setPosition(previous=>({active:folder,pages:{...previous.pages,
      ...(current?{[current.name]:pageFor(current)}:{}),...(folder?{[folder]:page}:{})}}));
    if(window.location.pathname!==base)return;
    const query=mdrBrowseQuery({search:props.search,records:props.records,folder,page});
    // Next integrates native replaceState without a server navigation or extra
    // Back entries. Never write auth/preview identifiers into these URLs.
    const href=`${base}${query?`?${query}`:""}`;
    if(`${window.location.pathname}${window.location.search}`===href)return;
    window.history.replaceState(null,"",href);
    window.dispatchEvent(new Event(browseEvent));
  };
  const disciplines=[...props.disciplines].sort((a,b)=>a.name.localeCompare(b.name));
  return <section aria-label="MDR disciplines" className="min-w-0 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-[#24384f]">Discipline folders</h2>{disciplines.length>0&&<button type="button" data-preview-safe onClick={()=>remember(null)} aria-label="Collapse all disciplines" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-[#526675]"><FoldVertical size={15} aria-hidden="true"/>Collapse all</button>}</div>
    {disciplines.length?disciplines.map(discipline=><DisciplineFolder key={JSON.stringify([props.organisationId,props.projectId,discipline.name,props.search,props.records])} {...props} discipline={discipline} page={pageFor(discipline)} onPageChange={page=>remember(discipline.name,page)} open={active===discipline.name} onOpenChange={open=>{if(open||active===discipline.name)remember(open?discipline.name:null,pageFor(discipline));}}/>):<p className="ev-card p-6 text-sm text-[#617083]">{props.search?"No documents match your search.":"No deliverables are registered in this MDR view yet."}</p>}
  </section>;
}
function DisciplineFolder({discipline,open,onOpenChange,page,onPageChange,...props}:Props&{discipline:MdrDisciplineSummary;open:boolean;onOpenChange:(open:boolean)=>void;page:number;onPageChange:(page:number)=>void}){
  const summary=useRef<HTMLElement>(null);
  const Icon=open?FolderOpen:Folder;
  return <details open={open} onToggle={event=>onOpenChange(event.currentTarget.open)} className="ev-card min-w-0 overflow-hidden">
    <summary ref={summary} className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
      <Icon size={19} aria-hidden="true" className="shrink-0" style={{color:disciplineFolderColour(discipline.name)}}/>
      <h3 className="min-w-0 flex-1 break-words text-sm font-semibold text-[#24384f]">{discipline.name}</h3>
      <span className="shrink-0 text-xs text-[#617083]">{discipline.count}<span className="sr-only sm:not-sr-only"> document{discipline.count===1?"":"s"}</span></span>
      <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-[#617083] ${open?"rotate-180":""}`}/>
    </summary>
    {open&&<FolderDocuments {...props} discipline={discipline} page={page} onPageChange={onPageChange} onClose={()=>{onOpenChange(false);summary.current?.focus();}}/>}
  </details>;
}
function FolderDocuments({organisationId,projectId,discipline,search,records,canManage,refreshKey,onClose,page,onPageChange}:Omit<Props,"disciplines">&{discipline:MdrDisciplineSummary;onClose:()=>void;page:number;onPageChange:(page:number)=>void}){
  const [retry,setRetry]=useState(0);
  const results=useRef<HTMLDivElement>(null);
  const [result,setResult]=useState<{scope:string;key:string;data?:MdrFolderPage;failed?:boolean}|null>(null);
  const query=new URLSearchParams({discipline:discipline.name,page:String(page)});
  if(search)query.set("q",search);
  if(records)query.set("records",records);
  const endpoint=`/api/v1/organisations/${organisationId}/projects/${projectId}/documents/register?${query}`;
  const requestSource=JSON.stringify([endpoint,refreshKey??"",retry]);
  const [attempt,setAttempt]=useState({source:requestSource,generation:0});
  // A repeated refresh key is still a new attempt after another key was requested.
  if(attempt.source!==requestSource)setAttempt({source:requestSource,generation:attempt.generation+1});
  const requestKey=JSON.stringify([requestSource,attempt.generation]);
  useEffect(()=>{
    const controller=new AbortController();
    void (async()=>{
      try{
        const response=await fetch(endpoint,{cache:"no-store",credentials:"same-origin",signal:controller.signal});
        if(!response.ok)throw new Error("Folder unavailable");
        const data:unknown=await response.json();
        if(!validPage(data,discipline.name))throw new Error("Folder unavailable");
        if(!controller.signal.aborted)setResult({scope:endpoint,key:requestKey,data});
      }catch{if(!controller.signal.aborted)setResult(previous=>({scope:endpoint,key:requestKey,data:previous?.scope===endpoint?previous.data:undefined,failed:true}));}
    })();
    return()=>controller.abort();
  },[endpoint,requestKey,discipline.name]);
  const current=result?.scope===endpoint?result:undefined;
  const updating=current?.key!==requestKey,failed=!updating&&Boolean(current?.failed);
  const data=current?.data,pages=data?Math.max(1,Math.ceil(data.total/data.pageSize)):1;
  // Page changes are new views, not revalidations of the rows already on screen.
  const goToPage=(value:number)=>{setResult(null);onPageChange(value);results.current?.focus();};
  return <div ref={results} role="region" aria-label={`${discipline.name} documents`} tabIndex={-1} className="min-w-0 border-t border-[#e7ecef]" aria-busy={updating}>
    {updating&&<p role="status" className="p-5 text-sm text-[#617083]">{data?`Updating ${discipline.name} documents… Showing previously loaded records while we check for updates.`:`Loading ${discipline.name} documents…`}</p>}
    {failed&&<div role="alert" className="p-5 text-sm text-[#617083]"><p>{data?"This discipline could not be refreshed. Showing the last successfully loaded records; they may be out of date. Changes are unavailable until a refresh succeeds.":"This discipline could not be loaded. No records have been changed."}</p><button type="button" data-preview-safe aria-label={`Retry ${discipline.name}`} className="ev-button-secondary mt-3" onClick={()=>setRetry(value=>value+1)}>Retry</button></div>}
    {data&&<>
      <MdrDocumentRows docs={data.documents} organisationId={organisationId} projectId={projectId} canManage={canManage&&data.canManage&&!updating&&!failed} title={discipline.name} returnToMdr={mdrBrowseQuery({search,records,folder:discipline.name,page:data.page})}/>
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
