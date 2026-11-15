import Link from "next/link";
import { redirect } from "next/navigation";
import { OrganisationCreateForm } from "@/components/organisation-create-form";
import { organisationVerificationSchema, type OrganisationVerification } from "@/lib/organisation-verification";
import { getOrganisationSetupAccess, organisationSetupLoginPath, organisationSetupPath } from "./setup-access";
import { VerificationRequestForm } from "./verification-request-form";
import { VerificationWithdrawForm } from "./verification-withdraw-form";

function RefreshStatus() {
  return <form action={organisationSetupPath} method="get">
    <button type="submit" className="ev-button-secondary min-h-11">Refresh status</button>
  </form>;
}

function StatusUnavailable() {
  return <div className="w-full max-w-lg space-y-4">
    <h1 className="text-3xl font-semibold tracking-tight text-[#10243e]">Status temporarily unavailable</h1>
    <p role="status" className="text-sm leading-6 text-[#526675]">We couldn’t load your verification status. Refresh to try again; there is no need to submit another request.</p>
    <RefreshStatus/>
  </div>;
}

const dateLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function RequestSummary({ request }: { request: OrganisationVerification }) {
  const submitted = Date.parse(request.submitted_at);
  return <dl className="grid min-w-0 gap-3 rounded-xl bg-[#f4f7fb] p-4 text-sm sm:grid-cols-2">
    <div className="min-w-0"><dt className="font-medium text-[#526675]">Organisation</dt><dd className="break-words font-semibold text-[#10243e]">{request.organisation_name}</dd></div>
    <div className="min-w-0"><dt className="font-medium text-[#526675]">Organisation domain submitted</dt><dd className="break-words font-semibold text-[#10243e]">{request.claimed_domain}</dd></div>
    {Number.isFinite(submitted) && <div><dt className="font-medium text-[#526675]">Requested</dt><dd className="text-[#10243e]"><time dateTime={request.submitted_at}>{dateLabel.format(submitted)}</time></dd></div>}
  </dl>;
}

function metadataText(value: unknown, length: number) {
  return typeof value === "string" ? value.slice(0, length) : "";
}

export default async function OrganisationSetupPage() {
  const access = await getOrganisationSetupAccess();
  if (access.status === "preview") return <div className="w-full max-w-lg space-y-4">
    <h1 className="text-3xl font-semibold tracking-tight text-[#10243e]">Organisation setup is unavailable in preview</h1>
    <p className="text-sm leading-6 text-[#526675]">Return to the workspace and exit preview before requesting a new organisation.</p>
    <Link className="ev-button-secondary" href="/app">Back to workspace</Link>
  </div>;
  if (access.status === "unavailable") return <StatusUnavailable/>;
  if (access.status === "denied") redirect(access.hasWorkspace ? "/app" : "/login?access=required");
  if (access.status === "email_required") return <div className="w-full max-w-lg space-y-4">
    <h1 className="text-3xl font-semibold tracking-tight text-[#10243e]">Verify your work email</h1>
    <p className="text-sm leading-6 text-[#526675]">Open the verification link sent to your work email before setting up your organisation. If the message has not arrived, you can request another from the sign-in page.</p>
    <Link className="ev-button-secondary" href={organisationSetupLoginPath}>Back to sign in</Link>
    {access.hasWorkspace && <Link className="ml-3 text-sm font-medium underline text-[#10243e]" href="/app">Back to your organisations</Link>}
  </div>;

  const response = access.canRequest ? await access.supabase.rpc("get_my_organisation_verification") : null;
  const parsed = response?.data == null ? null : organisationVerificationSchema.safeParse(response.data);
  const statusUnavailable = !!response?.error || (parsed !== null && !parsed.success);
  const request = parsed?.success === true ? parsed.data : null;
  const emailChanged = request !== null && request.work_email.trim().toLowerCase() !== access.email;
  const approvalExpires = request?.expires_at ? Date.parse(request.expires_at) : NaN;
  // The status RPC computes expiry on the database clock, and activation
  // independently rechecks expiry before it can provision the workspace.
  const canActivate = request?.status === "approved" && !emailChanged && Number.isFinite(approvalExpires);
  const status = emailChanged || (request?.status === "approved" && !canActivate) ? "expired" : request?.status;
  const resubmission = request && (status === "rejected" || status === "expired" || status === "withdrawn") ? request : null;
  const canSubmit = access.canRequest && !statusUnavailable && (!request || resubmission !== null || status === "activated");
  const metadata = access.user.user_metadata;

  return <div className="w-full max-w-lg space-y-5">
    <header>
      <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#a5452f]">Organisation setup</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#10243e]">{access.canRequest ? "Verify your organisation" : "Restore an existing workspace"}</h1>
      {access.canRequest && <p className="mt-2 text-sm leading-6 text-[#526675]">An authorised representative of your organisation needs to confirm your affiliation and your authority to set up the workspace. EngiOne contacts the organisation through an official channel and keeps a private record of the verification.</p>}
      <p className="mt-2 break-words text-sm text-[#526675]">Verified email: <strong className="font-semibold text-[#10243e]">{access.email}</strong></p>
      {access.hasWorkspace && <Link href="/app" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#10243e] underline">Back to your organisations</Link>}
    </header>

    {statusUnavailable && <section aria-label="Verification status" className="ev-card space-y-3 p-5">
      <h2 className="font-semibold text-[#10243e]">Verification status unavailable</h2>
      <p role="status" className="text-sm leading-6 text-[#526675]">Try refreshing. Workspace creation will be available once we can confirm the approval.</p>
      <RefreshStatus/>
    </section>}

    {!statusUnavailable && request && status === "pending" && <section aria-label="Verification status" className="ev-card space-y-3 p-5">
      <h2 className="text-base font-semibold text-[#10243e]">Pending organisation verification</h2>
      <p className="text-sm leading-6 text-[#526675]">Your request was received. The new workspace is not active while we confirm your details with your organisation.</p>
      <RequestSummary request={request}/>
      <RefreshStatus/>
      <VerificationWithdrawForm requestId={request.id}/>
    </section>}

    {!statusUnavailable && canActivate && request && <>
      <section aria-label="Verification status" className="ev-card space-y-3 p-5">
        <h2 className="font-semibold text-[#10243e]">Organisation verified</h2>
        <p className="text-sm leading-6 text-[#526675]">Add the company logo to activate this workspace. The approved name and workspace address cannot be changed before activation.</p>
        <RequestSummary request={request}/>
        <p className="text-sm text-[#526675]">Approval expires <time dateTime={request.expires_at ?? undefined}>{dateLabel.format(approvalExpires)} (UTC)</time>.</p>
      </section>
      <OrganisationCreateForm initialName={request.organisation_name} initialSlug={request.organisation_slug} lockIdentity/>
      <VerificationWithdrawForm requestId={request.id}/>
    </>}

    {!statusUnavailable && status === "rejected" && <p role="status" className="rounded-xl border border-[#f0c8b7] bg-[#fff6f2] p-4 text-sm leading-6 text-[#8b3d1f]">We couldn’t verify this request. Check the organisation details before submitting again, or contact EngiCite support.</p>}
    {!statusUnavailable && status === "expired" && <p role="status" className="rounded-xl border border-[#f0c8b7] bg-[#fff6f2] p-4 text-sm leading-6 text-[#8b3d1f]">This request is no longer valid for activation. Submit a fresh request using your verified work email.</p>}
    {!statusUnavailable && status === "withdrawn" && <p role="status" className="rounded-xl border border-[#d6e0ed] bg-[#f4f7fb] p-4 text-sm leading-6 text-[#526675]">You withdrew this request. You can update the details below and submit a fresh request.</p>}
    {!statusUnavailable && status === "activated" && <p role="status" className="rounded-xl border border-[#d6e0ed] bg-[#f4f7fb] p-4 text-sm leading-6 text-[#526675]">Your previous request was used to activate a workspace. Request another organisation below if needed.</p>}

    {canSubmit && <VerificationRequestForm initial={{
      applicantName: resubmission?.applicant_name ?? metadataText(metadata?.display_name, 80),
      organisationName: resubmission?.organisation_name ?? metadataText(metadata?.organisation_name, 100),
      organisationSlug: resubmission?.organisation_slug ?? metadataText(metadata?.organisation_slug, 48),
      claimedDomain: resubmission?.claimed_domain ?? "",
    }}/>}

    {access.canRestore && <details className="ev-card p-5">
      <summary className="min-h-11 cursor-pointer font-semibold text-[#10243e]">Restore a workspace you previously created</summary>
      <p className="mb-4 text-sm leading-6 text-[#526675]">Restoring is separate from requesting a new organisation. Only an eligible workspace you created can be restored.</p>
      <OrganisationCreateForm initialName={metadataText(metadata?.organisation_name, 100)} initialSlug={metadataText(metadata?.organisation_slug, 48)} restoreExisting/>
    </details>}
  </div>;
}
