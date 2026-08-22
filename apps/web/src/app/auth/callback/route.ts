import { NextResponse } from "next/server"; import { createClient } from "@/lib/supabase/server"; import { safeAuthDestination } from "@/lib/auth-destination";
export async function GET(request:Request){
  const url=new URL(request.url);
  const destination=safeAuthDestination(url.searchParams.get("next"));
  const code=url.searchParams.get("code");
  if(!code){
    const loginUrl=new URL("/login",url.origin);
    loginUrl.searchParams.set("verification","unavailable");
    if(destination!=="/app")loginUrl.searchParams.set("next",destination);
    return NextResponse.redirect(loginUrl);
  }
  const supabase=await createClient();
  const {error}=await supabase.auth.exchangeCodeForSession(code);
  if(error){
    const loginUrl=new URL("/login",url.origin);
    loginUrl.searchParams.set("verification","unavailable");
    if(destination!=="/app")loginUrl.searchParams.set("next",destination);
    return NextResponse.redirect(loginUrl);
  }
  if(destination.startsWith("/auth/update-password"))return NextResponse.redirect(new URL(destination,url.origin));
  await supabase.auth.signOut();
  const loginUrl=new URL("/login",url.origin);
  loginUrl.searchParams.set("verified","success");
  if(destination!=="/app")loginUrl.searchParams.set("next",destination);
  return NextResponse.redirect(loginUrl);
}
