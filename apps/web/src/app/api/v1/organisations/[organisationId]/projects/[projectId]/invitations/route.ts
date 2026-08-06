import { z } from "zod";
import { requireProject } from "@/lib/auth";
import { can } from "@/lib/permissions";

const schema=z.object({email:z.string().trim().toLowerCase().email(),role:z.enum(["project_admin","document_controller","engineer","viewer"])});
function hex(bytes:ArrayBuffer|Uint8Array){const view=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);return Array.from(view,b=>b.toString(16).padStart(2,"0")).join("")}

export async function POST(request:Request,ctx:{params:Promise<{organisationId:string;projectId:string}>}){
  const {organisationId,projectId}=await ctx.params;const {supabase,access}=await requireProject(organisationId,projectId);
  if(!can(String(access.role),"members:manage"))return Response.json({error:{code:"FORBIDDEN",message:"Project administration permission is required."}},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:{code:"VALIDATION_ERROR",message:"Invitation details are invalid."}},{status:422});
  const raw=hex(crypto.getRandomValues(new Uint8Array(32)));const tokenHash=hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw)));const expiresAt=new Date(Date.now()+7*86400_000).toISOString();
  const {data,error}=await supabase.rpc("create_project_invitation",{target_organisation:organisationId,target_project:projectId,target_email:parsed.data.email,target_role:parsed.data.role,target_token_hash:tokenHash,target_expires_at:expiresAt}).single();
  if(error?.code==="23505")return Response.json({error:{code:"INVITATION_CONFLICT",message:"A pending invitation already exists for this address."}},{status:409});
  if(error)return Response.json({error:{code:"INVITATION_FAILED",message:`Invitation could not be created. Reference: ${error.code}.`}},{status:error.code==="42501"?403:500});
  const base=process.env.NEXT_PUBLIC_APP_URL??new URL(request.url).origin;
  // The raw token is returned exactly once for delivery by the transactional email adapter.
  const invitation=data as {invitation_id:string;email:string;project_role:string;expires_at:string};
  return Response.json({invitation:{id:invitation.invitation_id,email:invitation.email,project_role:invitation.project_role,expires_at:invitation.expires_at},delivery:{acceptUrl:`${base}/invite/${raw}`}},{status:201});
}
