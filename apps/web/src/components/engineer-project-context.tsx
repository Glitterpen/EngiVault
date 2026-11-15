import {ArrowDown} from "lucide-react";
import {HelpTip} from "@/components/help-tip";
import {DashboardDates,DashboardPanel} from "@/components/role-dashboard";
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

/** The Project Manager's brief stays visible; it is never reduced to a disclosure. */
export function EngineerProjectContext({project,deliverablesHref="#deliverables"}:{project:EngineerProjectContextProject|null;deliverablesHref?:string}){
  const objectives=project?.key_objectives?.filter(objective=>objective.trim())??[];
  return <DashboardPanel id="project-brief" title="Project brief and dates" action={<a href={deliverablesHref} className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[#10243e] underline decoration-[#b8c3cf] underline-offset-4 hover:bg-[#f5f7fa]">
    My deliverables <ArrowDown size={15} aria-hidden="true" className="shrink-0"/>
  </a>}>
    {project?<>
      <DashboardDates start={project.planned_start_date} end={project.planned_end_date}/>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-[#14263d]">Project introduction</h3>
        <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-[#526675]">{project.project_introduction?.trim()?project.project_introduction:"The Project Manager has not added the project introduction yet."}</p>
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-[#14263d]">Key objectives</h3>
        {objectives.length>0?<ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-[#526675]">
          {objectives.map((objective,index)=><li key={`${index}-${objective}`} className="whitespace-pre-line break-words pl-1">{objective}</li>)}
        </ol>:<p className="mt-1 text-sm leading-6 text-[#526675]">No key objectives have been recorded yet.</p>}
      </div>
      <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 border-t border-[#e7ecf1] pt-3">
        <ContextDatum label="Delivery stage">{projectDeliveryStageLabel(project.delivery_stage)}</ContextDatum>
        <ContextDatum label="100% completion milestone">{projectTerminalIssueStatus(project.delivery_stage)}</ContextDatum>
      </dl>
    </>:<p className="text-sm leading-6 text-[#526279]">The project brief is currently unavailable.</p>}
  </DashboardPanel>;
}

function ContextDatum({label,children}:{label:string;children:React.ReactNode}){
  return <div className="min-w-0"><dt className="text-xs leading-5 text-[#526279]">{label}</dt><dd className="mt-1 break-words text-sm font-medium leading-6 text-[#10243e]">{children}</dd></div>;
}

export type EngineerProjectImpactSummaryProps={
  health:EngineerProgressHealth;
  projectActual:number;
  projectPlanned:number|null;
  engineerActual:number;
  engineerPlanned:number|null;
  engineerShare:number;
  contribution:number;
  expectedContribution:number|null;
  delayImpact:number|null;
};

const healthPresentation:Record<EngineerProgressHealth,{label:string;className:string}>={
  no_scope:{label:"Awaiting assignments",className:"bg-[#f0f3f7] text-[#526279]"},
  on_track:{label:"On track",className:"bg-[#eef3fa] text-[#10243e]"},
  at_risk:{label:"Due soon",className:"bg-[#fff2e9] text-[#934018]"},
  lagging:{label:"Needs attention",className:"bg-[#fff0eb] text-[#9b3824]"},
};

function displayNumber(value:number|null){
  return value!==null&&Number.isFinite(value)?new Intl.NumberFormat("en-GB",{maximumFractionDigits:1}).format(value):"N/A";
}

/** Presentation only: the caller supplies the existing authorised aggregate values. */
export function EngineerProjectImpactSummary({health,projectActual,projectPlanned,engineerActual,engineerPlanned,engineerShare,contribution,expectedContribution,delayImpact}:EngineerProjectImpactSummaryProps){
  const presentation=healthPresentation[health];
  return <DashboardPanel id="project-impact" title="My project impact" action={<span className={`rounded-full px-2.5 py-1 text-xs font-medium ${presentation.className}`}>{health==="on_track"&&engineerPlanned===null?"Plan unavailable":presentation.label}</span>}>
    {health==="no_scope"&&<p className="text-sm leading-6 text-[#526279]">No MDR deliverables are assigned to you yet.</p>}
    <div className="grid min-w-0 gap-x-5 gap-y-4 sm:grid-cols-2 @min-[52rem]:grid-cols-4">
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
        <p className={`mt-1 text-xl font-semibold leading-8 tabular-nums ${delayImpact!==null&&delayImpact>0?"text-[#9b3824]":"text-[#10243e]"}`}>{displayNumber(delayImpact)} <span className="text-xs font-medium">percentage points</span></p>
        <p className="mt-1 text-xs leading-5 text-[#526279]">A progress gap, not a measured schedule delay in days.</p>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-x-1 border-t border-[#e7ecf1] pt-3 text-xs leading-5 text-[#526279]">
      <span>DCC-accepted progress · Approved weighted milestone baseline</span>
      <HelpTip kind="info" label="About the approved baseline">Expected progress uses the Project Manager’s approved weighted milestone baseline, shared with the S-curve and reports. N/A means no approved matching plan is available; accepted progress is unchanged.</HelpTip>
    </div>
  </DashboardPanel>;
}

function AcceptedProgress({label,actual,planned}:{label:string;actual:number;planned:number|null}){
  const accessibleValue=Number.isFinite(actual)?Math.max(0,Math.min(100,actual)):0;
  return <div className="min-w-0">
    <h3 className="text-xs font-medium leading-5 text-[#526279]">{label} · DCC accepted</h3>
    <p className="mt-1 text-xl font-semibold leading-8 tabular-nums text-[#10243e]">{displayNumber(actual)}%</p>
    {Number.isFinite(actual)&&<progress aria-label={`${label} DCC-accepted progress`} max={100} value={accessibleValue} className="mt-2 block h-2 w-full appearance-none overflow-hidden rounded-full bg-[#e3e9f1] text-[#10243e] [&::-moz-progress-bar]:bg-[#10243e] [&::-webkit-progress-bar]:bg-[#e3e9f1] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[#10243e]"/>}
    <p className="mt-2 text-xs leading-5 text-[#526279]">Approved plan: {displayNumber(planned)}{planned===null?"":"%"}</p>
  </div>;
}
