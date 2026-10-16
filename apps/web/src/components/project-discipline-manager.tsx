"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { ChevronDown, Layers3, Plus } from "lucide-react";
import { HelpTip } from "@/components/help-tip";
import { createProjectDiscipline, restoreProjectDiscipline, type DisciplineState } from "@/app/app/project-discipline-actions";
import { disciplineLabel } from "@/lib/project-disciplines";
import { ProjectDisciplineRemove } from "@/components/project-discipline-remove";

export function ProjectDisciplineManager({ organisationId, projectId, disciplines, removedDisciplines = [], readOnly = false }: {
  organisationId: string;
  projectId: string;
  disciplines: { code: string; name: string }[];
  removedDisciplines?: { code: string; name: string }[];
  readOnly?: boolean;
}) {
  const [state, action, pending] = useActionState<DisciplineState, FormData>(createProjectDiscipline, undefined);
  const disclosure = useRef<HTMLDetailsElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (state?.message && disclosure.current) disclosure.current.open = true;
  }, [state]);

  return <details ref={disclosure} aria-labelledby={titleId} className="ev-card group min-w-0" onInvalidCapture={() => {
    if (disclosure.current) disclosure.current.open = true;
  }}>
    <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-2xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10243e] sm:px-5 [&::-webkit-details-marker]:hidden">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef3fa] text-[#10243e]"><Layers3 size={18} aria-hidden="true"/></span>
      <span className="min-w-0 flex-1"><span id={titleId} className="block text-sm font-semibold text-[#10243e]">Project disciplines</span><span className="mt-0.5 block text-xs text-[#617083]">{disciplines.length} available{removedDisciplines.length ? ` · ${removedDisciplines.length} removed` : ""}</span></span>
      <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-[#617083] transition-transform group-open:rotate-180 motion-reduce:transition-none"/>
    </summary>
    <div className="border-t border-[#d6e0ed] p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-xs font-semibold uppercase tracking-[.08em] text-[#617083]">Available for new selections</h3><HelpTip label="Managing project disciplines">Add a discipline before inviting its engineers or planning resources. New disciplines in a successfully imported MDR are added here automatically. Additions apply only to this project and do not grant anyone access.</HelpTip></div>
      <ul className="grid gap-2 lg:grid-cols-2" aria-label="Available project disciplines">
        {disciplines.map(item => <li key={item.name} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-[#d6e0ed] px-3 py-2 text-sm"><span className="min-w-0 text-[#24384f] [overflow-wrap:anywhere]">{disciplineLabel(item)}</span>{!readOnly && <ProjectDisciplineRemove organisationId={organisationId} projectId={projectId} name={item.name}/>}</li>)}
      </ul>
      {!disciplines.length && <p className="rounded-xl bg-[#f4f7fb] p-3 text-sm text-[#617083]">No disciplines are available for new selections.</p>}
      {removedDisciplines.length > 0 && <details className="mt-4 min-w-0 rounded-xl border border-[#d6e0ed]">
        <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold text-[#45586a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10243e]">Removed disciplines ({removedDisciplines.length})</summary>
        <div className="border-t border-[#d6e0ed] p-3"><div className="mb-2 flex justify-end"><HelpTip label="Removed disciplines">Restore a discipline for new selections, or permanently delete it if it has never been assigned and has no linked work or history.</HelpTip></div><ul className="space-y-2">{removedDisciplines.map(item => <li key={item.name} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f4f7fb] px-3 py-2 text-sm"><span className="min-w-0 [overflow-wrap:anywhere]">{disciplineLabel(item)}</span>{!readOnly && <div className="flex min-w-0 flex-wrap gap-1"><Restore organisationId={organisationId} projectId={projectId} name={item.name}/><ProjectDisciplineRemove organisationId={organisationId} projectId={projectId} name={item.name} permanentOnly/></div>}</li>)}</ul></div>
      </details>}
      {!readOnly && <form action={action} aria-label="Add project discipline" aria-busy={pending} className="mt-5 grid items-end gap-3 border-t border-[#d6e0ed] pt-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,.65fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,.65fr)_auto]">
        <input type="hidden" name="organisationId" value={organisationId}/>
        <input type="hidden" name="projectId" value={projectId}/>
        <label className="min-w-0"><span className="ev-label">Discipline name</span><input className="ev-input min-h-11 w-full" name="name" required maxLength={80} placeholder="e.g. Rotating Equipment"/></label>
        <label className="min-w-0"><span className="ev-label">Short code (optional)</span><input className="ev-input min-h-11 w-full" name="code" maxLength={24} pattern="[A-Za-z0-9-]{1,24}" placeholder="e.g. ROT"/></label>
        <button className="ev-button min-h-11 w-full sm:col-span-2 xl:col-span-1 xl:w-auto" disabled={pending}><Plus size={16} aria-hidden="true"/>{pending ? "Adding…" : "Add discipline"}</button>
        {state?.message && <p role={state.ok ? "status" : "alert"} className={`text-sm sm:col-span-2 xl:col-span-3 ${state.ok ? "text-[#10243e]" : "text-[#a5452f]"}`}>{state.message}</p>}
      </form>}
    </div>
  </details>;
}

function Restore({ organisationId, projectId, name }: { organisationId: string; projectId: string; name: string }) {
  const [state, action, pending] = useActionState<DisciplineState, FormData>(restoreProjectDiscipline, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state?.message) return;
    let ancestor = form.current?.closest("details");
    while (ancestor) {
      ancestor.open = true;
      ancestor = ancestor.parentElement?.closest("details");
    }
  }, [state]);
  return <form ref={form} action={action} aria-label={`Restore ${name}`} aria-busy={pending} className="min-w-0"><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="name" value={name}/><button className="ev-button-secondary min-h-11 text-xs" disabled={pending} aria-label={`Restore ${name}`}>{pending ? "Restoring…" : "Restore"}</button>{state?.message && <p role={state.ok ? "status" : "alert"} className={`mt-2 max-w-xs text-xs [overflow-wrap:anywhere] ${state.ok ? "text-[#10243e]" : "text-[#a5452f]"}`}>{state.message}</p>}</form>;
}
