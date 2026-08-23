"use client";
import Link from "next/link";
import {useActionState} from "react";
import type {AuthState} from "@/app/(auth)/actions";

export function AuthForm({mode,action,resendAction,resetAction,next,accessDenied=false,notice}:{mode:"login"|"register";action:(s:AuthState,d:FormData)=>Promise<AuthState>;resendAction:(s:AuthState,d:FormData)=>Promise<AuthState>;resetAction:(s:AuthState,d:FormData)=>Promise<AuthState>;next?:string;accessDenied?:boolean;notice?:string}){
  const [state,formAction,pending]=useActionState(action,undefined);
  const [resendState,resendFormAction,resendPending]=useActionState(resendAction,undefined);
  const [resetState,resetFormAction,resetPending]=useActionState(resetAction,undefined);
  const registering=mode==="register";
  const invitation=next?.startsWith("/invite/")??false;
  const organisationRegistration=registering&&!invitation;
  const alternateBase=registering?"/login":"/register";
  const alternateHref=next?`${alternateBase}?next=${encodeURIComponent(next)}`:alternateBase;
  return <div className="w-full max-w-md">
    <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#e8733f]">{organisationRegistration?"Organisation onboarding":invitation?"Project invitation":"Organisation-controlled access"}</p>
    <h2 className="mt-3 text-3xl font-semibold tracking-[-.04em] text-[#10243e]">{organisationRegistration?"Register your organisation":registering?"Create your invited account":"Sign in to EngiCite"}</h2>
    <p className="mt-2 text-sm leading-6 text-[#617083]">{organisationRegistration?"Create the organisation owner account and private company workspace. Project Managers, Document Controllers and Discipline Engineers join only through organisation-controlled invitations.":invitation?(registering?"Use the exact work email that received your project invitation. Your assigned role and discipline will be applied automatically.":"Sign in with the exact work email that received your project invitation."):"Open the secure workspace assigned to you as an Organisation Administrator, Project Manager, Document Controller or Discipline Engineer. Your role and discipline control what you can see and do."}</p>
    {accessDenied&&<div className="mt-5 rounded-xl border border-[#efc7bb] bg-[#fff7f4] p-3 text-sm leading-6 text-[#8b3d1f]">This account has no active EngiCite organisation or authorised project role. Ask your Organisation Administrator to send an invitation.</div>}
    {notice&&<div className="mt-5 rounded-xl border border-[#b9d9cb] bg-[#eff8f4] p-3 text-sm leading-6 text-[#0c5b45]" role="status">{notice}</div>}
    <form action={formAction} className="mt-8 space-y-5">
      {next&&<input type="hidden" name="next" value={next}/>}
      {registering&&<Field label="Full name" name="name" autoComplete="name" error={state?.errors?.name?.[0]}/>}
      {organisationRegistration&&<><Field label="Organisation name" name="organisationName" autoComplete="organization" error={state?.errors?.organisationName?.[0]}/><Field label="Organisation URL name" name="organisationSlug" hint="Lowercase letters, numbers and hyphens, e.g. north-field-engineering" error={state?.errors?.organisationSlug?.[0]}/></>}
      <Field label="Work email" name="email" type="email" autoComplete="email" hint={organisationRegistration?"Use an email not already registered with EngiCite. Existing Organisation Administrators should sign in instead.":undefined} error={state?.errors?.email?.[0]??resendState?.errors?.email?.[0]??resetState?.errors?.email?.[0]}/>
      <Field label="Password" name="password" type="password" autoComplete={registering?"new-password":"current-password"} hint={registering?"Minimum 12 characters":undefined} error={state?.errors?.password?.[0]}/>
      {state?.message&&<div className="rounded-xl border border-[#d3ddd8] bg-[#eef4f1] p-3 text-sm" role="status">{state.message}</div>}
      {resendState?.message&&<div className="rounded-xl border border-[#d3ddd8] bg-[#eef4f1] p-3 text-sm" role="status">{resendState.message}</div>}
      {resetState?.message&&<div className="rounded-xl border border-[#d3ddd8] bg-[#eef4f1] p-3 text-sm" role="status">{resetState.message}</div>}
      <button className="ev-button w-full" disabled={pending}>{pending?"Please wait…":organisationRegistration?"Register organisation":registering?"Create invited account":"Sign in"}</button>
      <div className="rounded-xl border border-[#dfe7e3] bg-[#f8faf9] p-3">
        <p className="text-xs font-bold uppercase tracking-[.12em] text-[#10243e]">Need help signing in?</p>
        <p className="mt-1 text-xs leading-5 text-[#617083]">Enter the exact work email above, then choose the help you need.</p>
        <button className="ev-button-secondary mt-3 w-full justify-center" type="submit" formAction={resetFormAction} formNoValidate disabled={pending||resendPending||resetPending}>{resetPending?"Requesting password reset...":"Forgot password?"}</button>
        <button className="mt-2 w-full rounded-lg px-3 py-2 text-xs font-bold text-[#0c5b45] hover:bg-[#eaf3ef] disabled:opacity-50" type="submit" formAction={resendFormAction} formNoValidate disabled={pending||resendPending||resetPending}>{resendPending?"Requesting verification...":"Account not verified? Resend verification"}</button>
      </div>
    </form>
    <p className="mt-6 text-center text-sm text-[#617083]">{registering?"Already registered? ":invitation?"Opening an invitation for the first time? ":"Setting up EngiCite for a company? "}<Link className="font-bold text-[#e8733f] hover:underline" href={alternateHref}>{registering?"Sign in":invitation?"Create invited account":"Register an organisation"}</Link></p>
  </div>;
}

function Field({label,name,type="text",autoComplete,hint,error}:{label:string;name:string;type?:string;autoComplete?:string;hint?:string;error?:string}){
  return <label className="block"><span className="ev-label">{label}</span><input className="ev-input" name={name} type={type} autoComplete={autoComplete} required aria-invalid={!!error}/>{(error||hint)&&<span className={`mt-1.5 block text-xs ${error?"text-red-700":"text-[#617083]"}`}>{error||hint}</span>}</label>;
}
