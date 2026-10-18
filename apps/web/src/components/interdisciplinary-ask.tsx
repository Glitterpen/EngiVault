"use client";

import Link from "next/link";
import {useEffect,useId,useRef,useState,type FormEvent} from "react";
import {Search,Sparkles} from "lucide-react";
import {referenceLocation,type InterdisciplinaryAnswer} from "@/lib/interdisciplinary-evidence";

type Props={organisationId:string;projectId:string;discipline:string;canAsk:boolean;preview:boolean};
type Result=InterdisciplinaryAnswer&{scopeLabel:string};

export function InterdisciplinaryAsk({organisationId,projectId,discipline,canAsk,preview}:Props){
  const id=useId();
  const [mode,setMode]=useState<"answer"|"search">(canAsk?"answer":"search");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [result,setResult]=useState<Result|null>(null);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  const endpoint=`/api/v1/organisations/${organisationId}/projects/${projectId}/interdisciplinary/questions`;
  const base=`/app/${organisationId}/projects/${projectId}/interdisciplinary`;

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(request.current)return;
    const form=new FormData(event.currentTarget);
    const question=String(form.get("question")??"").trim();
    const stage=String(form.get("stage")??"");
    if(question.length<2){setError("Enter a question or search phrase with at least 2 characters.");return}
    const controller=new AbortController();request.current=controller;
    setBusy(true);setError("");setResult(null);
    try{
      const values={question,discipline,stage,mode:canAsk?mode:"search",requestId:crypto.randomUUID()};
      const response=await fetch(preview?`${endpoint}?${new URLSearchParams({question,discipline,stage})}`:endpoint,
        preview?{method:"GET",cache:"no-store",signal:controller.signal}:{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(values),signal:controller.signal});
      const data=await response.json().catch(()=>null);
      if(controller.signal.aborted)return;
      if(!data||typeof data!=="object")throw new Error("The search result could not be verified. Refresh this page, then retry.");
      if(!response.ok)throw new Error(data.error?.message??"The approved evidence could not be searched. Please retry.");
      if(typeof data.answer!=="string"||!Array.isArray(data.sources))throw new Error("The answer could not be verified. Please retry.");
      setResult({...data,scopeLabel:`${discipline||"All project disciplines"} · ${stage||"All issue purposes"}`});
    }catch(cause){
      if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"The request could not finish. Try again shortly.");
    }finally{
      if(request.current===controller){request.current=null;if(!controller.signal.aborted)setBusy(false)}
    }
  }

  return <section className="ev-card mt-4 min-w-0 p-4 sm:p-5" aria-labelledby={`${id}-heading`}>
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><h2 id={`${id}-heading`} className="flex items-center gap-2 text-base font-semibold text-[#10243e]"><Sparkles size={18} aria-hidden="true" className="shrink-0 text-[#a64019]"/>Find an answer in approved deliverables</h2>
        <p className="mt-1 text-xs leading-5 text-[#526675]">{discipline?`${discipline} folder`:"All project disciplines"} · References include the document, revision and source location.</p></div>
    </div>
    <form onSubmit={submit} method={preview?"get":"post"} data-preview-safe={preview||undefined} aria-label="Search approved deliverable evidence" aria-busy={busy} className="mt-3 grid min-w-0 gap-3">
      <label htmlFor={`${id}-question`} className="block min-w-0"><span className="ev-label">Your question or search phrase</span><textarea id={`${id}-question`} name="question" className="ev-input min-h-20 resize-y py-3" required minLength={2} maxLength={1000} placeholder="What design pressure is specified for this line?"/></label>
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 basis-44"><span className="ev-label">Issue purpose</span><select name="stage" className="ev-input min-h-11" defaultValue="" disabled={busy}><option value="">All issue purposes</option><option value="IFR">Issued for Review (IFR)</option><option value="IFA">Issued for Approval (IFA)</option><option value="IFD">Issued for Design (IFD)</option><option value="IFC">Issued for Construction (IFC)</option></select></label>
        <label className="min-w-0 flex-1 basis-44"><span className="ev-label">Search mode</span><select className="ev-input min-h-11" value={canAsk?mode:"search"} onChange={event=>setMode(event.target.value as "answer"|"search")} disabled={busy||!canAsk}><option value="answer" disabled={!canAsk}>AI answer with references</option><option value="search">Search excerpts — no AI</option></select></label>
        <button type="submit" className="ev-button min-h-11 w-full sm:w-auto" disabled={busy}><Search size={16} aria-hidden="true"/>{busy?"Checking approved evidence…":canAsk&&mode==="answer"?"Ask EngiCite":"Search excerpts"}</button>
      </div>
      {preview&&<p className="text-xs leading-5 text-[#526675]">Read-only preview: excerpt search is available; AI answers and recording are disabled.</p>}
      {busy&&<p role="status" className="text-sm text-[#526675]">{mode==="answer"&&canAsk?"Retrieving evidence and preparing a referenced answer…":"Searching approved document excerpts…"}</p>}
      {error&&<p role="alert" className="text-sm leading-6 text-[#a5452f]">{error}</p>}
    </form>
    {result&&<section aria-label="Approved deliverable search result" aria-live="polite" className="mt-4 min-w-0 rounded-xl border border-[#dce4ee] bg-[#f7f9fc] p-3 sm:p-4">
      <p className="text-xs font-medium text-[#526675] [overflow-wrap:anywhere]">{result.scopeLabel}</p>
      <h3 className="mt-1 break-words text-sm font-semibold text-[#10243e] [overflow-wrap:anywhere]">{result.question}</h3>
      <p className="mt-3 text-xs font-semibold text-[#a64019]">{result.mode==="search"?"Matching excerpts · no AI answer":result.grounded?"Answer with deliverable references":"Insufficient approved evidence"}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-[#24384f] [overflow-wrap:anywhere]">{result.answer}</p>
      {result.sources.length>0&&<ol aria-label="Referenced deliverables" className="mt-3 grid min-w-0 gap-2">
        {result.sources.map(source=><li key={`${source.revisionId}-${source.label}`} className="min-w-0 rounded-lg border border-[#dde4eb] bg-white p-3">
          <Link className="inline-block min-h-11 max-w-full content-center break-words text-sm font-semibold text-[#10243e] underline underline-offset-4 [overflow-wrap:anywhere]" href={`${base}/${source.revisionId}`}>[{source.label}] {source.documentNumber} · Rev {source.revision}</Link>
          <p className="break-words text-xs leading-5 text-[#526675] [overflow-wrap:anywhere]">{source.title} · {source.issueStatus} · {referenceLocation(source)}</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#24384f] [overflow-wrap:anywhere]">{source.excerpt}</p>
        </li>)}
      </ol>}
    </section>}
  </section>;
}
