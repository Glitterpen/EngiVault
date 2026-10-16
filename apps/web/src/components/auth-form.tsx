"use client";
import {HelpTip} from "@/components/help-tip";
import {PasswordInput} from "@/components/password-input";
import Link from "next/link";
import {useActionState,useEffect,useId,useRef,useState} from "react";
import {FieldWithHelp} from "@/components/field-with-help";
import type {AuthState} from "@/app/(auth)/actions";
import {AuthTurnstile} from "@/components/auth-turnstile";

export function AuthForm({mode,action,resendAction,resetAction,next,accessDenied=false,notice,captchaSiteKey}:{mode:"login"|"register";action:(s:AuthState,d:FormData)=>Promise<AuthState>;resendAction:(s:AuthState,d:FormData)=>Promise<AuthState>;resetAction:(s:AuthState,d:FormData)=>Promise<AuthState>;next?:string;accessDenied?:boolean;notice?:string;captchaSiteKey?:string}){
  const [state,formAction,pending]=useActionState(action,undefined);
  const [resendState,resendFormAction,resendPending]=useActionState(resendAction,undefined);
  const [resetState,resetFormAction,resetPending]=useActionState(resetAction,undefined);
  const [captchaToken,setCaptchaToken]=useState("");
  const [captchaResetKey,setCaptchaResetKey]=useState(0);
  const wasPending=useRef(false);
  const helpDisclosure=useRef<HTMLDetailsElement>(null);
  const titleId=useId();
  const registering=mode==="register";
  const invitation=next?.startsWith("/invite/")??false;
  const organisationRegistration=registering&&!invitation;
  const alternateBase=registering?"/login":"/register";
  const alternateHref=next?`${alternateBase}?next=${encodeURIComponent(next)}`:alternateBase;
  const busy=pending||resendPending||resetPending;
  const captchaRequired=Boolean(captchaSiteKey?.trim());
  const captchaIncomplete=captchaRequired&&!captchaToken;
  useEffect(()=>{
    if(wasPending.current&&!busy)setCaptchaResetKey(value=>value+1);
    wasPending.current=busy;
  },[busy]);
  useEffect(()=>{
    if(helpDisclosure.current&&(state?.showResend||resendState?.message||resendState?.errors?.email?.length))helpDisclosure.current.open=true;
  },[resendState,state?.showResend]);
  const securityCheck=<AuthTurnstile siteKey={captchaSiteKey} resetKey={captchaResetKey} onTokenChange={setCaptchaToken}/>;
  const nameField=<Field label="Full name" name="name" autoComplete="name" alignLabel={organisationRegistration} error={state?.errors?.name?.[0]}/>;
  const emailField=<Field label="Work email" name="email" type="email" autoComplete="email" hint={organisationRegistration?"Use an email not already registered with EngiCite. Existing Organisation Administrators should sign in instead.":undefined} error={state?.errors?.email?.[0]??resendState?.errors?.email?.[0]??resetState?.errors?.email?.[0]}/>;
  const passwordField=<Field label="Password" name="password" type="password" autoComplete={registering?"new-password":"current-password"} hint={registering?"Minimum 12 characters":undefined} error={state?.errors?.password?.[0]}/>;
  const recoveryAction=<button className="inline-flex min-h-11 max-w-full items-center justify-center rounded-lg px-3 text-sm font-medium text-[#0c5b45] hover:underline hover:underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50" type="submit" formAction={resetFormAction} formNoValidate disabled={busy||captchaIncomplete}>{resetPending?"Requesting password reset...":"Forgot password?"}</button>;
  return <div className={`w-full min-w-0 ${registering?"max-w-none":"max-w-md"}`}>
    <div className="flex min-w-0 items-start gap-2"><h1 id={titleId} className="min-w-0 text-2xl font-semibold leading-tight tracking-tight text-[#10243e] [overflow-wrap:anywhere] sm:text-[1.75rem]">{organisationRegistration?"Register your organisation":registering?"Create your invited account":"Welcome back"}</h1><span className="pt-0.5"><HelpTip label="Signing in and organisation registration">{organisationRegistration?"Create the organisation owner account and private company workspace. Team members and Executive Viewers join only through organisation-controlled invitations.":invitation?(registering?"Use the exact work email that received your invitation. Your approved access will be applied automatically.":"Sign in with the exact work email that received your invitation."):"Open your organisation-controlled workspace. Your assigned role determines what you can see and do; Executive Viewers have read-only access."}</HelpTip></span></div>
    <p className="mt-2 text-sm leading-6 text-[#526675]">{organisationRegistration?"Set up your workspace and owner account.":invitation?"Use the work email on your invitation.":"Sign in to your engineering workspace."}</p>

    {accessDenied&&<div className="mt-5 rounded-xl border border-[#efc7bb] bg-[#fff7f4] p-3 text-sm leading-6 text-[#8b3d1f]" role="alert">This account has no active EngiCite organisation or authorised project role. Ask your Organisation Administrator to send an invitation.</div>}
    {notice&&<div className="mt-5 rounded-xl border border-[#b9d9cb] bg-[#eff8f4] p-3 text-sm leading-6 text-[#0c5b45]" role="status">{notice}</div>}
    <form action={formAction} aria-labelledby={titleId} aria-busy={busy} className={registering?"mt-5 min-w-0 space-y-3":"mt-6 min-w-0 space-y-4"}>
      {next&&<input type="hidden" name="next" value={next}/>}
      {organisationRegistration?<>
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-semibold text-[#24384f]">Organisation</legend>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <Field label="Organisation name" name="organisationName" autoComplete="organization" alignLabel error={state?.errors?.organisationName?.[0]}/>
            <Field label="Organisation URL name" name="organisationSlug" hint="Lowercase letters, numbers and hyphens, e.g. north-field-engineering" error={state?.errors?.organisationSlug?.[0]}/>
          </div>
        </fieldset>
        <fieldset className="min-w-0 border-t border-[#e3e9e6] pt-3">
          <legend className="pr-3 text-sm font-semibold text-[#24384f]">Owner account</legend>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">{nameField}{emailField}<div className="min-w-0 sm:col-span-2">{passwordField}</div></div>
        </fieldset>
      </>:<>{registering&&nameField}{emailField}{passwordField}</>}
      {state?.message&&<div className="rounded-xl border border-[#d3ddd8] bg-[#eef4f1] p-3 text-sm leading-6" role={state.showLogin?"alert":"status"}>
        <p>{state.message}</p>
        {state.showLogin&&<div className="mt-3 border-t border-[#d3ddd8] pt-3">
          <p className="font-semibold">Already have an account? Do not wait for another email.</p>
          <p className="mt-1 text-xs leading-5">Verified accounts do not receive a second registration message. Sign in with this work email, or use Forgot password if needed.</p>
          <Link className="mt-2 inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-[#0c5b45] underline underline-offset-4 hover:text-[#084635]" href={alternateHref}>Sign in instead</Link>
        </div>}
      </div>}
      {resendState?.message&&<div className="rounded-xl border border-[#d3ddd8] bg-[#eef4f1] p-3 text-sm" role="status">{resendState.message}</div>}
      {resetState?.message&&<div className="rounded-xl border border-[#d3ddd8] bg-[#eef4f1] p-3 text-sm" role="status">{resetState.message}</div>}
      {captchaRequired?<div className="-mx-2 min-[360px]:mx-0">{securityCheck}</div>:securityCheck}
      <input type="hidden" name="captchaToken" value={captchaToken}/>
      <button className="ev-button min-h-11 w-full" disabled={busy||captchaIncomplete}>{pending?"Please wait…":organisationRegistration?"Register organisation":registering?"Create invited account":"Sign in"}</button>
      {!registering&&<div className="flex justify-center">{recoveryAction}</div>}
      <details ref={helpDisclosure} className="min-w-0 border-t border-[#e3e9e6]">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-[#526675]">{registering?"Need help registering?":"Need help signing in?"}</summary>
        <div className="pb-1">{registering&&<div className="mb-2 flex justify-center">{recoveryAction}</div>}<div className="flex items-center gap-2"><span className="text-xs leading-5 text-[#526675]">Verification email</span><HelpTip label="Sign-in help">Enter the exact work email above, then choose password reset or resend verification.</HelpTip></div>
          <button className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#dce2e9] px-3 py-2 text-sm font-medium text-[#0c5b45] hover:bg-[#f4f8f6] disabled:cursor-not-allowed disabled:opacity-50" type="submit" formAction={resendFormAction} formNoValidate disabled={busy||captchaIncomplete}>{resendPending?"Requesting verification...":"Account not verified? Resend verification"}</button>
        </div>
      </details>
    </form>
    <p className={`${registering?"mt-3":"mt-5"} text-center text-sm leading-6 text-[#526675]`}>{registering?"Already registered? ":invitation?"Opening an invitation for the first time? ":"Setting up EngiCite for a company? "}<Link className="inline-flex min-h-11 max-w-full items-center font-semibold text-[#0c5b45] underline-offset-4 hover:underline" href={alternateHref}>{registering?"Sign in":invitation?"Create invited account":"Register an organisation"}</Link></p>
  </div>;
}

function Field({label,name,type="text",autoComplete,hint,error,alignLabel=false}:{label:string;name:string;type?:string;autoComplete?:string;hint?:string;error?:string;alignLabel?:boolean}){
  const id=useId();
  const inputProps={id,className:"ev-input min-h-11 min-w-0",name,autoComplete,required:true,"aria-invalid":!!error,"aria-describedby":error?`${id}-error`:undefined};
  const input=type==="password"?<PasswordInput {...inputProps}/>:<input {...inputProps} type={type}/>;
  return <div className="min-w-0">{hint?<FieldWithHelp label={label} helpLabel={`${label} guidance`} help={hint}>{input}</FieldWithHelp>:<><label htmlFor={id} className={alignLabel?"ev-label sm:mb-2 sm:flex sm:min-h-11 sm:items-center md:min-h-8":"ev-label"}>{label}</label>{input}</>}{error&&<span id={`${id}-error`} className="mt-1.5 block text-xs leading-5 text-red-700" role="alert">{error}</span>}</div>;
}
