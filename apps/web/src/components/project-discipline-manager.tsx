"use client";

import { useActionState } from "react";
import { createProjectDiscipline, type DisciplineState } from "@/app/app/project-discipline-actions";
import { disciplineLabel } from "@/lib/project-disciplines";

export function ProjectDisciplineManager({ organisationId, projectId, disciplines }: {
  organisationId: string; projectId: string; disciplines: { code: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<DisciplineState, FormData>(createProjectDiscipline, undefined);
  return <details className="ev-card mt-6 p-5 sm:p-6">
    <summary className="cursor-pointer font-semibold">Project disciplines · Add discipline</summary>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-[#617083]">Add a discipline before inviting its engineers or planning resources. New disciplines in a successfully imported MDR are added here automatically. Additions apply only to this project and do not grant anyone access.</p>
    <div className="mt-4 flex max-h-40 flex-wrap gap-2 overflow-y-auto" aria-label="Available project disciplines">
      {disciplines.map(item => <span key={item.name} className="max-w-full break-words rounded-lg bg-[#eef4f1] px-3 py-2 text-xs text-[#0c5b45]">{disciplineLabel(item)}</span>)}
    </div>
    <form action={action} className="mt-5 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,.6fr)_auto]">
      <input type="hidden" name="organisationId" value={organisationId}/>
      <input type="hidden" name="projectId" value={projectId}/>
      <label className="min-w-0"><span className="ev-label">Discipline name</span><input className="ev-input w-full" name="name" required maxLength={80} placeholder="e.g. Rotating Equipment"/></label>
      <label className="min-w-0"><span className="ev-label">Short code (optional)</span><input className="ev-input w-full" name="code" maxLength={24} pattern="[A-Za-z0-9-]{1,24}" placeholder="e.g. ROT"/></label>
      <button className="ev-button" disabled={pending}>{pending ? "Adding…" : "Add discipline"}</button>
      {state?.message && <p role="status" className={`text-sm sm:col-span-3 ${state.ok ? "text-[#0c5b45]" : "text-[#a5452f]"}`}>{state.message}</p>}
    </form>
  </details>;
}
