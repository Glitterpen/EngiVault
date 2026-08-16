import Link from "next/link";
import { ArrowLeft, BadgeCheck, Download } from "lucide-react";
import { notFound } from "next/navigation";
import { requireProject } from "@/lib/auth";
import { WorkPackageGenerate } from "@/components/work-package-generate";

type PackageManifest = {
  kind?: string;
  included?: number;
  exceptions?: number;
  issued_at?: string;
  recipient?: { company?: string; contact?: string; email?: string };
  issuer?: { name?: string; email?: string };
  acknowledgement?: { status?: string; required?: boolean };
  electronic_seal?: {
    status?: "system_attested" | "electronic_seal" | "qualified_electronic_seal";
    qualification?: string;
    platform?: string;
    trust_service_provider?: string;
    signature_format?: string;
    completed_at?: string;
  };
  message?: string;
};

export default async function PackagePage({
  params,
}: {
  params: Promise<{ organisationId: string; projectId: string; packageId: string }>;
}) {
  const { organisationId, projectId, packageId } = await params;
  const { supabase } = await requireProject(organisationId, projectId);
  const [{ data: pack }, { data: items }] = await Promise.all([
    supabase
      .from("work_packages")
      .select("*")
      .eq("id", packageId)
      .eq("organisation_id", organisationId)
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase.from("work_package_items").select("*").eq("work_package_id", packageId).order("discipline").order("document_number"),
  ]);
  if (!pack) notFound();
  const manifest = (pack.manifest ?? {}) as PackageManifest;
  const isTransmittal = manifest.kind === "document_transmittal";
  const seal = manifest.electronic_seal;
  const isQualifiedSeal = seal?.status === "qualified_electronic_seal" && seal.qualification === "provider_verified";
  const hasElectronicSeal = seal?.status === "electronic_seal" || isQualifiedSeal;
  const endpoint = `/api/v1/organisations/${organisationId}/projects/${projectId}/work-packages/${packageId}`;

  return (
    <div className="mx-auto max-w-7xl">
      <Link href={`/app/${organisationId}/projects/${projectId}/work-packages`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45]">
        <ArrowLeft size={16} /> Transmittals & work packages
      </Link>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-[#e8733f]">{pack.package_number} · VERSION {pack.version}</p>
          <h1 className="mt-2 text-3xl font-semibold">{isTransmittal ? "Client document transmittal" : pack.name}</h1>
          <p className="mt-2 text-sm capitalize text-[#617083]">{pack.state} · {isTransmittal ? `issued to ${manifest.recipient?.company ?? "client"}` : pack.destination.replaceAll("_", " ")}</p>
        </div>
        {pack.state === "ready" ? (
          <a className="ev-button" href={`${endpoint}/download`}>
            <Download size={16} /> {isTransmittal ? "Download transmittal ZIP" : "Download package"}
          </a>
        ) : pack.state === "frozen" || pack.state === "failed" ? (
          <WorkPackageGenerate
            endpoint={`${endpoint}/generate`}
            label={isTransmittal ? "Generate transmittal ZIP" : "Generate package ZIP"}
            loadingLabel={isTransmittal ? "Preparing transmittal and documents…" : "Building secure ZIP…"}
          />
        ) : null}
      </div>

      {isTransmittal && (
        <section className="ev-card mt-6 grid gap-5 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
          <Detail label="Recipient" value={manifest.recipient?.company ?? "—"} secondary={manifest.recipient?.contact} />
          <Detail label="Purpose" value={pack.purpose ?? "—"} />
          <Detail label="System-issued by" value={manifest.issuer?.name ?? "Document Controller"} secondary={manifest.issuer?.email} />
          <Detail label="Client acknowledgement" value={(manifest.acknowledgement?.status ?? "awaiting_client").replaceAll("_", " ")} />
          {manifest.message && <div className="sm:col-span-2 xl:col-span-4"><p className="ev-label">Cover message</p><p className="mt-2 text-sm leading-6 text-[#617083]">{manifest.message}</p></div>}
          <div className={`sm:col-span-2 xl:col-span-4 flex gap-2 rounded-xl p-4 text-xs leading-5 ${isQualifiedSeal ? "bg-[#f1f7f4] text-[#0c5b45]" : "bg-[#fff6ed] text-[#8a4425]"}`}>
            <BadgeCheck className="mt-0.5 shrink-0" size={16} />
            {isQualifiedSeal ? (
              <p><strong>Qualified organisation seal:</strong> the transmittal PDF was sealed through {seal?.platform} using an {seal?.trust_service_provider} qualified certificate in {seal?.signature_format ?? "PAdES"} format. The embedded certificate can be inspected in a trusted PDF reader.</p>
            ) : hasElectronicSeal ? (
              <p><strong>Electronic organisation seal:</strong> an electronic seal is embedded, but EngiCite has not asserted qualified status for the configured certificate.</p>
            ) : (
              <p><strong>EngiCite system attestation only:</strong> the package records the authenticated Document Controller, issue time and frozen document list. This is not a qualified electronic signature or seal.</p>
            )}
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card label="Included" value={Number(manifest.included ?? 0)} />
        <Card label="Exceptions" value={Number(manifest.exceptions ?? 0)} />
        <Card label={isTransmittal ? "Record type" : "Destination"} value={isTransmittal ? "Client transmittal" : pack.destination.replaceAll("_", " ")} />
      </div>
      <div className="ev-card mt-6 overflow-x-auto">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="border-b bg-[#f8faf8] text-xs uppercase text-[#617083]">
            <tr><th className="p-4">Document</th><th>Discipline</th><th>Type</th><th>Revision</th><th>Issue status</th><th>Readiness</th></tr>
          </thead>
          <tbody>
            {items?.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="p-4 font-semibold">{item.document_number}</td><td>{item.discipline}</td><td>{item.document_type}</td><td>{item.revision_code ?? "—"}</td><td>{item.issue_status ?? "—"}</td>
                <td className={item.inclusion_state === "included" ? "font-semibold text-[#0c5b45]" : "font-semibold text-[#a5452f]"}>{item.inclusion_state.replaceAll("_", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return <div className="ev-card p-5"><p className="ev-label">{label}</p><p className="text-2xl font-semibold capitalize">{value}</p></div>;
}

function Detail({ label, value, secondary }: { label: string; value: string; secondary?: string }) {
  return <div><p className="ev-label">{label}</p><p className="mt-2 font-semibold capitalize">{value}</p>{secondary && <p className="mt-1 text-xs text-[#617083]">{secondary}</p>}</div>;
}
