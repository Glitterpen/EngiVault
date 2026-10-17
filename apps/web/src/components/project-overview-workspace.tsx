"use client";

import {useId,useRef,useState,type ReactNode} from "react";
import Link from "next/link";
import {ArrowLeft,ArrowRight,CheckCircle2,ChevronDown,FileText,Plus,UsersRound} from "lucide-react";
import {AppDialog} from "@/components/app-dialog";
import {HelpTip} from "@/components/help-tip";
import {ProjectLogo} from "@/components/project-logo";
import {WorkspacePageHeading} from "@/components/workspace-page-heading";
import {healthTone} from "@/lib/project-health";
import {projectDeliveryStageLabel,projectTerminalIssueStatus,type ProjectDeliveryStage} from "@/lib/project-delivery-stage";
import type {OverviewIssue,ProjectOverviewSummary} from "@/lib/project-overview-summary";

export type OverviewProject={code:string;name:string;planned_start_date:string|null;planned_end_date:string|null;delivery_stage:ProjectDeliveryStage|null;revision_cycle_days:number|null};
type Props={organisationId:string;projectId:string;project:OverviewProject;role:string;preview:boolean;summary:ProjectOverviewSummary;issues:OverviewIssue[];issuesAvailable:boolean;resourcesAvailable:boolean;brief:ReactNode;revisionCycle:ReactNode;issueForm?:ReactNode;notice?:ReactNode;resolveIssueAction:(form:FormData)=>Promise<void>};
const ISSUE_PAGE_SIZE=5;
const severityOrder:Record<string,number>={critical:0,high:1,medium:2,low:3};

/** Daily oversight first; occasional setup stays in keyboard-accessible disclosures. */
export function ProjectOverviewWorkspace({organisationId,projectId,project,role,preview,summary,issues,issuesAvailable,resourcesAvailable,brief,revisionCycle,issueForm,notice,resolveIssueAction}:Props){
  const base=`/app/${organisationId}/projects/${projectId}`;
  const canManage=role==="project_admin"&&!preview;
  const heading=useId();
  return <div className="mx-auto min-w-0 max-w-[1450px] space-y-4">
    <header className="min-w-0">
      <Link href={`/app/${organisationId}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[#10243e]"><ArrowLeft size={16} aria-hidden="true"/>Back to projects</Link>
      <div className="mt-1"><WorkspacePageHeading title="Project overview" context={<>{project.code} · {project.name}</>} logo={<ProjectLogo organisationId={organisationId} projectId={projectId} name={project.name} size={44} className="size-full object-contain"/>} actions={<Link href={`${base}/reports`} className="ev-button w-full shrink-0 sm:w-auto"><FileText size={16} aria-hidden="true"/>Project report</Link>}/></div>
      <nav aria-label="Project overview actions" className="mt-2 flex flex-wrap gap-x-5 text-sm font-semibold text-[#526675]">
        <Link href={`${base}/team`} className="inline-flex min-h-11 items-center gap-2 rounded-lg hover:text-[#10243e]"><UsersRound size={15} aria-hidden="true"/>{role==="organisation_admin"?"Project leadership":"Team & resources"}</Link>
        <Link href={`${base}/templates`} className="inline-flex min-h-11 items-center rounded-lg hover:text-[#10243e]">Project templates</Link>
        {role==="organisation_admin"&&<Link href={`${base}/administration`} className="inline-flex min-h-11 items-center rounded-lg hover:text-[#10243e]">Admin controls</Link>}
        {canManage&&<Link href={`${base}/settings`} className="inline-flex min-h-11 items-center rounded-lg hover:text-[#10243e]">Project settings</Link>}

      </nav>
    </header>

    {notice}
    <section aria-labelledby={`${heading}-summary`} className="min-w-0 rounded-2xl border border-[#dde4eb] bg-white">
      <div className="grid min-w-0 gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-8">
        <div className="min-w-0"><div className="flex flex-wrap items-center justify-between gap-2"><h2 id={`${heading}-summary`} className="inline-flex items-center gap-1 text-sm font-semibold">Delivery progress<HelpTip label="Project completion milestones">Progress is weighted by accepted issue milestones, not time elapsed. A deliverable reaches 100% at {projectTerminalIssueStatus(project.delivery_stage)} after DCC acceptance.</HelpTip></h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${summary.health?healthTone(summary.health):"bg-[#eef1f4] text-[#526675]"}`}>{summary.health??"Health unavailable"}</span></div>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2"><p className="text-3xl font-semibold tabular-nums">{summary.completion===null?<span className="text-base text-[#526675]">Unavailable</span>:`${summary.completion}%`}</p><p className="text-xs text-[#526675]">{projectDeliveryStageLabel(project.delivery_stage)}</p></div>
          {summary.completion!==null&&<div role="progressbar" aria-label="Stage-weighted MDR completion" aria-valuenow={summary.completion} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-2 overflow-hidden rounded-full bg-[#eef3fa]"><div className="h-full rounded-full bg-[#10243e]" style={{width:`${summary.completion}%`}}/></div>}
        </div>
        <dl className="grid min-w-0 grid-cols-3 gap-3 self-center"><Datum label="MDR deliverables" value={summary.deliverables}/><Datum label="Overdue" value={summary.overdue} warn={summary.overdue!==null&&summary.overdue>0}/><Datum label="Open issues" value={summary.openIssues}/></dl>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#e7ecef] px-4 py-3 sm:grid-cols-4 sm:px-5"><Datum label="Planned start" value={formatDate(project.planned_start_date)} compact/><Datum label="Planned completion" value={formatDate(project.planned_end_date)} compact/><Datum label="Engineers" value={summary.engineers} compact/><Datum label="Document controllers" value={summary.dcc} compact/></dl>
    </section>

    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
      <ProjectIssues organisationId={organisationId} projectId={projectId} issues={issues} available={issuesAvailable} canManage={canManage} issueForm={issueForm} resolveIssueAction={resolveIssueAction}/>
    <section aria-label="Project details and planning" className="grid min-w-0 items-start gap-3">
      <details className="group min-w-0 overflow-hidden rounded-2xl border border-[#dde4eb] bg-white"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden sm:px-5"><span>Project brief &amp; objectives</span><ChevronDown size={17} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180"/></summary><div className="border-t border-[#e7ecef] p-4 sm:p-5">{brief}</div></details>
      <details className="group min-w-0 overflow-hidden rounded-2xl border border-[#dde4eb] bg-white"><summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden sm:px-5"><span>Revision cycle</span><span className="inline-flex items-center gap-3 text-xs font-normal text-[#526675]">{project.revision_cycle_days?`${project.revision_cycle_days} working days`:"Not set"}<ChevronDown size={17} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180"/></span></summary><div className="border-t border-[#e7ecef] p-4 sm:p-5">{revisionCycle}</div></details>
    </section>
      </div>
      <ResourceReadiness resources={summary.resources} available={resourcesAvailable} base={base} canManage={canManage}/>
    </div>
  </div>;
}

function Datum({label,value,warn=false,compact=false}:{label:string;value:string|number|null;warn?:boolean;compact?:boolean}){
  return <div className="min-w-0"><dt className="break-words text-xs leading-5 text-[#526675]">{label}</dt><dd className={`mt-1 break-words font-semibold tabular-nums ${compact?"text-sm":"text-2xl"} ${warn?"text-[#9b2c24]":"text-[#10243e]"}`}>{value===null?<span className="text-sm font-medium text-[#526675]">Unavailable</span>:value}</dd></div>;
}

function ProjectIssues({organisationId,projectId,issues,available,canManage,issueForm,resolveIssueAction}:{organisationId:string;projectId:string;issues:OverviewIssue[];available:boolean;canManage:boolean;issueForm?:ReactNode;resolveIssueAction:Props["resolveIssueAction"]}){
  const [view,setView]=useState<"open"|"resolved">("open"),[page,setPage]=useState(1);
  const id=useId(),results=useRef<HTMLDivElement>(null);
  const open=issues.filter(issue=>issue.status!=="resolved"),resolved=issues.filter(issue=>issue.status==="resolved");
  const filtered=[...(view==="open"?open:resolved)].sort((a,b)=>(view==="open"?(severityOrder[a.severity]??4)-(severityOrder[b.severity]??4):0)||b.created_at.localeCompare(a.created_at,"en")||a.id.localeCompare(b.id,"en"));
  const pages=Math.max(1,Math.ceil(filtered.length/ISSUE_PAGE_SIZE)),currentPage=Math.min(page,pages);
  const visible=filtered.slice((currentPage-1)*ISSUE_PAGE_SIZE,currentPage*ISSUE_PAGE_SIZE);
  return <section aria-labelledby={`${id}-heading`} className="min-w-0 overflow-hidden rounded-2xl border border-[#dde4eb] bg-white">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7ecef] px-4 py-3 sm:px-5"><h2 id={`${id}-heading`} className="font-semibold">Project issues <HelpTip label="Project issues guidance">Expand an issue to read its details or resolve it. Use Resolved to find closed issues.</HelpTip></h2>{canManage&&issueForm&&<AppDialog trigger={<><Plus size={15} aria-hidden="true"/>Report issue</>} title="Report an issue">{issueForm}</AppDialog>}</header>
    {!available?<p className="p-5 text-sm text-[#526675]">Project issues are unavailable. Retry the overview to load their current status.</p>:<>
      <nav aria-label="Issue status" className="flex flex-wrap gap-1 border-b border-[#edf1f3] px-4 py-2 sm:px-5">{([{value:"open",label:"Open",count:open.length},{value:"resolved",label:"Resolved",count:resolved.length}] as const).map(item=><button type="button" data-preview-safe key={item.value} aria-pressed={view===item.value} aria-controls={`${id}-results`} onClick={()=>{setView(item.value);setPage(1);}} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm ${view===item.value?"bg-[#eef3fa] font-semibold text-[#10243e]":"text-[#526675] hover:bg-[#f4f7fb]"}`}>{item.label}<span className="text-xs tabular-nums">{item.count}</span></button>)}</nav>
      <div ref={results} id={`${id}-results`} role="region" aria-label="Issue results" tabIndex={-1} className="focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#10243e]">
        {visible.length?<ul className="divide-y divide-[#edf1f3]">{visible.map(issue=><li key={issue.id}><details className="group"><summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden sm:px-5"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${severityTone(issue.severity)}`}>{issue.severity}</span><span className="text-xs capitalize text-[#526675]">{issue.status}</span></div><h3 className="mt-1 break-words text-sm font-semibold leading-6">{issue.title}</h3><p className="mt-1 break-words text-xs leading-5 text-[#526675]">{issue.owner_name||"Unassigned"} · Due {formatDate(issue.due_date)}</p></div><ChevronDown size={17} aria-hidden="true" className="mt-2 shrink-0 text-[#526675] transition-transform group-open:rotate-180"/></summary><div className="space-y-3 px-4 pb-4 text-sm sm:px-5"><p className="whitespace-pre-line break-words leading-6 text-[#526675]">{issue.description||"No additional description."}</p>{canManage&&issue.status!=="resolved"&&<form action={resolveIssueAction}><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="issueId" value={issue.id}/><input type="hidden" name="status" value="resolved"/><button className="ev-button-secondary"><CheckCircle2 size={15} aria-hidden="true"/>Resolve issue</button></form>}</div></details></li>)}</ul>:<p className="px-4 py-4 text-sm text-[#526675] sm:px-5">{view==="open"?"No open project issues.":"No resolved project issues."}</p>}
      </div>
      {pages>1&&<nav aria-label="Issue pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1f3] px-4 py-3 text-sm sm:px-5"><p role="status" aria-live="polite" aria-atomic="true" className="text-xs text-[#526675]">Page {currentPage} of {pages}</p><div className="flex gap-2"><button type="button" data-preview-safe className="ev-button-secondary" disabled={currentPage===1} onClick={()=>{setPage(current=>Math.max(1,Math.min(current,pages)-1));results.current?.focus();}}>Previous</button><button type="button" data-preview-safe className="ev-button-secondary" disabled={currentPage===pages} onClick={()=>{setPage(current=>Math.min(pages,current+1));results.current?.focus();}}>Next</button></div></nav>}
    </>}
  </section>;
}

function ResourceReadiness({resources,available,base,canManage}:{resources:ProjectOverviewSummary["resources"];available:boolean;base:string;canManage:boolean}){
  const [showAll,setShowAll]=useState(false);
  const id=useId();
  const sorted=[...resources].sort((a,b)=>(b.gap??0)-(a.gap??0)||a.discipline.localeCompare(b.discipline,"en"));
  const visible=showAll?sorted:sorted.slice(0,5);
  const gaps=resources.reduce((sum,resource)=>sum+(resource.gap??0),0),known=available&&resources.every(resource=>resource.gap!==null);
  return <section aria-labelledby={`${id}-heading`} className="min-w-0 overflow-hidden rounded-2xl border border-[#dde4eb] bg-white"><header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e7ecef] px-4 py-3 sm:px-5"><h2 id={`${id}-heading`} className="font-semibold">Resource readiness <HelpTip label="Resource readiness">Compares required engineers with active engineers in each discipline, excluding removed disciplines. Unfilled positions appear first.</HelpTip></h2><p className={`text-xs ${known&&gaps>0?"text-[#9b2c24]":"text-[#526675]"}`}>{!known?"Status unavailable":gaps?`${gaps} unfilled position${gaps===1?"":"s"}`:`${resources.length} discipline${resources.length===1?"":"s"}`}</p></header>
    {!available?<p className="p-5 text-sm text-[#526675]">Resource requirements are unavailable. Retry the overview to load their current status.</p>:resources.length?<><ul id={`${id}-list`} className="divide-y divide-[#edf1f3]" aria-label="Discipline resource requirements">{visible.map(resource=><li key={resource.id} className="px-4 py-3 sm:px-5"><div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1"><h3 className="min-w-0 break-words text-sm font-semibold">{resource.discipline}</h3><p className="shrink-0 text-xs text-[#526675]">{resource.assigned===null?"Assigned unavailable":`${resource.assigned} / ${resource.required_count} assigned`}</p></div><p className={`mt-1 text-xs ${resource.gap?"text-[#9b2c24]":"text-[#526675]"}`}>{resource.gap===null?"Readiness unavailable":resource.gap?`${resource.gap} ${resource.gap===1?"vacancy":"vacancies"}`:"Resourced"}{resource.notes?<span className="text-[#526675]"> · {resource.notes}</span>:null}</p></li>)}</ul>{resources.length>5&&<button type="button" data-preview-safe aria-expanded={showAll} aria-controls={`${id}-list`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 border-t border-[#edf1f3] px-4 py-2 text-sm font-semibold text-[#10243e]" onClick={()=>setShowAll(value=>!value)}>{showAll?"Show fewer disciplines":`Show all ${resources.length} disciplines`}<ChevronDown size={16} aria-hidden="true" className={showAll?"rotate-180":""}/></button>}</>:<p className="p-5 text-sm text-[#526675]">No discipline resource requirements have been set.</p>}
    <Link href={`${base}/team`} className="flex min-h-11 items-center justify-between gap-3 border-t border-[#edf1f3] px-4 py-3 text-sm font-semibold text-[#10243e] sm:px-5">{canManage?"Manage team & resources":"View project team"}<ArrowRight size={16} aria-hidden="true"/></Link>
  </section>;
}

function formatDate(value:string|null){
  if(!value)return "Not planned";
  const date=new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())?"Not planned":date.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});
}
function severityTone(value:string){if(value==="critical")return "bg-[#fde8e4] text-[#9b2c24]";if(value==="high")return "bg-[#fff0e9] text-[#8b3d1f]";return "bg-[#eef1f4] text-[#526675]";}
