"use client";

import Link from "next/link";
import {useActionState} from "react";
import type {AuthState} from "@/app/(auth)/actions";

export function FounderLoginForm({
  action,
  resetAction,
  next,
  notice,
}:{
  action:(state:AuthState,data:FormData)=>Promise<AuthState>;
  resetAction:(state:AuthState,data:FormData)=>Promise<AuthState>;
  next?:string;
  notice?:string;
}){
  const [state,formAction,pending]=useActionState(action,undefined);
  const [resetState,resetFormAction,resetPending]=useActionState(resetAction,undefined);
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
      <button className="ev-button w-full" disabled={pending||resetPending}>{pending?"Verifying founder identity…":"Continue securely"}</button>
      <button className="ev-button-secondary w-full justify-center" type="submit" formAction={resetFormAction} formNoValidate disabled={pending||resetPending}>{resetPending?"Requesting password reset…":"Forgot password?"}</button>
    </form>
    <p className="mt-6 text-center text-xs leading-5 text-[#728093]">Organisation Administrator, Project Manager, Document Controller or Discipline Engineer? <Link href="/login" className="font-bold text-[#0c684e] hover:underline">Use organisation sign in</Link>.</p>
  </div>;
}

function Field({label,name,type,autoComplete,error}:{label:string;name:string;type:string;autoComplete:string;error?:string}){
  return <label className="block"><span className="ev-label">{label}</span><input className="ev-input" name={name} type={type} autoComplete={autoComplete} required aria-invalid={Boolean(error)}/>{error&&<span className="mt-1.5 block text-xs text-red-700">{error}</span>}</label>;
}
