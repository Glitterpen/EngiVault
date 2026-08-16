import {z} from "zod";
import {requireProject} from "@/lib/auth";
import {can} from "@/lib/permissions";
import {sendInvitationEmail} from "@/lib/invitation-email";
import {createInvitationToken} from "@/lib/invitation-token";

type RenewedInvitation={
  invitation_id:string;
  email:string;
  project_role:string;
  discipline:string|null;
  expires_at:string;
  last_sent_at:string;
  send_count:number;
};

export async function POST(request:Request,ctx:{params:Promise<{organisationId:string;projectId:string;invitationId:string}>}){
  const {organisationId,projectId,invitationId}=await ctx.params;
  const ids=z.object({organisationId:z.string().uuid(),projectId:z.string().uuid(),invitationId:z.string().uuid()}).safeParse({organisationId,projectId,invitationId});
  if(!ids.success)return Response.json({error:{code:"VALIDATION_ERROR",message:"Invitation reference is invalid."}},{status:422});

  const {supabase,access}=await requireProject(organisationId,projectId);
  const role=String(access.role);
  if(!can(role,"members:manage")&&!can(role,"engineers:manage")){
    return Response.json({error:{code:"FORBIDDEN",message:"You do not have permission to resend project invitations."}},{status:403});
  }

  const {raw,tokenHash,expiresAt}=await createInvitationToken();
  const {data,error}=await supabase.rpc("renew_project_invitation",{
    target_organisation:organisationId,
    target_project:projectId,
    target_invitation:invitationId,
    target_token_hash:tokenHash,
    target_expires_at:expiresAt
  }).single();
  if(error){
    const status=error.code==="42501"?403:error.code==="P0002"?404:500;
    return Response.json({error:{code:"RESEND_FAILED",message:`Invitation could not be resent. Reference: ${error.code}.`}},{status});
  }

  const invitation=data as RenewedInvitation;
  const {data:project}=await supabase.from("projects").select("name,project_introduction,key_objectives,planned_start_date,planned_end_date").eq("organisation_id",organisationId).eq("id",projectId).single();
  const base=process.env.NEXT_PUBLIC_APP_URL??new URL(request.url).origin;
  const acceptUrl=`${base}/invite/${raw}`;
  const delivery=await sendInvitationEmail({
    to:invitation.email,
    acceptUrl,
    projectName:project?.name??"your EngiCite project",
    projectIntroduction:project?.project_introduction,
    keyObjectives:project?.key_objectives,
    plannedStart:project?.planned_start_date,
    plannedEnd:project?.planned_end_date,
    role:invitation.project_role,
    discipline:invitation.discipline??undefined,
    reminder:true
  }).catch(()=>({sent:false as const,reason:"provider_error" as const}));

  return Response.json({
    invitation,
    delivery:{acceptUrl,emailSent:delivery.sent},
    message:delivery.sent?"A fresh invitation link was emailed successfully.":"A fresh invitation link was created, but email delivery is not configured. Copy and send the secure link."
  });
}
