"use server";

import {cookies} from "next/headers";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requireUser} from "@/lib/auth";
import {ADMIN_PREVIEW_COOKIE} from "@/lib/admin-preview";
import {createAdminClient} from "@/lib/supabase/admin";
import {processQueuedIdentityPurges} from "@/lib/identity-purge";
import {serviceFailureMessage} from "@/lib/customer-messages";

export type AccountDeletionState={ok:boolean;message:string}|undefined;

export async function deleteRemovedMemberAccount(_previous:AccountDeletionState,form:FormData):Promise<AccountDeletionState>{
  if((await cookies()).has(ADMIN_PREVIEW_COOKIE))return {ok:false,message:"Exit read-only preview before managing accounts."};
  const parsed=z.object({organisationId:z.uuid(),userId:z.uuid(),confirmationEmail:z.email(),acknowledge:z.literal("yes")}).safeParse(Object.fromEntries(form));
  if(!parsed.success)return {ok:false,message:"Enter the account email and confirm that a new account will be required."};
  const {organisationId,userId,confirmationEmail}=parsed.data;
  const {supabase,user}=await requireUser();
  if(user.id===userId)return {ok:false,message:"You cannot delete your own account here."};
  const {data:organisation,error:accessError}=await supabase.rpc("get_my_organisations").eq("organisation_id",organisationId).eq("role","organisation_admin").maybeSingle();
  if(accessError||!organisation)return {ok:false,message:"Organisation Administrator permission is required."};
  // Ensure the server can attempt deletion before permanently retiring access.
  let admin;try{admin=createAdminClient()}catch{return {ok:false,message:"Account deletion is temporarily unavailable. Contact EngiCite support."};}
  const {error}=await supabase.rpc("request_removed_member_account_deletion",{target_organisation:organisationId,target_user:userId,confirmation_email:confirmationEmail});
  if(error)return {ok:false,message:error.code==="22023"?"The confirmation email does not match this account.":serviceFailureMessage("Account deletion was not permitted. Refresh the list and check that all project appointments have been removed.",error)};
  let completed=false;
  try{completed=(await processQueuedIdentityPurges(admin,[userId])).completed===1;}catch{console.error("[account-deletion] Access revoked; identity cleanup queued for retry",{userId});}
  revalidatePath(`/app/${organisationId}`,"layout");
  return {ok:true,message:completed
    ?"Account deleted. The old login cannot be reused. A new invitation and account are required; project documents and audit history remain intact."
    :"Access has been revoked. Account deletion is queued for retry; wait until deletion is complete before sending a fresh invitation."};
}
