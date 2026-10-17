"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { createWorkPackage, type MutationState } from "@/app/app/actions";
import { IssueStatusSelect } from "@/components/issue-status-select";
import {HelpTip} from "@/components/help-tip";
import {Package} from "lucide-react";

export function WorkPackageCreateForm({
  organisationId,
  projectId,
  disciplines,
}: {
  organisationId: string;
  projectId: string;
  disciplines: string[];
}) {
  const id=useId();
  const form=useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<MutationState, FormData>(
    createWorkPackage,
    undefined,
  );
  useEffect(()=>{
    if(state?.message){const disclosure=form.current?.closest("details");if(disclosure)disclosure.open=true;}
  },[state?.message]);
  return (
    <form ref={form} action={action} onInvalidCapture={event=>{const disclosure=event.currentTarget.closest("details");if(disclosure)disclosure.open=true;}} aria-labelledby={`${id}-heading`} aria-busy={pending} className="min-w-0">
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="projectId" value={projectId} />
      <h2 id={`${id}-heading`} className="flex items-center gap-2 text-base font-semibold"><Package size={18} aria-hidden="true" className="shrink-0 text-[#244b73]"/>Package details <HelpTip label="Create a work package">Choose the discipline and accepted issue status to include. Creating the package freezes those revisions; generate its ZIP separately from the package record.</HelpTip></h2>
      <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2"><Field name="packageNumber" label="Package number" placeholder="FWP-001" />
      <Field name="name" label="Package name" placeholder="Final engineering work package" />
      <div className="sm:col-span-2"><Field name="purpose" label="Purpose" optional /></div></div>
      <fieldset className="mt-4 min-w-0 border-t border-[#e7ecef] pt-3"><legend className="sr-only">Package scope and destination</legend><div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3"><label className="block min-w-0">
        <span className="ev-label mb-2 flex min-h-8 items-center">Discipline scope</span>
        <select className="ev-input min-w-0" name="discipline">
          <option value="">All disciplines</option>
          {disciplines.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <div className="min-w-0 [&>div]:mt-0 [&>div>div]:min-h-8"><IssueStatusSelect
        name="requiredStatus"
        label="Required issue status"
        allowEmpty
        emptyLabel="Any accepted issue status"
      /></div>
      <label className="block min-w-0">
        <span className="ev-label mb-2 flex min-h-8 items-center">Delivery destination</span>
        <select className="ev-input min-w-0" name="destination">
          <option value="local">Secure local download</option>
          <option value="sharepoint">Microsoft SharePoint</option>
          <option value="google_drive">Google Drive</option>
        </select>
      </label></div></fieldset>
      {state?.message && <p role="alert" className="mt-3 break-words rounded-lg border border-[#efd1c1] bg-[#fff8f3] p-3 text-sm leading-6 text-[#8b3d1f]">{state.message}</p>}
      <div className="mt-4 flex flex-col gap-2 sm:items-end"><button className="ev-button min-h-11 w-full sm:w-auto" disabled={pending}>
        {pending ? "Freezing revisions…" : "Create and freeze package"}
      </button></div>
    </form>
  );
}

function Field({
  name,
  label,
  placeholder,
  optional = false,
}: {
  name: string;
  label: string;
  placeholder?: string;
  optional?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="ev-label">{label}{optional&&<span className="ml-1 font-normal">(optional)</span>}</span>
      <input className="ev-input min-w-0" name={name} placeholder={placeholder} required={!optional} />
    </label>
  );
}
