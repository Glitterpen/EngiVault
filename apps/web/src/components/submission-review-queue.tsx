import Link from "next/link";
import { ChevronDown, Download, Eye, FileCog } from "lucide-react";
import { RevisionProcessingStatus } from "@/components/revision-processing-status";
import { RevisionReviewForm } from "@/components/revision-review-form";

export type SubmissionReviewRow = {
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

export function SubmissionReviewQueue({ organisationId, projectId, rows, readOnly = false }: {
  organisationId: string;
  projectId: string;
  rows: SubmissionReviewRow[];
  readOnly?: boolean;
}) {
  const projectBase = `/app/${organisationId}/projects/${projectId}`;
  const apiBase = `/api/v1/organisations/${organisationId}/projects/${projectId}/documents`;
  const firstReadyIndex = rows.findIndex((row) => row.state === "ready");
  const expandedIndex = firstReadyIndex < 0 ? 0 : firstReadyIndex;

  return <div className="space-y-3">
    {rows.map((row, index) => {
      const ready = row.state === "ready";
      const failed = row.state === "failed";
      const processing = ["quarantined", "queued", "processing"].includes(row.state);
      const stateLabel = ready ? "Ready" : failed ? "Failed" : processing ? "Processing" : row.state.replaceAll("_", " ");
      const documentNumber = row.documents?.document_number ?? "Document";
      const revisionBase = `${apiBase}/${row.document_id}/revisions/${row.id}`;

      return <details key={row.id} open={index === expandedIndex} className="group ev-card min-w-0 overflow-hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#617083]">
              <span className="break-all font-semibold text-[#20384f]">{documentNumber}</span>
              <span>Revision {row.revision_code}</span>
              <span>{row.documents?.discipline}</span>
              <span className={`max-w-28 break-words rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${failed ? "bg-[#fff0eb] text-[#9b3b27]" : ready ? "bg-[#eef4f1] text-[#0c5b45]" : processing ? "bg-[#fff7dd] text-[#7a5a00]" : "bg-[#f2f5f3] text-[#4f625d]"}`}>
                {stateLabel}
              </span>
            </div>
            <h2 className="mt-1 break-words text-base font-semibold text-[#102842]">{row.documents?.title ?? "Submitted document"}</h2>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5 text-[#617083]">
              <span>{row.issue_status}</span>
              <span>Submitted <time dateTime={row.created_at}>{new Date(row.created_at).toLocaleDateString("en-GB", { timeZone: "UTC" })}</time></span>
            </p>
          </div>
          <ChevronDown aria-hidden="true" size={16} className="mt-1 shrink-0 text-[#617083] transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>

        <div className="space-y-4 border-t border-[#e3e9e6] p-4">
          <div className="flex flex-wrap items-center gap-2">
            {ready ? <>
              <Link href={`${projectBase}/documents/${row.document_id}/revisions/${row.id}/preview`} target="_blank" rel="noopener noreferrer" className="ev-button min-h-11" aria-label={`Open secure preview for ${documentNumber}, revision ${row.revision_code} (opens in a new tab)`}>
                <Eye aria-hidden="true" size={16} /> Open secure preview
              </Link>
              <a href={`${revisionBase}/download`} target="_blank" rel="noopener noreferrer" className="ev-button-secondary min-h-11" aria-label={`Download original file for ${documentNumber}, revision ${row.revision_code}`}>
                <Download aria-hidden="true" size={16} /> Original file
              </a>
              {row.native_original_filename ? <a href={`${revisionBase}/native-download`} target="_blank" rel="noopener noreferrer" className="ev-button-secondary min-h-11" aria-label={`Download native source for ${documentNumber}, revision ${row.revision_code}`}>
                <FileCog aria-hidden="true" size={16} /> Native source
              </a> : null}
            </> : <div className="min-w-0 [&_button]:min-h-11 [&_button]:px-3">
              <RevisionProcessingStatus endpoint={`${revisionBase}/processing`} initialRevisionState={row.state} initialRun={null} canRetry={!readOnly} />
            </div>}
            <Link href={`${projectBase}/documents/${row.document_id}`} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-[#0c5b45]" aria-label={`Open document record for ${documentNumber}`}>
              Document record
            </Link>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <FileDetail label="Submitted file" value={row.original_filename} />
            {row.native_original_filename ? <FileDetail label="Editable native source" value={row.native_original_filename} /> : null}
          </dl>

          <RevisionReviewForm organisationId={organisationId} projectId={projectId} revisionId={row.id} ready={ready} readOnly={readOnly} />
        </div>
      </details>;
    })}
  </div>;
}

function FileDetail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0">
    <dt className="text-xs text-[#617083]">{label}</dt>
    <dd className="mt-1 break-all text-[#20384f]">{value}</dd>
  </div>;
}
