import Link from "next/link";
import {redirect} from "next/navigation";
import {requireProject} from "@/lib/auth";
import {projectHomePath,workspacePersona} from "@/lib/role-experience";
import {EditableProjectBrief,ProjectIssueForm} from "@/components/project-management-forms";
import {RevisionCycleForm} from "@/components/revision-cycle-form";
import {ProjectOverviewWorkspace,type OverviewProject} from "@/components/project-overview-workspace";
import {setProjectIssueStatus} from "@/app/app/workflow-actions";
import {activeProjectResourcePlans} from "@/lib/project-resource-readiness";
import type {ProjectCategory} from "@/lib/project-disciplines";
import {buildProjectOverviewSummary,type OverviewProgressRow,type OverviewIssue,type OverviewResource,type OverviewMember} from "@/lib/project-overview-summary";

type ReadResult={data:unknown;error:unknown;count?:number|null};
const completeRead=(result:ReadResult)=>!result.error&&Array.isArray(result.data)&&(result.count==null||result.count===result.data.length);

export default async function ProjectOverview({params}:{params:Promise<{organisationId:string;projectId:string}>}){
  const {organisationId,projectId}=await params;
  const {supabase,access,preview}=await requireProject(organisationId,projectId);
  const role=String(access.role),canManage=role==="project_admin"&&!preview;
  if(workspacePersona(role)!=="management")redirect(projectHomePath(organisationId,projectId,role));
  const [projectResult,progressResult,issueResult,resourceResult,teamResult,categoryResult]=await Promise.all([
    supabase.from("projects").select("id,organisation_id,code,name,description,project_introduction,key_objectives,planned_start_date,planned_end_date,delivery_stage,revision_cycle_days").eq("organisation_id",organisationId).eq("id",projectId).single(),
    supabase.from("project_document_progress").select("progress_weight,progress_credit,overdue,uploaded",{count:"exact"}).eq("organisation_id",organisationId).eq("project_id",projectId).eq("lifecycle_status","active"),
    supabase.from("project_issues").select("id,title,description,severity,status,owner_name,due_date,created_at",{count:"exact"}).eq("organisation_id",organisationId).eq("project_id",projectId).order("created_at",{ascending:false}),
    supabase.from("project_resource_plans").select("id,discipline,required_count,notes",{count:"exact"}).eq("organisation_id",organisationId).eq("project_id",projectId).order("discipline"),
    supabase.rpc("get_project_team",{target_organisation:organisationId,target_project:projectId},{count:"exact"}),
    supabase.rpc("get_project_document_categories",{target_organisation:organisationId,target_project:projectId},{count:"exact"}),
  ]);
  if(projectResult.error||!projectResult.data)return <OverviewUnavailable organisationId={organisationId} projectId={projectId}/>;
  const project=projectResult.data as OverviewProject&{description:string|null;project_introduction:string|null;key_objectives:string[]|null};
  const progressAvailable=completeRead(progressResult),issuesAvailable=completeRead(issueResult),teamAvailable=completeRead(teamResult);
  const resourcesAvailable=completeRead(resourceResult)&&completeRead(categoryResult);
  const issues=issuesAvailable?issueResult.data as OverviewIssue[]:[];
  const resources=resourcesAvailable?activeProjectResourcePlans(resourceResult.data as OverviewResource[],categoryResult.data as ProjectCategory[]):[];
  const summary=buildProjectOverviewSummary(progressAvailable?progressResult.data as OverviewProgressRow[]:[],issues,resources,teamAvailable?teamResult.data as OverviewMember[]:[],{progress:progressAvailable,issues:issuesAvailable,resources:resourcesAvailable,team:teamAvailable});
  const partial=!progressAvailable||!issuesAvailable||!resourcesAvailable||!teamAvailable;
  return <ProjectOverviewWorkspace organisationId={organisationId} projectId={projectId} project={{code:project.code,name:project.name,planned_start_date:project.planned_start_date,planned_end_date:project.planned_end_date,delivery_stage:project.delivery_stage,revision_cycle_days:project.revision_cycle_days}} role={role} preview={Boolean(preview)} summary={summary} issues={issues} issuesAvailable={issuesAvailable} resourcesAvailable={resourcesAvailable}
    notice={partial?<div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e3ccb7] bg-[#fffaf5] px-4 py-3 text-sm text-[#7c431f]"><p>Some project summary data could not be loaded. Unavailable figures are not counted as zero.</p><Link className="inline-flex min-h-11 items-center rounded-lg font-semibold underline" href={`/app/${organisationId}/projects/${projectId}/overview`}>Retry overview</Link></div>:undefined}
    brief={<EditableProjectBrief organisationId={organisationId} projectId={projectId} introduction={project.project_introduction||project.description||""} objectives={project.key_objectives??[]} startDate={project.planned_start_date??""} endDate={project.planned_end_date??""} deliveryStage={project.delivery_stage} dccCount={summary.dcc} editable={canManage} embedded/>}
    revisionCycle={<RevisionCycleForm organisationId={organisationId} projectId={projectId} days={project.revision_cycle_days} readOnly={!canManage} embedded/>}
    issueForm={canManage?<ProjectIssueForm organisationId={organisationId} projectId={projectId} embedded/>:undefined} resolveIssueAction={setProjectIssueStatus}/>;
}

function OverviewUnavailable({organisationId,projectId}:{organisationId:string;projectId:string}){
  const base=`/app/${organisationId}/projects/${projectId}`;
  return <div className="mx-auto min-w-0 max-w-6xl"><Link href={`/app/${organisationId}`} className="inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-[#0c5b45]">Back to projects</Link><h1 className="mt-1 text-3xl font-semibold">Project overview</h1><section role="alert" className="mt-4 rounded-2xl border border-[#dde4eb] bg-white p-5"><h2 className="font-semibold">Project overview could not be loaded.</h2><p className="mt-2 text-sm text-[#526675]">Try again shortly. No project records have been changed.</p><Link href={`${base}/overview`} className="ev-button-secondary mt-4">Retry overview</Link></section></div>;
}
