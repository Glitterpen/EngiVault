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
  if(error) return {message:"Sign-in failed. Check your credentials and verification status."};
  redirect("/app");
}
export async function register(_:AuthState, formData:FormData):Promise<AuthState> {
  const parsed=registerSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success) return {errors:parsed.error.flatten().fieldErrors};
  const supabase=await createClient();
  const appUrl=process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const {error}=await supabase.auth.signUp({email:parsed.data.email,password:parsed.data.password,options:{data:{display_name:parsed.data.name},emailRedirectTo:`${appUrl}/auth/callback`}});
  if(error) return {message:"Registration could not be completed. Try again or contact support."};
  return {message:"Check your email to verify your account, then sign in."};
}
export async function signOut(){ const supabase=await createClient(); await supabase.auth.signOut(); redirect("/login"); }
