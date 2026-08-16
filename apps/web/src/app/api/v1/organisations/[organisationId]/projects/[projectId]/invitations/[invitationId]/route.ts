import {z} from "zod";
import {requireProject} from "@/lib/auth";
import {canInviteProjectRole} from "@/lib/permissions";

export async function DELETE(_request:Request,ctx:{params:Promise<{organisationId:string;projectId:string;invitationId:string}>}){
  const {organisationId,projectId,invitationId}=await ctx.params;
  const ids=z.object({organisationId:z.string().uuid(),projectId:z.string().uuid(),invitationId:z.string().uuid()}).safeParse({organisationId,projectId,invitationId});
  if(!ids.success)return Response.json({error:{code:"VALIDATION_ERROR",message:"Invitation reference is invalid."}},{status:422});

  const {supabase,access}=await requireProject(organisationId,projectId);
  const role=String(access.role);
  const {data:pendingInvitations}=await supabase.rpc("get_pending_project_invitations",{target_organisation:organisationId,target_project:projectId});
  const invitation=(pendingInvitations??[]).find((item:{invitation_id:string})=>item.invitation_id===invitationId) as {project_role:string}|undefined;
  if(!invitation||!canInviteProjectRole(role,String(invitation.project_role))){
    return Response.json({error:{code:"FORBIDDEN",message:"You do not have permission to delete project invitations."}},{status:403});
  }

  const {error}=await supabase.rpc("revoke_project_invitation",{
    target_organisation:organisationId,
    target_project:projectId,
    target_invitation:invitationId
  });
  if(error){
    const status=error.code==="42501"?403:error.code==="P0002"?404:500;
    return Response.json({error:{code:"DELETE_FAILED",message:`Invitation could not be deleted. Reference: ${error.code}.`}},{status});
  }
  return Response.json({message:"Invitation deleted. Its acceptance link can no longer be used."});
}
