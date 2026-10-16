import Link from "next/link";
import { ArrowLeft, BadgeCheck, ChevronDown, Download, FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { requireProject } from "@/lib/auth";
import { WorkPackageGenerate } from "@/components/work-package-generate";
import { WorkspacePageHeading } from "@/components/workspace-page-heading";

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
    <div className="mx-auto min-w-0 max-w-6xl">
      <Link href={`/app/${organisationId}/projects/${projectId}/work-packages`} className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[#0c5b45]">
        <ArrowLeft size={16} aria-hidden="true" /> Transmittals & work packages
      </Link>
      <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div className="min-w-0 flex-1"><WorkspacePageHeading
        title={isTransmittal ? "Client document transmittal" : pack.name}
        context={<><span className="break-all">{pack.package_number}</span> · Version {pack.version}</>}
      /></div>{(pack.state === "ready"||pack.state === "frozen"||pack.state === "failed")&&<div className="w-full shrink-0 sm:w-auto xl:max-w-sm">{pack.state === "ready" ? (
          <a className="ev-button min-h-11 w-full justify-center sm:w-auto" href={`${endpoint}/download`}>
            <Download size={16} aria-hidden="true" /> {isTransmittal ? "Download transmittal ZIP" : "Download package"}
          </a>
        ) : pack.state === "frozen" || pack.state === "failed" ? (
          <WorkPackageGenerate
            endpoint={`${endpoint}/generate`}
            label={isTransmittal ? "Generate transmittal ZIP" : "Generate package ZIP"}
            loadingLabel={isTransmittal ? "Preparing transmittal and documents…" : "Building secure ZIP…"}
          />
        ) : null}</div>}</div>

      <dl aria-label="Package summary" className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-[#dfe7e3] bg-white px-4 py-4 lg:grid-cols-4 sm:px-5">
        <Detail label="Status" value={pack.state.replaceAll("_", " ")} />
        <Detail label="Included" value={String(Number(manifest.included ?? 0))} />
        <Detail label="Exceptions" value={String(Number(manifest.exceptions ?? 0))} />
        <Detail label={isTransmittal ? "Recipient" : "Destination"} value={isTransmittal ? manifest.recipient?.company ?? "Client" : pack.destination.replaceAll("_", " ")} />
      </dl>

      {isTransmittal && <>
        <details className="ev-card group mt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#10243e] sm:px-5 [&::-webkit-details-marker]:hidden">
            Recipient & issue details
            <ChevronDown size={16} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <div className="border-t border-[#e5ece8] px-4 py-4 sm:px-5">
            <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="Recipient" value={manifest.recipient?.company ?? "—"} secondary={manifest.recipient?.contact} />
              <Detail label="Purpose" value={pack.purpose ?? "—"} />
              <Detail label="System-issued by" value={manifest.issuer?.name ?? "Document Controller"} secondary={manifest.issuer?.email} />
              <Detail label="Client acknowledgement" value={(manifest.acknowledgement?.status ?? "awaiting_client").replaceAll("_", " ")} />
              {manifest.message && <Detail label="Cover message" value={manifest.message} className="sm:col-span-2 lg:col-span-4" />}
            </dl>
          </div>
        </details>
        <section aria-label="Seal qualification" className="mt-3 flex gap-2.5 rounded-xl border border-[#dfe7e3] bg-[#f7f9f8] px-4 py-3 text-xs leading-5 text-[#526675]">
            <BadgeCheck className="mt-0.5 shrink-0 text-[#526675]" size={16} aria-hidden="true" />
            {isQualifiedSeal ? (
              <p><strong>Qualified organisation seal:</strong> the transmittal PDF contains a provider-verified qualified certificate. The embedded certificate, its issuer and signature format can be inspected in a trusted PDF reader.</p>
            ) : hasElectronicSeal ? (
              <p><strong>Electronic organisation seal:</strong> an electronic seal is embedded, but EngiCite has not asserted qualified status for the configured certificate.</p>
            ) : (
              <p><strong>EngiCite system attestation only:</strong> the package records the authenticated Document Controller, issue time and frozen document list. This is not a qualified electronic signature or seal.</p>
            )}
        </section>
      </>}

      <section aria-labelledby="package-documents-heading" className="ev-card mt-4 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5ece8] px-4 py-4 sm:px-5">
          <h2 id="package-documents-heading" className="text-base font-semibold text-[#10243e]">Package documents</h2>
          <span className="text-xs text-[#526675]">{items?.length ?? 0} document{items?.length === 1 ? "" : "s"}</span>
        </div>
        {items?.length ? <ul className="divide-y divide-[#e5ece8]">
          {items.map((item) => (
            <li key={item.id} className="min-w-0 px-4 py-4 sm:px-5">
              <article className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,0.6fr)] lg:items-start">
                <h3 className="flex min-w-0 items-start gap-2 text-sm font-semibold leading-6 text-[#10243e]"><FileText size={16} className="mt-1 shrink-0 text-[#617083]" aria-hidden="true" /><span className="min-w-0 break-all">{item.document_number}</span></h3>
                <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 xl:grid-cols-4">
                  <Detail label="Discipline" value={item.discipline} />
                  <Detail label="Type" value={item.document_type} />
                  <Detail label="Revision" value={item.revision_code ?? "—"} />
                  <Detail label="Issue status" value={item.issue_status ?? "—"} />
                </dl>
                <dl className="min-w-0"><dt className="mb-1 text-xs text-[#526675]">Readiness</dt><dd className={`inline-flex max-w-full rounded-md px-2 py-1 text-xs font-semibold leading-5 ${item.inclusion_state === "included" ? "bg-[#eef5f1] text-[#0c5b45]" : "bg-[#fff2ed] text-[#93402d]"}`}><span className="min-w-0 break-words">{item.inclusion_state.replaceAll("_", " ")}</span></dd></dl>
              </article>
            </li>
          ))}
        </ul> : <p className="px-4 py-8 text-sm text-[#526675] sm:px-5">No documents are recorded in this package.</p>}
      </section>
    </div>
  );
}

function Detail({ label, value, secondary, className = "" }: { label: string; value: string; secondary?: string; className?: string }) {
  return <div className={`min-w-0 ${className}`}><dt className="text-xs text-[#526675]">{label}</dt><dd className="mt-1 break-words text-sm font-medium leading-6 text-[#10243e]">{value}{secondary && <span className="mt-0.5 block break-all text-xs font-normal leading-5 text-[#526675]">{secondary}</span>}</dd></div>;
}
