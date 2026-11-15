import Link from "next/link";
import {ArrowLeft,Building2} from "lucide-react";
import {z} from "zod";
import {FounderMfaGate} from "@/components/founder-mfa-gate";
import {WorkspacePageHeading} from "@/components/workspace-page-heading";
import {organisationVerificationSchema} from "@/lib/organisation-verification";
import {getOrganisationVerificationReviewAccess,organisationVerificationPath} from "./review-access";
import {OrganisationVerificationReviewForm} from "./review-form";

export const metadata={title:"Organisation verification"};

const queueSchema=z.array(organisationVerificationSchema.extend({status:z.literal("pending")}));

const submittedDate=new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"});

export default async function OrganisationVerificationReviewPage(){
  const {access,session}=await getOrganisationVerificationReviewAccess();
  let queue:z.infer<typeof queueSchema>|null=null;
  if(session){
    try{
      const {data,error}=await session.supabase.rpc("list_organisation_verification_requests");
      const result=queueSchema.safeParse(data);
      if(!error&&result.success)queue=result.data;
    }catch{
      // No applicant details should be rendered from a failed read.
    }
  }

  return <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:px-6 lg:py-8">
    <header className="space-y-3">
      <Link href="/founder" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[#10243e]"><ArrowLeft size={17} aria-hidden="true"/> Founder control centre</Link>
      <WorkspacePageHeading title="Organisation verification" context="Review requests for new workspaces"/>
    </header>
    {!session?(access.current_aal==="aal2"?<section role="alert" className="ev-card p-5 text-sm text-[#526675]">This session is not authorised to review organisation requests.</section>:<FounderMfaGate currentAal={access.current_aal} continueTo={organisationVerificationPath}/>):<>
      <section aria-labelledby="review-guidance-heading" className="ev-card space-y-2 p-5">
        <h2 id="review-guidance-heading" className="font-semibold text-[#10243e]">Verify through the organisation</h2>
        <p className="text-sm leading-relaxed text-[#526675]">Find an authorised company representative through a source you verified independently, such as the company’s published switchboard or official HR or IT contact. Do not rely solely on a name, website, or contact supplied by the applicant.</p>
        <p className="text-sm leading-relaxed text-[#526675]">Confirm the applicant works for the named organisation, is authorised to set up its workspace, and uses a work-email domain belonging to that organisation. If the claimed domain and email domain differ, verify the relationship before approving. Recording a decision does not create a workspace or alter existing access.</p>
      </section>
      {queue===null?<section role="alert" className="ev-card space-y-3 p-5"><h2 className="font-semibold text-[#10243e]">The review queue is temporarily unavailable</h2><p className="text-sm text-[#526675]">No decision has been made. Reload the queue to try again.</p><a href={organisationVerificationPath} className="ev-button-secondary">Reload review queue</a></section>
        :queue.length===0?<section className="ev-card p-5"><h2 className="font-semibold text-[#10243e]">No pending requests</h2><p className="mt-1 text-sm text-[#526675]">New requests appear after applicants verify their work email and submit their organisation details.</p></section>
          :<section aria-labelledby="pending-requests-heading" className="space-y-3">
            <h2 id="pending-requests-heading" className="font-semibold text-[#10243e]">Pending requests</h2>
            {queue.map(request=>{
              const workDomain=request.work_email.slice(request.work_email.lastIndexOf("@")+1).toLowerCase();
              const date=new Date(request.submitted_at);
              return <article key={request.id} aria-labelledby={`verification-${request.id}`} className="ev-card space-y-4 p-5">
                <div className="flex items-start gap-3"><Building2 size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-[#10243e]"/><div className="min-w-0"><h3 id={`verification-${request.id}`} className="break-words font-semibold text-[#10243e]">{request.organisation_name}</h3><p className="mt-0.5 text-xs text-[#526675]">Submitted {Number.isNaN(date.getTime())?"date unavailable":<time dateTime={request.submitted_at}>{submittedDate.format(date)} UTC</time>}</p></div></div>
                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div className="min-w-0"><dt className="text-xs text-[#526675]">Applicant</dt><dd className="break-words font-medium text-[#10243e]">{request.applicant_name}</dd></div>
                  <div className="min-w-0"><dt className="text-xs text-[#526675]">Confirmed email</dt><dd className="break-words font-medium text-[#10243e]">{request.work_email}</dd></div>
                  <div className="min-w-0"><dt className="text-xs text-[#526675]">Applicant’s claimed company domain</dt><dd className="break-words font-medium text-[#10243e]">{request.claimed_domain}</dd></div>
                  <div className="min-w-0"><dt className="text-xs text-[#526675]">Requested workspace URL slug</dt><dd className="break-words font-medium text-[#10243e]">{request.organisation_slug}</dd></div>
                </dl>
                {workDomain!==request.claimed_domain&&<p className="rounded-lg bg-[#fff1e9] px-3 py-2 text-sm text-[#913c24]">The email domain <span className="break-all font-semibold">{workDomain}</span> differs from the claimed company domain. Verify the connection independently before approving.</p>}
                <details className="rounded-xl border border-[#e0e7ed] px-4 py-3">
                  <summary className="cursor-pointer font-semibold text-[#10243e]">Review request</summary>
                  <div className="mt-4"><OrganisationVerificationReviewForm requestId={request.id}/></div>
                </details>
              </article>;
            })}
          </section>}
    </>}
  </main>;
}
