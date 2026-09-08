import { z } from "zod";
import { requireProject } from "@/lib/auth";
import {canInviteProjectRole} from "@/lib/permissions";
import { sendInvitationEmail } from "@/lib/invitation-email";
import { matchDiscipline, type ProjectCategory } from "@/lib/project-disciplines";
import { createInvitationToken } from "@/lib/invitation-token";

const schema=z.object({
  email:z.string().trim().toLowerCase().email(),
  role:z.enum(["project_admin","document_controller","engineer"]),
  // Keep the scalar field for existing clients during a rolling deployment.
  discipline:z.string().trim().min(1).max(80).optional(),
  disciplines:z.array(z.string().trim().min(1).max(80)).max(100).optional(),
}).superRefine((value,context)=>{
  if(value.discipline!==undefined&&value.disciplines!==undefined)context.addIssue({code:"custom",message:"Supply one discipline format only."});
  const selected=value.disciplines??(value.discipline?[value.discipline]:[]);
  if(value.role==="engineer"&&!selected.length)context.addIssue({code:"custom",path:["disciplines"],message:"Select at least one discipline."});
  if(value.role!=="engineer"&&selected.length)context.addIssue({code:"custom",path:["disciplines"],message:"Only engineers may have discipline scopes."});
});
type InvitationIdentity={organisation_name:string;project_name:string};

export async function POST(request:Request,ctx:{params:Promise<{organisationId:string;projectId:string}>}){
  const {organisationId,projectId}=await ctx.params;const {supabase,access}=await requireProject(organisationId,projectId);
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:{code:"VALIDATION_ERROR",message:"Invitation details are invalid."}},{status:422});
  const role=String(access.role);if(!canInviteProjectRole(role,parsed.data.role))return Response.json({error:{code:"FORBIDDEN",message:"Your role cannot appoint this project role."}},{status:403});
  let disciplines:string[]=[];
  if(parsed.data.role==="engineer"){
    const {data:categoryRows,error:categoryError}=await supabase.rpc("get_project_document_categories",{target_organisation:organisationId,target_project:projectId});
    if(categoryError)return Response.json({error:{code:"DISCIPLINES_UNAVAILABLE",message:"Project disciplines could not be loaded. Try again shortly."}},{status:503});
    const selected=parsed.data.disciplines??[parsed.data.discipline!];
    const resolved=selected.map(value=>matchDiscipline((categoryRows??[]) as ProjectCategory[],value));
    if(resolved.some(value=>!value))return Response.json({error:{code:"INVALID_DISCIPLINE",message:"Select available project disciplines. The Project Manager can add disciplines in Project team & resources."}},{status:422});
    disciplines=[...new Set(resolved as string[])];
  }
  const {raw,tokenHash,expiresAt}=await createInvitationToken();
  const {data,error}=await supabase.rpc("create_project_invitation_with_disciplines",{target_organisation:organisationId,target_project:projectId,target_email:parsed.data.email,target_role:parsed.data.role,target_token_hash:tokenHash,target_expires_at:expiresAt,target_disciplines:disciplines}).single();
  if(error?.code==="23505")return Response.json({error:{code:"INVITATION_CONFLICT",message:"A pending invitation already exists for this address."}},{status:409});
  if(error)return Response.json({error:{code:"INVITATION_FAILED",message:`Invitation could not be created. Reference: ${error.code}.`}},{status:error.code==="42501"?403:500});
  const base=process.env.NEXT_PUBLIC_APP_URL??new URL(request.url).origin;
  // The raw token is returned exactly once for delivery by the transactional email adapter.
  const invitation=data as {invitation_id:string;email:string;project_role:string;expires_at:string};
  const acceptUrl=`${base}/invite/${raw}`;const [{data:project},{data:invitationContext,error:identityError}]=await Promise.all([
    supabase.from("projects").select("name,project_introduction,key_objectives,planned_start_date,planned_end_date").eq("organisation_id",organisationId).eq("id",projectId).single(),
    supabase.rpc("get_project_invitation_registration_context",{raw_token:raw,candidate_email:invitation.email}).maybeSingle()
  ]);
  const identity=invitationContext as InvitationIdentity|null;
  if(identityError||!identity?.organisation_name)console.error("[invitation-email] Organisation identity unavailable",{code:identityError?.code??"missing_context",organisationId,projectId});
  const delivery=identity?.organisation_name
    ? await sendInvitationEmail({to:invitation.email,acceptUrl,projectName:identity.project_name??project?.name??"your project",organisationName:identity.organisation_name,projectIntroduction:project?.project_introduction,keyObjectives:project?.key_objectives,plannedStart:project?.planned_start_date,plannedEnd:project?.planned_end_date,role:invitation.project_role,disciplines}).catch(()=>({sent:false as const,reason:"provider_error" as const}))
    : {sent:false as const,reason:"identity_unavailable" as const};
  return Response.json({invitation:{id:invitation.invitation_id,email:invitation.email,project_role:invitation.project_role,expires_at:invitation.expires_at},delivery:{acceptUrl,emailSent:delivery.sent,reason:delivery.sent?undefined:delivery.reason}},{status:201});
}
