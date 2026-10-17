"use client";

import {FormField} from "@/components/form-field";
import {FormFeedback} from "@/components/form-feedback";
import Link from "next/link";
import {useActionState,useId} from "react";
import {Plus} from "lucide-react";
import {createProject,type MutationState} from "@/app/app/actions";

export function ProjectCreateForm({organisationId,embedded=false}:{organisationId:string;embedded?:boolean}){
  const [state,action,pending]=useActionState<MutationState,FormData>(createProject,undefined);
  const id=useId();

  return <form action={action} aria-label="Create project" aria-busy={pending} className={embedded?"min-w-0":"ev-card h-fit min-w-0 p-6"}>
    <input type="hidden" name="organisationId" value={organisationId}/>
    {!embedded&&<div className="flex items-center gap-2"><Plus size={18} className="text-[#e8733f]" aria-hidden="true"/><h2 className="font-semibold">Create project</h2></div>}
    <FormField id={`${id}-code`} label="Project code" className={embedded?"":"mt-6"} help={{label:"Project code format",content:"Use 2–20 letters, numbers or hyphens, starting with a letter or number. The code must be unique within your organisation."}}>
      <input className="ev-input min-h-11 min-w-0" name="code" placeholder="ENG-001" required/>
    </FormField>
    <FormField id={`${id}-name`} label="Project name" className="mt-4"><input className="ev-input min-h-11 min-w-0" name="name" required/></FormField>
    {state?.message&&<FormFeedback tone={state.projectId?"success":"error"} className="mt-4"><p>{state.message}</p>{state.projectId&&<Link className="mt-2 inline-flex min-h-11 max-w-full items-center rounded-lg font-semibold underline" href={`/app/${organisationId}/projects/${state.projectId}/overview`}>Appoint project leadership</Link>}</FormFeedback>}
    <button className="ev-button mt-5 w-full" disabled={pending}>{pending?"Creating project…":"Create project"}</button>
  </form>;
}
