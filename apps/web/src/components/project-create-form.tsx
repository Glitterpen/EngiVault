"use client";
import { useActionState } from "react";
import { Plus } from "lucide-react";
import { createProject, type MutationState } from "@/app/app/actions";

export function ProjectCreateForm({organisationId}:{organisationId:string}){
  const [state,action,pending]=useActionState<MutationState,FormData>(createProject,undefined);
  return <form action={action} className="ev-card h-fit p-6"><input type="hidden" name="organisationId" value={organisationId}/><div className="flex items-center gap-2"><Plus size={18} className="text-[#e8733f]"/><h2 className="font-semibold">Create project</h2></div><label className="mt-6 block"><span className="ev-label">Project code</span><input className="ev-input" name="code" placeholder="ENG-001" required/></label><label className="mt-4 block"><span className="ev-label">Project name</span><input className="ev-input" name="name" required/></label>{state?.message&&<p className="mt-4 rounded-lg border border-[#f0c8b7] bg-[#fff6f2] p-3 text-xs leading-5 text-[#8b3d1f]" role="alert">{state.message}</p>}<button className="ev-button mt-5 w-full" disabled={pending}>{pending?"Creating project…":"Create project"}</button></form>
}
