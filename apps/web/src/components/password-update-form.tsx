"use client";
import {HelpTip} from "@/components/help-tip";
import {PasswordInput} from "@/components/password-input";
import {useActionState,useId} from "react";
import type {AuthState} from "@/app/(auth)/actions";

export function PasswordUpdateForm({action,next}:{action:(state:AuthState,data:FormData)=>Promise<AuthState>;next:string}){
  const [state,formAction,pending]=useActionState(action,undefined);
  const id=useId();
  return <form action={formAction} className="mt-8 space-y-5">
    <input type="hidden" name="next" value={next}/>
    {(["password","confirmPassword"] as const).map(name=>{
      const label=name==="password"?"New password":"Confirm new password";
      const error=state?.errors?.[name]?.[0];
      return <div key={name}><label className="ev-label" htmlFor={`${id}-${name}`}>{label}</label><PasswordInput id={`${id}-${name}`} name={name} toggleLabel={label.toLowerCase()} autoComplete="new-password" minLength={12} maxLength={128} required aria-invalid={!!error} aria-describedby={error?`${id}-${name}-error`:undefined}/>{error&&<span id={`${id}-${name}-error`} className="mt-1.5 block text-xs text-red-700">{error}</span>}</div>;
    })}
    <HelpTip label="Password guidance">Use at least 12 characters. Avoid names, project codes and passwords used on other services.</HelpTip>
    {state?.message&&<div className="rounded-xl border border-[#efc7bb] bg-[#fff7f4] p-3 text-sm leading-6 text-[#8b3d1f]" role="alert">{state.message}</div>}
    <button className="ev-button w-full justify-center" disabled={pending}>{pending?"Saving new password...":"Save new password"}</button>
  </form>;
}
