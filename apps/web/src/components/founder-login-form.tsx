"use client";

import Link from "next/link";
import {useActionState,useEffect,useRef,useState} from "react";
import type {AuthState} from "@/app/(auth)/actions";
import {AuthTurnstile} from "@/components/auth-turnstile";

export function FounderLoginForm({
  action,
  resetAction,
  next,
  notice,
  captchaSiteKey,
}:{
  action:(state:AuthState,data:FormData)=>Promise<AuthState>;
  resetAction:(state:AuthState,data:FormData)=>Promise<AuthState>;
  next?:string;
  notice?:string;
  captchaSiteKey?:string;
}){
  const [state,formAction,pending]=useActionState(action,undefined);
  const [resetState,resetFormAction,resetPending]=useActionState(resetAction,undefined);
  const [captchaToken,setCaptchaToken]=useState("");
  const [captchaResetKey,setCaptchaResetKey]=useState(0);
  const wasPending=useRef(false);
  const busy=pending||resetPending;
  const captchaIncomplete=Boolean(captchaSiteKey?.trim())&&!captchaToken;
  useEffect(()=>{
    if(wasPending.current&&!busy)setCaptchaResetKey(value=>value+1);
    wasPending.current=busy;
  },[busy]);
  return <div className="w-full max-w-md">
    <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#e8733f]">Restricted platform access</p>
    <h2 className="mt-3 text-3xl font-semibold tracking-[-.04em] text-[#10243e]">Founder Control Centre</h2>
    <p className="mt-2 text-sm leading-6 text-[#617083]">Sign in with the approved founder identity. This route is separate from organisation workspaces and requires authenticator verification before account oversight is opened.</p>
    {notice&&<div className="mt-5 rounded-xl border border-[#b9d9cb] bg-[#eff8f4] p-3 text-sm leading-6 text-[#0c5b45]" role="status">{notice}</div>}
    <form action={formAction} className="mt-8 space-y-5">
      <input type="hidden" name="next" value={next?.startsWith("/founder")?next:"/founder"}/>
      <Field label="Founder email" name="email" type="email" autoComplete="email" error={state?.errors?.email?.[0]??resetState?.errors?.email?.[0]}/>
      <Field label="Password" name="password" type="password" autoComplete="current-password" error={state?.errors?.password?.[0]}/>
      {state?.message&&<div className="rounded-xl border border-[#e3cbc5] bg-[#fff7f4] p-3 text-sm leading-6 text-[#7f3b26]" role="alert">{state.message}</div>}
      {resetState?.message&&<div className="rounded-xl border border-[#d3ddd8] bg-[#eef4f1] p-3 text-sm leading-6" role="status">{resetState.message}</div>}
      <AuthTurnstile siteKey={captchaSiteKey} resetKey={captchaResetKey} onTokenChange={setCaptchaToken}/>
      <input type="hidden" name="captchaToken" value={captchaToken}/>
      <button className="ev-button w-full" disabled={busy||captchaIncomplete}>{pending?"Verifying founder identity…":"Continue securely"}</button>
      <button className="ev-button-secondary w-full justify-center" type="submit" formAction={resetFormAction} formNoValidate disabled={busy||captchaIncomplete}>{resetPending?"Requesting password reset…":"Forgot password?"}</button>
    </form>
    <p className="mt-6 text-center text-xs leading-5 text-[#728093]">Organisation Administrator, Project Manager, Document Controller or Discipline Engineer? <Link href="/login" className="font-bold text-[#0c684e] hover:underline">Use organisation sign in</Link>.</p>
  </div>;
}

function Field({label,name,type,autoComplete,error}:{label:string;name:string;type:string;autoComplete:string;error?:string}){
  return <label className="block"><span className="ev-label">{label}</span><input className="ev-input" name={name} type={type} autoComplete={autoComplete} required aria-invalid={Boolean(error)}/>{error&&<span className="mt-1.5 block text-xs text-red-700">{error}</span>}</label>;
}
