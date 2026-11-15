import { BookOpen } from "lucide-react";

export function UserGuideLink({ organisationId, projectId }: { organisationId: string; projectId?: string }) {
  const endpoint = `/api/v1/organisations/${encodeURIComponent(organisationId)}/user-guide`;
  const pdfHref = projectId ? `${endpoint}?project=${encodeURIComponent(projectId)}` : endpoint;

  return (
    <a href={pdfHref} target="_blank" rel="noopener noreferrer" aria-label="User guide (PDF, opens in a new tab)" className="ev-button-secondary mt-2 min-h-11">
      <BookOpen size={17} aria-hidden="true" /> User guide
    </a>
  );
}
