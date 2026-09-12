"use client";
import {UserPlus} from "lucide-react";
import {ProjectInvite,type InvitableRole} from "@/components/project-invite";
import {AppDialog} from "@/components/app-dialog";
type Discipline={code:string;name:string};
export function ProjectInviteDialog({organisationId,projectId,disciplines,allowedRoles,label="Invite member",lockedDiscipline}:{organisationId:string;projectId:string;disciplines:Discipline[];allowedRoles?:InvitableRole[];label?:string;lockedDiscipline?:string}) {
 return <AppDialog title="Invite project member" trigger={<><UserPlus size={16}/> {label}</>}><ProjectInvite organisationId={organisationId} projectId={projectId} disciplines={disciplines} allowedRoles={allowedRoles} lockedDiscipline={lockedDiscipline} bare/></AppDialog>;
}
