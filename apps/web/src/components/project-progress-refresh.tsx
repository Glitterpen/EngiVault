"use client";

import {useEffect,useRef,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {RefreshCw} from "lucide-react";

/** Refresh data only; never dispatch activity or touch the idle-session clock. */
export function ProjectProgressRefresh({asOf}:{asOf:string}){
  const router=useRouter(),[automatic,setAutomatic]=useState(true),[pending,startTransition]=useTransition();
  const pendingRef=useRef(false);
  useEffect(()=>{pendingRef.current=pending;},[pending]);
  useEffect(()=>{
    if(!automatic)return;
    const refresh=()=>{if(document.visibilityState==="visible"&&navigator.onLine&&!pendingRef.current)startTransition(()=>router.refresh());};
    const timer=window.setInterval(refresh,60000);
    document.addEventListener("visibilitychange",refresh);
    return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",refresh);};
  },[automatic,router]);
  const date=new Date(asOf),time=Number.isNaN(date.getTime())?"Unavailable":date.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"UTC"});
  return <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#526675]">
    <p>Updated <time dateTime={asOf}>{time} UTC</time></p>
    <label className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" data-preview-safe checked={automatic} onChange={event=>setAutomatic(event.target.checked)} className="size-4 accent-[#0c5b45]"/>Auto-refresh · 60s</label>
    <button type="button" data-preview-safe disabled={pending} onClick={()=>startTransition(()=>router.refresh())} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 font-semibold text-[#0c5b45] disabled:opacity-60"><RefreshCw size={15} aria-hidden="true" className={pending?"animate-spin motion-reduce:animate-none":""}/>{pending?"Refreshing…":"Refresh now"}</button>
  </div>;
}
