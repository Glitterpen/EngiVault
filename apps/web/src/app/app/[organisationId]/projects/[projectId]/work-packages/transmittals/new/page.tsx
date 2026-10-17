import {WorkspacePageHeading} from "@/components/workspace-page-heading";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { redirect } from "next/navigation";
import { requireProject } from "@/lib/auth";
import {
  TransmittalCreateForm,
} from "@/components/transmittal-create-form";
import { projectHomePath } from "@/lib/role-experience";
import { loadTransmittalRows, loadTransmittalHistoryRows, TRANSMITTAL_PAGE_SIZE } from "@/lib/load-transmittal-rows";
import {
  classifyLatestAcceptedRevisions,
  groupRevisionTransmittals,
  type AcceptedRevisionCandidate,
  type TransmittalHistoryItem,
} from "@/lib/transmittal-revisions";

export const dynamic = "force-dynamic";

type RevisionRow = {
  id: string;
  revision_code: string;
  issue_status: string;
  state: string;
  created_at: string;
  documents:
    | {
        id: string;
        document_number: string;
        title: string;
        discipline: string;
        document_type: string;
      }
    | {
        id: string;
        document_number: string;
        title: string;
        discipline: string;
        document_type: string;
      }[];
};

type IssuedItemRow = {
  revision_id: string | null;
  document_id: string;
  document_number: string;
  revision_code: string;
  discipline: string;
  issue_status: string;
  work_packages:
    | { id: string; state: string; package_number: string; manifest: Record<string, unknown> | null; created_at: string }
    | { id: string; state: string; package_number: string; manifest: Record<string, unknown> | null; created_at: string }[];
};

export default async function NewTransmittalPage({
  params,
}: {
  params: Promise<{ organisationId: string; projectId: string }>;
}) {
  const { organisationId, projectId } = await params;
  const { supabase, access, preview } = await requireProject(organisationId, projectId);
  const role = String(access.role);
  if (role !== "document_controller") redirect(projectHomePath(organisationId, projectId, role));

  const loadPageData = () => Promise.all([
      supabase
        .from("projects")
        .select("code,name,client_name")
        .eq("organisation_id", organisationId)
        .eq("id", projectId)
        .single(),
      loadTransmittalRows<RevisionRow>((offset) => supabase
        .from("document_revisions")
        .select(
          "id,revision_code,issue_status,state,created_at,documents!inner(id,document_number,title,discipline,document_type,lifecycle_status)",
          {count: "exact"},
        )
        .eq("organisation_id", organisationId)
        .eq("project_id", projectId)
        .eq("control_status", "accepted")
        .in("state", ["quarantined", "processing", "ready", "failed"])
        .eq("documents.lifecycle_status", "active")
        .order("id")
        .range(offset, offset + TRANSMITTAL_PAGE_SIZE - 1)),
      loadTransmittalHistoryRows<IssuedItemRow>(supabase, organisationId, projectId),
      supabase
        .from("work_packages")
        .select("id", { count: "exact", head: true })
        .eq("organisation_id", organisationId)
        .eq("project_id", projectId),
    ]);

  let pageData: Awaited<ReturnType<typeof loadPageData>>;
  try {
    pageData = await loadPageData();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      pageData = await loadPageData();
    } catch {
      return <TransmittalLoadError organisationId={organisationId} projectId={projectId} />;
    }
  }

  const [projectResult, revisionResult, issuedResult, countResult] = pageData;
  if (projectResult.error || revisionResult.error || issuedResult.error || countResult.error) {
    return <TransmittalLoadError organisationId={organisationId} projectId={projectId} />;
  }
  const { data: project } = projectResult;
  const { data: revisionRows } = revisionResult;
  const { data: issuedRows } = issuedResult;
  const { count } = countResult;

  const candidates: AcceptedRevisionCandidate[] = [];
  for (const row of (revisionRows ?? []) as RevisionRow[]) {
    const document = Array.isArray(row.documents) ? row.documents[0] : row.documents;
    if (!document) continue;
    candidates.push({
      id: row.id,
      documentId: document.id,
      documentNumber: document.document_number,
      title: document.title,
      discipline: document.discipline,
      documentType: document.document_type,
      revisionCode: row.revision_code,
      issueStatus: row.issue_status,
      state: row.state,
      createdAt: row.created_at,
    });
  }
  const { ready: revisions, preparing } = classifyLatestAcceptedRevisions(candidates);
  const issueRecords: TransmittalHistoryItem[] = [];
  for (const row of (issuedRows ?? []) as unknown as IssuedItemRow[]) {
    const pack = Array.isArray(row.work_packages) ? row.work_packages[0] : row.work_packages;
    if (!row.revision_id || !pack || pack.manifest?.kind !== "document_transmittal") continue;
    issueRecords.push({
      revisionId: row.revision_id,
      transmittalNumber: pack.package_number,
      createdAt: pack.created_at,
      packageId: pack.id,
      packageState: pack.state,
      documentId: row.document_id,
      documentNumber: row.document_number,
      revisionCode: row.revision_code,
      discipline: row.discipline,
      issueStatus: row.issue_status,
    });
  }
  const issuedRevisionNumbers = groupRevisionTransmittals(issueRecords);
  const sequence = String((count ?? 0) + 1).padStart(3, "0");
  const defaultNumber = `TR-${project?.code ?? "PROJECT"}-${new Date().getFullYear()}-${sequence}`;

  return (
    <div className="mx-auto min-w-0 max-w-6xl">
      <Link
        href={`/app/${organisationId}/projects/${projectId}/control`}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#10243e]"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Document control centre
      </Link>
      <div className="mt-2">
        <WorkspacePageHeading
          title="Create document transmittal"
          context={<>{project?.code ?? "Project"}{project?.name ? ` · ${project.name}` : ""} · Controlled client issue</>}
          actions={<Link href={`/app/${organisationId}/projects/${projectId}/work-packages`} className="ev-button-secondary min-h-11">Work packages</Link>}
        />
      </div>
      <div className="mt-4">
        <TransmittalCreateForm
          organisationId={organisationId}
          projectId={projectId}
          defaultNumber={defaultNumber}
          clientName={project?.client_name?.trim() || null}
          revisions={revisions}
          preparing={preparing}
          issuedRevisionNumbers={issuedRevisionNumbers}
          history={issueRecords}
          readOnly={Boolean(preview)}
        />
      </div>
    </div>
  );
}

function TransmittalLoadError({
  organisationId,
  projectId,
}: {
  organisationId: string;
  projectId: string;
}) {
  const pagePath = `/app/${organisationId}/projects/${projectId}/work-packages/transmittals/new`;
  return (
    <div className="mx-auto min-w-0 max-w-[900px]">
      <Link
        href={`/app/${organisationId}/projects/${projectId}/control`}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#10243e]"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Document control centre
      </Link>
      <section className="ev-card mt-4 p-4 sm:p-6">
        <span className="grid size-12 place-items-center rounded-xl bg-[#fff0e9] text-[#b54a2c]">
          <AlertTriangle size={22} aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-.03em]">Transmittal list could not be refreshed</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#617083]">
          EngiCite could not safely load the accepted documents and transmission history. Check the Work packages list before submitting again, then retry this page.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a href={pagePath} className="ev-button min-h-11">
            <RefreshCw size={16} aria-hidden="true" /> Retry securely
          </a>
          <Link href={`/app/${organisationId}/projects/${projectId}/work-packages`} className="ev-button-secondary min-h-11">
            Check work packages
          </Link>
        </div>
      </section>
    </div>
  );
}
