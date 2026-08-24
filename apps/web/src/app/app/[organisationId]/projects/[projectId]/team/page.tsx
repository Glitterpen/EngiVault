import Link from "next/link";
import {redirect} from "next/navigation";
import {AlertTriangle,ArrowLeft,ClipboardCheck,Clock3,ShieldCheck,Target,UserCheck,UserCog,Users,X} from "lucide-react";
import {requireProject} from "@/lib/auth";
import {can,canInviteProjectRole,canRemoveProjectMember,invitableProjectRoles} from "@/lib/permissions";
import {setMemberDiscipline,setMemberRole} from "@/app/app/workflow-actions";
import {ProjectInviteDialog} from "@/components/project-invite-dialog";
import {PendingProjectInvitations,type PendingProjectInvitation} from "@/components/pending-project-invitations";
import {ProjectMemberRemove} from "@/components/project-member-remove";
import {ResourcePlanForm} from "@/components/project-management-forms";
import {projectHomePath,workspacePersona} from "@/lib/role-experience";

type Member={user_id:string;display_name:string;email:string;role:string;disciplines:string[]};
type Discipline={code:string;name:string};
type Resource={id:string;discipline:string;required_count:number;notes:string|null};

export default async function TeamPage({params}:{params:Promise<{organisationId:string;projectId:string}>}){
  const {organisationId,projectId}=await params;
  const {supabase,user,access}=await requireProject(organisationId,projectId);
  const role=String(access.role);
  const persona=workspacePersona(role);
  if(persona!=="management"&&persona!=="document_control")redirect(projectHomePath(organisationId,projectId,role));
  const isDcc=role==="document_controller";
  const isOrganisationAdmin=role==="organisation_admin";
  const allowedRoles=invitableProjectRoles(role);
  const canReview=isDcc;
  const canManageEngineers=can(role,"engineers:manage");
  const [{data:team},{data:categoryRows},{data:pendingRows},{data:resourceRows}]=await Promise.all([
    supabase.rpc("get_project_team",{target_organisation:organisationId,target_project:projectId}),
    supabase.from("document_categories").select("code,name").eq("organisation_id",organisationId).eq("kind","discipline").eq("is_active",true).order("sort_order"),
    allowedRoles.length?supabase.rpc("get_pending_project_invitations",{target_organisation:organisationId,target_project:projectId}):Promise.resolve({data:[]}),
    supabase.from("project_resource_plans").select("id,discipline,required_count,notes").eq("organisation_id",organisationId).eq("project_id",projectId).order("discipline")
  ]);
  const allMembers=(team??[]) as Member[];
  const members=isDcc?allMembers.filter(member=>member.role==="engineer"):isOrganisationAdmin?allMembers.filter(member=>member.role==="project_admin"||member.role==="document_controller"):allMembers;
  const disciplines=(categoryRows??[]) as Discipline[];
  const resources=(resourceRows??[]) as Resource[];
  const pending=((pendingRows??[]) as PendingProjectInvitation[]).filter(invitation=>allowedRoles.some(allowedRole=>allowedRole===invitation.project_role));
  const workspaceTitle=isDcc?"Discipline engineers":isOrganisationAdmin?"Project leadership appointments":"Project team & resources";
  const workspaceKicker=isDcc?"Document control resources":isOrganisationAdmin?"Organisation governance":"Project management resources";
  const activeEngineers=allMembers.filter(member=>member.role==="engineer");
  const requiredPositions=resources.reduce((sum,resource)=>sum+resource.required_count,0);
  const vacancies=resources.reduce((sum,resource)=>sum+Math.max(0,resource.required_count-activeEngineers.filter(member=>member.disciplines.some(discipline=>sameDiscipline(discipline,resource.discipline))).length),0);

  return <div className="mx-auto max-w-[1500px]">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href={isDcc?`/app/${organisationId}/projects/${projectId}/control`:`/app/${organisationId}/projects/${projectId}/overview`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45]"><ArrowLeft size={16}/> {isDcc?"Document control centre":"Project overview"}</Link>
      <div className="flex flex-wrap gap-2">{allowedRoles.length>0&&<ProjectInviteDialog organisationId={organisationId} projectId={projectId} disciplines={disciplines} allowedRoles={allowedRoles} label={isOrganisationAdmin?"Appoint Project Manager or DCC":"Invite discipline engineer"}/>} {canReview&&<Link href={`/app/${organisationId}/projects/${projectId}/reviews`} className="ev-button-secondary"><ClipboardCheck size={16}/> Review submissions</Link>}</div>
    </div>
    <p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">{workspaceKicker}</p>
    <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold"><Users/> {workspaceTitle}</h1>
    <p className="mt-2 max-w-4xl text-sm leading-6 text-[#617083]">{isDcc?"View discipline engineers already appointed by the Project Manager, then allocate their discipline deliverables from the Master Document Register. Document Control cannot create project invitations.":isOrganisationAdmin?"Appoint only the Project Manager and Document Controller. The Project Manager controls the wider team and discipline resource plan.":"Use this single workspace to plan discipline requirements, invite engineers, follow pending invitations and manage active project resources."}</p>

    <section className={`mt-6 grid gap-3 sm:grid-cols-2 ${role==="project_admin"?"xl:grid-cols-4":"xl:grid-cols-2"}`}>
      <TeamMetric label="Active members" value={members.length} icon={<UserCheck size={18}/>}/>
      <TeamMetric label="Pending invitations" value={pending.length} icon={<Clock3 size={18}/>} warn={pending.length>0}/>
      {role==="project_admin"&&<><TeamMetric label="Planned positions" value={requiredPositions} icon={<Target size={18}/>}/><TeamMetric label="Unfilled positions" value={vacancies} icon={<AlertTriangle size={18}/>} warn={vacancies>0}/></>}
    </section>

    {role==="project_admin"&&<section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
      <article className="ev-card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ef] px-5 py-4 sm:px-6"><div><h2 className="font-semibold">Discipline resource readiness</h2><p className="mt-1 text-xs leading-5 text-[#617083]">Planned positions compared with engineers who have accepted their invitation.</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${vacancies?"bg-[#fff0e9] text-[#a5452f]":"bg-[#e8f1ed] text-[#0c5b45]"}`}>{vacancies?`${vacancies} position${vacancies===1?"":"s"} open`:"Fully resourced"}</span></div><div className="grid gap-px bg-[#edf1ef] md:grid-cols-2">{resources.length?resources.map(resource=>{const assigned=activeEngineers.filter(member=>member.disciplines.some(discipline=>sameDiscipline(discipline,resource.discipline))).length;const gap=Math.max(0,resource.required_count-assigned);return <div className="bg-white p-5" key={resource.id}><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{resource.discipline}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${gap?"bg-[#fff0e9] text-[#a5452f]":"bg-[#e8f1ed] text-[#0c5b45]"}`}>{gap?`${gap} open`:"Ready"}</span></div><p className="mt-3 text-2xl font-semibold">{assigned}<span className="text-sm font-normal text-[#617083]"> / {resource.required_count} active</span></p>{resource.notes&&<p className="mt-2 text-xs leading-5 text-[#617083]">{resource.notes}</p>}</div>}):<p className="bg-white p-8 text-center text-sm text-[#617083] md:col-span-2">No discipline requirements have been planned yet. Add the first requirement using the form.</p>}</div></article>
      <ResourcePlanForm organisationId={organisationId} projectId={projectId} disciplines={disciplines}/>
    </section>}

    {allowedRoles.length>0&&<PendingProjectInvitations organisationId={organisationId} projectId={projectId} invitations={pending}/>}

    <div className="mt-8 flex items-end justify-between gap-3"><div><p className="ev-label">Accepted access</p><h2 className="mt-1 text-xl font-semibold">Active team members</h2></div><span className="text-xs font-semibold text-[#617083]">{members.length} active</span></div>
    <section className="mt-4 grid gap-4">
      {members.map(member=>{const canEditRole=canInviteProjectRole(role,member.role);const canRemove=member.user_id!==user.id&&canRemoveProjectMember(role,member.role);return <article className="ev-card p-5" key={member.user_id}>
        <div className="flex flex-wrap justify-between gap-3">
          <div><h2 className="font-semibold">{member.display_name}</h2><p className="mt-1 text-xs text-[#617083]">{member.email} · {member.role.replaceAll("_"," ")}</p></div>
          {member.role==="engineer"?<div className="flex flex-wrap justify-end gap-2">{member.disciplines?.length?member.disciplines.map(discipline=><div key={discipline} className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f1ed] px-3 py-1 text-xs font-semibold text-[#0c5b45]"><ShieldCheck size={13}/>{discipline}{canManageEngineers&&<form action={setMemberDiscipline}><Hidden organisationId={organisationId} projectId={projectId}/><input type="hidden" name="userId" value={member.user_id}/><input type="hidden" name="discipline" value={discipline}/><input type="hidden" name="enabled" value="false"/><button className="ml-1 grid size-5 place-items-center rounded-full hover:bg-[#cee0d8]" aria-label={`Remove ${discipline} access from ${member.display_name}`}><X size={12}/></button></form>}</div>):<span className="text-xs font-semibold text-[#a5452f]">No discipline assigned</span>}</div>:<span className="text-xs font-semibold capitalize text-[#0c5b45]">{member.role.replaceAll("_"," ")}</span>}
        </div>
        {canEditRole&&<div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-[#edf1ef] pt-4"><form action={setMemberRole} className="flex flex-wrap items-end gap-2"><Hidden organisationId={organisationId} projectId={projectId}/><input type="hidden" name="userId" value={member.user_id}/><label className="min-w-56"><span className="ev-label">Project role</span><select className="ev-input" name="role" defaultValue={member.role}>{allowedRoles.map(value=><option key={value} value={value}>{value==="project_admin"?"Project Manager":value==="document_controller"?"Document Controller":"Discipline Engineer"}</option>)}</select></label><button className="ev-button-secondary"><UserCog size={16}/> Update role</button></form>{canRemove&&<ProjectMemberRemove organisationId={organisationId} projectId={projectId} member={{userId:member.user_id,name:member.display_name,role:member.role}}/>}</div>}
        {member.role==="engineer"&&canManageEngineers&&<form action={setMemberDiscipline} className="mt-4 flex flex-wrap gap-2 border-t border-[#edf1ef] pt-4"><Hidden organisationId={organisationId} projectId={projectId}/><input type="hidden" name="userId" value={member.user_id}/><input type="hidden" name="enabled" value="true"/><select className="ev-input max-w-xs" name="discipline" required defaultValue=""><option value="" disabled>Add authorised discipline</option>{disciplines.map(item=><option key={item.code} value={item.name}>{item.code} — {item.name}</option>)}</select><button className="ev-button-secondary" disabled={!disciplines.length}>Add discipline</button>{!disciplines.length&&<p className="w-full text-xs text-[#a5452f]">Configure an active MDR discipline category first.</p>}</form>}
      </article>})}
      {!members.length&&<div className="ev-card p-10 text-center text-[#617083]">{isDcc?"No discipline engineers have joined this project yet.":isOrganisationAdmin?"No Project Manager or Document Controller has joined this project yet.":"No active project members."}</div>}
    </section>
  </div>;
}

function Hidden({organisationId,projectId}:{organisationId:string;projectId:string}){return <><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/></>}
function TeamMetric({label,value,icon,warn=false}:{label:string;value:number;icon:React.ReactNode;warn?:boolean}){return <article className="ev-card p-5"><span className={warn?"text-[#b6532b]":"text-[#e8733f]"}>{icon}</span><p className="mt-3 text-2xl font-semibold">{value}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#617083]">{label}</p></article>}
function sameDiscipline(left:string,right:string){return left.trim().replaceAll(/\s+/g," ").toLocaleLowerCase("en")===right.trim().replaceAll(/\s+/g," ").toLocaleLowerCase("en")}
