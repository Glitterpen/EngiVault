"use client";

import Link from "next/link";
import {useActionState} from "react";
import {Plus} from "lucide-react";
import {createProject,type MutationState} from "@/app/app/actions";

export function ProjectCreateForm({organisationId}:{organisationId:string}){
  const [state,action,pending]=useActionState<MutationState,FormData>(createProject,undefined);

  return <form action={action} className="ev-card h-fit p-6">
    <input type="hidden" name="organisationId" value={organisationId}/>
    <div className="flex items-center gap-2"><Plus size={18} className="text-[#e8733f]"/><h2 className="font-semibold">Create project shell</h2></div>
    <p className="mt-2 text-xs leading-5 text-[#617083]">Create the project record, then appoint its Project Manager and Document Controller. The Project Manager will complete the client identity, brief, objectives, schedule and resource plan.</p>
    <label className="mt-6 block"><span className="ev-label">Project code</span><input className="ev-input" name="code" placeholder="ENG-001" required/></label>
    <label className="mt-4 block"><span className="ev-label">Project name</span><input className="ev-input" name="name" required/></label>
    {state?.message&&<div className={`mt-4 rounded-lg border p-3 text-xs leading-5 ${state.projectId?"border-[#b9d8ca] bg-[#f1f8f4] text-[#0c5b45]":"border-[#f0c8b7] bg-[#fff6f2] text-[#8b3d1f]"}`} role={state.projectId?"status":"alert"}><p>{state.message}</p>{state.projectId&&<Link className="mt-2 inline-flex font-bold underline" href={`/app/${organisationId}/projects/${state.projectId}/overview`}>Appoint project leadership</Link>}</div>}
    <button className="ev-button mt-5 w-full" disabled={pending}>{pending?"Creating project…":"Create project shell"}</button>
  </form>;
}
