"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCheck, Clock3, FileCheck2, RefreshCw, Send } from "lucide-react";
import { createDocumentTransmittal, type MutationState } from "@/app/app/actions";
import type {
  PreparingTransmittalRevision,
  TransmittalRevision,
} from "@/lib/transmittal-revisions";

export function TransmittalCreateForm({
  organisationId,
  projectId,
  defaultNumber,
  revisions,
  preparing,
  issuedRevisionNumbers,
}: {
  organisationId: string;
  projectId: string;
  defaultNumber: string;
  revisions: TransmittalRevision[];
  preparing: PreparingTransmittalRevision[];
  issuedRevisionNumbers: Record<string, string[]>;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<MutationState, FormData>(
    createDocumentTransmittal,
    undefined,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [preparingMessage, setPreparingMessage] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allSelected = revisions.length > 0 && selected.length === revisions.length;
  const activePreparing = preparing.some((revision) =>
    ["quarantined", "processing"].includes(revision.state),
  );
  const processEndpoint = `/api/v1/organisations/${organisationId}/projects/${projectId}/work-packages/transmittals/process`;

  useEffect(() => {
    if (!activePreparing) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function advanceQueue() {
      setPreparingMessage("Preparing recently accepted files for transmission...");
      try {
        const response = await fetch(processEndpoint, { method: "POST", cache: "no-store" });
        if (!response.ok) throw new Error("Processing is temporarily unavailable.");
        if (!cancelled) {
          router.refresh();
          timer = setTimeout(advanceQueue, 4000);
        }
      } catch {
        if (!cancelled) {
          setPreparingMessage("Automatic preparation paused. Use Refresh accepted list to try again.");
          timer = setTimeout(advanceQueue, 10000);
        }
      }
    }

    void advanceQueue();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activePreparing, processEndpoint, router]);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="projectId" value={projectId} />

      <section className="ev-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#fff0e9] text-[#e8733f]">
            <Send size={19} />
          </span>
          <div>
            <h2 className="font-semibold">Transmission details</h2>
            <p className="mt-1 text-xs leading-5 text-[#617083]">
              These details are frozen into the EngiCite transmittal cover and audit record.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field name="transmittalNumber" label="Transmittal number" defaultValue={defaultNumber} />
          <Field name="recipientCompany" label="Client / recipient company" placeholder="Client organisation" />
          <Field name="recipientContact" label="Attention" placeholder="Client representative" optional />
          <Field name="recipientEmail" label="Recipient email" type="email" placeholder="representative@client.com" optional />
          <label className="sm:col-span-2">
            <span className="ev-label">Transmission purpose</span>
            <select className="ev-input" name="purpose" required defaultValue="Issued for Review">
              <option>Issued for Review</option>
              <option>Issued for Approval</option>
              <option>Issued for Information</option>
              <option>Issued for Construction</option>
              <option>Issued for Handover</option>
              <option>Final documentation</option>
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="ev-label">Cover message (optional)</span>
            <textarea
              className="ev-input min-h-24 resize-y"
              name="message"
              maxLength={2000}
              placeholder="Please acknowledge receipt and record any comments on the enclosed transmittal form."
            />
          </label>
        </div>
      </section>

      <section className="ev-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4ebe7] px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-semibold">Select accepted documents</h2>
            <p className="mt-1 text-xs text-[#617083]">
              Only the latest DCC-accepted, processing-ready revision of each document is available.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ev-button-secondary" onClick={() => router.refresh()}>
              <RefreshCw size={16} /> Refresh accepted list
            </button>
            <button
              type="button"
              className="ev-button-secondary"
              disabled={!revisions.length}
              onClick={() => setSelected(allSelected ? [] : revisions.map((revision) => revision.id))}
            >
              <CheckCheck size={16} /> {allSelected ? "Clear selection" : "Select all"}
            </button>
          </div>
        </div>
        {preparing.length > 0 && (
          <div className="border-b border-[#e4ebe7] bg-[#fffaf4] px-5 py-4 sm:px-6">
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 shrink-0 text-[#c36a2d]" size={18} />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-[#6f421f]">Recently accepted documents</h3>
                <p className="mt-1 text-xs leading-5 text-[#7a6555]">
                  The latest accepted revision replaces older issues immediately. It becomes selectable as soon as secure preparation finishes.
                </p>
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  {preparing.map((revision) => (
                    <Link
                      key={revision.id}
                      href={`/app/${organisationId}/projects/${projectId}/documents/${revision.documentId}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-[#eadbc9] bg-white px-3 py-2 text-xs hover:border-[#e8733f]"
                    >
                      <span className="min-w-0">
                        <strong className="block truncate text-[#24384f]">{revision.documentNumber} · Rev {revision.revisionCode}</strong>
                        <span className="mt-0.5 block truncate text-[#617083]">{revision.title}</span>
                        <IssuedBadge numbers={issuedRevisionNumbers[revision.id] ?? []} />
                      </span>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-bold uppercase ${revision.state === "failed" ? "bg-[#fff0e9] text-[#a5452f]" : "bg-[#fff7dd] text-[#7a5a00]"}`}>
                        {revision.state === "failed" ? <AlertTriangle size={11} /> : <RefreshCw size={11} className="animate-spin" />}
                        {revision.state === "failed" ? "Needs retry" : "Preparing"}
                      </span>
                    </Link>
                  ))}
                </div>
                {preparingMessage && <p className="mt-2 text-xs font-medium text-[#7a5a00]" role="status">{preparingMessage}</p>}
              </div>
            </div>
          </div>
        )}
        <div className="max-h-[52vh] divide-y divide-[#edf1ef] overflow-y-auto">
          {revisions.map((revision) => (
            <label
              key={revision.id}
              className={`flex cursor-pointer gap-3 p-4 transition hover:bg-[#f8faf8] sm:px-6 ${
                selectedSet.has(revision.id) ? "bg-[#f2f8f5]" : ""
              }`}
            >
              <input
                type="checkbox"
                name="revisionIds"
                value={revision.id}
                checked={selectedSet.has(revision.id)}
                onChange={() => toggle(revision.id)}
                className="mt-1 size-4 accent-[#0c5b45]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <strong className="text-sm text-[#0c5b45]">{revision.documentNumber}</strong>
                  <span className="rounded-full bg-[#e8f1ed] px-2 py-0.5 text-[10px] font-bold uppercase text-[#0c5b45]">
                    Rev {revision.revisionCode}
                  </span>
                  <IssuedBadge numbers={issuedRevisionNumbers[revision.id] ?? []} />
                </span>
                <span className="mt-1 block text-sm font-medium text-[#24384f]">{revision.title}</span>
                <span className="mt-1 block text-xs text-[#617083]">
                  {revision.discipline} · {revision.documentType} · {revision.issueStatus}
                </span>
              </span>
            </label>
          ))}
          {!revisions.length && (
            <div className="p-10 text-center">
              <FileCheck2 className="mx-auto text-[#9aa7a1]" />
              <p className="mt-3 text-sm font-semibold">No accepted documents are ready for transmission.</p>
              <p className="mt-1 text-xs text-[#617083]">Accept a completed revision from the DCC review queue first.</p>
            </div>
          )}
        </div>
        <div className="border-t border-[#e4ebe7] bg-[#fbfcfb] p-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#0c5b45]">
              {selected.length} document{selected.length === 1 ? "" : "s"} selected
            </p>
            <button className="ev-button" disabled={pending || !selected.length || !revisions.length}>
              <Send size={16} /> {pending ? "Freezing transmittal..." : "Create transmittal"}
            </button>
          </div>
          {state?.message && (
            <p className="mt-3 rounded-lg border border-[#f0c8b7] bg-[#fff6f2] p-3 text-xs leading-5 text-[#8b3d1f]" role="alert">
              {state.message}
            </p>
          )}
          <p className="mt-3 text-xs leading-5 text-[#617083]">
            EngiCite will identify the authenticated DCC issuer and add an audit-backed attestation. When a verified qualified seal is configured, the processor embeds it in the PDF. The client acknowledgement block remains for the recipient to sign and return.
          </p>
        </div>
      </section>
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
  placeholder,
  type = "text",
  optional = false,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  optional?: boolean;
}) {
  return (
    <label>
      <span className="ev-label">{label}</span>
      <input
        className="ev-input"
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={!optional}
      />
    </label>
  );
}

function IssuedBadge({ numbers }: { numbers: string[] }) {
  if (!numbers.length) return null;
  const label = `ISSUED · ${numbers.join(", ")}`;
  return (
    <span
      className="mt-1 inline-flex max-w-full rounded-full bg-[#eaf0f8] px-2 py-0.5 text-[10px] font-bold uppercase text-[#234a75]"
      title={label}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
