"use client";
import { customerErrorMessage } from "@/lib/customer-messages";

import Link from "next/link";
import {type FormEvent,useId,useState} from "react";
import {Search,FileSearch} from "lucide-react";
type Result={chunk_id:string;document_id:string;revision_id:string;document_number:string;title:string;revision_code:string;discipline:string;document_type:string;issue_status:string;locator_type:string;page_number:number|null;paragraph_number:number|null;sheet_name:string|null;cell_range:string|null;content:string;score:number};
export function ProjectSearch({endpoint,basePath,readOnly=false}:{endpoint:string;basePath:string;readOnly?:boolean}){
  const id=useId();
  const [results,setResults]=useState<Result[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("Search ready documents by wording or engineering meaning.");
  const [mode,setMode]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage("");
    const form=new FormData(event.currentTarget);
    try{
      const response=await fetch(readOnly?`${endpoint}?${new URLSearchParams({query:String(form.get("query")??""),discipline:String(form.get("discipline")??""),documentType:String(form.get("documentType")??"")})}`:endpoint,readOnly?{cache:"no-store"}:{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({query:form.get("query"),discipline:form.get("discipline"),documentType:form.get("documentType")})});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload?.error?.message??"Search failed.");
      setResults(payload.results);setMode(payload.mode);
      setMessage(payload.results.length?`${payload.results.length} evidence match${payload.results.length===1?"":"es"}.`:"No authorised evidence matched this search.");
    }catch(error){
      setResults([]);setMessage(customerErrorMessage(error,"Search failed."));
    }finally{setBusy(false);}
  }
  return <div className="min-w-0">
    <form aria-label="Search project evidence" aria-busy={busy} data-preview-safe={readOnly?true:undefined} onSubmit={submit} className="ev-card grid min-w-0 gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <label htmlFor={`${id}-query`} className="min-w-0 sm:col-span-2 xl:col-span-1"><span className="ev-label">Search project evidence</span><span className="relative block min-w-0"><Search className="pointer-events-none absolute left-3 top-3.5 text-[#718294]" size={16} aria-hidden="true"/><input id={`${id}-query`} required minLength={2} maxLength={500} type="search" name="query" className="ev-input min-h-11 min-w-0 w-full pl-9" placeholder="e.g. export line design pressure"/></span></label>
      <label htmlFor={`${id}-discipline`} className="min-w-0"><span className="ev-label">Discipline (optional)</span><input id={`${id}-discipline`} name="discipline" className="ev-input min-h-11 min-w-0" placeholder="e.g. Process"/></label>
      <label htmlFor={`${id}-type`} className="min-w-0"><span className="ev-label">Document type (optional)</span><input id={`${id}-type`} name="documentType" className="ev-input min-h-11 min-w-0" placeholder="e.g. Report"/></label>
      <button disabled={busy} className="ev-button min-h-11 w-full self-end px-6 disabled:opacity-50 sm:col-span-2 xl:col-span-1 xl:w-auto">{busy?"Searching…":"Search evidence"}</button>
    </form>
    <div className="mt-3 flex min-w-0 flex-wrap items-start justify-between gap-2 text-xs leading-5 text-[#617083]"><p role="status" aria-live="polite" aria-atomic="true" className="min-w-0 [overflow-wrap:anywhere]">{busy?"Searching authorised project evidence…":message}</p>{mode&&<span className="max-w-full rounded-full bg-[#eef3fa] px-2.5 py-1 font-semibold capitalize [overflow-wrap:anywhere]">{mode.replaceAll("_"," ")}</span>}</div>
    <section aria-label="Search results" aria-busy={busy} className="mt-5 min-w-0 space-y-3">{results.map((result,index)=><article key={result.chunk_id} aria-labelledby={`${id}-result-${index}`} className="ev-card min-w-0 p-4 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1 basis-52"><p className="text-xs font-semibold leading-5 text-[#9b431f] [overflow-wrap:anywhere]">{result.document_number} · Rev {result.revision_code} · {locator(result)}</p><h2 id={`${id}-result-${index}`} className="mt-1 font-semibold leading-6 [overflow-wrap:anywhere]">{result.title}</h2><p className="mt-1 text-xs leading-5 text-[#617083] [overflow-wrap:anywhere]">{result.discipline} · {result.document_type} · {result.issue_status}</p></div><span aria-label={`Search relevance rank ${index+1}`} className="max-w-full rounded-full bg-[#eef3fa] px-2.5 py-1 text-xs font-semibold">Relevance #{index+1}</span></div>
      <p className="mt-3 line-clamp-4 text-sm leading-6 text-[#24384f] [overflow-wrap:anywhere]">{result.content}</p>
      <Link aria-label={`Open cited source: ${result.document_number}, revision ${result.revision_code}, ${locator(result)}`} className="mt-3 inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg text-sm font-semibold text-[#10243e]" href={`${basePath}/documents/${result.document_id}/revisions/${result.revision_id}/preview`}><FileSearch size={15} className="shrink-0" aria-hidden="true"/>Open cited source</Link>
    </article>)}</section>
  </div>;
}
function locator(result:Result){if(result.page_number)return `Page ${result.page_number}`;if(result.paragraph_number)return `Paragraph ${result.paragraph_number}`;return `${result.sheet_name??"Sheet"} ${result.cell_range??""}`.trim()}
