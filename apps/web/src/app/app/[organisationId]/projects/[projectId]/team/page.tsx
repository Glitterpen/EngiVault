import Link from "next/link";
import {redirect} from "next/navigation";
import {ArrowLeft,ClipboardCheck,ShieldCheck,UserCog,Users,X} from "lucide-react";
import {requireProject} from "@/lib/auth";
import {can,canInviteProjectRole,invitableProjectRoles} from "@/lib/permissions";
import {setMemberDiscipline,setMemberRole} from "@/app/app/workflow-actions";
import {ProjectInviteDialog} from "@/components/project-invite-dialog";
import {PendingProjectInvitations,type PendingProjectInvitation} from "@/components/pending-project-invitations";
import {projectHomePath,workspacePersona} from "@/lib/role-experience";

type Member={user_id:string;display_name:string;email:string;role:string;disciplines:string[]};
type Discipline={code:string;name:string};

export default async function TeamPage({params}:{params:Promise<{organisationId:string;projectId:string}>}){
  const {organisationId,projectId}=await params;
  const {supabase,access}=await requireProject(organisationId,projectId);
  const role=String(access.role);
  const persona=workspacePersona(role);
  if(persona!=="management"&&persona!=="document_control")redirect(projectHomePath(organisationId,projectId,role));
  const isDcc=role==="document_controller";
  const isOrganisationAdmin=role==="organisation_admin";
  const allowedRoles=invitableProjectRoles(role);
  const canReview=isDcc;
  const canManageEngineers=can(role,"engineers:manage");
  const [{data:team},{data:categoryRows},{data:pendingRows}]=await Promise.all([
    supabase.rpc("get_project_team",{target_organisation:organisationId,target_project:projectId}),
    supabase.from("document_categories").select("code,name").eq("organisation_id",organisationId).eq("kind","discipline").eq("is_active",true).order("sort_order"),
    supabase.rpc("get_pending_project_invitations",{target_organisation:organisationId,target_project:projectId})
  ]);
  const allMembers=(team??[]) as Member[];
  const members=isDcc?allMembers.filter(member=>member.role==="engineer"):isOrganisationAdmin?allMembers.filter(member=>member.role==="project_admin"||member.role==="document_controller"):allMembers;
  const disciplines=(categoryRows??[]) as Discipline[];
  const pending=((pendingRows??[]) as PendingProjectInvitation[]).filter(invitation=>allowedRoles.some(allowedRole=>allowedRole===invitation.project_role));
  const workspaceTitle=isDcc?"Discipline engineers":isOrganisationAdmin?"Project leadership appointments":"Project team and role assignments";
  const workspaceKicker=isDcc?"Document control resources":isOrganisationAdmin?"Organisation governance":"Project management resources";

  return <div className="mx-auto max-w-6xl">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href={isDcc?`/app/${organisationId}/projects/${projectId}/control`:`/app/${organisationId}/projects/${projectId}/overview`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45]"><ArrowLeft size={16}/> {isDcc?"Document control centre":"Project overview"}</Link>
      <div className="flex flex-wrap gap-2">{allowedRoles.length>0&&<ProjectInviteDialog organisationId={organisationId} projectId={projectId} disciplines={disciplines} allowedRoles={allowedRoles} label={isDcc?"Invite discipline engineer":isOrganisationAdmin?"Appoint Project Manager or DCC":"Invite project resource"}/>} {canReview&&<Link href={`/app/${organisationId}/projects/${projectId}/reviews`} className="ev-button-secondary"><ClipboardCheck size={16}/> Review submissions</Link>}</div>
    </div>
    <p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">{workspaceKicker}</p>
    <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold"><Users/> {workspaceTitle}</h1>
    <p className="mt-2 text-sm text-[#617083]">{isDcc?"Invite engineers and control the disciplines where they may submit deliverables. Other management roles are intentionally hidden from this DCC view.":isOrganisationAdmin?"Appoint only the Project Manager and Document Controller. The Project Manager controls the wider team and discipline resource plan.":"Plan project resources and invite discipline engineers. Organisation leadership appoints the Project Manager and Document Controller."}</p>

    <PendingProjectInvitations organisationId={organisationId} projectId={projectId} invitations={pending}/>

    <div className="mt-8 flex items-end justify-between gap-3"><div><p className="ev-label">Accepted access</p><h2 className="mt-1 text-xl font-semibold">Active team members</h2></div><span className="text-xs font-semibold text-[#617083]">{members.length} active</span></div>
    <section className="mt-4 grid gap-4">
      {members.map(member=>{const canEditRole=canInviteProjectRole(role,member.role);return <article className="ev-card p-5" key={member.user_id}>
        <div className="flex flex-wrap justify-between gap-3">
          <div><h2 className="font-semibold">{member.display_name}</h2><p className="mt-1 text-xs text-[#617083]">{member.email} · {member.role.replaceAll("_"," ")}</p></div>
          {member.role==="engineer"?<div className="flex flex-wrap justify-end gap-2">{member.disciplines?.length?member.disciplines.map(discipline=><div key={discipline} className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f1ed] px-3 py-1 text-xs font-semibold text-[#0c5b45]"><ShieldCheck size={13}/>{discipline}{canManageEngineers&&<form action={setMemberDiscipline}><Hidden organisationId={organisationId} projectId={projectId}/><input type="hidden" name="userId" value={member.user_id}/><input type="hidden" name="discipline" value={discipline}/><input type="hidden" name="enabled" value="false"/><button className="ml-1 grid size-5 place-items-center rounded-full hover:bg-[#cee0d8]" aria-label={`Remove ${discipline} access from ${member.display_name}`}><X size={12}/></button></form>}</div>):<span className="text-xs font-semibold text-[#a5452f]">No discipline assigned</span>}</div>:<span className="text-xs font-semibold capitalize text-[#0c5b45]">{member.role.replaceAll("_"," ")}</span>}
        </div>
        {canEditRole&&<form action={setMemberRole} className="mt-4 flex flex-wrap items-end gap-2 border-t border-[#edf1ef] pt-4"><Hidden organisationId={organisationId} projectId={projectId}/><input type="hidden" name="userId" value={member.user_id}/><label className="min-w-56"><span className="ev-label">Project role</span><select className="ev-input" name="role" defaultValue={member.role}>{allowedRoles.map(value=><option key={value} value={value}>{value==="project_admin"?"Project Manager":value==="document_controller"?"Document Controller":"Discipline Engineer"}</option>)}</select></label><button className="ev-button-secondary"><UserCog size={16}/> Update role</button></form>}
        {member.role==="engineer"&&canManageEngineers&&<form action={setMemberDiscipline} className="mt-4 flex flex-wrap gap-2 border-t border-[#edf1ef] pt-4"><Hidden organisationId={organisationId} projectId={projectId}/><input type="hidden" name="userId" value={member.user_id}/><input type="hidden" name="enabled" value="true"/><select className="ev-input max-w-xs" name="discipline" required defaultValue=""><option value="" disabled>Add authorised discipline</option>{disciplines.map(item=><option key={item.code} value={item.name}>{item.code} — {item.name}</option>)}</select><button className="ev-button-secondary" disabled={!disciplines.length}>Add discipline</button>{!disciplines.length&&<p className="w-full text-xs text-[#a5452f]">Configure an active MDR discipline category first.</p>}</form>}
      </article>})}
      {!members.length&&<div className="ev-card p-10 text-center text-[#617083]">{isDcc?"No discipline engineers have joined this project yet.":isOrganisationAdmin?"No Project Manager or Document Controller has joined this project yet.":"No active project members."}</div>}
    </section>
  </div>;
}

function Hidden({organisationId,projectId}:{organisationId:string;projectId:string}){return <><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/></>}
