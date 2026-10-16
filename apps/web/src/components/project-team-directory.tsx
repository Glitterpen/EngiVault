"use client";

import {useId,useState} from "react";
import {Search,ShieldCheck,UserCog,Users,X} from "lucide-react";
import {setMemberDiscipline,setMemberRole} from "@/app/app/workflow-actions";
import {can,canInviteProjectRole,canRemoveProjectMember,invitableProjectRoles} from "@/lib/permissions";
import {disciplineLabel} from "@/lib/project-disciplines";
import {ProjectMemberRemove} from "@/components/project-member-remove";

export type ProjectTeamMember={user_id:string;display_name:string;email:string;role:string;disciplines:string[]};
type Props={organisationId:string;projectId:string;members:ProjectTeamMember[];disciplines:{code:string;name:string}[];role:string;currentUserId:string;emptyMessage:string};

export function ProjectTeamDirectory({organisationId,projectId,members,disciplines,role,currentUserId,emptyMessage}:Props){
  const id=useId();
  const [search,setSearch]=useState("");
  const query=search.trim().toLocaleLowerCase();
  const visible=members.filter(member=>`${member.display_name} ${member.email} ${roleLabel(member.role)} ${member.disciplines.join(" ")}`.toLocaleLowerCase().includes(query));
  const allowedRoles=invitableProjectRoles(role);
  const canManageEngineers=can(role,"engineers:manage");

  return <section aria-labelledby={`${id}-heading`} className="ev-card min-w-0 overflow-hidden">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e7ecef] px-4 py-3 sm:px-5"><h2 id={`${id}-heading`} className="text-base font-semibold">Active team members</h2><span className="text-xs text-[#526675]">{members.length} active</span></header>
    <div data-preview-safe className="min-w-0 border-b border-[#e7ecef] px-4 py-3 sm:px-5">
      <label htmlFor={`${id}-search`} className="ev-label">Search team members</label><div className="relative mt-1 min-w-0"><Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 text-[#526675]"/><input id={`${id}-search`} type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Name, email, role or discipline" className="ev-input min-w-0 pl-10"/></div>
      <p role="status" className="mt-2 text-xs text-[#526675]">{visible.length} of {members.length} members</p>
    </div>
    <ul aria-label="Active project team" className="divide-y divide-[#e7ecef]">{visible.map(member=>{
      const canEditRole=canInviteProjectRole(role,member.role);
      const canRemove=member.user_id!==currentUserId&&canRemoveProjectMember(role,member.role);
      const canEditDisciplines=member.role==="engineer"&&canManageEngineers;
      return <li key={member.user_id} className="min-w-0 px-4 py-4 sm:px-5"><article aria-labelledby={`${id}-${member.user_id}`} className="min-w-0">
        <div className="flex min-w-0 items-start gap-3"><span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eef4f1] text-sm font-semibold text-[#0c5b45]">{(member.display_name||member.email).trim().charAt(0).toLocaleUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"><h3 id={`${id}-${member.user_id}`} className="min-w-0 max-w-full text-sm font-semibold [overflow-wrap:anywhere]">{member.display_name}</h3><span className="rounded-full bg-[#f0f3f6] px-2 py-0.5 text-xs font-medium text-[#405566]">{roleLabel(member.role)}</span></div><p className="mt-1 text-sm text-[#526675] [overflow-wrap:anywhere]">{member.email}</p>
          {member.role==="engineer"&&<div className="mt-2 flex min-w-0 flex-wrap gap-1.5" aria-label={`Authorised disciplines for ${member.display_name}`}>{member.disciplines.length?member.disciplines.map(discipline=><span key={discipline} className="inline-flex min-w-0 max-w-full items-start gap-1.5 rounded-lg bg-[#eef4f1] px-2 py-1 text-xs text-[#0c5b45]"><ShieldCheck size={13} aria-hidden="true" className="mt-0.5 shrink-0"/><span className="min-w-0 [overflow-wrap:anywhere]">{discipline}</span></span>):<span className="text-xs font-medium text-[#a5452f]">No discipline assigned</span>}</div>}
        </div></div>
        {(canEditRole||canEditDisciplines)&&<details className="mt-3 min-w-0 rounded-xl border border-[#e7ecef]" onInvalidCapture={event=>{event.currentTarget.open=true;}}>
          <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-medium text-[#405566]">Manage access<span className="sr-only"> for {member.display_name}</span></summary>
          <div className="min-w-0 space-y-4 border-t border-[#e7ecef] p-3 sm:p-4">
            {canEditRole&&<div className="flex min-w-0 flex-wrap items-end justify-between gap-3"><form action={setMemberRole} aria-label={`Update project role for ${member.display_name}`} className="flex w-full min-w-0 flex-wrap items-end gap-2 sm:w-auto"><Hidden organisationId={organisationId} projectId={projectId}/><input type="hidden" name="userId" value={member.user_id}/><label className="min-w-0 flex-1 sm:w-56"><span className="ev-label">Project role</span><select className="ev-input min-w-0" name="role" defaultValue={member.role}>{allowedRoles.map(value=><option key={value} value={value}>{roleLabel(value)}</option>)}</select></label><button className="ev-button-secondary min-h-11 w-full sm:w-auto"><UserCog size={16} aria-hidden="true"/> Update role</button></form>{canRemove&&<ProjectMemberRemove organisationId={organisationId} projectId={projectId} member={{userId:member.user_id,name:member.display_name,role:member.role}}/>}</div>}
            {canEditDisciplines&&<div className="min-w-0 space-y-3">
              {member.disciplines.length>0&&<div className="flex min-w-0 flex-wrap gap-2">{member.disciplines.map(discipline=><form action={setMemberDiscipline} key={discipline} className="max-w-full"><Hidden organisationId={organisationId} projectId={projectId}/><input type="hidden" name="userId" value={member.user_id}/><input type="hidden" name="discipline" value={discipline}/><input type="hidden" name="enabled" value="false"/><button className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-[#dce5df] px-3 text-xs text-[#0c5b45] hover:bg-[#eef4f1]" aria-label={`Remove ${discipline} access from ${member.display_name}`}><span className="min-w-0 [overflow-wrap:anywhere]">{discipline}</span><X size={15} aria-hidden="true" className="shrink-0"/></button></form>)}</div>}
              <form action={setMemberDiscipline} aria-label={`Add authorised discipline for ${member.display_name}`} className="flex min-w-0 flex-wrap items-end gap-2"><Hidden organisationId={organisationId} projectId={projectId}/><input type="hidden" name="userId" value={member.user_id}/><input type="hidden" name="enabled" value="true"/><label className="min-w-0 flex-1 sm:max-w-sm"><span className="ev-label">Add authorised discipline</span><select className="ev-input min-w-0" name="discipline" required defaultValue=""><option value="" disabled>Select discipline</option>{disciplines.map(item=><option key={item.name} value={item.name}>{disciplineLabel(item)}</option>)}</select></label><button className="ev-button-secondary min-h-11 w-full sm:w-auto" disabled={!disciplines.length}>Add discipline</button>{!disciplines.length&&<p className="w-full text-xs text-[#a5452f]">Configure an active MDR discipline category first.</p>}</form>
            </div>}
          </div>
        </details>}
      </article></li>;
    })}</ul>
    {!visible.length&&<div className="px-4 py-8 text-center sm:px-5"><Users size={23} aria-hidden="true" className="mx-auto text-[#657889]"/><p className="mt-3 text-sm text-[#526675]">{members.length?"No team members match your search.":emptyMessage}</p>{members.length>0&&<button type="button" data-preview-safe onClick={()=>setSearch("")} className="ev-button-secondary mt-3 min-h-11 w-full sm:w-auto">Clear team search</button>}</div>}
  </section>;
}

function Hidden({organisationId,projectId}:{organisationId:string;projectId:string}){return <><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/></>}
function roleLabel(role:string){return role==="project_admin"?"Project Manager":role==="document_controller"?"Document Controller":role==="engineer"?"Discipline Engineer":role.replaceAll("_"," ");}
