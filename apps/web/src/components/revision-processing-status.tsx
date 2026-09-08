"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { customerErrorMessage, processingFailureMessage } from "@/lib/customer-messages";

type Run={state:string;attempt:number;error_code:string|null;metrics:Record<string,unknown>|null;updated_at:string};
type Status={revisionState:string;run:Run|null};

export function RevisionProcessingStatus({endpoint,initialRevisionState,initialRun,canRetry}:{endpoint:string;initialRevisionState:string;initialRun:Run|null;canRetry:boolean}) {
  const router=useRouter();
  const [status,setStatus]=useState<Status>({revisionState:initialRevisionState,run:initialRun});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const inFlight=useRef(false);
  const refreshedState=useRef(initialRevisionState);
  const active=["quarantined","processing","queued"].includes(status.revisionState)||["queued","processing"].includes(status.run?.state??"");
  const load=useCallback(async(signal?:AbortSignal)=>{
    if(inFlight.current)return;
    inFlight.current=true;
    try {
      const response=await fetch(endpoint,{cache:"no-store",signal});
      if(!response.ok)throw new Error("Processing status could not be checked. Please refresh shortly.");
      const payload=await response.json() as Status;
      if(signal?.aborted)return;
      setStatus(payload);setMessage("");
      if(payload.revisionState!==refreshedState.current&&["ready","failed","superseded"].includes(payload.revisionState)) {
        refreshedState.current=payload.revisionState;
        router.refresh();
      }
    } catch(error) {
      if(!signal?.aborted)setMessage(customerErrorMessage(error,"Processing status could not be checked. Please refresh shortly."));
    } finally {inFlight.current=false;}
  },[endpoint,router]);
  useEffect(()=>{
    const controller=new AbortController();
    const initial=window.setTimeout(()=>{void load(controller.signal)},0);
    if(!active)return()=>{controller.abort();window.clearTimeout(initial)};
    const timer=window.setInterval(()=>{if(document.visibilityState!=="hidden")void load(controller.signal)},5000);
    const focus=()=>{void load(controller.signal)};
    window.addEventListener("focus",focus);
    return()=>{controller.abort();window.clearTimeout(initial);window.clearInterval(timer);window.removeEventListener("focus",focus)};
  },[active,load]);
  async function retry(){
    setBusy(true);setMessage("");
    try {
      const response=await fetch(endpoint,{method:"POST"});
      const body=await response.json();
      if(!response.ok)throw new Error(body?.error?.message??"Retry failed.");
      refreshedState.current="quarantined";
      setStatus({revisionState:"quarantined",run:null});
      setMessage("Retry queued. Status will update automatically.");
    } catch(error){setMessage(customerErrorMessage(error,"Retry failed."))}
    finally{setBusy(false)}
  }
  return <div className="mt-2 flex flex-wrap items-center gap-2">
    <span className="rounded-full bg-[#eef4f1] px-2.5 py-1 text-xs font-semibold capitalize">{(status.run?.state??status.revisionState).replaceAll("_"," ")}</span>
    {active&&<span className="inline-flex items-center gap-1 text-xs text-[#617083]"><RefreshCw size={12} className="animate-spin"/> Updating automatically</span>}
    <button type="button" onClick={()=>{void load();router.refresh()}} className="rounded-lg border border-[#d8e0dc] px-2.5 py-1 text-xs font-semibold">Refresh status</button>
    {canRetry&&["failed","dead_letter"].includes(status.run?.state??"")&&<button type="button" onClick={retry} disabled={busy} className="rounded-lg border border-[#d8e0dc] px-2.5 py-1 text-xs font-semibold text-[#0c5b45] disabled:opacity-50">{busy?"Queueing…":"Retry processing"}</button>}
    {status.run?.error_code&&<p className="w-full text-xs text-[#a5452f]">{processingFailureMessage(status.run.error_code)}{active&&" Another processing attempt is queued."}</p>}
    {message&&<span className="text-xs text-[#617083]" role="status">{message}</span>}
  </div>;
}
