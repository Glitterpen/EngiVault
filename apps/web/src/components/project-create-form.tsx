"use client";

import {HelpTip} from "@/components/help-tip";
import Link from "next/link";
import {useActionState,useId} from "react";
import {Plus} from "lucide-react";
import {createProject,type MutationState} from "@/app/app/actions";

export function ProjectCreateForm({organisationId,embedded=false}:{organisationId:string;embedded?:boolean}){
  const [state,action,pending]=useActionState<MutationState,FormData>(createProject,undefined);
  const id=useId();

  return <form action={action} className={embedded?"min-w-0":"ev-card h-fit p-6"}>
    <input type="hidden" name="organisationId" value={organisationId}/>
    {!embedded&&<div className="flex items-center gap-2"><Plus size={18} className="text-[#e8733f]" aria-hidden="true"/><h2 className="font-semibold">Create project</h2></div>}
    <div className={embedded?"":"mt-6"}>
      <div className="flex items-center gap-2"><label className="ev-label" htmlFor={`${id}-code`}>Project code</label><HelpTip label="Project setup">Create the project record, then appoint its Project Manager and Document Controller. The Project Manager will complete the client identity, brief, objectives, schedule and resource plan, and upload the approved project template ZIP from the overview or project settings.</HelpTip></div>
      <input id={`${id}-code`} className="ev-input" name="code" placeholder="ENG-001" required/>
    </div>
    <label className="mt-4 block" htmlFor={`${id}-name`}><span className="ev-label">Project name</span><input id={`${id}-name`} className="ev-input" name="name" required/></label>
    {state?.message&&<div className={`mt-4 rounded-lg border p-3 text-xs leading-5 ${state.projectId?"border-[#d6e0ed] bg-[#eef3fa] text-[#10243e]":"border-[#f0c8b7] bg-[#fff6f2] text-[#8b3d1f]"}`} role={state.projectId?"status":"alert"}><p>{state.message}</p>{state.projectId&&<Link className="mt-2 inline-flex font-bold underline" href={`/app/${organisationId}/projects/${state.projectId}/overview`}>Appoint project leadership</Link>}</div>}
    <button className="ev-button mt-5 w-full" disabled={pending}>{pending?"Creating project…":"Create project"}</button>
  </form>;
}
