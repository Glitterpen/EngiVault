"use client";

import { useActionState } from "react";
import { withdrawOrganisationVerification } from "./verification-actions";

export function VerificationWithdrawForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(withdrawOrganisationVerification, undefined);

  return <details className="rounded-xl border border-[#d6e0ed] px-4">
    <summary className="min-h-11 cursor-pointer rounded py-3 text-sm font-semibold text-[#10243e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a5452f]">Withdraw this request</summary>
    <p id="withdraw-verification-description" className="text-sm leading-6 text-[#526675]">This ends the review and cancels any unused approval. You can submit a fresh request. Existing workspaces are unchanged.</p>
    <form action={action} aria-label="Withdraw organisation verification" aria-describedby="withdraw-verification-description" className="space-y-3 pb-4 pt-3">
      <input type="hidden" name="target_request" value={requestId}/>
      {state?.message && <p role="alert" className="text-sm font-medium text-[#8b3d1f]">{state.message}</p>}
      <button type="submit" disabled={pending} className="ev-button-secondary min-h-11">{pending ? "Withdrawing…" : "Confirm withdrawal"}</button>
    </form>
  </details>;
}
