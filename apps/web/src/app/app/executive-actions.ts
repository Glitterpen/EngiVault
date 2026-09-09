"use server";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requireExecutiveAdministrator} from "@/lib/executive-admin";
import {createInvitationToken} from "@/lib/invitation-token";
import {sendInvitationEmail} from "@/lib/invitation-email";
import {supportReference} from "@/lib/customer-messages";

export type ExecutiveActionState={ok?:boolean;message:string;acceptUrl?:string}|undefined;
export async function inviteExecutive(_:ExecutiveActionState,form:FormData):Promise<ExecutiveActionState>{
  const parsed=z.object({organisationId:z.uuid(),email:z.string().trim().toLowerCase().email().max(254)}).safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"Enter a valid work email."};
  const {organisationId,email}=parsed.data;
  const {supabase,organisation}=await requireExecutiveAdministrator(organisationId);
  const appUrl=process.env.NEXT_PUBLIC_APP_URL;
  if(!appUrl||!/^https?:\/\//.test(appUrl))return {message:"Invitation delivery is unavailable. Please contact support."};
  const {raw,tokenHash,expiresAt}=await createInvitationToken();
  const {error}=await supabase.rpc("create_executive_invitation",{target_organisation:organisationId,target_email:email,target_token_hash:tokenHash,target_expires_at:expiresAt});
  if(error){
    if(error.code==="23505")return {message:"This account already has active executive access."};
    if(error.code==="23514")return {message:"Remove existing project appointments and pending project invitations before adding this account as an Executive Viewer."};
    if(error.code==="54000")return {message:"Too many invitations. Please wait before trying again."};
    return {message:`Executive invitation could not be created. Reference: ${supportReference(error.code)}.`};
  }
  const acceptUrl=new URL(`/invite/${raw}`,appUrl).toString();
  const delivered=await sendInvitationEmail({to:email,acceptUrl,organisationName:organisation.name,projectName:"Executive overview",role:"executive_viewer"}).catch(()=>({sent:false}));
  revalidatePath(`/app/${organisationId}/settings/executives`);
  return {ok:true,message:delivered.sent?"Private executive invitation emailed. The link expires in seven days.":"Private invitation created, but email delivery was unsuccessful. Send this one-time link securely to the invited person.",...(delivered.sent?{}:{acceptUrl})};
}
export async function revokeExecutive(_:ExecutiveActionState,form:FormData):Promise<ExecutiveActionState>{
  const parsed=z.object({organisationId:z.uuid(),id:z.uuid(),kind:z.enum(["member","invitation"]),confirmed:z.literal("true")}).safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"Confirm that you want to revoke this executive access or invitation."};
  const {organisationId,id,kind}=parsed.data;
  const {supabase}=await requireExecutiveAdministrator(organisationId);
  const {error}=await supabase.rpc("revoke_executive_access",{target_organisation:organisationId,target_id:id,target_kind:kind});
  if(error)return {message:`Executive access could not be revoked. Reference: ${supportReference(error.code)}.`};
  revalidatePath(`/app/${organisationId}`,"layout");
  return {ok:true,message:kind==="invitation"?"Invitation revoked. Its link can no longer be used.":"Executive access revoked. Existing sessions can no longer read this organisation's dashboard."};
}
