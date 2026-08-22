import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  Eye,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { reviewRevision } from "@/app/app/workflow-actions";
import { requireProject } from "@/lib/auth";

type Revision = {
  id: string;
  document_id: string;
  revision_code: string;
  issue_status: string;
  original_filename: string;
  created_at: string;
  state: string;
  documents: {
    document_number: string;
    title: string;
    discipline: string;
  } | null;
};

export default async function ReviewsPage({
  params,
}: {
  params: Promise<{ organisationId: string; projectId: string }>;
}) {
  const { organisationId, projectId } = await params;
  const { supabase, access } = await requireProject(organisationId, projectId);

  if (String(access.role) !== "document_controller") notFound();

  const { data } = await supabase
    .from("document_revisions")
    .select(
      "id,document_id,revision_code,issue_status,original_filename,created_at,state,documents!inner(document_number,title,discipline)",
    )
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId)
    .eq("control_status", "submitted")
    .neq("state", "pending_upload")
    .order("created_at");

  const rows = (data ?? []) as unknown as Revision[];

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={`/app/${organisationId}/projects/${projectId}/control`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45]"
      >
        <ArrowLeft size={16} /> Document control centre
      </Link>

      <p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">
        Document control
      </p>
      <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold">
        <ClipboardCheck /> Submission review
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#617083]">
        Preview every engineer submission, verify its document details and file
        content, then accept it into the controlled register or return it with
        clear instructions.
      </p>

      <div className="mt-6 space-y-5">
        {rows.length ? (
          rows.map((row) => {
            const enhancedPreviewAvailable = row.state === "ready";
            const canReview = row.state === "ready";
            const previewHref = `/app/${organisationId}/projects/${projectId}/documents/${row.document_id}/revisions/${row.id}/preview`;
            const downloadHref = `/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${row.document_id}/revisions/${row.id}/download`;

            return (
              <article className="ev-card overflow-hidden" key={row.id}>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e3e9e6] p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold uppercase tracking-[.12em] text-[#e8733f]">
                        {row.documents?.document_number} &middot; Revision {row.revision_code}
                      </p>
                      <span className="rounded-full bg-[#eef4f1] px-2.5 py-1 text-[10px] font-bold uppercase text-[#0c5b45]">
                        {row.documents?.discipline}
                      </span>
                    </div>
                    <h2 className="mt-2 text-lg font-semibold">{row.documents?.title}</h2>
                    <p className="mt-1 truncate text-xs text-[#617083]">
                      Submitted {new Date(row.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {enhancedPreviewAvailable ? (
                      <Link
                        href={previewHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ev-button"
                      >
                        <Eye size={16} /> Open secure preview
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-xl bg-[#fff7dd] px-3 py-2 text-xs font-semibold text-[#7a5a00]">
                        <Clock3 size={15} /> Security processing: {row.state.replaceAll("_", " ")}
                      </span>
                    )}
                    {enhancedPreviewAvailable && (
                      <a
                        href={downloadHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ev-button-secondary"
                      >
                        <Download size={16} /> Original file
                      </a>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 bg-[#f8faf9] p-5 sm:grid-cols-2 lg:grid-cols-4">
                  <ConformanceItem label="Document number" value={row.documents?.document_number ?? "—"} />
                  <ConformanceItem label="Revision" value={row.revision_code} />
                  <ConformanceItem label="Issue status" value={row.issue_status} />
                  <ConformanceItem label="Submitted file" value={row.original_filename} />
                </div>

                <form action={reviewRevision} className="p-5">
                  <Hidden
                    organisationId={organisationId}
                    projectId={projectId}
                    revisionId={row.id}
                  />

                  <div className="rounded-xl border border-[#dce6e1] bg-white p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold text-[#102842]">
                      <ShieldCheck size={17} className="text-[#0c5b45]" /> Conformance confirmation
                    </p>
                    <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm leading-5 text-[#4f625d]">
                      <input
                        type="checkbox"
                        name="conformanceConfirmed"
                        value="yes"
                        required
                        disabled={!canReview}
                        className="mt-0.5 size-4 accent-[#0c5b45]"
                      />
                      <span>
                        I opened the secure preview or original file and confirmed that the file,
                        document number, revision and issue status conform to the MDR.
                      </span>
                    </label>
                    {!canReview && (
                      <p className="mt-2 text-xs font-medium text-[#7a5a00]">
                        Preview, download and approval remain unavailable until antivirus scanning,
                        file validation and secure processing finish successfully.
                      </p>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                    <input
                      className="ev-input"
                      name="comment"
                      placeholder="Review comment or return instructions"
                    />
                    <button
                      name="decision"
                      value="returned"
                      formNoValidate
                      disabled={!canReview}
                      className="ev-button-secondary text-[#a5452f] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <RotateCcw size={16} /> Return
                    </button>
                    <button
                      name="decision"
                      value="accepted"
                      disabled={!canReview}
                      className="ev-button disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <CheckCircle2 size={16} /> Approve submission
                    </button>
                  </div>
                </form>
              </article>
            );
          })
        ) : (
          <div className="ev-card p-10 text-center text-[#617083]">
            No engineer submissions are waiting for review.
          </div>
        )}
      </div>
    </div>
  );
}

function ConformanceItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#718079]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[#20384f]" title={value}>
        {value}
      </p>
    </div>
  );
}

function Hidden({
  organisationId,
  projectId,
  revisionId,
}: {
  organisationId: string;
  projectId: string;
  revisionId: string;
}) {
  return (
    <>
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="revisionId" value={revisionId} />
    </>
  );
}
