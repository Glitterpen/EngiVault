import type {ReactNode} from "react";
import Link from "next/link";
import {ArrowDown,ArrowRight,CalendarClock,ClipboardCheck,FileStack,PackageOpen,Send} from "lucide-react";
import {HelpTip} from "@/components/help-tip";
import {WorkspacePageHeading} from "@/components/workspace-page-heading";

export type DccProject={code:string;name:string;project_introduction:string|null;key_objectives:string[]|null;planned_start_date:string|null;planned_end_date:string|null};
type WorkspaceProps={
  organisationId:string;
  projectId:string;
  project:DccProject;
  summary:{deliverables:number;awaitingReview:number;pendingRequests:number|null;unsubmitted:number;overdue:number;engineers:number|null;issues:number|null};
  disciplines:{name:string;count:number}[];
  preview:boolean;
  issueForm?:ReactNode;
};

/** Keep project context and daily work visible, with occasional tools below. */
export function DccControlWorkspace({organisationId,projectId,project,summary,disciplines,preview,issueForm}:WorkspaceProps){
  const base=`/app/${organisationId}/projects/${projectId}`;
  const tasks=[
    {title:"Review submissions",description:"Check files and confirm conformance.",href:`${base}/reviews`,icon:ClipboardCheck,count:summary.awaitingReview,countLabel:"awaiting review"},
    {title:"Deliverable requests",description:"Review date changes and additional deliverables.",href:`${base}/requests`,icon:CalendarClock,count:summary.pendingRequests,countLabel:"awaiting DCC acceptance"},
    {title:"Create transmittal",description:"Select approved revisions for the next issue.",href:`${base}/work-packages/transmittals/new`,icon:Send},
    {title:"Work packages",description:"Prepare handover packages and view past transmittals.",href:`${base}/work-packages`,icon:PackageOpen},
  ];
  return <div className="@container mx-auto min-w-0 max-w-6xl space-y-4">
    <header className="min-w-0"><WorkspacePageHeading title="Document control centre" context={<>{project.code} · {project.name}</>} actions={<Link className="ev-button w-full shrink-0 sm:w-auto" href={`${base}/documents`}><FileStack size={16} aria-hidden="true"/>Open MDR</Link>}/></header>
    <div className="grid min-w-0 items-start gap-4 @min-[52rem]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <DccProjectBrief project={project}/>
      <section id="dcc-work-queue" tabIndex={-1} aria-labelledby="dcc-work-heading" className="ev-card min-w-0 scroll-mt-24 overflow-hidden">
        <div className="border-b border-[#e7ecef] px-4 py-3 sm:px-5"><h2 id="dcc-work-heading" className="font-semibold">Work queue</h2></div>
        <ul className="divide-y divide-[#e7ecef]">{tasks.map(({title,description,href,icon:Icon,count,countLabel})=><li key={href}>
          <Link href={href} className="group flex min-h-11 min-w-0 items-center gap-3 px-4 py-4 transition hover:bg-[#f4f7fb] focus-visible:outline-offset-[-3px] sm:px-5">
            <Icon size={19} aria-hidden="true" className="shrink-0 text-[#526675]"/>
            <div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><h3 className="break-words text-sm font-semibold text-[#14263d]">{title}</h3>{countLabel?<span className={`rounded-md px-2 py-1 text-xs font-medium tabular-nums ${count!==null&&count!==undefined&&count>0?"bg-[#fff0e8] text-[#993d21]":"bg-[#eef3fa] text-[#526675]"}`}>{count===null?"Count unavailable":`${count} ${countLabel}`}</span>:null}</div><p className="mt-1 break-words text-xs leading-5 text-[#617083]">{description}</p></div>
            <ArrowRight size={17} aria-hidden="true" className="shrink-0 text-[#617083]"/>
          </Link>
        </li>)}</ul>
      </section>
    </div>
    <section aria-labelledby="dcc-summary-heading" className="ev-card px-4 py-3 sm:px-5">
      <div className="flex items-center gap-1"><h2 id="dcc-summary-heading" className="text-sm font-semibold">Register summary</h2><HelpTip label="Register counts">Awaiting review excludes incomplete uploads, but may include files still completing security checks. Overdue follows the MDR schedule, so a deliverable can appear in more than one count.</HelpTip></div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <SummaryDatum label="MDR deliverables" value={summary.deliverables}/>
        <SummaryDatum label="Awaiting review" value={summary.awaitingReview}/>
        <SummaryDatum label="Not submitted" value={summary.unsubmitted}/>
        <SummaryDatum label="Overdue" value={summary.overdue} overdue/>
      </dl>
    </section>
    <div className="grid min-w-0 items-start gap-3 @min-[52rem]:grid-cols-2">
      <details className="ev-card min-w-0 overflow-hidden">
        <summary className="min-h-11 cursor-pointer break-words px-4 py-3 text-sm font-semibold sm:px-5">MDR by discipline <span className="ml-2 text-xs font-normal text-[#617083]">{disciplines.length} {disciplines.length===1?"discipline":"disciplines"}</span></summary>
        <div className="border-t border-[#e7ecef] px-4 pb-2 sm:px-5">{disciplines.length?<ul className="divide-y divide-[#edf1f3]">{disciplines.map(({name,count})=><li key={name}>
          <Link href={`${base}/documents?${new URLSearchParams({folder:name})}`} className="flex min-h-11 min-w-0 items-center justify-between gap-3 py-2 text-sm text-[#24384f] hover:text-[#10243e]">
            <span className="min-w-0 break-words">{name}</span><span className="shrink-0 text-xs text-[#617083]">{count} {count===1?"deliverable":"deliverables"}<span aria-hidden="true" className="ml-2">→</span></span>
          </Link>
        </li>)}</ul>:<p className="py-4 text-sm text-[#617083]">The MDR is empty. Use Open MDR to register the first deliverable.</p>}</div>
      </details>
      <details className="ev-card min-w-0 overflow-hidden">
        <summary className="min-h-11 cursor-pointer break-words px-4 py-3 text-sm font-semibold sm:px-5">Project issues <span className={`ml-2 text-xs font-normal ${summary.issues?"text-[#a5452f]":"text-[#617083]"}`}>{summary.issues===null?"Count unavailable":`${summary.issues} open`}</span></summary>
        <div className="border-t border-[#e7ecef]">
          {summary.issues===null&&<p role="status" className="px-4 pt-4 text-sm text-[#617083]">The issue count could not be loaded. Refresh to try again.</p>}
          {preview?<p className="p-4 text-sm leading-6 text-[#617083]">Issue reporting is unavailable in this read-only preview.</p>:issueForm}
        </div>
      </details>
    </div>
    <nav aria-label="Document control references" className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs font-semibold text-[#526675]">
      <Link href={`${base}/team`} className="inline-flex min-h-11 items-center rounded-lg">Discipline engineers <span className="ml-1 font-normal">({summary.engineers??"unavailable"})</span></Link>
      <Link href={`${base}/templates`} className="inline-flex min-h-11 items-center rounded-lg">Project templates</Link>
    </nav>
  </div>;
}

function DccProjectBrief({project}:{project:DccProject}){
  const objectives=project.key_objectives?.filter(objective=>objective.trim());
  return <section aria-labelledby="dcc-brief-heading" className="ev-card min-w-0 space-y-4 px-4 py-4 sm:px-5">
    <div className="flex flex-wrap items-center justify-between gap-x-4">
      <h2 id="dcc-brief-heading" className="font-semibold text-[#14263d]">Project brief and dates</h2>
      <a href="#dcc-work-queue" className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm font-medium text-[#24384f] underline underline-offset-4 @min-[52rem]:hidden">Jump to work queue<ArrowDown size={14} aria-hidden="true"/></a>
    </div>
    <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 rounded-lg border-l-2 border-l-[#b94d20] bg-[#f4f7fb] px-3 py-3 sm:px-4">
      <PlannedDate label="Planned start" value={project.planned_start_date}/>
      <PlannedDate label="Planned completion" value={project.planned_end_date}/>
    </dl>
    <p className="whitespace-pre-line text-sm leading-6 text-[#526675] [overflow-wrap:anywhere]">{project.project_introduction?.trim()||"No project introduction has been recorded."}</p>
    {objectives?.length?<div><h3 className="text-sm font-semibold text-[#14263d]">Key objectives</h3><ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-[#526675]">{objectives.map((objective,index)=><li className="[overflow-wrap:anywhere]" key={`${index}-${objective}`}>{objective}</li>)}</ol></div>:null}
  </section>;
}

const plannedDateFormatter=new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});

function PlannedDate({label,value}:{label:string;value:string|null}){
  const date=value&&/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(`${value}T00:00:00Z`):null;
  const formatted=date&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?plannedDateFormatter.format(date):null;
  return <div className="min-w-0 [overflow-wrap:anywhere]"><dt className="text-xs font-medium text-[#526675]">{label}</dt><dd className="mt-1 text-sm font-semibold tabular-nums text-[#14263d]">{formatted&&value?<time dateTime={value}>{formatted}</time>:<span className="font-normal text-[#526675]">Not planned</span>}</dd></div>;
}

function SummaryDatum({label,value,overdue=false}:{label:string;value:number;overdue?:boolean}){
  return <div className="flex min-w-0 flex-col gap-1"><dt className="order-2 break-words text-xs text-[#617083]">{label}</dt><dd className={`text-2xl font-semibold tabular-nums ${overdue&&value>0?"text-[#a5452f]":"text-[#14263d]"}`}>{value}</dd></div>;
}
