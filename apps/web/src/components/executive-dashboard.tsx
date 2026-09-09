import Link from "next/link";
import {ArrowLeft,CalendarDays,Eye} from "lucide-react";
import {HelpTip} from "./help-tip";
import {ExecutiveRefresh} from "./executive-refresh";
import {executivePortfolioTotals,executiveProjectStatus,type ExecutivePortfolio} from "@/lib/executive-portfolio";

export function ExecutiveDashboard({portfolio}:{portfolio:ExecutivePortfolio}){
  const totals=executivePortfolioTotals(portfolio.projects);
  return <div>
    <Link href="/app" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#0c5b45]"><ArrowLeft size={16}/> Organisations</Link>
    <header className="mt-4 flex flex-wrap items-end justify-between gap-4"><div className="min-w-0"><p className="ev-label">Executive overview · Read only</p><h1 className="mt-2 break-words text-3xl font-semibold">{portfolio.organisation.name}</h1><p className="mt-2 text-sm capitalize text-[#617083]">Organisation {portfolio.organisation.status}</p></div><div className="flex flex-wrap gap-2"><span className="inline-flex items-center gap-2 rounded-full bg-[#e8f1ed] px-3 py-2 text-xs font-bold text-[#0c5b45]"><Eye size={14}/> Private executive access</span><ExecutiveRefresh/></div></header>
    <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Active project summary">
      <Metric label="Active projects" value={totals.active}/><Metric label="Average progress" value={totals.average===null?"Not baselined":`${totals.average}%`} help="Unweighted average of active projects with MDR deliverables. Each project's progress is weighted by its deliverables and DCC-accepted issue stage."/>
      <Metric label="Outstanding deliverables" value={totals.outstanding}/><Metric label="Overdue submissions" value={totals.overdue}/>
    </section>
    <div className="mt-8 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">Project status <HelpTip label="Executive progress measures">Progress follows DCC-accepted issue stages; IFR and IFA do not earn final completion for FEED or DED. Planned progress uses MDR final dates, falling back to first issue dates where no final date is set. Lag is the shortfall in percentage points, not days. Missing dates are shown as incomplete, never on track. Overdue submissions follow the working-day revision cycle and accepted date changes. Archived projects are shown but excluded from the summary above.</HelpTip></h2><p className="text-xs text-[#617083]">Updated {new Date(portfolio.as_of).toLocaleString("en-GB",{timeZone:"UTC"})} UTC</p></div>
    <section className="mt-4 grid gap-4" aria-label="Project status list">
      {portfolio.projects.map(project=>{const status=executiveProjectStatus(project);return <article className="ev-card min-w-0 p-4 sm:p-6" key={project.id}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold text-[#e8733f]">{project.code} · {project.delivery_stage?.toUpperCase()??"Stage not set"}{project.status==="archived"?" · Archived":""}</p><h3 className="mt-1 break-words text-lg font-semibold">{project.name}</h3></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${status==="Behind plan"?"bg-[#fff0e9] text-[#a5452f]":"bg-[#eef4f1] text-[#0c5b45]"}`}>{status}</span></div>
        <div className="mt-4 flex items-end justify-between gap-3"><p className="text-2xl font-semibold">{project.progress_percent}% <span className="text-xs font-normal text-[#617083]">complete</span></p><p className="text-right text-sm">{project.lag_points===null?"Lag unavailable":project.lag_points>0?`${project.lag_points} pp behind plan`:"No progress lag"}</p></div>
        <progress className="mt-2 h-2 w-full appearance-none overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-[#e8efec] [&::-webkit-progress-value]:bg-[#0c5b45] [&::-moz-progress-bar]:bg-[#0c5b45]" aria-label={`${project.name} progress`} value={project.progress_percent} max={100}/>
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-[#edf1ef] pt-4 sm:grid-cols-4"><Detail label="Planned progress" value={project.planned_percent===null?"Dates incomplete":`${project.planned_percent}%`}/><Detail label="Outstanding" value={`${project.outstanding} / ${project.deliverables}`}/><Detail label="Overdue" value={project.overdue}/><Detail label="Open issues" value={project.open_issues}/></dl>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#617083]"><span className="inline-flex items-center gap-1.5"><CalendarDays size={14}/> Start: {formatDate(project.start_date)}</span><span>Planned end: {formatDate(project.end_date)}</span></div>
      </article>})}
      {!portfolio.projects.length&&<p className="ev-card p-8 text-center text-[#617083]">No projects yet. New projects will appear here automatically.</p>}
    </section>
  </div>;
}
function Metric({label,value,help}:{label:string;value:string|number;help?:string}){return <article className="ev-card min-w-0 p-4 sm:p-5"><p className="break-words text-2xl font-semibold">{value}</p><h2 className="mt-2 text-xs font-semibold text-[#617083]">{label}{help&&<> <HelpTip label={`${label} definition`}>{help}</HelpTip></>}</h2></article>;}
function Detail({label,value}:{label:string;value:string|number}){return <div><dt className="text-xs text-[#617083]">{label}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>;}
function formatDate(value:string|null){return value?new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB",{timeZone:"UTC",day:"numeric",month:"short",year:"numeric"}):"Not set";}
