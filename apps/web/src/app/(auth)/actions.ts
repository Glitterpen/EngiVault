"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { message?: string; errors?: Record<string,string[]> } | undefined;
const email = z.string().trim().toLowerCase().email("Enter a valid email address.");
const password = z.string().min(12,"Use at least 12 characters.").max(128);
const loginSchema = z.object({ email, password: z.string().min(1,"Enter your password.") });
const registerSchema = z.object({ name:z.string().trim().min(2).max(80), email, password });

export async function login(_:AuthState, formData:FormData):Promise<AuthState> {
  const parsed=loginSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success) return {errors:parsed.error.flatten().fieldErrors};
  const supabase=await createClient();
  const {error}=await supabase.auth.signInWithPassword(parsed.data);
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
  const requestedNext=String(formData.get("next")??"");
  const destination=requestedNext.startsWith("/app")&&!requestedNext.startsWith("//")?requestedNext:"/app";
  redirect(destination);
}
export async function register(_:AuthState, formData:FormData):Promise<AuthState> {
  const parsed=registerSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success) return {errors:parsed.error.flatten().fieldErrors};
  const supabase=await createClient();
  const appUrl=process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
  const {error}=await supabase.auth.signUp({email:parsed.data.email,password:parsed.data.password,options:{data:{display_name:parsed.data.name},emailRedirectTo:`${appUrl}/auth/callback`}});
  if(error){
    const code=error.code??`http_${error.status}`;
    const guidance=code==="user_already_exists"?"An account already exists for this email. Use Sign in instead.":code==="email_address_invalid"?"Enter a valid deliverable email address.":code==="over_email_send_rate_limit"?"Email delivery is temporarily rate-limited. Wait a minute and try again.":"Registration could not be completed.";
    return {message:`${guidance} Reference: ${code}.`};
  }
  return {message:"Check your email to verify your account, then sign in."};
}
export async function signOut(){ const supabase=await createClient(); await supabase.auth.signOut(); redirect("/login"); }
