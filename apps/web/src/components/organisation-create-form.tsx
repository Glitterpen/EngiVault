"use client";
import { useActionState } from "react";
import { Plus } from "lucide-react";
import { createOrganisation, type MutationState } from "@/app/app/actions";

export function OrganisationCreateForm(){
  const [state,action,pending]=useActionState<MutationState,FormData>(createOrganisation,undefined);
  return <form action={action} className="ev-card h-fit p-6"><div className="flex items-center gap-2"><Plus size={18} className="text-[#e8733f]"/><h2 className="font-semibold">Create organisation</h2></div><label className="mt-6 block"><span className="ev-label">Organisation name</span><input className="ev-input" name="name" required/></label><label className="mt-4 block"><span className="ev-label">URL slug</span><input className="ev-input" name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="north-field-engineering" required/></label>{state?.message&&<p className="mt-4 rounded-lg border border-[#f0c8b7] bg-[#fff6f2] p-3 text-xs leading-5 text-[#8b3d1f]" role="alert">{state.message}</p>}<button className="ev-button mt-5 w-full" disabled={pending}>{pending?"Creating workspace…":"Create secure workspace"}</button></form>
}
