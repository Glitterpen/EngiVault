"use client";
import {useActionState,useId} from "react";
import { createDocumentCategory, type MutationState } from "@/app/app/actions";

export function DocumentCategoryCreateForm({organisationId}:{organisationId:string}){
  const [state,action,pending]=useActionState<MutationState,FormData>(createDocumentCategory,undefined);
  const id=useId();
  const succeeded=state?.message==="Category added.";
  const controlClass="ev-input min-h-11 min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10243e]";
  return <form action={action} aria-labelledby={`${id}-title`} aria-busy={pending} className="ev-card min-w-0 p-4 sm:p-5">
    <input type="hidden" name="organisationId" value={organisationId}/>
    <h2 id={`${id}-title`} className="text-base font-semibold text-[#10243e]">Add a category</h2>
    <div className="mt-4 min-w-0"><label htmlFor={`${id}-kind`} className="ev-label">Category kind</label><select id={`${id}-kind`} className={controlClass} name="kind"><option value="discipline">Discipline</option><option value="document_type">Document type</option></select></div>
    <div className="mt-4 min-w-0"><label htmlFor={`${id}-code`} className="ev-label">Short code</label><input id={`${id}-code`} className={controlClass} name="code" required placeholder="ROT" maxLength={24} autoCapitalize="characters" spellCheck={false}/></div>
    <div className="mt-4 min-w-0"><label htmlFor={`${id}-name`} className="ev-label">Display name</label><input id={`${id}-name`} className={controlClass} name="name" required placeholder="Rotating Equipment" maxLength={80}/></div>
    {state?.message&&<p className={`mt-4 text-sm leading-6 [overflow-wrap:anywhere] ${succeeded?"text-[#24384f]":"text-[#a5452f]"}`} role={succeeded?"status":"alert"}>{state.message}</p>}
    <button type="submit" className="ev-button mt-5 min-h-11 w-full min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10243e]" disabled={pending}>{pending?"Adding…":"Add category"}</button>
  </form>;
}
