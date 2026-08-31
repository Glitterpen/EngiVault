"use client";

import Link from "next/link";
import {ChevronDown,LogOut,ShieldCheck} from "lucide-react";
import {usePathname} from "next/navigation";
import {useEffect,useState} from "react";
import {signOut} from "@/app/(auth)/actions";

const projectPathPattern=new RegExp("^/app/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/projects/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})","i");

export function AccountMenu({email,initialRoleLabel,founderAccess=false}:{email:string;initialRoleLabel:string;founderAccess?:boolean}){
  const pathname=usePathname();
  const match=pathname.match(projectPathPattern);
  const organisationId=match?.[1];
  const projectId=match?.[2];
  const projectKey=organisationId&&projectId?`${organisationId}:${projectId}`:null;
  const [scopedRole,setScopedRole]=useState<{projectKey:string;label:string}|null>(null);
  const currentRoleLabel=scopedRole?.projectKey===projectKey?scopedRole.label:initialRoleLabel;
  const initial=(email[0]??"U").toUpperCase();

  useEffect(()=>{
    if(!organisationId||!projectId||!projectKey)return;
    const controller=new AbortController();
    fetch(`/api/v1/organisations/${organisationId}/projects/${projectId}/workspace-context`,{cache:"no-store",signal:controller.signal})
      .then(response=>response.ok?response.json():null)
      .then((context:{roleLabel?:string}|null)=>{if(context?.roleLabel)setScopedRole({projectKey,label:context.roleLabel})})
      .catch(()=>undefined);
    return()=>controller.abort();
  },[organisationId,projectId,projectKey]);

  return <details className="group relative">
    <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-[#e1e7ec] bg-[#f8fafb] py-1.5 pl-1.5 pr-2 text-[#58687b] transition hover:border-[#cbd7d1] hover:bg-white sm:gap-2 sm:pr-2.5" aria-label={`Open account details, ${currentRoleLabel}`}>
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#10243e] text-xs font-bold text-white">{initial}</span>
      <span className="hidden max-w-52 truncate text-xs font-bold text-[#35485d] sm:block">{currentRoleLabel}</span>
      <ChevronDown size={14} className="shrink-0 transition group-open:rotate-180"/>
    </summary>
    <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 overflow-hidden rounded-2xl border border-[#dce4ea] bg-white shadow-[0_18px_50px_rgba(16,36,62,.16)]">
      <div className="border-b border-[#edf1f4] p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#e8733f]">Signed-in account</p>
        <p className="mt-2 break-all text-sm font-semibold text-[#10243e]">{email}</p>
        <p className="mt-1 text-xs text-[#617083]">{currentRoleLabel}</p>
      </div>
      {founderAccess&&<div className="border-b border-[#edf1f4] p-2"><Link href="/founder" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#10243e] transition hover:bg-[#eef4f7]"><ShieldCheck size={16} className="text-[#e8733f]"/> Founder control centre</Link></div>}
      <form action={signOut} className="p-2">
        <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#58687b] transition hover:bg-[#fff3ed] hover:text-[#a5452f]">
          <LogOut size={16}/>
          Sign out
        </button>
      </form>
    </div>
  </details>;
}
