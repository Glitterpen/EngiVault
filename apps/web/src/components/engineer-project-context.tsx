import {ArrowDown} from "lucide-react";
import {HelpTip} from "@/components/help-tip";
import type {EngineerProgressHealth} from "@/lib/engineer-progress";
import {projectDeliveryStageLabel,projectTerminalIssueStatus,type ProjectDeliveryStage} from "@/lib/project-delivery-stage";

export type EngineerProjectContextProject={
  code:string;
  name:string;
  project_introduction:string|null;
  key_objectives:string[];
  planned_start_date:string|null;
  planned_end_date:string|null;
  delivery_stage:ProjectDeliveryStage;
};

function ProjectDate({value}:{value:string|null}){
  if(!value)return <span>Not set</span>;
  const date=new Date(`${value}T00:00:00Z`);
  if(Number.isNaN(date.getTime()))return <span>Not set</span>;
  return <time dateTime={value}>{new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(date)}</time>;
}

/** The Project Manager's brief stays visible; it is never reduced to a disclosure. */
export function EngineerProjectContext({project,deliverablesHref="#deliverables"}:{project:EngineerProjectContextProject|null;deliverablesHref?:string}){
  const objectives=project?.key_objectives??[];
  return <section id="project-brief" aria-labelledby="engineer-project-brief-heading" className="min-w-0 scroll-mt-24 rounded-2xl border border-[#dde4eb] bg-white p-4 sm:p-5">
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 id="engineer-project-brief-heading" className="text-sm font-semibold text-[#10243e]">Project brief</h2>
        {project&&<p className="mt-1 break-words text-xs leading-5 text-[#526279]">{project.code} · {project.name}</p>}
      </div>
      <a href={deliverablesHref} className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[#10243e] underline decoration-[#b8c3cf] underline-offset-4 hover:bg-[#f5f7fa]">
        My deliverables <ArrowDown size={15} aria-hidden="true" className="shrink-0"/>
      </a>
    </header>
    {project?<>
      <div className="mt-3 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-[#526279]">Project introduction</h3>
          <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-[#24384f]">{project.project_introduction?.trim()?project.project_introduction:"The Project Manager has not added the project introduction yet."}</p>
        </div>
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-[#526279]">Key objectives</h3>
          {objectives.length>0?<ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6 text-[#24384f]">
            {objectives.map((objective,index)=><li key={`${index}-${objective}`} className="whitespace-pre-line break-words pl-1 marker:font-semibold marker:text-[#a64019]">{objective}</li>)}
          </ol>:<p className="mt-2 text-sm leading-6 text-[#526279]">No key objectives have been recorded yet.</p>}
        </div>
      </div>
      <dl className="mt-4 grid min-w-0 grid-cols-1 gap-x-5 gap-y-3 border-t border-[#e7ecf1] pt-4 min-[380px]:grid-cols-2 lg:grid-cols-4">
        <ContextDatum label="Planned start"><ProjectDate value={project.planned_start_date}/></ContextDatum>
        <ContextDatum label="Planned completion"><ProjectDate value={project.planned_end_date}/></ContextDatum>
        <ContextDatum label="Delivery stage">{projectDeliveryStageLabel(project.delivery_stage)}</ContextDatum>
        <ContextDatum label="100% completion milestone">{projectTerminalIssueStatus(project.delivery_stage)}</ContextDatum>
      </dl>
    </>:<p className="mt-3 text-sm leading-6 text-[#526279]">The project brief is currently unavailable.</p>}
  </section>;
}

function ContextDatum({label,children}:{label:string;children:React.ReactNode}){
  return <div className="min-w-0"><dt className="text-xs leading-5 text-[#526279]">{label}</dt><dd className="mt-1 break-words text-sm font-medium leading-6 text-[#10243e]">{children}</dd></div>;
}

export type EngineerProjectImpactSummaryProps={
  health:EngineerProgressHealth;
  projectActual:number;
  projectPlanned:number;
  engineerActual:number;
  engineerPlanned:number;
  engineerShare:number;
  contribution:number;
  expectedContribution:number;
  delayImpact:number;
};

const healthPresentation:Record<EngineerProgressHealth,{label:string;className:string}>={
  no_scope:{label:"Awaiting assignments",className:"bg-[#f0f3f7] text-[#526279]"},
  on_track:{label:"On track",className:"bg-[#eef3fa] text-[#10243e]"},
  at_risk:{label:"Due soon",className:"bg-[#fff2e9] text-[#934018]"},
  lagging:{label:"Needs attention",className:"bg-[#fff0eb] text-[#9b3824]"},
};

function displayNumber(value:number){
  return Number.isFinite(value)?new Intl.NumberFormat("en-GB",{maximumFractionDigits:1}).format(value):"Unavailable";
}

/** Presentation only: the caller supplies the existing authorised aggregate values. */
export function EngineerProjectImpactSummary({health,projectActual,projectPlanned,engineerActual,engineerPlanned,engineerShare,contribution,expectedContribution,delayImpact}:EngineerProjectImpactSummaryProps){
  const presentation=healthPresentation[health];
  return <section id="project-impact" aria-labelledby="engineer-project-impact-heading" className="min-w-0 scroll-mt-24 rounded-2xl border border-[#dde4eb] bg-white p-4 sm:p-5">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="engineer-project-impact-heading" className="text-sm font-semibold text-[#10243e]">My project impact</h2>
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${presentation.className}`}>{presentation.label}</span>
    </header>
    {health==="no_scope"&&<p className="mt-2 text-sm leading-6 text-[#526279]">No MDR deliverables are assigned to you yet.</p>}
    <div className="mt-4 grid min-w-0 gap-x-5 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
      <AcceptedProgress label="Overall project" actual={projectActual} planned={projectPlanned}/>
      <AcceptedProgress label="My disciplines" actual={engineerActual} planned={engineerPlanned}/>
      <div className="min-w-0">
        <h3 className="text-xs font-medium leading-5 text-[#526279]">Contribution to project progress</h3>
        <p className="mt-1 text-xl font-semibold leading-8 tabular-nums text-[#10243e]">{displayNumber(contribution)} <span className="text-xs font-medium">percentage points</span></p>
        <p className="mt-1 text-xs leading-5 text-[#526279]">Expected: {displayNumber(expectedContribution)} percentage points</p>
        <p className="mt-1 text-xs leading-5 text-[#526279]">Your scope: {displayNumber(engineerShare)}% of project weight</p>
      </div>
      <div className="min-w-0">
        <h3 className="text-xs font-medium leading-5 text-[#526279]">Gap to expected contribution</h3>
        <p className={`mt-1 text-xl font-semibold leading-8 tabular-nums ${delayImpact>0?"text-[#9b3824]":"text-[#10243e]"}`}>{displayNumber(delayImpact)} <span className="text-xs font-medium">percentage points</span></p>
        <p className="mt-1 text-xs leading-5 text-[#526279]">A progress gap, not a measured schedule delay in days.</p>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-x-1 border-t border-[#e7ecf1] pt-3 text-xs leading-5 text-[#526279]">
      <span>DCC-accepted progress · MDR due-date baseline</span>
      <HelpTip kind="info" label="About the MDR due-date baseline">Expected progress uses each deliverable’s planned final date, falling back to its first-submission date. The S-curve’s estimated plan instead follows the project start and completion dates.</HelpTip>
    </div>
  </section>;
}

function AcceptedProgress({label,actual,planned}:{label:string;actual:number;planned:number}){
  const accessibleValue=Number.isFinite(actual)?Math.max(0,Math.min(100,actual)):0;
  return <div className="min-w-0">
    <h3 className="text-xs font-medium leading-5 text-[#526279]">{label} · DCC accepted</h3>
    <p className="mt-1 text-xl font-semibold leading-8 tabular-nums text-[#10243e]">{displayNumber(actual)}%</p>
    {Number.isFinite(actual)&&<progress aria-label={`${label} DCC-accepted progress`} max={100} value={accessibleValue} className="mt-2 block h-2 w-full appearance-none overflow-hidden rounded-full bg-[#e3e9f1] text-[#10243e] [&::-moz-progress-bar]:bg-[#10243e] [&::-webkit-progress-bar]:bg-[#e3e9f1] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[#10243e]"/>}
    <p className="mt-2 text-xs leading-5 text-[#526279]">MDR expected: {displayNumber(planned)}%</p>
  </div>;
}
