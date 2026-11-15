import type {ReactNode} from "react";
import Link from "next/link";
import {ArrowDown,CalendarClock,ClipboardCheck,FileStack,PackageOpen,Send} from "lucide-react";
import {HelpTip} from "@/components/help-tip";
import {DashboardDates,DashboardLead,DashboardPanel,DashboardSummary,DashboardWorkQueue,RoleDashboard,type DashboardTask} from "@/components/role-dashboard";
import {UserGuideLink} from "@/components/user-guide-link";
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
  const tasks:DashboardTask[]=[
    {title:"Review submissions",description:"Check files and confirm conformance.",href:`${base}/reviews`,icon:<ClipboardCheck size={19}/>,badge:queueCount(summary.awaitingReview,"awaiting review")},
    {title:"Deliverable requests",description:"Review date changes and additional deliverables.",href:`${base}/requests`,icon:<CalendarClock size={19}/>,badge:queueCount(summary.pendingRequests,"awaiting DCC acceptance")},
    {title:"Create transmittal",description:"Select approved revisions for the next issue.",href:`${base}/work-packages/transmittals/new`,icon:<Send size={19}/>},
    {title:"Work packages",description:"Prepare handover packages and view past transmittals.",href:`${base}/work-packages`,icon:<PackageOpen size={19}/>},
  ];
  return <RoleDashboard>
    <header className="min-w-0">
      <WorkspacePageHeading title="Document control centre" context={<>{project.code} · {project.name}</>} actions={<Link className="ev-button w-full shrink-0 sm:w-auto" href={`${base}/documents`}><FileStack size={16} aria-hidden="true"/>Open MDR</Link>}/>
      {!preview&&<UserGuideLink organisationId={organisationId} projectId={projectId}/>}
    </header>
    <DashboardLead>
      <DccProjectBrief project={project}/>
      <DashboardWorkQueue id="dcc-work-queue" title="Work queue" items={tasks}/>
    </DashboardLead>
    <DashboardSummary title="Register summary" items={[
      {label:"MDR deliverables",value:summary.deliverables},
      {label:"Awaiting review",value:summary.awaitingReview},
      {label:"Not submitted",value:summary.unsubmitted},
      {label:"Overdue",value:summary.overdue,attention:summary.overdue>0},
    ]} help={<HelpTip label="Register counts">Awaiting review excludes incomplete uploads, but may include files still completing security checks. Overdue follows the MDR schedule, so a deliverable can appear in more than one count.</HelpTip>}/>
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
  </RoleDashboard>;
}

function DccProjectBrief({project}:{project:DccProject}){
  const objectives=project.key_objectives?.filter(objective=>objective.trim());
  return <DashboardPanel title="Project brief and dates" action={<a href="#dcc-work-queue" className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm font-medium text-[#24384f] underline underline-offset-4 @min-[52rem]:hidden">Jump to work queue<ArrowDown size={14} aria-hidden="true"/></a>}>
    <DashboardDates start={project.planned_start_date} end={project.planned_end_date}/>
    <p className="whitespace-pre-line text-sm leading-6 text-[#526675] [overflow-wrap:anywhere]">{project.project_introduction?.trim()||"No project introduction has been recorded."}</p>
    {objectives?.length?<div><h3 className="text-sm font-semibold text-[#14263d]">Key objectives</h3><ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-[#526675]">{objectives.map((objective,index)=><li className="[overflow-wrap:anywhere]" key={`${index}-${objective}`}>{objective}</li>)}</ol></div>:null}
  </DashboardPanel>;
}

function queueCount(count:number|null,label:string){
  return {text:count===null?"Count unavailable":`${count} ${label}`,attention:count!==null&&count>0};
}
