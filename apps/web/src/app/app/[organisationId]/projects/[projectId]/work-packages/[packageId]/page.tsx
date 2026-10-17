import Link from "next/link";
import { ArrowLeft, BadgeCheck, ChevronDown, Download } from "lucide-react";
import { notFound } from "next/navigation";
import { requireProject } from "@/lib/auth";
import { WorkPackageGenerate } from "@/components/work-package-generate";
import { WorkspacePageHeading } from "@/components/workspace-page-heading";
import {ReadUnavailable} from "@/components/read-unavailable";
import {WorkPackageDocuments, type WorkPackageDocument} from "@/components/work-package-documents";

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
  const retryHref=`/app/${organisationId}/projects/${projectId}/work-packages/${packageId}`;
  const [{ data: pack, error: packageError }, { data: items, error: itemsError }] = await Promise.all([
    supabase
      .from("work_packages")
      .select("*")
      .eq("id", packageId)
      .eq("organisation_id", organisationId)
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase.from("work_package_items").select("*").eq("work_package_id", packageId).order("discipline").order("document_number"),
  ]);
  if(packageError)return <ReadUnavailable title="Work package is temporarily unavailable" href={retryHref}/>;
  if (!pack) notFound();
  if(itemsError)return <ReadUnavailable title="Package documents are temporarily unavailable" href={retryHref}>The frozen document list could not be loaded. Retry before generating or checking this package.</ReadUnavailable>;
  const manifest = (pack.manifest ?? {}) as PackageManifest;
  const isTransmittal = manifest.kind === "document_transmittal";
  const seal = manifest.electronic_seal;
  const isQualifiedSeal = seal?.status === "qualified_electronic_seal" && seal.qualification === "provider_verified";
  const hasElectronicSeal = seal?.status === "electronic_seal" || isQualifiedSeal;
  const endpoint = `/api/v1/organisations/${organisationId}/projects/${projectId}/work-packages/${packageId}`;

  return (
    <div className="mx-auto min-w-0 max-w-6xl">
      <Link href={`/app/${organisationId}/projects/${projectId}/work-packages`} className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[#10243e]">
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

      <dl aria-label="Package summary" className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-[#d6e0ed] bg-white px-4 py-4 lg:grid-cols-4 sm:px-5">
        <Detail label="Status" value={packageStateLabel(pack.state, isTransmittal)} />
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
          <div className="border-t border-[#dce5ef] px-4 py-4 sm:px-5">
            <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="Recipient" value={manifest.recipient?.company ?? "—"} secondary={manifest.recipient?.contact} />
              <Detail label="Purpose" value={pack.purpose ?? "—"} />
              <Detail label="System-issued by" value={manifest.issuer?.name ?? "Document Controller"} secondary={manifest.issuer?.email} />
              <Detail label="Client acknowledgement" value={(manifest.acknowledgement?.status ?? "awaiting_client").replaceAll("_", " ")} />
              {manifest.message && <Detail label="Cover message" value={manifest.message} className="sm:col-span-2 lg:col-span-4" />}
            </dl>
          </div>
        </details>
        <section aria-label="Seal qualification" className="mt-3 flex gap-2.5 rounded-xl border border-[#d6e0ed] bg-[#f7f9fc] px-4 py-3 text-xs leading-5 text-[#526675]">
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

      <WorkPackageDocuments items={(items ?? []).map((item: WorkPackageDocument) => ({id: item.id, document_number: item.document_number, discipline: item.discipline, document_type: item.document_type, revision_code: item.revision_code, issue_status: item.issue_status, inclusion_state: item.inclusion_state}))} />
    </div>
  );
}

function packageStateLabel(state: string, transmittal: boolean) {
  if (state === "ready") return transmittal ? "Transmittal generated" : "Ready to download";
  if (state === "frozen") return "Frozen · awaiting ZIP";
  if (state === "generating") return "Preparing ZIP";
  if (state === "failed") return "Generation failed";
  const label = state.replaceAll("_", " ");
  return label ? label[0].toUpperCase() + label.slice(1) : "Status unavailable";
}

function Detail({ label, value, secondary, className = "" }: { label: string; value: string; secondary?: string; className?: string }) {
  return <div className={`min-w-0 ${className}`}><dt className="text-xs text-[#526675]">{label}</dt><dd className="mt-1 break-words text-sm font-medium leading-6 text-[#10243e]">{value}{secondary && <span className="mt-0.5 block break-all text-xs font-normal leading-5 text-[#526675]">{secondary}</span>}</dd></div>;
}
