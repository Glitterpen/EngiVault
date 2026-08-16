import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Package, Send } from "lucide-react";
import { requireProject } from "@/lib/auth";
import { WorkPackageCreateForm } from "@/components/work-package-create-form";
import { projectHomePath } from "@/lib/role-experience";

type PackageRow = {
  id: string;
  package_number: string;
  name: string;
  version: number;
  state: string;
  destination: string;
  manifest: { kind?: string; recipient?: { company?: string } } | null;
  created_at: string;
};

export default async function WorkPackagesPage({
  params,
}: {
  params: Promise<{ organisationId: string; projectId: string }>;
}) {
  const { organisationId, projectId } = await params;
  const { supabase, access } = await requireProject(organisationId, projectId);
  const role = String(access.role);
  if (role !== "document_controller") redirect(projectHomePath(organisationId, projectId, role));
  const [{ data: packages }, { data: docs }] = await Promise.all([
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
  const disciplines = [...new Set((docs ?? []).map((row) => row.discipline))].sort();

  return (
    <div className="mx-auto max-w-7xl">
      <Link
        href={`/app/${organisationId}/projects/${projectId}/control`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45]"
      >
        <ArrowLeft size={16} /> Document control centre
      </Link>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">Controlled issue and handover</p>
          <h1 className="mt-2 text-3xl font-semibold">Transmittals & engineering work packages</h1>
          <p className="mt-2 text-sm text-[#617083]">Issue selected documents to a client or freeze authorised revisions into a final project package.</p>
        </div>
        <Link className="ev-button" href={`/app/${organisationId}/projects/${projectId}/work-packages/transmittals/new`}>
          <Send size={16} /> New client transmittal
        </Link>
      </div>
      <div className="mt-7 grid items-start gap-5 lg:grid-cols-[1fr_360px]">
        <section className="space-y-3">
          {(packages as PackageRow[] | null)?.map((item) => {
            const isTransmittal = item.manifest?.kind === "document_transmittal";
            return (
              <Link
                key={item.id}
                href={`/app/${organisationId}/projects/${projectId}/work-packages/${item.id}`}
                className="ev-card flex items-center gap-4 p-5"
              >
                <span className={`grid size-11 place-items-center rounded-xl ${isTransmittal ? "bg-[#e8f1ed] text-[#0c5b45]" : "bg-[#fff0e9] text-[#e8733f]"}`}>
                  {isTransmittal ? <Send size={19} /> : <Package size={20} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[#e8733f]">{item.package_number} · V{item.version}</p>
                  <h2 className="mt-1 truncate font-semibold">{isTransmittal ? "Client document transmittal" : item.name}</h2>
                  <p className="mt-1 text-xs capitalize text-[#617083]">
                    {item.state} · {isTransmittal ? `To ${item.manifest?.recipient?.company ?? "client"}` : item.destination.replaceAll("_", " ")}
                  </p>
                </div>
                <ArrowRight size={18} />
              </Link>
            );
          })}
          {!packages?.length && <div className="ev-card p-10 text-center text-[#617083]">No transmittals or work packages created yet.</div>}
        </section>
        <div className="space-y-4">
          <article className="ev-card border-l-4 border-l-[#0c5b45] p-5">
            <h2 className="font-semibold">Need to transmit selected documents?</h2>
            <p className="mt-2 text-xs leading-5 text-[#617083]">Use a client transmittal to choose several accepted revisions and produce an acknowledgement cover.</p>
            <Link className="ev-button-secondary mt-4 w-full" href={`/app/${organisationId}/projects/${projectId}/work-packages/transmittals/new`}>
              <Send size={16} /> Create transmittal
            </Link>
          </article>
          <WorkPackageCreateForm organisationId={organisationId} projectId={projectId} disciplines={disciplines} />
        </div>
      </div>
    </div>
  );
}
