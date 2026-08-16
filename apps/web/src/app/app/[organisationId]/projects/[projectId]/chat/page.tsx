import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProjectChat } from "@/components/project-chat";
import { requireProject } from "@/lib/auth";
import { can } from "@/lib/permissions";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ organisationId: string; projectId: string }>;
}) {
  const { organisationId, projectId } = await params;
  const { supabase, access } = await requireProject(organisationId, projectId);
  const base = `/app/${organisationId}/projects/${projectId}`;

  if (!can(String(access.role), "ai:use")) {
    return (
      <div className="ev-card mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold">AI chat unavailable</h1>
        <p className="mt-3 text-sm text-[#617083]">
          Your project role does not include AI question access.
        </p>
        <Link
          className="mt-5 inline-flex text-sm font-bold text-[#0c5b45]"
          href={`${base}/documents`}
        >
          Return to documents
        </Link>
      </div>
    );
  }

  const scopeResult = await supabase
    .from("document_revisions")
    .select(
      "id,revision_code,document_id,documents!inner(document_number,title)",
    )
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId)
    .eq("state", "ready")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto w-full max-w-[1500px]">
      <Link
        href={`${base}/documents`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45]"
      >
        <ArrowLeft size={16} /> Back to document register
      </Link>
      <div className="mt-5">
        <ProjectChat
          organisationId={organisationId}
          projectId={projectId}
          revisions={(scopeResult.data ?? []) as never}
        />
      </div>
    </div>
  );
}
