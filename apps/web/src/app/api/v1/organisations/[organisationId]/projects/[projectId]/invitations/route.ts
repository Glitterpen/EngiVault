import { z } from "zod";
import { requireProject } from "@/lib/auth";
import {canInviteProjectRole} from "@/lib/permissions";
import { sendInvitationEmail } from "@/lib/invitation-email";
import { canonicalDiscipline } from "@/lib/discipline-access";
import { createInvitationToken } from "@/lib/invitation-token";

const schema=z.object({email:z.string().trim().toLowerCase().email(),role:z.enum(["project_admin","document_controller","engineer"]),discipline:z.string().trim().max(80).optional()}).superRefine((value,context)=>{if(value.role==="engineer"&&!value.discipline)context.addIssue({code:"custom",path:["discipline"],message:"An engineer discipline is required."})});

export async function POST(request:Request,ctx:{params:Promise<{organisationId:string;projectId:string}>}){
  const {organisationId,projectId}=await ctx.params;const {supabase,access}=await requireProject(organisationId,projectId);
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:{code:"VALIDATION_ERROR",message:"Invitation details are invalid."}},{status:422});
  const role=String(access.role);if(!canInviteProjectRole(role,parsed.data.role))return Response.json({error:{code:"FORBIDDEN",message:"Your role cannot appoint this project role."}},{status:403});
  let discipline:string|undefined;if(parsed.data.role==="engineer"){const {data:categoryRows}=await supabase.from("document_categories").select("name").eq("organisation_id",organisationId).eq("kind","discipline").eq("is_active",true);discipline=canonicalDiscipline((categoryRows??[]).map(row=>row.name),parsed.data.discipline??"");if(!discipline)return Response.json({error:{code:"INVALID_DISCIPLINE",message:"Select an active discipline from the organisation's MDR categories."}},{status:422})}
  const {raw,tokenHash,expiresAt}=await createInvitationToken();
  const {data,error}=await supabase.rpc("create_project_invitation",{target_organisation:organisationId,target_project:projectId,target_email:parsed.data.email,target_role:parsed.data.role,target_token_hash:tokenHash,target_expires_at:expiresAt,target_discipline:discipline??null}).single();
  if(error?.code==="23505")return Response.json({error:{code:"INVITATION_CONFLICT",message:"A pending invitation already exists for this address."}},{status:409});
  if(error)return Response.json({error:{code:"INVITATION_FAILED",message:`Invitation could not be created. Reference: ${error.code}.`}},{status:error.code==="42501"?403:500});
  const base=process.env.NEXT_PUBLIC_APP_URL??new URL(request.url).origin;
  // The raw token is returned exactly once for delivery by the transactional email adapter.
  const invitation=data as {invitation_id:string;email:string;project_role:string;expires_at:string};
  const acceptUrl=`${base}/invite/${raw}`;const [{data:project},{data:organisation}]=await Promise.all([
    supabase.from("projects").select("name,project_introduction,key_objectives,planned_start_date,planned_end_date").eq("organisation_id",organisationId).eq("id",projectId).single(),
    supabase.from("organisations").select("name").eq("id",organisationId).single()
  ]);
  const delivery=await sendInvitationEmail({to:invitation.email,acceptUrl,projectName:project?.name??"your EngiCite project",organisationName:organisation?.name,projectIntroduction:project?.project_introduction,keyObjectives:project?.key_objectives,plannedStart:project?.planned_start_date,plannedEnd:project?.planned_end_date,role:invitation.project_role,discipline});
  return Response.json({invitation:{id:invitation.invitation_id,email:invitation.email,project_role:invitation.project_role,expires_at:invitation.expires_at},delivery:{acceptUrl,emailSent:delivery.sent}},{status:201});
}
