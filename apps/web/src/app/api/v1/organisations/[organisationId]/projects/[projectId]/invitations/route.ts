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
  const {data,error}=await supabase.from("invitations").insert({organisation_id:organisationId,project_id:projectId,email:parsed.data.email,project_role:parsed.data.role,token_hash:tokenHash,expires_at:expiresAt}).select("id,email,project_role,expires_at").single();
  if(error)return Response.json({error:{code:"INVITATION_CONFLICT",message:"A pending invitation already exists for this address."}},{status:409});
  const base=process.env.NEXT_PUBLIC_APP_URL??new URL(request.url).origin;
  // The raw token is returned exactly once for delivery by the transactional email adapter.
  return Response.json({invitation:data,delivery:{acceptUrl:`${base}/invite/${raw}`}},{status:201});
}
