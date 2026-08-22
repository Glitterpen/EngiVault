"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeAuthDestination } from "@/lib/auth-destination";
import { sanitiseEmailHeaderText } from "@/lib/email-sender";

export type AuthState = { message?: string; errors?: Record<string,string[]>; showResend?: boolean } | undefined;
const email = z.string().trim().toLowerCase().email("Enter a valid email address.");
const password = z.string().min(12,"Use at least 12 characters.").max(128);
const loginSchema = z.object({ email, password: z.string().min(1,"Enter your password.") });
const registerSchema = z.object({ name:z.string().trim().min(2).max(80), email, password });
const organisationRegisterSchema=registerSchema.extend({organisationName:z.string().trim().min(2).max(100),organisationSlug:z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(48)});
const passwordResetSchema=z.object({password,confirmPassword:z.string()}).refine(value=>value.password===value.confirmPassword,{message:"Passwords must match.",path:["confirmPassword"]});
const invitationDestination=/^\/invite\/([a-f0-9]{64})$/i;
const loginRoles=new Set(["organisation_admin","project_admin","document_controller","engineer"]);
type AccessError={code?:string;message?:string;details?:string;hint?:string};
const accessErrorSummary=(error:AccessError|null)=>error?{code:error.code,message:error.message,details:error.details,hint:error.hint}:null;

export async function login(_:AuthState, formData:FormData):Promise<AuthState> {
  const parsed=loginSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success) return {errors:parsed.error.flatten().fieldErrors};
  const supabase=await createClient();
  const {data:authentication,error}=await supabase.auth.signInWithPassword(parsed.data);
  if(error){
    const code=error.code??`http_${error.status}`;
    const guidance=code==="email_not_confirmed"
      ? "Your email has not been verified. Open the secure account-verification email sent for your organisation, then try again."
      : code==="invalid_credentials"
        ? "The email or password is incorrect. Check both entries and try again."
        : code==="user_banned"
          ? "This account is currently disabled. Contact an organisation administrator."
          : code==="over_request_rate_limit"
            ? "Too many sign-in attempts. Wait a few minutes and try again."
            : "Sign-in could not be completed. Try again shortly.";
    return {message:`${guidance} Reference: ${code}.`,showResend:code==="email_not_confirmed"};
  }
  const destination=safeAuthDestination(String(formData.get("next")??""));
  const invitation=destination.match(invitationDestination);
  if(invitation){
    const {data:validInvitation,error:invitationError}=await supabase.rpc("validate_project_invitation",{raw_token:invitation[1],candidate_email:parsed.data.email});
    if(invitationError||!validInvitation){await supabase.auth.signOut();return {message:"This invitation is expired, unavailable or addressed to a different account."}}
    redirect(destination);
  }
  const [{data:organisations,error:organisationError},{data:projects,error:projectError}]=await Promise.all([
    supabase.rpc("get_my_organisations"),
    supabase.from("project_access").select("role"),
  ]);
  if(organisationError||projectError){
    const reference=[organisationError?`org_${organisationError.code??"unknown"}`:null,projectError?`project_${projectError.code??"unknown"}`:null].filter(Boolean).join("_");
    console.error("[auth] Organisation access verification failed",{organisation:accessErrorSummary(organisationError),project:accessErrorSummary(projectError)});
    await supabase.auth.signOut();
    return {message:`Organisation access could not be verified. Try again shortly. Reference: ${reference}.`};
  }
  if(!organisations?.length){
    if(authentication.user?.user_metadata?.onboarding_mode==="organisation")redirect("/organisation/setup");
    await supabase.auth.signOut();
    return {message:"This account does not belong to an active EngiCite organisation. Ask an Organisation Administrator to send a controlled project invitation."};
  }
  const roles=[...(organisations??[]).map((item:{role:string})=>String(item.role)),...(projects??[]).map(item=>String(item.role))];
  if(!roles.some(role=>loginRoles.has(role))){
    if(authentication.user?.user_metadata?.onboarding_mode==="organisation")redirect("/organisation/setup");
    await supabase.auth.signOut();
    return {message:"This account has no active organisation or authorised project role. Ask your Organisation Administrator for an invitation."};
  }
  redirect(destination);
}
export async function register(_:AuthState, formData:FormData):Promise<AuthState> {
  const requestedDestination=safeAuthDestination(String(formData.get("next")??""));
  const invitation=requestedDestination.match(invitationDestination);
  const parsed=(invitation?registerSchema:organisationRegisterSchema).safeParse(Object.fromEntries(formData));
  if(!parsed.success) return {errors:parsed.error.flatten().fieldErrors};
  const supabase=await createClient();
  const appUrl=process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
  let invitationContext:{organisation_name:string;project_name:string}|null=null;
  if(invitation){
    const {data,error:invitationError}=await supabase
      .rpc("get_project_invitation_registration_context",{raw_token:invitation[1],candidate_email:parsed.data.email})
      .maybeSingle();
    if(invitationError||!data)return {message:"Account creation requires an active invitation addressed to this exact work email."};
    const trustedContext=data as {organisation_name:string;project_name:string};
    invitationContext={
      organisation_name:sanitiseEmailHeaderText(trustedContext.organisation_name,"Inviting organisation").slice(0,120),
      project_name:sanitiseEmailHeaderText(trustedContext.project_name,"Invited project").slice(0,160),
    };
  }
  const destination=invitation?requestedDestination:"/organisation/setup";
  const callbackUrl=new URL("/auth/callback",appUrl);
  callbackUrl.searchParams.set("next",destination);
  const organisationData=invitation
    ? {
        onboarding_mode:"project_invitation",
        inviting_organisation_name:invitationContext?.organisation_name,
        inviting_project_name:invitationContext?.project_name,
      }
    : {onboarding_mode:"organisation",organisation_name:(parsed.data as z.infer<typeof organisationRegisterSchema>).organisationName,organisation_slug:(parsed.data as z.infer<typeof organisationRegisterSchema>).organisationSlug};
  const {data,error}=await supabase.auth.signUp({email:parsed.data.email,password:parsed.data.password,options:{data:{display_name:parsed.data.name,...organisationData},emailRedirectTo:callbackUrl.toString()}});
  if(error){
    const code=error.code??`http_${error.status}`;
    const guidance=code==="user_already_exists"?"An account already exists for this email. Use Sign in instead.":code==="email_address_invalid"?"Enter a valid deliverable email address.":code==="over_email_send_rate_limit"?"Email delivery is temporarily rate-limited. Wait a minute and try again.":"Registration could not be completed.";
    return {message:`${guidance} Reference: ${code}.`};
  }
  if(data.session)redirect(destination);
  return {message:destination.startsWith("/invite/")
    ? `Check your email for a secure ${invitationContext?.organisation_name??"organisation"} account-verification message. Confirm it to join ${invitationContext?.project_name??"the invited project"}.`
    : "Check your work email to verify the organisation owner account, then complete the organisation profile and company logo.",showResend:true};
}
export async function resendVerification(_:AuthState,formData:FormData):Promise<AuthState>{
  const parsed=email.safeParse(formData.get("email"));
  if(!parsed.success)return {errors:{email:[parsed.error.issues[0]?.message??"Enter a valid email address."]},showResend:true};
  const requestedDestination=safeAuthDestination(String(formData.get("next")??""));
  const invitation=requestedDestination.match(invitationDestination);
  const supabase=await createClient();
  if(invitation){
    const {data,error:invitationError}=await supabase
      .rpc("get_project_invitation_registration_context",{raw_token:invitation[1],candidate_email:parsed.data})
      .maybeSingle();
    if(invitationError||!data)return {message:"A verification email can only be resent to the exact work email on an active project invitation.",showResend:true};
  }
  const destination=invitation?requestedDestination:"/organisation/setup";
  const appUrl=process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
  const callbackUrl=new URL("/auth/callback",appUrl);
  callbackUrl.searchParams.set("next",destination);
  const {error}=await supabase.auth.resend({type:"signup",email:parsed.data,options:{emailRedirectTo:callbackUrl.toString()}});
  if(error){
    const code=error.code??`http_${error.status}`;
    const guidance=code==="over_email_send_rate_limit"
      ? "A verification email was requested recently. Wait at least 60 seconds before trying again."
      : code==="email_address_invalid"
        ? "Enter the exact work email used to create the account."
        : "A fresh verification email could not be requested. Try again shortly.";
    return {message:`${guidance} Reference: ${code}.`,showResend:true};
  }
  return {message:"If this email belongs to an unconfirmed account, a fresh verification message will arrive shortly. If the account is already confirmed, use Sign in or request a password reset instead.",showResend:true};
}
export async function requestPasswordReset(_:AuthState,formData:FormData):Promise<AuthState>{
  const parsed=email.safeParse(formData.get("email"));
  if(!parsed.success)return {errors:{email:[parsed.error.issues[0]?.message??"Enter a valid email address."]}};
  const requestedDestination=safeAuthDestination(String(formData.get("next")??""));
  const invitation=requestedDestination.match(invitationDestination);
  const supabase=await createClient();
  if(invitation){
    const {data,error:invitationError}=await supabase
      .rpc("get_project_invitation_registration_context",{raw_token:invitation[1],candidate_email:parsed.data})
      .maybeSingle();
    if(invitationError||!data)return {message:"Password recovery can only be requested for the exact work email on an active project invitation."};
  }
  const returnDestination=invitation?requestedDestination:"/app";
  const recoveryDestination=`/auth/update-password?next=${encodeURIComponent(returnDestination)}`;
  const appUrl=process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
  const callbackUrl=new URL("/auth/callback",appUrl);
  callbackUrl.searchParams.set("next",recoveryDestination);
  const {error}=await supabase.auth.resetPasswordForEmail(parsed.data,{redirectTo:callbackUrl.toString()});
  if(error){
    const code=error.code??`http_${error.status}`;
    const guidance=code==="over_email_send_rate_limit"
      ? "A recovery email was requested recently. Wait at least 60 seconds before trying again."
      : "A password-recovery email could not be requested. Try again shortly.";
    return {message:`${guidance} Reference: ${code}.`};
  }
  return {message:"If this email belongs to an EngiCite account, a secure password-reset link will arrive shortly. Check the inbox and spam folder."};
}
export async function updatePassword(_:AuthState,formData:FormData):Promise<AuthState>{
  const parsed=passwordResetSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return {errors:parsed.error.flatten().fieldErrors};
  const supabase=await createClient();
  const {data:{user},error:userError}=await supabase.auth.getUser();
  if(userError||!user)return {message:"This password-reset session is unavailable or has expired. Request a fresh recovery email."};
  const {error}=await supabase.auth.updateUser({password:parsed.data.password});
  if(error){
    const code=error.code??`http_${error.status}`;
    const guidance=code==="same_password"?"Choose a password you have not used for this account.":"The new password could not be saved. Try again shortly.";
    return {message:`${guidance} Reference: ${code}.`};
  }
  const destination=safeAuthDestination(String(formData.get("next")??""));
  await supabase.auth.signOut();
  const params=new URLSearchParams({password:"updated"});
  if(destination!=="/app")params.set("next",destination);
  redirect(`/login?${params.toString()}`);
}
export async function signOut(){ const supabase=await createClient(); await supabase.auth.signOut(); redirect("/login"); }
