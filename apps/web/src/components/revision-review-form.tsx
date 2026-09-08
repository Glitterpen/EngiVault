"use client";

import { useActionState } from "react";
import { CheckCircle2, RotateCcw, ShieldCheck } from "lucide-react";
import { reviewRevision } from "@/app/app/workflow-actions";

export function RevisionReviewForm({ organisationId, projectId, revisionId, ready, readOnly = false }: {
  organisationId: string; projectId: string; revisionId: string; ready: boolean; readOnly?: boolean;
}) {
  const [state, action, pending] = useActionState(reviewRevision, undefined);
  const disabled = !ready || readOnly || pending || Boolean(state?.ok);
  return <form action={action} className="p-5">
    <input type="hidden" name="organisationId" value={organisationId} />
    <input type="hidden" name="projectId" value={projectId} />
    <input type="hidden" name="revisionId" value={revisionId} />
    <div className="rounded-xl border border-[#dce6e1] bg-white p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-[#102842]">
        <ShieldCheck size={17} className="text-[#0c5b45]" /> Conformance confirmation
      </p>
      <label className="mt-3 flex items-start gap-3 text-sm leading-5 text-[#4f625d]">
        <input type="checkbox" name="conformanceConfirmed" value="yes" required disabled={disabled} className="mt-0.5 size-4 accent-[#0c5b45]" />
        <span>I opened the secure preview and, where attached, the editable native source,
          and confirmed that the files, document number, revision and issue status conform to the MDR.</span>
      </label>
      {!ready && <p className="mt-2 text-xs font-medium text-[#7a5a00]">
        Preview, download and approval become available automatically after file validation,
        antivirus scanning and secure processing finish successfully.
      </p>}
      {readOnly && <p className="mt-2 text-xs text-[#617083]">This audited member preview is read-only.</p>}
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
      <input className="ev-input min-w-0" name="comment" aria-label="Review comment or return instructions" placeholder="Review comment or return instructions" maxLength={1000} disabled={disabled} />
      <button name="decision" value="returned" formNoValidate disabled={disabled} className="ev-button-secondary text-[#a5452f] disabled:cursor-not-allowed disabled:opacity-45"><RotateCcw size={16} /> Return</button>
      <button name="decision" value="accepted" disabled={disabled} className="ev-button disabled:cursor-not-allowed disabled:opacity-45"><CheckCircle2 size={16} /> {pending ? "Saving review…" : "Approve submission"}</button>
    </div>
    {state?.message && <p role={state.ok ? "status" : "alert"} className="mt-3 text-sm">{state.message}</p>}
  </form>;
}
