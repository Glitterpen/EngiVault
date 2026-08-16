import Link from "next/link";
import { AlertTriangle, ArrowLeft, BadgeCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { requireProject } from "@/lib/auth";
import {
  TransmittalCreateForm,
} from "@/components/transmittal-create-form";
import { projectHomePath } from "@/lib/role-experience";
import {
  classifyLatestAcceptedRevisions,
  groupRevisionTransmittals,
  type AcceptedRevisionCandidate,
  type RevisionTransmittalRecord,
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
  work_packages:
    | { package_number: string; manifest: Record<string, unknown> | null; created_at: string }
    | { package_number: string; manifest: Record<string, unknown> | null; created_at: string }[];
};

export default async function NewTransmittalPage({
  params,
}: {
  params: Promise<{ organisationId: string; projectId: string }>;
}) {
  const { organisationId, projectId } = await params;
  const { supabase, access } = await requireProject(organisationId, projectId);
  const role = String(access.role);
  if (role !== "document_controller") redirect(projectHomePath(organisationId, projectId, role));

  const loadPageData = () => Promise.all([
      supabase
        .from("projects")
        .select("code,name")
        .eq("organisation_id", organisationId)
        .eq("id", projectId)
        .single(),
      supabase
        .from("document_revisions")
        .select(
          "id,revision_code,issue_status,state,created_at,documents!inner(id,document_number,title,discipline,document_type,lifecycle_status)",
        )
        .eq("organisation_id", organisationId)
        .eq("project_id", projectId)
        .eq("control_status", "accepted")
        .in("state", ["quarantined", "processing", "ready", "failed"])
        .eq("documents.lifecycle_status", "active")
        .order("created_at", { ascending: false }),
      supabase
        .from("work_package_items")
        .select("revision_id,work_packages!inner(package_number,manifest,created_at)")
        .eq("organisation_id", organisationId)
        .eq("project_id", projectId)
        .eq("inclusion_state", "included")
        .limit(10_000),
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
  const issueRecords: RevisionTransmittalRecord[] = [];
  for (const row of (issuedRows ?? []) as unknown as IssuedItemRow[]) {
    const pack = Array.isArray(row.work_packages) ? row.work_packages[0] : row.work_packages;
    if (!row.revision_id || !pack || pack.manifest?.kind !== "document_transmittal") continue;
    issueRecords.push({
      revisionId: row.revision_id,
      transmittalNumber: pack.package_number,
      createdAt: pack.created_at,
    });
  }
  const issuedRevisionNumbers = groupRevisionTransmittals(issueRecords);
  const sequence = String((count ?? 0) + 1).padStart(3, "0");
  const defaultNumber = `TR-${project?.code ?? "PROJECT"}-${new Date().getFullYear()}-${sequence}`;

  return (
    <div className="mx-auto max-w-[1180px]">
      <Link
        href={`/app/${organisationId}/projects/${projectId}/control`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45]"
      >
        <ArrowLeft size={16} /> Document control centre
      </Link>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">Controlled client issue</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Create document transmittal</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#617083]">
            Select several approved revisions, freeze the exact issue set, and download one secure ZIP containing the engineering documents and client acknowledgement transmittal PDF.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-[#0c5b45]">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#e8f1ed] px-3 py-2"><BadgeCheck size={15} /> Accepted revisions only</span>
          <span className="inline-flex items-center gap-2 rounded-full bg-[#e8f1ed] px-3 py-2"><ShieldCheck size={15} /> DCC-only issue authority</span>
        </div>
      </div>
      <div className="mt-6">
        <TransmittalCreateForm
          organisationId={organisationId}
          projectId={projectId}
          defaultNumber={defaultNumber}
          revisions={revisions}
          preparing={preparing}
          issuedRevisionNumbers={issuedRevisionNumbers}
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
    <div className="mx-auto max-w-[900px]">
      <Link
        href={`/app/${organisationId}/projects/${projectId}/control`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45]"
      >
        <ArrowLeft size={16} /> Document control centre
      </Link>
      <section className="ev-card mt-6 p-6 sm:p-8">
        <span className="grid size-12 place-items-center rounded-xl bg-[#fff0e9] text-[#b54a2c]">
          <AlertTriangle size={22} />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-.03em]">Transmittal list could not be refreshed</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#617083]">
          EngiCite temporarily lost its secure connection while loading the accepted documents. Check the Work packages list before submitting again, then retry this page.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href={pagePath} className="ev-button">
            <RefreshCw size={16} /> Retry securely
          </a>
          <Link href={`/app/${organisationId}/projects/${projectId}/work-packages`} className="ev-button-secondary">
            Check work packages
          </Link>
        </div>
      </section>
    </div>
  );
}
