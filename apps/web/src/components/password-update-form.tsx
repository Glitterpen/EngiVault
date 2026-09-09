"use client";
import {HelpTip} from "@/components/help-tip";
import {useActionState} from "react";
import type {AuthState} from "@/app/(auth)/actions";

export function PasswordUpdateForm({action,next}:{action:(state:AuthState,data:FormData)=>Promise<AuthState>;next:string}){
  const [state,formAction,pending]=useActionState(action,undefined);
  return <form action={formAction} className="mt-8 space-y-5">
    <input type="hidden" name="next" value={next}/>
    <label className="block"><span className="ev-label">New password</span><input className="ev-input" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required aria-invalid={!!state?.errors?.password}/>{state?.errors?.password?.[0]&&<span className="mt-1.5 block text-xs text-red-700">{state.errors.password[0]}</span>}</label>
    <label className="block"><span className="ev-label">Confirm new password</span><input className="ev-input" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required aria-invalid={!!state?.errors?.confirmPassword}/>{state?.errors?.confirmPassword?.[0]&&<span className="mt-1.5 block text-xs text-red-700">{state.errors.confirmPassword[0]}</span>}</label>
    <HelpTip label="Password guidance">Use at least 12 characters. Avoid names, project codes and passwords used on other services.</HelpTip>
    {state?.message&&<div className="rounded-xl border border-[#efc7bb] bg-[#fff7f4] p-3 text-sm leading-6 text-[#8b3d1f]" role="alert">{state.message}</div>}
    <button className="ev-button w-full justify-center" disabled={pending}>{pending?"Saving new password...":"Save new password"}</button>
  </form>;
}
