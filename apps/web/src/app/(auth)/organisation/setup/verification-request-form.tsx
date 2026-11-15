"use client";

import { useActionState, useId, useState } from "react";
import { submitOrganisationVerification, type OrganisationRequestState } from "./verification-actions";

type RequestDetails = { applicantName: string; organisationName: string; organisationSlug: string; claimedDomain: string };

export function VerificationRequestForm({ initial }: { initial: RequestDetails }) {
  const [state, action, pending] = useActionState<OrganisationRequestState, FormData>(submitOrganisationVerification, undefined);
  const [details, setDetails] = useState(initial);
  const helpId = useId();

  return <form action={action} aria-label="Request organisation verification" className="ev-card p-5 sm:p-6">
    <h2 className="text-base font-semibold text-[#10243e]">Organisation details</h2>
    <div className="mt-4 space-y-4">
      <label className="block"><span className="ev-label">Your full name</span><input autoComplete="name" className="ev-input" name="applicant_name" value={details.applicantName} onChange={event=>setDetails({...details,applicantName:event.target.value})} minLength={2} maxLength={80} required/></label>
      <label className="block"><span className="ev-label">Legal organisation name</span><input autoComplete="organization" className="ev-input" name="organisation_name" value={details.organisationName} onChange={event=>setDetails({...details,organisationName:event.target.value})} minLength={2} maxLength={100} required/></label>
      <label className="block"><span className="ev-label">Workspace address (slug)</span><input className="ev-input" name="organisation_slug" autoCapitalize="none" spellCheck={false} value={details.organisationSlug} onChange={event=>setDetails({...details,organisationSlug:event.target.value})} placeholder="north-field-engineering" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" minLength={3} maxLength={48} required/></label>
      <label className="block"><span className="ev-label">Official organisation domain</span><input className="ev-input" name="claimed_domain" autoCapitalize="none" spellCheck={false} value={details.claimedDomain} onChange={event=>setDetails({...details,claimedDomain:event.target.value})} placeholder="company.example" aria-describedby={helpId} maxLength={253} required/></label>
      <p id={helpId} className="text-xs leading-5 text-[#526675]">Enter the organisation’s domain, without <code>https://</code> or an email address. We verify the organisation and your authority to set up its workspace before it opens.</p>
    </div>
    {state?.message && <p role="alert" className="mt-4 rounded-lg border border-[#f0c8b7] bg-[#fff6f2] p-3 text-sm text-[#8b3d1f]">{state.message}</p>}
    <button type="submit" className="ev-button mt-5 w-full min-h-11" disabled={pending}>{pending ? "Sending request…" : "Request verification"}</button>
  </form>;
}
