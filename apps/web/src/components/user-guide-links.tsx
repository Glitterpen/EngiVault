import { BookOpen, Download, ExternalLink } from "lucide-react";

export function UserGuideLinks({ organisationId, projectId }: { organisationId: string; projectId?: string }) {
  const endpoint = `/api/v1/organisations/${encodeURIComponent(organisationId)}/user-guide`;
  const query = new URLSearchParams();
  if (projectId) query.set("project", projectId);
  const pdfHref = projectId ? `${endpoint}?${query}` : endpoint;
  query.set("format", "docx");

  return (
    <div role="group" aria-label="User guide" className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#10243e]">
        <BookOpen size={17} aria-hidden="true" /> User guide
      </span>
      {/* These are file responses, not app pages. Use regular links with no prefetch. */}
      <a href={pdfHref} target="_blank" rel="noopener noreferrer" aria-label="Open PDF user guide (opens in a new tab)" className="ev-button-secondary min-h-11">
        Open PDF <ExternalLink size={14} aria-hidden="true" />
      </a>
      <a href={`${endpoint}?${query}`} download aria-label="Download Word user guide" className="ev-button-secondary min-h-11">
        <Download size={15} aria-hidden="true" /> Download Word
      </a>
    </div>
  );
}
