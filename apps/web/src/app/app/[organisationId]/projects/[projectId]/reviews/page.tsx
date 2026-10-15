import { HelpTip } from "@/components/help-tip";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SubmissionReviewQueue, type SubmissionReviewRow } from "@/components/submission-review-queue";
import { requireProject } from "@/lib/auth";

export default async function ReviewsPage({ params }: {
  params: Promise<{ organisationId: string; projectId: string }>;
}) {
  const { organisationId, projectId } = await params;
  const { supabase, access, preview } = await requireProject(organisationId, projectId);

  if (String(access.role) !== "document_controller") notFound();

  const { data, error } = await supabase
    .from("document_revisions")
    .select(
      "id,document_id,revision_code,issue_status,original_filename,native_original_filename,created_at,state,documents!inner(document_number,title,discipline)",
    )
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId)
    .eq("control_status", "submitted")
    .neq("state", "pending_upload")
    .order("created_at");

  const rows = (data ?? []) as unknown as SubmissionReviewRow[];
  const pageHref = `/app/${organisationId}/projects/${projectId}/reviews`;

  return <div className="mx-auto min-w-0 max-w-6xl space-y-4">
    <header>
      <Link href={`/app/${organisationId}/projects/${projectId}/control`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0c5b45]">
        <ArrowLeft aria-hidden="true" size={16} /> Document control centre
      </Link>
      <div className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h1 className="flex min-w-0 flex-wrap items-center gap-2 break-words text-2xl font-semibold leading-tight tracking-tight text-[#10243e] sm:text-[1.75rem]">
          Submission review
          <HelpTip label="Reviewing engineer submissions">Open a submission to check its files and MDR details. Confirm conformance before approving, or return it with clear instructions. The queue is ordered oldest first.</HelpTip>
        </h1>
        {!error ? <p className="text-sm text-[#617083]">{rows.length} submission{rows.length === 1 ? "" : "s"} awaiting review</p> : null}
      </div>
      {preview ? <p className="mt-2 text-sm text-[#617083]">Audited DCC preview · Read-only</p> : null}
    </header>

    {error ? <div className="ev-card p-5" role="alert">
      <p className="font-semibold text-[#102842]">Submissions could not be loaded.</p>
      <p className="mt-1 text-sm text-[#617083]">Try again shortly. No review decisions have been changed.</p>
      <Link href={pageHref} className="ev-button-secondary mt-4 min-h-11">Retry submissions</Link>
    </div> : rows.length ? <SubmissionReviewQueue organisationId={organisationId} projectId={projectId} rows={rows} readOnly={Boolean(preview)} /> : <div className="ev-card px-4 py-4 text-sm text-[#617083] sm:px-5">
      No engineer submissions are waiting for review.
    </div>}
  </div>;
}
