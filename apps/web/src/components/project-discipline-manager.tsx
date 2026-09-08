"use client";

import { useActionState } from "react";
import { createProjectDiscipline, restoreProjectDiscipline, type DisciplineState } from "@/app/app/project-discipline-actions";
import { disciplineLabel } from "@/lib/project-disciplines";
import { ProjectDisciplineRemove } from "@/components/project-discipline-remove";

export function ProjectDisciplineManager({ organisationId, projectId, disciplines, removedDisciplines=[], readOnly=false }: {
  organisationId: string; projectId: string; disciplines: { code: string; name: string }[]; removedDisciplines?:{code:string;name:string}[];readOnly?:boolean;
}) {
  const [state, action, pending] = useActionState<DisciplineState, FormData>(createProjectDiscipline, undefined);
  return <details className="ev-card mt-6 p-5 sm:p-6">
    <summary className="cursor-pointer font-semibold">Project disciplines · Manage disciplines</summary>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-[#617083]">Add a discipline before inviting its engineers or planning resources. New disciplines in a successfully imported MDR are added here automatically. Additions apply only to this project and do not grant anyone access.</p>
    <div className="mt-4 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2" aria-label="Available project disciplines">
      {disciplines.map(item => <div key={item.name} className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-[#eef4f1] px-3 py-2 text-xs text-[#0c5b45]"><span className="min-w-0 break-words">{disciplineLabel(item)}</span>{!readOnly&&<ProjectDisciplineRemove organisationId={organisationId} projectId={projectId} name={item.name}/>}</div>)}
      {!disciplines.length&&<p className="text-sm text-[#617083]">No disciplines are available for new selections.</p>}
    </div>
    {removedDisciplines.length>0&&<details className="mt-4 rounded-lg border border-[#dce2e9] p-3"><summary className="cursor-pointer text-sm font-semibold">Removed disciplines ({removedDisciplines.length})</summary><p className="mt-2 text-xs leading-5 text-[#617083]">Existing work and access are retained. Restore a discipline to use it in new selections.</p><div className="mt-3 space-y-2">{removedDisciplines.map(item=><div key={item.name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f6f7f8] px-3 py-2 text-sm"><span className="break-words">{disciplineLabel(item)}</span>{!readOnly&&<Restore organisationId={organisationId} projectId={projectId} name={item.name}/>}</div>)}</div></details>}
    {!readOnly&&<form action={action} className="mt-5 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,.6fr)_auto]">
      <input type="hidden" name="organisationId" value={organisationId}/>
      <input type="hidden" name="projectId" value={projectId}/>
      <label className="min-w-0"><span className="ev-label">Discipline name</span><input className="ev-input w-full" name="name" required maxLength={80} placeholder="e.g. Rotating Equipment"/></label>
      <label className="min-w-0"><span className="ev-label">Short code (optional)</span><input className="ev-input w-full" name="code" maxLength={24} pattern="[A-Za-z0-9-]{1,24}" placeholder="e.g. ROT"/></label>
      <button className="ev-button" disabled={pending}>{pending ? "Adding…" : "Add discipline"}</button>
      {state?.message && <p role="status" className={`text-sm sm:col-span-3 ${state.ok ? "text-[#0c5b45]" : "text-[#a5452f]"}`}>{state.message}</p>}
    </form>}
  </details>;
}

function Restore({organisationId,projectId,name}:{organisationId:string;projectId:string;name:string}){
  const [state,action,pending]=useActionState<DisciplineState,FormData>(restoreProjectDiscipline,undefined);
  return <form action={action}><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="name" value={name}/><button className="ev-button-secondary min-h-9 text-xs" disabled={pending} aria-label={`Restore ${name}`}>{pending?"Restoring…":"Restore"}</button>{state?.message&&<p role="status" className="mt-2 text-xs">{state.message}</p>}</form>;
}
