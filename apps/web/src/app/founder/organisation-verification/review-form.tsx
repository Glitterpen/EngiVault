"use client";

import {useActionState,useId} from "react";
import {reviewOrganisationVerification,type OrganisationVerificationReviewState} from "./actions";

const checkClass="flex min-h-11 items-start gap-3 rounded-lg border border-[#dbe3ed] px-3 py-2.5 text-sm leading-relaxed text-[#334960]";
const checkInputClass="mt-0.5 size-4 shrink-0 accent-[#10243e]";

function ReviewFeedback({state}:{state:OrganisationVerificationReviewState}){
  if(!state)return null;
  return state.kind==="error"
    ?<p role="alert" className="rounded-lg bg-[#fff2eb] px-3 py-2 text-sm text-[#913c24]">{state.message}</p>
    :<p role="status" className="rounded-lg bg-[#eef3fa] px-3 py-2 text-sm text-[#183653]">{state.message}</p>;
}

export function OrganisationVerificationReviewForm({requestId}:{requestId:string}){
  const [approval,approve,approving]=useActionState(reviewOrganisationVerification,undefined);
  const [rejection,decline,declining]=useActionState(reviewOrganisationVerification,undefined);
  const referenceHelpId=useId();
  const submitted=approval?.kind==="success"||rejection?.kind==="success";
  const busy=approving||declining||submitted;

  return <div className="space-y-5 border-t border-[#e0e7ed] pt-4">
    <form action={approve} aria-label="Record company confirmation" aria-busy={approving} className="space-y-4">
      <input type="hidden" name="requestId" value={requestId}/>
      <input type="hidden" name="decision" value="approve"/>
      <fieldset disabled={busy} className="space-y-4">
        <legend className="font-semibold text-[#10243e]">Company confirmation</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="ev-label">Representative name</span><input name="representativeName" className="ev-input" minLength={2} maxLength={100} required/></label>
          <label className="block"><span className="ev-label">Representative role</span><input name="representativeRole" className="ev-input" minLength={2} maxLength={100} required/></label>
          <label className="block"><span className="ev-label">Confirmation method</span><select name="confirmationMethod" className="ev-input" defaultValue="" required><option value="" disabled>Choose a method</option><option value="company_email">Company email</option><option value="company_phone">Company phone or switchboard</option></select></label>
          <label className="block"><span className="ev-label">Verified work-email domain</span><input name="verifiedWorkDomain" className="ev-input" placeholder="example.com" autoCapitalize="none" spellCheck={false} maxLength={253} required/></label>
        </div>
        <label className="block"><span className="ev-label">Independent source and confirmation reference</span><textarea name="confirmationReference" className="ev-input min-h-24" rows={3} minLength={4} maxLength={300} aria-describedby={referenceHelpId} required/></label>
        <p id={referenceHelpId} className="text-xs leading-relaxed text-[#526675]">Record where you found the company contact and a brief dated reference for the confirmation. Do not enter passwords, ID numbers or sensitive documents.</p>
        <div className="grid gap-2">
          <label className={checkClass}><input type="checkbox" name="independentRepresentative" value="confirmed" className={checkInputClass} required/> I contacted a representative other than the applicant through an independently verified company channel.</label>
          <label className={checkClass}><input type="checkbox" name="affiliationConfirmed" value="confirmed" className={checkInputClass} required/> The representative confirmed that the applicant is a member of staff at this organisation.</label>
          <label className={checkClass}><input type="checkbox" name="authorityConfirmed" value="confirmed" className={checkInputClass} required/> The representative confirmed that the applicant is authorised to create and administer this EngiCite workspace.</label>
        </div>
        <button type="submit" className="ev-button self-start" disabled={busy}>{approving?"Recording approval…":"Record approval"}</button>
      </fieldset>
      <ReviewFeedback state={approval}/>
    </form>

    <details className="rounded-xl border border-[#e0e7ed] px-4 py-3">
      <summary className="cursor-pointer font-semibold text-[#334960]">Decline request</summary>
      <form action={decline} aria-label="Decline verification request" aria-busy={declining} className="mt-3 space-y-3">
        <input type="hidden" name="requestId" value={requestId}/>
        <input type="hidden" name="decision" value="reject"/>
        <p className="text-sm text-[#526675]">Decline if company confirmation could not be obtained or the applicant is not authorised. This does not affect any existing workspace or project invitation.</p>
        <button type="submit" className="ev-button-secondary" disabled={busy}>{declining?"Recording decision…":"Confirm decline"}</button>
        <ReviewFeedback state={rejection}/>
      </form>
    </details>
  </div>;
}
