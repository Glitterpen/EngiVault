"use client";

import {useId,useRef,useState,type ReactNode} from "react";
import Link from "next/link";
import {ArrowLeft,ArrowRight,Archive,FolderKanban,Search,Settings} from "lucide-react";
import {HelpTip} from "@/components/help-tip";
import {OrganisationLogo} from "@/components/organisation-logo";
import {ProjectLogo} from "@/components/project-logo";
import {WorkspacePageHeading} from "@/components/workspace-page-heading";
import {healthTone} from "@/lib/project-health";
import {projectHomePath,roleLabel} from "@/lib/role-experience";
import type {PortfolioProject,ProjectSummary} from "@/lib/organisation-project-portfolio";

type Project=PortfolioProject&{summary?:ProjectSummary};
type Metrics={activeProjects:number;averageCompletion:number|null;attentionProjects:number|null;openIssues:number|null};
type Props={organisationId:string;organisationName:string;projects:Project[];isAdmin:boolean;metrics?:Metrics;disciplines?:Record<string,string[]>;disciplinesAvailable?:boolean;notice?:ReactNode;createAction?:ReactNode};
const PAGE_SIZE=12;
const statuses=[{value:"active",label:"Active"},{value:"archived",label:"Archived"},{value:"trashed",label:"Deleted"}] as const;
type Status=typeof statuses[number]["value"];

export function OrganisationProjectsWorkspace({organisationId,organisationName,projects,isAdmin,metrics,disciplines={},disciplinesAvailable=true,notice,createAction}:Props){
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState<Status>("active");
  const [page,setPage]=useState(1);
  const searchId=useId();
  const search=useRef<HTMLInputElement>(null),results=useRef<HTMLDivElement>(null);
  const needle=query.trim().toLowerCase();
  const filtered=projects.filter(project=>project.status===status&&(!needle||`${project.code} ${project.name} ${roleLabel(project.role)} ${(disciplines[project.project_id]??[]).join(" ")}`.toLowerCase().includes(needle)))
    .sort((a,b)=>a.code.localeCompare(b.code,"en",{numeric:true})||a.name.localeCompare(b.name,"en")||a.project_id.localeCompare(b.project_id,"en"));
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)),currentPage=Math.min(page,pages);
  const visible=filtered.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
  const counts=new Map(statuses.map(item=>[item.value,projects.filter(project=>project.status===item.value).length]));
  const base=`/app/${organisationId}`;
  const title=isAdmin?"Projects":"My project assignments";
  const selectedLabel=statuses.find(item=>item.value===status)!.label.toLowerCase();
  const engineeringWorkspace=!isAdmin&&projects.length>0&&projects.every(project=>project.role==="engineer");
  const activeEngineeringProjects=engineeringWorkspace?projects.filter(project=>project.status==="active"):[];
  const assignedDisciplineCount=activeEngineeringProjects.reduce((total,project)=>total+(disciplines[project.project_id]?.length??0),0);

  return <div className="mx-auto min-w-0 max-w-[1450px] space-y-4">
    <header className="min-w-0">
      <Link href="/app" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[#10243e]"><ArrowLeft size={16} aria-hidden="true"/>Back to organisations</Link>
      <div className="mt-1"><WorkspacePageHeading title={title} context={organisationName} logo={<OrganisationLogo organisationId={organisationId} name={organisationName} size={44} className="size-full object-contain"/>} help={<HelpTip label={isAdmin?"Projects dashboard guidance":"Project assignments guidance"}>{isAdmin?"Summary figures cover active projects only; completion is weighted by accepted MDR milestones, not time elapsed. Use Archived or Deleted to find projects outside the active portfolio.":"Choose a project to open its workspace. Engineer discipline assignments are listed on each project card."}</HelpTip>} actions={isAdmin&&createAction}/></div>
      {isAdmin&&<nav aria-label="Organisation actions" className="mt-2 flex flex-wrap gap-x-5 text-sm font-semibold text-[#526675]">
        <Link href={`${base}/settings`} className="inline-flex min-h-11 items-center gap-2 rounded-lg hover:text-[#10243e]"><Settings size={15} aria-hidden="true"/>Manage organisation</Link>
        <Link href={`${base}/audit`} className="inline-flex min-h-11 items-center rounded-lg hover:text-[#10243e]">Audit log</Link>
        <Link href={`${base}/subscription`} className="inline-flex min-h-11 items-center rounded-lg hover:text-[#10243e]">Plan &amp; usage</Link>
      </nav>}
    </header>

    {notice}
    {engineeringWorkspace&&<section aria-label="Your engineering work" className="rounded-2xl border border-[#dde4eb] bg-white">
      <dl className="grid grid-cols-2 divide-x divide-[#d6e0ed]">
        <PortfolioMetric label="Active projects" value={activeEngineeringProjects.length}/>
        <PortfolioMetric label="Discipline assignments" value={disciplinesAvailable?assignedDisciplineCount:null}/>
      </dl>
    </section>}
    {isAdmin&&metrics&&<section aria-label="Active portfolio summary" className="rounded-2xl border border-[#dde4eb] bg-white">
      <dl className="grid grid-cols-2 lg:grid-cols-4">
        <PortfolioMetric label="Active projects" value={metrics.activeProjects}/>
        <PortfolioMetric label="Average completion" value={metrics.averageCompletion} percent/>
        <PortfolioMetric label="Need attention" value={metrics.attentionProjects}/>
        <PortfolioMetric label="Open issues" value={metrics.openIssues}/>
      </dl>
    </section>}

    <section aria-labelledby={`${searchId}-projects`} className="min-w-0 space-y-3">
      <h2 id={`${searchId}-projects`} className="sr-only">{isAdmin?"Project portfolio":"Your workspaces"}</h2>
      <div className="grid min-w-0 gap-3 border-b border-[#dfe6e9] pb-3 lg:grid-cols-[minmax(240px,384px)_minmax(0,1fr)] lg:items-end">
        <label htmlFor={searchId} className="block min-w-0"><span className="mb-1 block text-sm font-medium text-[#526675]">Search projects</span><span className="relative block"><Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-[#617083]"/><input ref={search} id={searchId} aria-controls={`${searchId}-results`} type="search" maxLength={150} value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}} className="ev-input pl-10" placeholder="Project code or name"/></span></label>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <nav aria-label="Project status" className="flex flex-wrap gap-1">{statuses.filter(item=>item.value==="active"||counts.get(item.value)!>0).map(item=><button key={item.value} type="button" aria-pressed={status===item.value} onClick={()=>{setStatus(item.value);setPage(1);}} className={`inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm ${status===item.value?"bg-[#eef3fa] font-semibold text-[#10243e]":"text-[#526675] hover:bg-[#edf2f5]"}`}>{item.label}<span className="text-xs tabular-nums">{counts.get(item.value)}</span></button>)}</nav>
        <p role="status" aria-live="polite" aria-atomic="true" className="text-xs text-[#526675]">{filtered.length} {query?"matching ":""}{selectedLabel} project{filtered.length===1?"":"s"}{pages>1?` · Page ${currentPage} of ${pages}`:""}</p>
        </div>
      </div>

      <div ref={results} id={`${searchId}-results`} role="region" aria-label="Project results" tabIndex={-1} className="min-w-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10243e]">
      {visible.length?<ul className={engineeringWorkspace?"grid min-w-0 gap-3 xl:grid-cols-2":"min-w-0 space-y-3"} aria-label={isAdmin?"Projects":"Project assignments"}>{visible.map(project=><li key={project.project_id} className="min-w-0"><ProjectCard project={project} organisationId={organisationId} isAdmin={isAdmin} disciplines={disciplines[project.project_id]??[]} disciplinesAvailable={disciplinesAvailable}/></li>)}</ul>:<div className="rounded-2xl border border-dashed border-[#cbd6df] bg-white px-4 py-5 text-center sm:px-5 sm:py-6">
        <FolderKanban size={24} aria-hidden="true" className="mx-auto text-[#617083]"/>
        <h3 className="mt-3 text-base font-semibold">{query?"No matching projects":`No ${selectedLabel} projects`}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#526675]">{query?"Try another project code or name, or choose a different project status.":status==="active"?isAdmin?"Create a project when you are ready to begin. Archived and deleted records remain in their own views.":"Your project workspaces will appear here when you are appointed to a project.":status==="archived"?"Archived projects will appear here. They remain separate from active work.":"Deleted projects will appear here while they can still be recovered."}</p>
        {query&&<button type="button" className="ev-button-secondary mt-4" onClick={()=>{setQuery("");setPage(1);search.current?.focus();}}>Clear search</button>}
      </div>}
      </div>

      {pages>1&&<nav aria-label="Project pages" className="flex flex-wrap items-center justify-between gap-3 pt-2 text-sm text-[#526675]"><p>Page {currentPage} of {pages}</p><div className="flex gap-2"><button type="button" className="ev-button-secondary" disabled={currentPage===1} onClick={()=>{setPage(current=>Math.max(1,Math.min(current,pages)-1));results.current?.focus();}}>Previous</button><button type="button" className="ev-button-secondary" disabled={currentPage===pages} onClick={()=>{setPage(current=>Math.min(pages,current+1));results.current?.focus();}}>Next</button></div></nav>}
    </section>
  </div>;
}

function PortfolioMetric({label,value,percent=false}:{label:string;value:number|null;percent?:boolean}){
  return <div className="min-w-0 px-4 py-3 sm:px-5"><dt className="text-sm text-[#526675]">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-[#10243e]">{value===null?<span className="text-base font-medium text-[#617083]">Unavailable</span>:`${value}${percent?"%":""}`}</dd></div>;
}

function ProjectCard({project,organisationId,isAdmin,disciplines,disciplinesAvailable}:{project:Project;organisationId:string;isAdmin:boolean;disciplines:string[];disciplinesAvailable:boolean}){
  const summary=project.summary;
  const active=project.status==="active";
  const deleted=project.status==="trashed";
  const href=deleted?`/app/${organisationId}/projects/${project.project_id}/administration`:projectHomePath(organisationId,project.project_id,project.role);
  const headingId=useId();
  const action=deleted?"Manage deleted project":"Open project";
  if(!isAdmin&&project.role==="engineer")return <EngineerProjectCard project={project} organisationId={organisationId} href={href} headingId={headingId} action={action} disciplines={disciplines} disciplinesAvailable={disciplinesAvailable}/>;
  return <article aria-labelledby={headingId} className="relative min-w-0 rounded-2xl border border-[#dde4eb] bg-white p-4 transition-colors hover:border-[#d6e0ed] sm:p-5">
    <div className="flex min-w-0 items-start gap-3 sm:gap-4">
      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#d6e0ed] bg-[#fbfcfe] p-1.5 sm:size-12"><ProjectLogo organisationId={organisationId} projectId={project.project_id} name={project.name} size={48} className="size-full object-contain"/></span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><p className="break-words text-xs font-semibold tracking-wide text-[#526675]">{project.code}</p>{isAdmin&&active&&summary?<span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${summary.health?healthTone(summary.health):"bg-[#eef1f4] text-[#526675]"}`}>{summary.health??"Health unavailable"}</span>:!active?<span className="inline-flex items-center gap-1 rounded-full bg-[#eef1f4] px-2.5 py-1 text-xs font-semibold text-[#526675]"><Archive size={12} aria-hidden="true"/>{deleted?"Deleted":"Archived"}</span>:null}</div>
        <h3 id={headingId} className="mt-1 break-words text-base font-semibold leading-6 text-[#10243e] sm:text-lg"><Link href={href} aria-label={`${action}: ${project.code} — ${project.name}`} className="inline-flex min-h-11 items-center gap-3 rounded-lg after:absolute after:inset-0 after:rounded-2xl hover:text-[#10243e] hover:underline focus-visible:after:ring-2 focus-visible:after:ring-[#10243e]"><span>{project.name}</span><ArrowRight size={17} aria-hidden="true" className="shrink-0 text-[#10243e]"/></Link></h3>
        {!isAdmin&&<p className="mt-1 text-sm text-[#10243e]">{roleLabel(project.role)}</p>}
      </div>
    </div>
        {isAdmin&&active&&summary&&<div className="mt-4 grid gap-4 sm:ml-16 md:grid-cols-[minmax(180px,1fr)_1.2fr] md:items-center">
          <div><div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm"><span className="text-[#526675]">MDR completion</span><span className="font-semibold tabular-nums text-[#10243e]">{summary.completion===null?"Unavailable":`${summary.completion}%`}</span></div>{summary.completion!==null&&<div role="progressbar" aria-label={`${project.code} MDR completion`} aria-valuenow={summary.completion} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-[#eef3fa]"><div className="h-full rounded-full bg-[#10243e]" style={{width:`${summary.completion}%`}}/></div>}</div>
          <dl className="grid grid-cols-3 gap-3 text-sm"><ProjectMetric label="Deliverables" value={summary.deliverables}/><ProjectMetric label="Overdue" value={summary.overdue} warn={summary.overdue!==null&&summary.overdue>0}/><ProjectMetric label="Open issues" value={summary.openIssues}/></dl>
        </div>}
  </article>;
}

function EngineerProjectCard({project,organisationId,href,headingId,action,disciplines,disciplinesAvailable}:{project:Project;organisationId:string;href:string;headingId:string;action:string;disciplines:string[];disciplinesAvailable:boolean}){
  const active=project.status==="active",deleted=project.status==="trashed";
  return <article aria-labelledby={headingId} className="flex h-full min-w-0 flex-col rounded-2xl border border-[#dde4eb] bg-white p-4 sm:p-5">
    <div className="flex min-w-0 items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#d6e0ed] bg-[#fbfcfe] p-1.5"><ProjectLogo organisationId={organisationId} projectId={project.project_id} name={project.name} size={44} className="size-full object-contain"/></span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><p className="break-words text-xs font-medium text-[#526675]">{project.code}</p>{!active&&<span className="inline-flex items-center gap-1 rounded-full bg-[#eef1f4] px-2.5 py-1 text-xs font-medium text-[#526675]"><Archive size={12} aria-hidden="true"/>{deleted?"Deleted":"Archived"}</span>}</div>
        <h3 id={headingId} className="mt-1 break-words text-base font-semibold leading-6 text-[#10243e] sm:text-lg"><Link href={href} aria-label={`${action}: ${project.code} — ${project.name}`} className="inline-flex min-h-11 items-center rounded-lg hover:text-[#10243e] hover:underline">{project.name}</Link></h3>
        <p className="text-sm text-[#526675]">{roleLabel(project.role)}</p>
      </div>
    </div>
    <div className="mt-4 min-w-0 border-t border-[#d6e0ed] pt-3">
      <p className="text-sm font-medium text-[#526675]">Authorised disciplines</p>
      {disciplinesAvailable?disciplines.length?<ul aria-label={`Authorised disciplines for ${project.code}`} className="mt-2 flex min-w-0 flex-wrap gap-1.5">{disciplines.map(discipline=><li key={discipline} className="max-w-full break-words rounded-lg bg-[#eef3fa] px-2.5 py-1.5 text-sm text-[#24384f]">{discipline}</li>)}</ul>:<p className="mt-2 text-sm text-[#8b3d1f]">Awaiting discipline assignment</p>:<p className="mt-2 text-sm text-[#526675]">Discipline details unavailable</p>}
    </div>
    <div className="mt-auto pt-4"><Link href={href} aria-label={`${deleted?"Manage deleted project":"My Deliverables"}: ${project.code} — ${project.name}`} className="ev-button-secondary w-full justify-center gap-2 sm:w-auto">{deleted?"Manage deleted project":"My Deliverables"}<ArrowRight size={16} aria-hidden="true"/></Link></div>
  </article>;
}

function ProjectMetric({label,value,warn=false}:{label:string;value:number|null;warn?:boolean}){
  return <div className="min-w-0"><dt className="text-xs text-[#526675]">{label}</dt><dd className={`mt-1 font-semibold tabular-nums ${warn?"text-[#9b2c24]":"text-[#24384f]"}`}>{value??"Unavailable"}</dd></div>;
}
