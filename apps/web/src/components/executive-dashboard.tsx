import Link from "next/link";
import {ArrowDown,ArrowLeft,Eye} from "lucide-react";
import {HelpTip} from "./help-tip";
import {ExecutiveRefresh} from "./executive-refresh";
import {DashboardDates,DashboardLead,DashboardPanel,DashboardSummary,RoleDashboard} from "./role-dashboard";
import {WorkspacePageHeading} from "./workspace-page-heading";
import {executivePortfolioTotals,executiveProjectStatus,type ExecutivePortfolio} from "@/lib/executive-portfolio";

export function ExecutiveDashboard({portfolio}:{portfolio:ExecutivePortfolio}){
  const totals=executivePortfolioTotals(portfolio.projects);
  return <RoleDashboard>
    <header className="min-w-0">
      <Link href="/app" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[#10243e]"><ArrowLeft size={16} aria-hidden="true"/> Organisations</Link>
      <WorkspacePageHeading title={portfolio.organisation.name} context="Executive overview · Read only" actions={<ExecutiveRefresh/>}/>
    </header>
    <DashboardLead>
      <DashboardPanel title="Organisation status">
        <p className="inline-flex items-center gap-2 rounded-md bg-[#eef3fa] px-2 py-1 text-xs font-semibold text-[#24384f]"><Eye size={15} aria-hidden="true"/> Private executive access</p>
        <p className="text-sm text-[#526675]">Organisation <span className="font-semibold">{portfolio.organisation.status}</span>.</p>
        <p className="text-xs text-[#526675]">Updated <time dateTime={portfolio.as_of}>{new Date(portfolio.as_of).toLocaleString("en-GB",{timeZone:"UTC"})} UTC</time></p>
        <a href="#executive-projects" className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm font-semibold text-[#24384f] underline underline-offset-4">Jump to project status <ArrowDown size={15} aria-hidden="true"/></a>
      </DashboardPanel>
      <DashboardSummary title="Active project summary" items={[
        {label:"Active projects",value:totals.active},
        {label:"Average progress",value:totals.average===null?"Not baselined":`${totals.average}%`},
        {label:"Outstanding deliverables",value:totals.outstanding},
        {label:"Overdue submissions",value:totals.overdue,attention:totals.overdue>0},
      ]} help={<HelpTip label="Average progress definition" kind="info">Each active project with MDR deliverables counts equally. Within a project, deliverable weights and DCC-accepted issue stages determine progress.</HelpTip>}/>
    </DashboardLead>
    <section id="executive-projects" tabIndex={-1} className="min-w-0 scroll-mt-24 space-y-3" aria-labelledby="executive-projects-heading">
      <div className="flex flex-wrap items-center gap-1"><h2 id="executive-projects-heading" className="text-lg font-semibold">Project status</h2><HelpTip label="Executive progress measures" kind="info">Planned progress uses the Project Manager’s approved weighted milestone baseline. N/A means no approved matching plan is available. Lag is the shortfall in percentage points, not days.</HelpTip></div>
      <div className={`grid min-w-0 gap-4 ${portfolio.projects.length>1?"@min-[62rem]:grid-cols-2":""}`}>
      {portfolio.projects.map(project=>{const status=executiveProjectStatus(project);return <article className="ev-card min-w-0 p-4 sm:p-6" key={project.id}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-xs font-semibold text-[#526675]">{project.code} · {project.delivery_stage?.toUpperCase()??"Stage not set"}{project.status==="archived"?" · Archived":""}</p><h3 className="mt-1 break-words text-lg font-semibold">{project.name}</h3></div><span className={`rounded-md px-2 py-1 text-xs font-semibold ${status==="Behind plan"?"bg-[#fff0e9] text-[#a5452f]":"bg-[#eef3fa] text-[#10243e]"}`}>{status}</span></div>
        <div className="mt-3"><DashboardDates start={project.start_date} end={project.end_date}/></div>
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><p className="text-2xl font-semibold tabular-nums">{project.progress_percent}% <span className="text-xs font-normal text-[#526675]">complete</span></p><p className="min-w-0 break-words text-sm">{project.lag_points===null?"Lag unavailable":project.lag_points>0?`${project.lag_points} pp behind plan`:"No progress lag"}</p></div>
        <progress className="mt-2 h-2 w-full appearance-none overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-[#eef3fa] [&::-webkit-progress-value]:bg-[#10243e] [&::-moz-progress-bar]:bg-[#10243e]" aria-label={`${project.name} progress`} value={project.progress_percent} max={100}/>
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-[#d6e0ed] pt-4 sm:grid-cols-4"><Detail label="Planned progress" value={project.planned_percent===null?"N/A":`${project.planned_percent}%`}/><Detail label="Outstanding" value={`${project.outstanding} / ${project.deliverables}`}/><Detail label="Overdue" value={project.overdue}/><Detail label="Open issues" value={project.open_issues}/></dl>
      </article>})}
      {!portfolio.projects.length&&<p className="ev-card p-8 text-center text-[#617083]">No projects yet. New projects will appear here automatically.</p>}
      </div>
    </section>
  </RoleDashboard>;
}
function Detail({label,value}:{label:string;value:string|number}){return <div><dt className="text-xs text-[#617083]">{label}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>;}
