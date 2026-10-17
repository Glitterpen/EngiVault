import Link from "next/link";
import {redirect} from "next/navigation";
import {ArrowLeft,ClipboardCheck} from "lucide-react";
import {HelpTip} from "@/components/help-tip";
import {WorkspacePageHeading} from "@/components/workspace-page-heading";
import {requireProject} from "@/lib/auth";
import {invitableProjectRoles} from "@/lib/permissions";
import {ProjectInviteDialog} from "@/components/project-invite-dialog";
import {PendingProjectInvitations,type PendingProjectInvitation} from "@/components/pending-project-invitations";
import {ProjectDisciplineManager} from "@/components/project-discipline-manager";
import {ProjectTeamDirectory,type ProjectTeamMember} from "@/components/project-team-directory";
import {activeProjectResourcePlans} from "@/lib/project-resource-readiness";
import {ResourcePlanForm} from "@/components/project-management-forms";
import {projectHomePath,workspacePersona} from "@/lib/role-experience";

type Discipline={code:string;name:string;kind:string};
type Resource={id:string;discipline:string;required_count:number;notes:string|null};

export default async function TeamPage({params}:{params:Promise<{organisationId:string;projectId:string}>}){
  const {organisationId,projectId}=await params;
  const {supabase,user,access,preview}=await requireProject(organisationId,projectId);
  const role=String(access.role);
  const persona=workspacePersona(role);
  if(persona!=="management"&&persona!=="document_control")redirect(projectHomePath(organisationId,projectId,role));
  const isDcc=role==="document_controller";
  const isOrganisationAdmin=role==="organisation_admin";
  const allowedRoles=invitableProjectRoles(role);
  const [{data:team,error:teamError},{data:categoryRows,error:categoryError},{data:pendingRows,error:pendingError},{data:resourceRows,error:resourceError}]=await Promise.all([
    supabase.rpc("get_project_team",{target_organisation:organisationId,target_project:projectId}),
    supabase.rpc("get_project_document_categories",{target_organisation:organisationId,target_project:projectId}),
    allowedRoles.length?supabase.rpc("get_pending_project_invitations",{target_organisation:organisationId,target_project:projectId}):Promise.resolve({data:[],error:null}),
    supabase.from("project_resource_plans").select("id,discipline,required_count,notes").eq("organisation_id",organisationId).eq("project_id",projectId).order("discipline")
  ]);
  if(categoryError||resourceError)throw new Error("Project resource readiness could not be loaded. Please retry.");
  if(teamError||pendingError)throw new Error("Project team details could not be loaded. Please retry.");
  const allMembers=(team??[]) as ProjectTeamMember[];
  const members=isDcc?allMembers.filter(member=>member.role==="engineer"):isOrganisationAdmin?allMembers.filter(member=>member.role==="project_admin"||member.role==="document_controller"):allMembers;
  const disciplines=((categoryRows??[]) as Discipline[]).filter(item=>item.kind==="discipline");
  const {data:removedRows,error:removedError}=role==="project_admin"?await supabase.from("project_disciplines").select("name,code").eq("organisation_id",organisationId).eq("project_id",projectId).eq("is_active",false).order("name"): {data:[],error:null};
  if(removedError)throw new Error("Project discipline settings could not be loaded. Please contact EngiCite support.");
  const removedDisciplines=(removedRows??[]).map(item=>({name:item.name,code:item.code??""}));
  const resources=activeProjectResourcePlans((resourceRows??[]) as Resource[],disciplines);
  const pending=((pendingRows??[]) as PendingProjectInvitation[]).filter(invitation=>allowedRoles.some(allowedRole=>allowedRole===invitation.project_role));
  const workspaceTitle=isDcc?"Discipline engineers":isOrganisationAdmin?"Project leadership appointments":"Project team & resources";
  const context=isDcc?"Appointed engineers and authorised disciplines":isOrganisationAdmin?"Project Manager and Document Controller appointments":"People, discipline coverage and project resource planning";
  const activeEngineers=allMembers.filter(member=>member.role==="engineer");
  const requiredPositions=resources.reduce((sum,resource)=>sum+resource.required_count,0);
  const coverage=resources.map(resource=>{const assigned=activeEngineers.filter(member=>member.disciplines.some(discipline=>sameDiscipline(discipline,resource.discipline))).length;return {...resource,assigned,gap:Math.max(0,resource.required_count-assigned)};});
  const vacancies=coverage.reduce((sum,resource)=>sum+resource.gap,0);
  const guidance=isDcc?"Assign deliverables from the MDR after an engineer joins. The Project Manager manages engineer invitations and discipline access.":isOrganisationAdmin?"Invite a Project Manager or Document Controller using the appointment button. The Project Manager invites discipline engineers.":"Invite an engineer for one or more disciplines using the same work email. Use Manage access to change an existing member’s role or disciplines.";

  return <div className="mx-auto min-w-0 max-w-[1500px] space-y-5">
    <Link href={isDcc?`/app/${organisationId}/projects/${projectId}/control`:`/app/${organisationId}/projects/${projectId}/overview`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#10243e]"><ArrowLeft size={16} aria-hidden="true"/> {isDcc?"Document control centre":"Project overview"}</Link>
    <WorkspacePageHeading title={workspaceTitle} context={context} help={<HelpTip label="Project team and resources guidance">{guidance}</HelpTip>} actions={<>{allowedRoles.length>0&&<ProjectInviteDialog organisationId={organisationId} projectId={projectId} disciplines={disciplines} allowedRoles={allowedRoles} label={isOrganisationAdmin?"Appoint Project Manager or DCC":"Invite discipline engineer"}/>} {isDcc&&<Link href={`/app/${organisationId}/projects/${projectId}/reviews`} className="ev-button-secondary min-h-11"><ClipboardCheck size={16} aria-hidden="true"/> Review submissions</Link>}</>}/>

    <section aria-label="Team summary" className={`grid divide-x divide-[#e7ecef] overflow-hidden rounded-2xl border border-[#e0e7ec] bg-white ${role==="project_admin"?"grid-cols-2 sm:grid-cols-4":allowedRoles.length?"grid-cols-2":"grid-cols-1"}`}>
      <TeamMetric label="Active members" value={members.length}/>
      {allowedRoles.length>0&&<TeamMetric label="Pending invitations" value={pending.length}/>}
      {role==="project_admin"&&<><TeamMetric label="Planned positions" value={requiredPositions}/><TeamMetric label="Unfilled positions" value={vacancies}/></>}
    </section>

    {allowedRoles.length>0&&(pending.length>0?<PendingProjectInvitations organisationId={organisationId} projectId={projectId} invitations={pending}/>:<details className="ev-card min-w-0"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-[#405566] sm:px-5">Pending invitations <span className="ml-2 text-xs font-normal text-[#526675]">0 awaiting acceptance</span></summary><p className="border-t border-[#e7ecef] px-4 py-3 text-sm text-[#526675] sm:px-5">No invitations are awaiting acceptance. Invite a team member using the invitation button above.</p></details>)}

    <ProjectTeamDirectory organisationId={organisationId} projectId={projectId} members={members} disciplines={disciplines} role={role} currentUserId={user.id} emptyMessage={isDcc?"No discipline engineers have joined this project yet.":isOrganisationAdmin?"No Project Manager or Document Controller has joined this project yet.":"No active project members."}/>

    {role==="project_admin"&&<>
      <article aria-labelledby="team-resource-readiness" className="ev-card min-w-0 overflow-hidden">
        <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-[#e7ecef] px-4 py-3 sm:px-5"><div className="flex min-w-0 items-center gap-1.5"><h2 id="team-resource-readiness" className="text-base font-semibold">Discipline resource readiness</h2><HelpTip label="Resource coverage">Planned positions compared with engineers who have accepted their invitation. A person authorised for multiple disciplines counts in each matching discipline.</HelpTip></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${!coverage.length?"bg-[#f0f3f6] text-[#405566]":vacancies?"bg-[#fff0e9] text-[#a5452f]":"bg-[#eef3fa] text-[#10243e]"}`}>{!coverage.length?"No requirements":vacancies?`${vacancies} position${vacancies===1?"":"s"} open`:"Fully resourced"}</span></header>
        <div className="grid gap-px bg-[#e7ecef] lg:grid-cols-2">{coverage.length?coverage.map(resource=><section key={resource.id} aria-label={`${resource.discipline} resource coverage`} className="min-w-0 bg-white px-4 py-3 sm:px-5"><div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold [overflow-wrap:anywhere]">{resource.discipline}</h3><p className="mt-1 text-xs text-[#526675]">{resource.assigned} / {resource.required_count} active</p></div><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${resource.gap?"bg-[#fff0e9] text-[#a5452f]":"bg-[#eef3fa] text-[#10243e]"}`}>{resource.gap?`${resource.gap} open`:"Ready"}</span></div>{resource.notes&&<p className="mt-1.5 text-xs leading-5 text-[#526675] [overflow-wrap:anywhere]">{resource.notes}</p>}</section>):<p className="bg-white px-4 py-6 text-sm text-[#526675] sm:px-5 lg:col-span-2">No discipline requirements have been planned yet. Add a resource requirement below.</p>}</div>
        <details className="min-w-0 border-t border-[#e7ecef]"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-[#405566] sm:px-5">Plan discipline resources</summary><div className="border-t border-[#e7ecef] px-4 py-4 sm:px-5"><ResourcePlanForm organisationId={organisationId} projectId={projectId} disciplines={disciplines} embedded/></div></details>
      </article>
      <ProjectDisciplineManager organisationId={organisationId} projectId={projectId} disciplines={disciplines} removedDisciplines={removedDisciplines} readOnly={Boolean(preview)}/>
    </>}
  </div>;
}

function TeamMetric({label,value}:{label:string;value:number}){return <article className="min-w-0 px-4 py-3 sm:px-5"><p className="text-xs leading-5 text-[#526675]">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-[#10243e]">{value}</p></article>;}
function sameDiscipline(left:string,right:string){return left.trim().replaceAll(/\s+/g," ").toLocaleLowerCase("en")===right.trim().replaceAll(/\s+/g," ").toLocaleLowerCase("en");}
