"use client";
import { customerErrorMessage } from "@/lib/customer-messages";

import {useRouter} from "next/navigation";
import {useId,useState} from "react";

export function RevisionCompare({endpoint,revisions}:{endpoint:string;revisions:{id:string;revision_code:string}[]}){
  const router=useRouter();
  const id=useId();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function compare(formData:FormData){
    setBusy(true);setMessage("Comparing extracted engineering content…");
    try{
      const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({baseRevisionId:formData.get("base"),targetRevisionId:formData.get("target")})});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error?.message??"Comparison failed.");
      router.push(`${endpoint.replace('/api/v1/organisations','/app').replace('/comparisons','')}/comparisons/${body.comparisonId}`)
    }catch(error){setMessage(customerErrorMessage(error,"Comparison failed."))}
    finally{setBusy(false)}
  }
  if(revisions.length<2)return null;
  return <form action={compare} aria-label="Compare revisions" className="min-w-0">
    <div className="grid gap-3 sm:grid-cols-2">
      <label htmlFor={`${id}-base`} className="block min-w-0 text-sm font-medium text-[#405566]">Base revision
        <select id={`${id}-base`} name="base" className="ev-input mt-1.5 min-h-11 w-full min-w-0" required defaultValue={revisions[0].id}>{revisions.map(r=><option key={r.id} value={r.id}>Base: {r.revision_code}</option>)}</select>
      </label>
      <label htmlFor={`${id}-target`} className="block min-w-0 text-sm font-medium text-[#405566]">Target revision
        <select id={`${id}-target`} name="target" className="ev-input mt-1.5 min-h-11 w-full min-w-0" required defaultValue={revisions[1].id}>{revisions.map(r=><option key={r.id} value={r.id}>Target: {r.revision_code}</option>)}</select>
      </label>
    </div>
    <button disabled={busy} className="ev-button mt-3 min-h-11 w-full sm:w-auto">{busy?"Comparing…":"Compare side by side"}</button>
    {message&&<p role="status" className="mt-3 break-words text-sm leading-6 text-[#526675]">{message}</p>}
  </form>
}
