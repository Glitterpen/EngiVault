"use client";
import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/app/(auth)/actions";

export function AuthForm({mode,action}:{mode:"login"|"register";action:(s:AuthState,d:FormData)=>Promise<AuthState>}) {
  const [state,formAction,pending]=useActionState(action,undefined); const register=mode==="register";
  return <div className="w-full max-w-md"><p className="text-sm font-semibold uppercase tracking-[.16em] text-[#0c5b45]">Secure workspace</p><h2 className="mt-3 text-3xl font-semibold tracking-[-.035em]">{register?"Create your account":"Welcome back"}</h2><p className="mt-2 text-sm text-[#65736f]">{register?"Verify your email before creating an organisation.":"Sign in to your authorised organisations and projects."}</p>
    <form action={formAction} className="mt-8 space-y-5">{register&&<Field label="Full name" name="name" autoComplete="name" error={state?.errors?.name?.[0]}/>}<Field label="Work email" name="email" type="email" autoComplete="email" error={state?.errors?.email?.[0]}/><Field label="Password" name="password" type="password" autoComplete={register?"new-password":"current-password"} hint={register?"Minimum 12 characters":undefined} error={state?.errors?.password?.[0]}/>{state?.message&&<div className="rounded-xl border border-[#d3ddd8] bg-[#eef4f1] p-3 text-sm" role="status">{state.message}</div>}<button className="ev-button w-full" disabled={pending}>{pending?"Please wait…":register?"Create account":"Sign in"}</button></form>
    <p className="mt-6 text-center text-sm text-[#65736f]">{register?"Already registered? ":"New to EngiVault? "}<Link className="font-semibold text-[#0c5b45] hover:underline" href={register?"/login":"/register"}>{register?"Sign in":"Create account"}</Link></p></div>
}
function Field({label,name,type="text",autoComplete,hint,error}:{label:string;name:string;type?:string;autoComplete?:string;hint?:string;error?:string}){return <label className="block"><span className="ev-label">{label}</span><input className="ev-input" name={name} type={type} autoComplete={autoComplete} required aria-invalid={!!error}/>{(error||hint)&&<span className={`mt-1.5 block text-xs ${error?"text-red-700":"text-[#65736f]"}`}>{error||hint}</span>}</label>}
