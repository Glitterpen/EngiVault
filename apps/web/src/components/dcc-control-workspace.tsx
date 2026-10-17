import type {ReactNode} from "react";
import Link from "next/link";
import {ArrowRight,CalendarClock,ClipboardCheck,FileStack,PackageOpen,Send} from "lucide-react";
import {HelpTip} from "@/components/help-tip";
import {WorkspacePageHeading} from "@/components/workspace-page-heading";

export type DccProject={code:string;name:string;project_introduction:string|null;key_objectives:string[]|null;planned_end_date:string|null};
type WorkspaceProps={
  organisationId:string;
  projectId:string;
  project:DccProject;
  summary:{deliverables:number;awaitingReview:number;pendingRequests:number|null;unsubmitted:number;overdue:number;engineers:number|null;issues:number|null};
  disciplines:{name:string;count:number}[];
  preview:boolean;
  issueForm?:ReactNode;
};

/** Keep daily work visible; reference information and occasional forms stay out of the way. */
export function DccControlWorkspace({organisationId,projectId,project,summary,disciplines,preview,issueForm}:WorkspaceProps){
  const base=`/app/${organisationId}/projects/${projectId}`;
  const tasks=[
    {title:"Review submissions",description:"Check files and confirm conformance.",href:`${base}/reviews`,icon:ClipboardCheck,count:summary.awaitingReview,countLabel:"awaiting review"},
    {title:"Deliverable requests",description:"Review date changes and additional deliverables.",href:`${base}/requests`,icon:CalendarClock,count:summary.pendingRequests,countLabel:"awaiting DCC acceptance"},
    {title:"Create transmittal",description:"Select approved revisions for the next issue.",href:`${base}/work-packages/transmittals/new`,icon:Send},
    {title:"Work packages",description:"Prepare handover packages and view past transmittals.",href:`${base}/work-packages`,icon:PackageOpen},
  ];
  return <div className="mx-auto min-w-0 max-w-6xl space-y-4">
    <header className="min-w-0"><WorkspacePageHeading title="Document control centre" context={<>{project.code} · {project.name}</>} help={<HelpTip label="Document Control workspace">Manage the MDR, review engineer submissions and issue approved documents. Open project details only when needed. Help icons also work with keyboard focus and a tap.</HelpTip>} actions={<Link className="ev-button w-full shrink-0 sm:w-auto" href={`${base}/documents`}><FileStack size={16} aria-hidden="true"/>Open MDR</Link>}/></header>
    <section aria-labelledby="dcc-summary-heading" className="ev-card px-4 py-3 sm:px-5">
      <div className="flex items-center gap-1"><h2 id="dcc-summary-heading" className="text-sm font-semibold">Register summary</h2><HelpTip label="Document control summary guidance">Awaiting review counts submitted revisions in the active MDR, excluding unfinished uploads; some files may still be completing security checks. Not submitted means no completed upload is recorded. Overdue follows the agreed MDR schedule. These counts can overlap.</HelpTip></div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <SummaryDatum label="MDR deliverables" value={summary.deliverables}/>
        <SummaryDatum label="Awaiting review" value={summary.awaitingReview}/>
        <SummaryDatum label="Not submitted" value={summary.unsubmitted}/>
        <SummaryDatum label="Overdue" value={summary.overdue} overdue/>
      </dl>
    </section>
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <section aria-labelledby="dcc-work-heading" className="ev-card min-w-0 overflow-hidden">
        <div className="border-b border-[#e7ecef] px-4 py-3 sm:px-5"><h2 id="dcc-work-heading" className="font-semibold">Work queue</h2></div>
        <ul className="divide-y divide-[#e7ecef]">{tasks.map(({title,description,href,icon:Icon,count,countLabel})=><li key={href}>
          <Link href={href} className="group flex min-h-11 min-w-0 items-center gap-3 px-4 py-4 transition hover:bg-[#f4f7fb] focus-visible:outline-offset-[-3px] sm:px-5">
            <Icon size={19} aria-hidden="true" className="shrink-0 text-[#526675]"/>
            <div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><h3 className="break-words text-sm font-semibold text-[#14263d]">{title}</h3>{countLabel?<span className={`rounded-md px-2 py-1 text-xs font-medium tabular-nums ${count!==null&&count!==undefined&&count>0?"bg-[#fff0e8] text-[#993d21]":"bg-[#eef3fa] text-[#526675]"}`}>{count===null?"Count unavailable":`${count} ${countLabel}`}</span>:null}</div><p className="mt-1 break-words text-xs leading-5 text-[#617083]">{description}</p></div>
            <ArrowRight size={17} aria-hidden="true" className="shrink-0 text-[#617083]"/>
          </Link>
        </li>)}</ul>
      </section>
      <div className="min-w-0 space-y-3">
        <details className="ev-card min-w-0 overflow-hidden">
          <summary className="min-h-11 cursor-pointer break-words px-4 py-3 text-sm font-semibold sm:px-5">MDR by discipline <span className="ml-2 text-xs font-normal text-[#617083]">{disciplines.length} {disciplines.length===1?"discipline":"disciplines"}</span></summary>
          <div className="border-t border-[#e7ecef] px-4 pb-2 sm:px-5">{disciplines.length?<ul className="divide-y divide-[#edf1f3]">{disciplines.map(({name,count})=><li key={name}>
            <Link href={`${base}/documents?${new URLSearchParams({folder:name})}`} className="flex min-h-11 min-w-0 items-center justify-between gap-3 py-2 text-sm text-[#24384f] hover:text-[#10243e]">
              <span className="min-w-0 break-words">{name}</span><span className="shrink-0 text-xs text-[#617083]">{count} {count===1?"deliverable":"deliverables"}<span aria-hidden="true" className="ml-2">→</span></span>
            </Link>
          </li>)}</ul>:<p className="py-4 text-sm text-[#617083]">The MDR is empty. Use Open MDR to register the first deliverable.</p>}</div>
        </details>
        <details className="ev-card min-w-0 overflow-hidden">
          <summary className="min-h-11 cursor-pointer break-words px-4 py-3 text-sm font-semibold sm:px-5">Project brief and dates</summary>
          <div className="space-y-3 border-t border-[#e7ecef] p-4 text-sm leading-6 sm:px-5">
            <h3 className="break-words font-semibold">{project.name}</h3>
            <p className="whitespace-pre-line break-words text-[#617083]">{project.project_introduction||"No project introduction has been recorded."}</p>
            {project.key_objectives?.length?<div><h4 className="font-semibold">Key objectives</h4><ol className="mt-2 list-decimal space-y-1 pl-5 text-[#617083]">{project.key_objectives.map((objective,index)=><li className="break-words" key={`${index}-${objective}`}>{objective}</li>)}</ol></div>:null}
            {project.planned_end_date&&<p className="text-[#617083]">Planned completion: <span className="font-medium text-[#24384f]">{new Date(`${project.planned_end_date}T00:00:00Z`).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"})}</span></p>}
          </div>
        </details>
        <details className="ev-card min-w-0 overflow-hidden">
          <summary className="min-h-11 cursor-pointer break-words px-4 py-3 text-sm font-semibold sm:px-5">Project issues <span className={`ml-2 text-xs font-normal ${summary.issues?"text-[#a5452f]":"text-[#617083]"}`}>{summary.issues===null?"Count unavailable":`${summary.issues} open`}</span></summary>
          <div className="border-t border-[#e7ecef]">
            {summary.issues===null&&<p role="status" className="px-4 pt-4 text-sm text-[#617083]">The issue count could not be loaded. Refresh to try again.</p>}
            {preview?<p className="p-4 text-sm leading-6 text-[#617083]">Issue reporting is unavailable in this read-only preview.</p>:issueForm}
          </div>
        </details>
        <nav aria-label="Document control references" className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs font-semibold text-[#526675]">
          <Link href={`${base}/team`} className="inline-flex min-h-11 items-center rounded-lg">Discipline engineers <span className="ml-1 font-normal">({summary.engineers??"unavailable"})</span></Link>
          <Link href={`${base}/templates`} className="inline-flex min-h-11 items-center rounded-lg">Project templates</Link>
        </nav>
      </div>
    </div>
  </div>;
}

function SummaryDatum({label,value,overdue=false}:{label:string;value:number;overdue?:boolean}){
  return <div className="flex min-w-0 flex-col gap-1"><dt className="order-2 break-words text-xs text-[#617083]">{label}</dt><dd className={`text-2xl font-semibold tabular-nums ${overdue&&value>0?"text-[#a5452f]":"text-[#14263d]"}`}>{value}</dd></div>;
}
