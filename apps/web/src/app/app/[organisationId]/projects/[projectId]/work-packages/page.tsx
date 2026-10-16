import {HelpTip} from "@/components/help-tip";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, RefreshCw, Send } from "lucide-react";
import { requireProject } from "@/lib/auth";
import { WorkPackageCreateForm } from "@/components/work-package-create-form";
import { projectHomePath } from "@/lib/role-experience";
import {WorkspacePageHeading} from "@/components/workspace-page-heading";
import {WorkPackageList,type WorkPackageListItem} from "@/components/work-package-list";

export default async function WorkPackagesPage({
  params,
}: {
  params: Promise<{ organisationId: string; projectId: string }>;
}) {
  const { organisationId, projectId } = await params;
  const { supabase, access } = await requireProject(organisationId, projectId);
  const role = String(access.role);
  if (role !== "document_controller") redirect(projectHomePath(organisationId, projectId, role));
  const [packageResult, documentResult] = await Promise.all([
    supabase
      .from("work_packages")
      .select("id,package_number,name,version,state,destination,manifest,created_at")
      .eq("organisation_id", organisationId)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("documents")
      .select("discipline")
      .eq("organisation_id", organisationId)
      .eq("project_id", projectId),
  ]);
  if(packageResult.error||documentResult.error)return <div className="mx-auto min-w-0 max-w-6xl">
    <Link href={`/app/${organisationId}/projects/${projectId}/control`} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[#10243e]"><ArrowLeft size={16} aria-hidden="true"/>Document control centre</Link>
    <section className="ev-card mt-3 p-4 sm:p-6"><AlertTriangle size={24} aria-hidden="true" className="text-[#a5452f]"/><h1 className="mt-3 text-2xl font-semibold">Work packages could not be loaded</h1><p className="mt-2 text-sm leading-6 text-[#526675]">EngiCite could not safely load the package history and discipline scope. Retry before creating another transmittal or package.</p><a href={`/app/${organisationId}/projects/${projectId}/work-packages`} className="ev-button mt-4 w-full sm:w-auto"><RefreshCw size={16} aria-hidden="true"/>Retry securely</a></section>
  </div>;
  const {data:packages}=packageResult;
  const {data:docs}=documentResult;
  const disciplines = [...new Set((docs ?? []).map((row) => row.discipline))].sort();

  return (
    <div className="mx-auto min-w-0 max-w-6xl">
      <Link
        href={`/app/${organisationId}/projects/${projectId}/control`}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[#10243e]"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Document control centre
      </Link>
      <header className="mt-1"><WorkspacePageHeading title="Transmittals & work packages" context="Controlled document issue and engineering handover" help={<HelpTip label="Controlled work packages">Issue selected accepted revisions to a client, or freeze authorised revisions into an engineering package. Generated transmittals are not proof that the client received them.</HelpTip>} actions={<Link className="ev-button min-h-11" href={`/app/${organisationId}/projects/${projectId}/work-packages/transmittals/new`}><Send size={16} aria-hidden="true"/>New client transmittal</Link>}/></header>
      <div className="mt-4 min-w-0 space-y-4">
        <details id="create-work-package" className="ev-card min-w-0 scroll-mt-24 overflow-hidden"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold sm:px-5">Create frozen package</summary><div className="border-t border-[#e7ecef] p-4 sm:p-5"><WorkPackageCreateForm organisationId={organisationId} projectId={projectId} disciplines={disciplines}/></div></details>
        <WorkPackageList organisationId={organisationId} projectId={projectId} packages={(packages??[]) as WorkPackageListItem[]}/>
      </div>
    </div>
  );
}
