"use client";

import {HelpTip} from "@/components/help-tip";
import {TRANSMITTAL_DAILY_NOTICE} from "@/lib/submission-override";
import { useActionState, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, CheckCheck, Clock3, FileCheck2, RefreshCw, Send } from "lucide-react";
import { createDocumentTransmittal, type MutationState } from "@/app/app/actions";
import {
  separateTransmissionQueue,
  type PreparingTransmittalRevision,
  type TransmittalRevision,
  type TransmittalHistoryItem,
} from "@/lib/transmittal-revisions";

const MAX_SELECTED_REVISIONS = 100;

export function TransmittalCreateForm({
  organisationId,
  projectId,
  defaultNumber,
  clientName,
  revisions,
  preparing,
  issuedRevisionNumbers,
  history,
}: {
  organisationId: string;
  projectId: string;
  defaultNumber: string;
  clientName: string | null;
  revisions: TransmittalRevision[];
  preparing: PreparingTransmittalRevision[];
  issuedRevisionNumbers: Record<string, string[]>;
  history: TransmittalHistoryItem[];
}) {
  const router = useRouter();
  const formId = useId();
  const [state, action, pending] = useActionState<MutationState, FormData>(
    createDocumentTransmittal,
    undefined,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [preparingMessage, setPreparingMessage] = useState("");
  const queue = useMemo(() => separateTransmissionQueue(revisions, history), [revisions, history]);
  const eligible = queue.ready.filter((revision) => !(issuedRevisionNumbers[revision.id]?.length));
  const matches = (row: {documentNumber: string; discipline: string; revisionCode: string; title?: string}) =>
    (!discipline || row.discipline === discipline) &&
    `${row.documentNumber} ${row.revisionCode} ${row.discipline} ${row.title ?? ""}`.toLowerCase().includes(search.trim().toLowerCase());
  const visibleRevisions = eligible.filter(matches);
  const eligibleIds = new Set(eligible.map((revision) => revision.id));
  const visibleIds = new Set(visibleRevisions.map((revision) => revision.id));
  const selectedSet = new Set(selected.filter((id) => eligibleIds.has(id)).slice(0, MAX_SELECTED_REVISIONS));
  const visibleSelectedCount = [...selectedSet].filter((id) => visibleIds.has(id)).length;
  const disciplines = [...new Set([...revisions, ...preparing, ...history].map((row) => row.discipline))].sort();
  const clientConfigured = Boolean(clientName?.trim());
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
    if (pending || !eligibleIds.has(id)) return;
    setSelected((current) => {
      const next = new Set(current.filter((value) => eligibleIds.has(value)));
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_SELECTED_REVISIONS) next.add(id);
      return [...next].slice(0, MAX_SELECTED_REVISIONS);
    });
  }

  function selectVisible() {
    if (pending) return;
    setSelected((current) => [...new Set([
      ...current.filter((id) => eligibleIds.has(id)),
      ...visibleIds,
    ])].slice(0, MAX_SELECTED_REVISIONS));
  }

  function clearVisible() {
    if (pending) return;
    setSelected((current) => current.filter((id) => eligibleIds.has(id) && !visibleIds.has(id)));
  }

  return (
    <form action={action} aria-label="Create document transmittal" aria-busy={pending} className="min-w-0 space-y-4">
      <p className="flex items-start gap-2 text-sm leading-6 text-[#526675]"><Clock3 size={16} className="mt-1 shrink-0" aria-hidden="true" />{TRANSMITTAL_DAILY_NOTICE}</p>
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="projectId" value={projectId} />
      {/* Hidden fields retain intentional selections when a search hides their rows. */}
      {[...selectedSet].map((id) => <input key={id} type="hidden" name="revisionIds" value={id} />)}

      <section aria-label="Transmission queue" className="rounded-xl border border-[#d6e0ed] bg-white px-4 py-3 sm:px-5">
        <div className="flex items-center gap-1.5"><h2 className="text-sm font-semibold text-[#24384f]">Transmission queue</h2><HelpTip label="Transmission status">Ready lists only newly approved, securely prepared revisions not already reserved in a transmittal. Staged revisions remain reserved while their ZIP is preparing or needs retry. Transmitted means the transmittal ZIP is generated, not confirmation that the client received it.</HelpTip></div>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
          {[['Ready for transmission', eligible.length], ['Approved · preparing', preparing.length], ['Staged / needs attention', queue.staged.length], ['Transmitted', queue.transmitted.length]].map(([label, count]) => (
            <div key={label} className="min-w-0"><dt className="break-words text-xs leading-5 text-[#526675]">{label}</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums text-[#24384f]">{count}</dd></div>
          ))}
        </dl>
      </section>

      <section aria-labelledby={`${formId}-details`} className="rounded-xl border border-[#d6e0ed] bg-white p-4 sm:p-5">
        <div className="flex items-center gap-1.5"><h2 id={`${formId}-details`} className="font-semibold text-[#24384f]">Transmission details</h2><HelpTip label="Recipient company">The recipient company is inherited from the controlled project information and frozen into the audit record. The Project Manager controls this information; the DCC cannot change it here.</HelpTip></div>
        <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-2">
          <Field name="transmittalNumber" label="Transmittal number" defaultValue={defaultNumber} />
          <div className="min-w-0">
            <span className="ev-label">Client / recipient company</span>
            <div className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${clientConfigured ? "border-[#d6e0ed] bg-[#f4f7fb] text-[#24384f]" : "border-[#f0c8b7] bg-[#fff6f2] text-[#8b3d1f]"}`}>
              <Building2 size={16} className="shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words py-2">{clientName || "Client name is missing from project information"}</span>
            </div>
          </div>
        </div>
        <details className="mt-3 border-t border-[#d6e0ed]" onInvalidCapture={(event) => { event.currentTarget.open = true; }}>
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-[#526675]">Recipient details & cover message <span className="font-normal">(optional)</span></summary>
          <div className="grid min-w-0 gap-4 pb-1 sm:grid-cols-2">
            <Field name="recipientContact" label="Attention" placeholder="Client representative" optional />
            <Field name="recipientEmail" label="Recipient email" type="email" placeholder="representative@client.com" optional />
            <label className="min-w-0 sm:col-span-2">
              <span className="ev-label">Cover message (optional)</span>
              <textarea
                className="ev-input min-h-24 resize-y"
                name="message"
                maxLength={2000}
                placeholder="Please sign and date the enclosed acknowledgement and return it to the issuing Document Controller."
              />
            </label>
          </div>
        </details>
      </section>

      <section aria-labelledby={`${formId}-ready`} className="min-w-0 overflow-hidden rounded-xl border border-[#d6e0ed] bg-white">
        <div className="border-b border-[#d6e0ed] p-4 sm:px-5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1.5"><h2 id={`${formId}-ready`} className="font-semibold text-[#24384f]">Ready for transmission</h2><HelpTip label="Eligible transmittal revisions">Only the latest approved and securely prepared revision is selectable. Previously staged or transmitted revisions are excluded. Select up to 100 revisions per transmittal.</HelpTip></div>
            <button type="button" className="ev-button-secondary min-h-11 w-full sm:w-auto" onClick={() => router.refresh()}>
              <RefreshCw size={16} aria-hidden="true" /> Refresh accepted list
            </button>
          </div>
          <div data-preview-safe className="mt-3 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.65fr)]">
            <label className="min-w-0"><span className="ev-label">Find deliverable</span><input className="ev-input min-h-11" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Document number, title or revision" /></label>
            <label className="min-w-0"><span className="ev-label">Discipline filter</span><select className="ev-input min-h-11" value={discipline} onChange={(event) => setDiscipline(event.target.value)}><option value="">All disciplines</option>{disciplines.map((name) => <option key={name}>{name}</option>)}</select></label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-xs leading-5 text-[#526675]">{visibleRevisions.length} ready · Select up to 100</p>
            <div role="group" aria-label="Deliverable selection" className="flex flex-wrap items-center gap-x-2">
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[#10243e] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending || !visibleRevisions.length || selectedSet.size >= MAX_SELECTED_REVISIONS || visibleSelectedCount === visibleIds.size}
                onClick={selectVisible}
              >
                <CheckCheck size={16} aria-hidden="true" /> Select visible (max 100)
              </button>
              <button type="button" className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-[#526675] disabled:cursor-not-allowed disabled:opacity-50" disabled={pending || !visibleSelectedCount} onClick={clearVisible}>Clear visible</button>
              <button type="button" className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-[#526675] disabled:cursor-not-allowed disabled:opacity-50" disabled={pending || !selectedSet.size} onClick={() => setSelected([])}>Clear all selections</button>
            </div>
          </div>
        </div>
        {preparing.length > 0 && (
          <div className="border-b border-[#d6e0ed] bg-[#fbfcfe] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-1.5"><h3 className="text-sm font-semibold text-[#526675]">Recently accepted documents</h3><HelpTip label="Latest accepted revisions">The latest accepted revision replaces older issues immediately. It becomes selectable as soon as secure preparation finishes.</HelpTip></div>
            <details className="mt-1" open={preparing.some((revision) => revision.state === "failed") || undefined}>
              <summary className="min-h-11 cursor-pointer py-3 text-sm text-[#526675]">{preparing.length} approved · {preparing.some((revision) => revision.state === "failed") ? "Preparation needs attention" : "Preparing for transmission"}</summary>
                <div className="grid min-w-0 gap-2 pb-1 lg:grid-cols-2">
                  {preparing.map((revision) => (
                    <Link
                      key={revision.id}
                      href={`/app/${organisationId}/projects/${projectId}/documents/${revision.documentId}`}
                      className="flex min-h-11 min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-[#d6e0ed] bg-white px-3 py-2 text-xs hover:border-[#718294]"
                    >
                      <span className="min-w-0">
                        <strong className="block min-w-0 max-w-full text-[#24384f] [overflow-wrap:anywhere]">{revision.documentNumber} · Rev {revision.revisionCode}</strong>
                        <span className="mt-0.5 block break-words leading-5 text-[#526675]">{revision.title}</span>
                        <IssuedBadge numbers={issuedRevisionNumbers[revision.id] ?? []} />
                      </span>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-medium ${revision.state === "failed" ? "bg-[#fff0e9] text-[#a5452f]" : "bg-[#eef3fa] text-[#526675]"}`}>
                        {revision.state === "failed" ? <AlertTriangle size={13} aria-hidden="true" /> : <RefreshCw size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                        {revision.state === "failed" ? "Needs retry" : "Preparing"}
                      </span>
                    </Link>
                  ))}
                </div>
            </details>
            {preparingMessage && <p className="mt-1 text-xs leading-5 text-[#526675]" role="status">{preparingMessage}</p>}
          </div>
        )}
        <div role="group" aria-label="Ready deliverables" className="max-h-[60vh] divide-y divide-[#d6e0ed] overflow-y-auto overscroll-contain">
          {visibleRevisions.map((revision) => (
            <label
              key={revision.id}
              className={`flex min-h-11 min-w-0 cursor-pointer gap-3 p-4 transition hover:bg-[#f4f7fb] motion-reduce:transition-none sm:px-5 ${
                selectedSet.has(revision.id) ? "bg-[#f4f7fb]" : ""
              }`}
            >
              <input
                type="checkbox"
                value={revision.id}
                aria-label={`Select ${revision.documentNumber} revision ${revision.revisionCode}`}
                disabled={pending || (!selectedSet.has(revision.id) && selectedSet.size >= MAX_SELECTED_REVISIONS)}
                checked={selectedSet.has(revision.id)}
                onChange={() => toggle(revision.id)}
                className="mt-1 size-5 shrink-0 accent-[#10243e]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <strong className="min-w-0 max-w-full text-sm text-[#24384f] [overflow-wrap:anywhere]">{revision.documentNumber}</strong>
                  <span className="rounded-md bg-[#eef3fa] px-2 py-0.5 text-xs font-medium text-[#10243e]">
                    Rev {revision.revisionCode}
                  </span>
                </span>
                <span className="mt-1 block break-words text-sm leading-6 text-[#24384f]">{revision.title}</span>
                <span className="mt-1 block break-words text-xs leading-5 text-[#526675]">
                  {revision.discipline} · {revision.documentType} · {revision.issueStatus}
                </span>
              </span>
            </label>
          ))}
          {!visibleRevisions.length && (
            <div className="px-4 py-8 text-center">
              <FileCheck2 className="mx-auto text-[#8693a2]" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold">{eligible.length ? "No ready deliverables match these filters." : "No new approved documents are ready for transmission."}</p>
              <HelpTip label="No ready deliverables">Previously staged or transmitted revisions are kept in their separate lists below. Newly approved revisions appear here after secure preparation finishes.</HelpTip>
            </div>
          )}
        </div>
        <div className="border-t border-[#d6e0ed] bg-[#fbfcfe] p-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#24384f]" role="status" aria-live="polite">
              {selectedSet.size} document{selectedSet.size === 1 ? "" : "s"} selected
              {[...selectedSet].some((id) => !visibleRevisions.some((revision) => revision.id === id)) && <span className="mt-0.5 block text-xs font-normal text-[#526675]">Includes selections outside the current filters.</span>}
            </p>
            <button className="ev-button min-h-11 w-full sm:w-auto" disabled={pending || !selectedSet.size || !eligible.length || !clientConfigured}>
              <Send size={16} aria-hidden="true" /> {pending ? "Freezing transmittal..." : "Create transmittal"}
            </button>
          </div>
          {state?.message && (
            <p className="mt-3 break-words rounded-lg border border-[#f0c8b7] bg-[#fff6f2] p-3 text-sm leading-6 text-[#8b3d1f]" role="alert">
              {state.message}
            </p>
          )}
          {!clientConfigured && (
            <p className="mt-3 rounded-lg border border-[#f0c8b7] bg-[#fff6f2] p-3 text-sm leading-6 text-[#8b3d1f]" role="alert">
              Creation is paused until the Project Manager adds the client name in Project information.
            </p>
          )}
          <HelpTip label="Transmittal attestation">EngiCite will identify the authenticated DCC issuer and add an audit-backed attestation. When a verified qualified seal is configured, EngiCite embeds it in the PDF. The client acknowledgement block remains for the recipient to sign and return.</HelpTip>
        </div>
      </section>
      <TransmissionHistory title="Staged / needs attention" items={queue.staged.filter(matches)} total={queue.staged.length} organisationId={organisationId} projectId={projectId} />
      <TransmissionHistory title="Already transmitted" items={queue.transmitted.filter(matches)} total={queue.transmitted.length} organisationId={organisationId} projectId={projectId} />
    </form>
  );
}

function TransmissionHistory({title, items, total, organisationId, projectId}: {title: string; items: TransmittalHistoryItem[]; total: number; organisationId: string; projectId: string}) {
  return <details className="min-w-0 overflow-hidden rounded-xl border border-[#d6e0ed] bg-white">
    <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-[#24384f] sm:px-5">{title} <span className="ml-1 font-normal tabular-nums text-[#526675]">({total})</span></summary>
    <div className="max-h-[52vh] divide-y divide-[#d6e0ed] overflow-y-auto overscroll-contain border-t border-[#d6e0ed]">
      {[...items].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map((item) => <div key={`${item.packageId}-${item.revisionId}`} className="flex min-w-0 flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
        <div className="min-w-0 flex-1 basis-52"><strong className="text-sm text-[#24384f] [overflow-wrap:anywhere]">{item.documentNumber} · Rev {item.revisionCode}</strong><p className="mt-1 break-words text-xs leading-5 text-[#526675]">{item.discipline} · {item.issueStatus}</p><p className="mt-1 text-xs leading-5 text-[#526675]">Staged {new Date(item.createdAt).toISOString().slice(0,10)} · {item.packageState === 'ready' ? 'Transmittal generated' : item.packageState === 'failed' ? 'Generation failed — retry existing transmittal' : item.packageState === 'cancelled' ? 'Cancelled — retained in issue history' : 'Reserved in existing transmittal'}</p></div>
        <Link className="ev-button-secondary min-h-11 max-w-full whitespace-normal [overflow-wrap:anywhere]" href={`/app/${organisationId}/projects/${projectId}/work-packages/${item.packageId}`}><span className="min-w-0 [overflow-wrap:anywhere]">{item.transmittalNumber}</span></Link>
      </div>)}
      {!items.length && <p className="p-4 text-sm text-[#526675]">{total ? 'No matching deliverables.' : 'No deliverables in this category.'}</p>}
    </div>
  </details>;
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
    <label className="min-w-0">
      <span className="ev-label">{label}</span>
      <input
        className="ev-input min-h-11"
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
      className="mt-1 inline-flex max-w-full rounded-md bg-[#eaf0f8] px-2 py-0.5 text-xs font-medium text-[#234a75]"
      title={label}
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
    </span>
  );
}
