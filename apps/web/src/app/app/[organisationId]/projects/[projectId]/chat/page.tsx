import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProjectChat } from "@/components/project-chat";
import { requireProject } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {canOpenOperationalMdr,projectHomePath} from "@/lib/role-experience";
import {ReadUnavailable} from "@/components/read-unavailable";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ organisationId: string; projectId: string }>;
}) {
  const { organisationId, projectId } = await params;
  const { supabase, access } = await requireProject(organisationId, projectId);
  const base = `/app/${organisationId}/projects/${projectId}`;
  const role=String(access.role),canOpenMdr=canOpenOperationalMdr(role);
  const backHref=canOpenMdr?`${base}/documents`:projectHomePath(organisationId,projectId,role);

  if (!can(role, "ai:use")) {
    return (
      <div className="ev-card mx-auto min-w-0 max-w-2xl p-5 sm:p-8">
        <h1 className="text-2xl font-semibold">AI chat unavailable</h1>
        <p className="mt-3 text-sm text-[#617083]">
          Your project role does not include AI question access.
        </p>
        <Link
          className="mt-5 inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-[#10243e]"
          href={backHref}
        >
          {canOpenMdr?"Return to documents":"Return to project workspace"}
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
  if(scopeResult.error)return <ReadUnavailable title="Project evidence is temporarily unavailable" href={`${base}/chat`}>Your authorised revision scope could not be loaded. Retry before starting a question.</ReadUnavailable>;

  return (
    <div className="mx-auto min-w-0 w-full max-w-[1500px]">
      <Link
        href={backHref}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[#10243e]"
      >
        <ArrowLeft size={16} className="shrink-0" aria-hidden="true"/>{canOpenMdr?"Back to document register":"Back to project workspace"}
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
