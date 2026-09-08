import "server-only";
import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {readAdminPreview} from "@/lib/admin-preview";
import {createMemberPreviewClient} from "@/lib/member-preview-client";

export const requireAuthenticatedUser=cache(async(loginPath="/login")=>{const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect(loginPath);return {supabase,user};});
export const requireUser=cache(async()=>{
 const authenticated=await requireAuthenticatedUser();
 const {data:organisations,error}=await authenticated.supabase.rpc("get_my_organisations").limit(1);
 if(error){console.error("[auth] Organisation membership verification failed",{code:error.code});redirect("/auth/access-denied")}
 if(!organisations?.length){
  if(authenticated.user.user_metadata?.onboarding_mode==="organisation")redirect("/organisation/setup");
  redirect("/auth/access-denied");
 }
 return authenticated;
});
export async function requireProject(orgId:string,projectId:string){
 const {supabase,user}=await requireUser();
 const {data}=await supabase.from("project_access").select("organisation_id,project_id,role").eq("organisation_id",orgId).eq("project_id",projectId).maybeSingle();
 if(!data)notFound();
 const {data:entitled,error:entitlementError}=await supabase.rpc("has_organisation_entitlement",{target_organisation:orgId});
 if(!entitlementError&&!entitled)redirect(`/app/${orgId}/subscription-required`);
 const actualRole=String(data.role);
 const requested=await readAdminPreview();
 if(requested&&(actualRole!=="organisation_admin"||requested.organisationId!==orgId||requested.projectId!==projectId))notFound();
 const preview=requested;
 return {supabase:preview?createMemberPreviewClient(supabase,preview):supabase,
   user:preview?{...user,id:preview.memberId,email:preview.email,user_metadata:{}}:user,
   actorUser:user,access:{...data,role:preview?.role??data.role},actualRole,preview};
}

// Global notifications use the selected project's member perspective in preview.
export async function requireNotificationUser(){
 const preview=await readAdminPreview();
 return preview?requireProject(preview.organisationId,preview.projectId):{...await requireUser(),preview:null};
}
