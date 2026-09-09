import {HelpTip} from "@/components/help-tip";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ClipboardCheck,
  Clock3,
  Download,
  Eye,
  FileCog,
} from "lucide-react";
import { RevisionReviewForm } from "@/components/revision-review-form";
import { RevisionProcessingStatus } from "@/components/revision-processing-status";
import { requireProject } from "@/lib/auth";

type Revision = {
  id: string;
  document_id: string;
  revision_code: string;
  issue_status: string;
  original_filename: string;
  native_original_filename: string | null;
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
       <HelpTip label="Reviewing engineer submissions">Preview every engineer submission, verify its document details and file
        content, then accept it into the controlled register or return it with
        clear instructions.</HelpTip></h1>


      <div className="mt-6 space-y-5">
        {error ? <div className="ev-card p-6" role="alert">Submissions could not be loaded. Refresh the page and try again.</div> : rows.length ? (
          rows.map((row) => {
            const enhancedPreviewAvailable = row.state === "ready";
            const canReview = row.state === "ready";
            const previewHref = `/app/${organisationId}/projects/${projectId}/documents/${row.document_id}/revisions/${row.id}/preview`;
            const downloadHref = `/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${row.document_id}/revisions/${row.id}/download`;
            const nativeDownloadHref = `/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${row.document_id}/revisions/${row.id}/native-download`;

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
                    {enhancedPreviewAvailable && row.native_original_filename && (
                      <a
                        href={nativeDownloadHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ev-button-secondary"
                      >
                        <FileCog size={16} /> Native source
                      </a>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 bg-[#f8faf9] p-5 sm:grid-cols-2 lg:grid-cols-4">
                  <ConformanceItem label="Document number" value={row.documents?.document_number ?? "—"} />
                  <ConformanceItem label="Revision" value={row.revision_code} />
                  <ConformanceItem label="Issue status" value={row.issue_status} />
                  <ConformanceItem label="Submitted file" value={row.original_filename} />
                  {row.native_original_filename&&<ConformanceItem label="Editable native source" value={row.native_original_filename}/>}
                </div>

                <div className="px-5 pt-3">
                  <RevisionProcessingStatus
                    endpoint={`/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${row.document_id}/revisions/${row.id}/processing`}
                    initialRevisionState={row.state}
                    initialRun={null}
                    canRetry={!preview}
                  />
                  <Link href={`/app/${organisationId}/projects/${projectId}/documents/${row.document_id}`} className="mt-2 inline-block text-xs font-semibold text-[#0c5b45]">Open document record and processing details</Link>
                </div>
                <RevisionReviewForm organisationId={organisationId} projectId={projectId} revisionId={row.id} ready={canReview} readOnly={Boolean(preview)} />
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
