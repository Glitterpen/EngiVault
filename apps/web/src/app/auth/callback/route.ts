import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeAuthDestination } from "@/lib/auth-destination";
import {
  isPasswordRecoveryCallback,
  passwordRecoveryDestination,
  supportedEmailOtpType,
} from "@/lib/auth-email-callback";

export async function GET(request:Request){
  const url=new URL(request.url);
  const destination=safeAuthDestination(url.searchParams.get("next"));
  const code=url.searchParams.get("code");
  const tokenHash=url.searchParams.get("token_hash");
  const type=supportedEmailOtpType(url.searchParams.get("type"));
  const recovery=isPasswordRecoveryCallback(type,destination);
  const supabase=await createClient();
  const result=code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash&&type
      ? await supabase.auth.verifyOtp({token_hash:tokenHash,type})
      : {error:new Error("Missing authentication callback credentials")};
  if(result.error){
    const loginUrl=new URL("/login",url.origin);
    if(recovery)loginUrl.searchParams.set("password","unavailable");
    else loginUrl.searchParams.set("verification","unavailable");
    if(destination!=="/app")loginUrl.searchParams.set("next",destination);
    return NextResponse.redirect(loginUrl);
  }
  if(recovery)return NextResponse.redirect(new URL(passwordRecoveryDestination(destination),url.origin));
  await supabase.auth.signOut();
  const loginUrl=new URL("/login",url.origin);
  loginUrl.searchParams.set("verified","success");
  if(destination!=="/app")loginUrl.searchParams.set("next",destination);
  return NextResponse.redirect(loginUrl);
}

export async function POST(request:Request){
  const url=new URL(request.url);
  const formData=await request.formData();
  const destination=safeAuthDestination(String(formData.get("next")??""));
  const tokenHash=String(formData.get("token_hash")??"");
  const type=supportedEmailOtpType(String(formData.get("type")??""));
  const loginUrl=new URL("/login",url.origin);
  if(!tokenHash||type!=="recovery"){
    loginUrl.searchParams.set("password","unavailable");
    if(destination!=="/app")loginUrl.searchParams.set("next",destination);
    return NextResponse.redirect(loginUrl,303);
  }
  const supabase=await createClient();
  const {error}=await supabase.auth.verifyOtp({token_hash:tokenHash,type});
  if(error){
    loginUrl.searchParams.set("password","unavailable");
    if(destination!=="/app")loginUrl.searchParams.set("next",destination);
    return NextResponse.redirect(loginUrl,303);
  }
  return NextResponse.redirect(new URL(passwordRecoveryDestination(destination),url.origin),303);
}
