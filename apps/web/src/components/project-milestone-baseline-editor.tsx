"use client";

import {useActionState,useId,useMemo,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {Folder,Search} from "lucide-react";
import {approveMilestoneBaseline} from "@/app/app/milestone-baseline-actions";
import {HelpTip} from "@/components/help-tip";
import {projectDeliveryStageLabel} from "@/lib/project-delivery-stage";
import {validateBaselineDates,type BaselineIssueStatus,type ProjectMilestoneBaselineEditor} from "@/lib/project-milestone-baseline";

const PAGE_SIZE=40;
type Props={organisationId:string;projectId:string;editor:ProjectMilestoneBaselineEditor};

export function ProjectMilestoneBaselineEditor({organisationId,projectId,editor}:Props){
  const id=useId();
  const router=useRouter();
  const [state,action,pending]=useActionState(approveMilestoneBaseline,{});
  const [query,setQuery]=useState("");
  const [page,setPage]=useState(1);
  const [documents,setDocuments]=useState(()=>editor.documents.map(document=>({document_id:document.document_id,milestones:document.milestones.map(milestone=>({...milestone}))})));
  const [reason,setReason]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const locked=pending||state.ok===true;
  const validation=useMemo(()=>validateBaselineDates(editor,documents),[editor,documents]);
  const byId=useMemo(()=>new Map(documents.map(document=>[document.document_id,document])),[documents]);
  const filtered=useMemo(()=>{
    const search=query.trim().toLocaleLowerCase();
    return editor.documents.filter(document=>!search||`${document.document_number} ${document.title} ${document.discipline}`.toLocaleLowerCase().includes(search));
  },[editor.documents,query]);
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const activePage=Math.min(page,pages);
  const visible=filtered.slice((activePage-1)*PAGE_SIZE,activePage*PAGE_SIZE);
  const groups=new Map<string,typeof visible>();
  for(const document of visible){const rows=groups.get(document.discipline)??[];rows.push(document);groups.set(document.discipline,rows);}
  const totalWeight=editor.documents.reduce((total,document)=>total+document.progress_weight,0);

  function changeDate(documentId:string,issueStatus:BaselineIssueStatus,value:string){
    setDocuments(previous=>previous.map(document=>document.document_id===documentId?{...document,milestones:document.milestones.map(milestone=>milestone.issue_status===issueStatus?{...milestone,planned_date:value||null}:milestone)}:document));
    setConfirmed(false);
  }

  return <form action={action} aria-label="Approve weighted milestone baseline" aria-busy={pending} className="min-w-0 space-y-4">
    <input type="hidden" name="organisationId" value={organisationId}/>
    <input type="hidden" name="projectId" value={projectId}/>
    <input type="hidden" name="expectedBaseline" value={editor.current_baseline_id??""}/>
    <input type="hidden" name="expectedScopeHash" value={editor.scope_hash}/>
    <input type="hidden" name="plannedMilestones" value={JSON.stringify(documents)}/>
    <section className="ev-card min-w-0 p-4 sm:p-5" aria-labelledby={`${id}-scope`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id={`${id}-scope`} className="font-semibold text-[#10243e]">{editor.baseline_version?`Review baseline version ${editor.baseline_version}`:"Prepare the first baseline"}</h2><p className="mt-1 text-sm text-[#526675]">{projectDeliveryStageLabel(editor.delivery_stage)} · {editor.documents.length} deliverables · {totalWeight.toLocaleString(undefined,{maximumFractionDigits:3})} total weight</p></div>
        <div className="flex items-center gap-1 text-sm text-[#526675]"><span>MDR weights retained</span><HelpTip label="How baseline weights are used">Each deliverable keeps its existing MDR weight. Approval records a versioned plan without changing deliverables, actual progress, accepted files or previous reports.</HelpTip></div>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-[#526675]">Project start</dt><dd className="mt-1 font-semibold text-[#10243e]">{editor.planned_start_date??"Not set"}</dd></div>
        <div><dt className="text-xs text-[#526675]">Project completion</dt><dd className="mt-1 font-semibold text-[#10243e]">{editor.planned_end_date??"Not set"}</dd></div>
        <div><dt className="text-xs text-[#526675]">Revision cycle</dt><dd className="mt-1 font-semibold text-[#10243e]">{editor.revision_cycle_days?`${editor.revision_cycle_days} working days`:"Not set"}</dd></div>
      </dl>
    </section>
    <section className="ev-card min-w-0 p-4 sm:p-5" aria-labelledby={`${id}-dates`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id={`${id}-dates`} className="font-semibold text-[#10243e]">Planned issue dates</h2><span className="text-xs text-[#526675]">{validation.length?`${validation.length} item${validation.length===1?"":"s"} to review`:"All deliverable dates are complete"}</span></div>
      <label className="relative mt-4 block"><span className="sr-only">Search baseline deliverables</span><Search aria-hidden="true" size={18} className="pointer-events-none absolute left-3 top-3.5 text-[#526675]"/><input type="search" className="ev-input pl-10" value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}} placeholder="Search document number, title or discipline"/></label>
      {visible.length?<div className="mt-4 space-y-3">{Array.from(groups,([discipline,rows])=><details key={discipline} open={query.trim()?true:undefined} className="min-w-0 rounded-xl border border-[#d6e0ed]">
        <summary className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[#10243e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10243e]"><Folder aria-hidden="true" size={18} className="shrink-0 text-[#b94d20]"/><span className="min-w-0 break-words">{discipline}</span><span className="ml-auto shrink-0 text-xs font-normal text-[#526675]">{rows.length} on this page</span></summary>
        <div className="divide-y divide-[#e3e9f0] border-t border-[#e3e9f0]">{rows.map(document=>{
          const draft=byId.get(document.document_id)!;
          return <fieldset key={document.document_id} disabled={locked} className="min-w-0 p-3 sm:p-4">
            <legend className="sr-only">{document.document_number} milestone dates</legend>
            <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(14rem,1fr)_minmax(0,1.6fr)]">
              <div className="min-w-0"><p className="break-words text-sm font-semibold text-[#10243e]">{document.document_number}</p><p className="mt-1 break-words text-sm text-[#526675]">{document.title}</p><p className="mt-2 text-xs text-[#526675]">Weight {document.progress_weight.toLocaleString(undefined,{maximumFractionDigits:3})}</p></div>
              <div className={`grid min-w-0 grid-cols-1 gap-3 ${draft.milestones.length===2?"sm:grid-cols-2":"sm:grid-cols-3"}`}>{draft.milestones.map(milestone=><label key={milestone.issue_status} className="block min-w-0"><span className="ev-label">{milestone.issue_status}<span className="sr-only"> for {document.document_number}</span></span><input className="ev-input min-w-0" aria-label={`${milestone.issue_status} date for ${document.document_number}`} type="date" min={editor.planned_start_date??undefined} max={editor.planned_end_date??undefined} value={milestone.planned_date??""} onChange={event=>changeDate(document.document_id,milestone.issue_status,event.target.value)}/></label>)}</div>
            </div>
          </fieldset>;
        })}</div>
      </details>)}</div>:<p role="status" className="mt-5 text-sm text-[#526675]">No matching deliverables.</p>}
      <nav aria-label="Baseline deliverable pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#e3e9f0] pt-4">
        <p className="text-xs text-[#526675]">{filtered.length?`${(activePage-1)*PAGE_SIZE+1}–${Math.min(activePage*PAGE_SIZE,filtered.length)} of ${filtered.length} deliverables`:"0 deliverables"}</p>
        <div className="flex items-center gap-2"><button type="button" className="ev-button-secondary min-h-11" disabled={activePage<=1} onClick={()=>setPage(previous=>Math.max(1,previous-1))}>Previous</button><span className="text-xs text-[#526675]">{activePage} / {pages}</span><button type="button" className="ev-button-secondary min-h-11" disabled={activePage>=pages} onClick={()=>setPage(previous=>Math.min(pages,previous+1))}>Next</button></div>
      </nav>
    </section>
    <section className="ev-card min-w-0 p-4 sm:p-5" aria-labelledby={`${id}-approval`}>
      <h2 id={`${id}-approval`} className="font-semibold text-[#10243e]">Approve a baseline version</h2>
      {validation.length?<div role="status" className="mt-3 rounded-xl border border-[#e3d1c9] bg-[#fff8f4] p-3 text-sm text-[#873a22]"><p className="font-semibold">Review the complete plan before approval.</p><ul className="mt-2 list-disc space-y-1 pl-5">{validation.slice(0,5).map((error,index)=><li key={`${index}-${error}`}>{error}</li>)}</ul>{validation.length>5?<p className="mt-2">{validation.length-5} more items need review, including deliverables on other pages.</p>:null}</div>:null}
      <label className="mt-4 block"><span className="ev-label">Approval reason</span><textarea name="approvalReason" className="ev-input min-h-24" required minLength={10} maxLength={1000} value={reason} disabled={locked} onChange={event=>setReason(event.target.value)} placeholder="Record the reason for this approved plan or revision."/></label>
      <label className="mt-4 flex min-h-11 items-start gap-3 text-sm leading-6 text-[#24384f]"><input name="confirmApproval" type="checkbox" className="mt-1 size-5 shrink-0 accent-[#10243e]" required checked={confirmed} disabled={locked} onChange={event=>setConfirmed(event.target.checked)}/><span>I have reviewed every deliverable and approve these dates and captured MDR weights as the project milestone baseline.</span></label>
      {state.message?<p role={state.ok?"status":"alert"} className={`mt-4 rounded-xl p-3 text-sm ${state.ok?"bg-[#eef3fa] text-[#10243e]":"bg-[#fff2eb] text-[#873a22]"}`}>{state.message}</p>:null}
      <div className="mt-4 flex flex-wrap gap-3">{state.ok?<Link className="ev-button" href={`/app/${organisationId}/projects/${projectId}/progress`}>Return to progress &amp; health</Link>:<button className="ev-button min-h-11 w-full sm:w-auto" type="submit" disabled={pending||validation.length>0||reason.trim().length<10||!confirmed}>{pending?"Approving baseline…":"Approve milestone baseline"}</button>}<button type="button" className="ev-button-secondary min-h-11 w-full sm:w-auto" disabled={pending} onClick={()=>router.refresh()}>Reload latest plan</button></div>
    </section>
  </form>;
}
