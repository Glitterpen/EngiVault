"use client";

import { useActionState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { reviewRevision } from "@/app/app/workflow-actions";

export function RevisionReviewForm({ organisationId, projectId, revisionId, ready, readOnly = false }: {
  organisationId: string; projectId: string; revisionId: string; ready: boolean; readOnly?: boolean;
}) {
  const [state, action, pending] = useActionState(reviewRevision, undefined);
  const disabled = !ready || readOnly || pending || Boolean(state?.ok);
  return <form action={action} className="border-t border-[#d6e0ed] pt-4">
    <input type="hidden" name="organisationId" value={organisationId} />
    <input type="hidden" name="projectId" value={projectId} />
    <input type="hidden" name="revisionId" value={revisionId} />
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-sm font-semibold text-[#102842]">Conformance confirmation</legend>
      <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg bg-[#f4f7fb] p-3 text-sm leading-5 text-[#526675]">
        <input type="checkbox" name="conformanceConfirmed" value="yes" required disabled={disabled} className="mt-0.5 size-5 shrink-0 accent-[#10243e]" />
        <span>I opened the secure preview and, where attached, the editable native source,
          and confirmed that the files, document number, revision and issue status conform to the MDR.</span>
      </label>
      {!ready && <p className="mt-2 text-xs font-medium text-[#7a5a00]">
        Preview, download and approval become available automatically after file validation,
        antivirus scanning and secure processing finish successfully.
      </p>}
      {readOnly && <p className="mt-2 text-xs text-[#617083]">This audited member preview is read-only.</p>}
    </fieldset>
    <div className="mt-4 space-y-3">
      <label className="block text-sm text-[#526675]">Review comment or return instructions
        <input className="ev-input mt-1 min-h-11 min-w-0" name="comment" placeholder="Add a comment" maxLength={1000} disabled={disabled} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button name="decision" value="returned" formNoValidate disabled={disabled} className="ev-button-secondary min-h-11 disabled:cursor-not-allowed disabled:opacity-45"><RotateCcw aria-hidden="true" size={16} /> Return</button>
        <button name="decision" value="accepted" disabled={disabled} className="ev-button min-h-11 disabled:cursor-not-allowed disabled:opacity-45"><CheckCircle2 aria-hidden="true" size={16} /> {pending ? "Saving review…" : "Approve submission"}</button>
      </div>
    </div>
    {state?.message && <p role={state.ok ? "status" : "alert"} className="mt-3 text-sm">{state.message}</p>}
  </form>;
}
