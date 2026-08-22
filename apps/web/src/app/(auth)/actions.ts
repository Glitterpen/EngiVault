"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeAuthDestination } from "@/lib/auth-destination";

export type AuthState = { message?: string; errors?: Record<string,string[]> } | undefined;
const email = z.string().trim().toLowerCase().email("Enter a valid email address.");
const password = z.string().min(12,"Use at least 12 characters.").max(128);
const loginSchema = z.object({ email, password: z.string().min(1,"Enter your password.") });
const registerSchema = z.object({ name:z.string().trim().min(2).max(80), email, password });
const organisationRegisterSchema=registerSchema.extend({organisationName:z.string().trim().min(2).max(100),organisationSlug:z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(48)});
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
      ? "Your email has not been verified. Open the verification email from Supabase, then try again."
      : code==="invalid_credentials"
        ? "The email or password is incorrect. Check both entries and try again."
        : code==="user_banned"
          ? "This account is currently disabled. Contact an organisation administrator."
          : code==="over_request_rate_limit"
            ? "Too many sign-in attempts. Wait a few minutes and try again."
            : "Sign-in could not be completed. Try again shortly.";
    return {message:`${guidance} Reference: ${code}.`};
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
  if(invitation){
    const {data:validInvitation,error:invitationError}=await supabase.rpc("validate_project_invitation",{raw_token:invitation[1],candidate_email:parsed.data.email});
    if(invitationError||!validInvitation)return {message:"Account creation requires an active invitation addressed to this exact work email."};
  }
  const destination=invitation?requestedDestination:"/organisation/setup";
  const callbackUrl=new URL("/auth/callback",appUrl);
  callbackUrl.searchParams.set("next",destination);
  const organisationData=invitation?{}:{onboarding_mode:"organisation",organisation_name:(parsed.data as z.infer<typeof organisationRegisterSchema>).organisationName,organisation_slug:(parsed.data as z.infer<typeof organisationRegisterSchema>).organisationSlug};
  const {data,error}=await supabase.auth.signUp({email:parsed.data.email,password:parsed.data.password,options:{data:{display_name:parsed.data.name,...organisationData},emailRedirectTo:callbackUrl.toString()}});
  if(error){
    const code=error.code??`http_${error.status}`;
    const guidance=code==="user_already_exists"?"An account already exists for this email. Use Sign in instead.":code==="email_address_invalid"?"Enter a valid deliverable email address.":code==="over_email_send_rate_limit"?"Email delivery is temporarily rate-limited. Wait a minute and try again.":"Registration could not be completed.";
    return {message:`${guidance} Reference: ${code}.`};
  }
  if(data.session)redirect(destination);
  return {message:destination.startsWith("/invite/")?"Check your email to verify your invited account. The project invitation will continue automatically after verification.":"Check your work email to verify the organisation owner account, then complete the organisation profile and company logo."};
}
export async function signOut(){ const supabase=await createClient(); await supabase.auth.signOut(); redirect("/login"); }
