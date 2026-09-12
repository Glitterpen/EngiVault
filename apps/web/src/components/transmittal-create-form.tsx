"use client";

import {HelpTip} from "@/components/help-tip";
import {TRANSMITTAL_DAILY_NOTICE} from "@/lib/submission-override";
import { useActionState, useEffect, useMemo, useState } from "react";
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
  const selectableIds = visibleRevisions.slice(0, 100).map((revision) => revision.id);
  const selectedSet = new Set(selected.filter((id) => eligible.some((revision) => revision.id === id)));
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedSet.has(id));
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
    if (!eligible.some((revision) => revision.id === id)) return;
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...selectedSet, id].slice(0, 100),
    );
  }

  return (
    <form action={action} className="space-y-5">
      <p className="rounded-xl border border-[#dfe7e3] bg-[#f7faf8] p-3 text-sm font-medium text-[#0c5b45]">{TRANSMITTAL_DAILY_NOTICE}</p>
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="projectId" value={projectId} />
      {/* Hidden fields retain intentional selections when a search hides their rows. */}
      {[...selectedSet].map((id) => <input key={id} type="hidden" name="revisionIds" value={id} />)}

      <section className="ev-card p-5 sm:p-6">
        <h2 className="font-semibold">Deliverables transmission status <HelpTip label="Transmission status">Ready lists only newly approved, securely prepared revisions not already reserved in a transmittal. Staged revisions remain reserved while their ZIP is preparing or needs retry. Transmitted means the transmittal ZIP is generated, not confirmation that the client received it.</HelpTip></h2>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[['Ready for transmission', eligible.length], ['Approved · preparing', preparing.length], ['Staged / needs attention', queue.staged.length], ['Transmitted', queue.transmitted.length]].map(([label, count]) => (
            <div key={label} className="min-w-0 rounded-xl border border-[#e4ebe7] p-3"><strong className="block text-xl text-[#0c5b45]">{count}</strong><span className="text-xs text-[#617083]">{label}</span></div>
          ))}
        </div>
        <div data-preview-safe className="mt-4 grid gap-3 sm:grid-cols-2">
          <label><span className="ev-label">Find deliverable</span><input className="ev-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Document number, title or revision" /></label>
          <label><span className="ev-label">Discipline filter</span><select className="ev-input" value={discipline} onChange={(event) => setDiscipline(event.target.value)}><option value="">All disciplines</option>{disciplines.map((name) => <option key={name}>{name}</option>)}</select></label>
        </div>
      </section>

      <section className="ev-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#fff0e9] text-[#e8733f]">
            <Send size={19} />
          </span>
          <div>
            <h2 className="font-semibold">Transmission details <HelpTip label="Recipient company">The recipient company is inherited from the controlled project information and frozen into the audit record.</HelpTip></h2>

          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field name="transmittalNumber" label="Transmittal number" defaultValue={defaultNumber} />
          <div>
            <span className="ev-label">Client / recipient company</span>
            <div className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${clientConfigured ? "border-[#dce5e1] bg-[#f5f8f6] text-[#24384f]" : "border-[#f0c8b7] bg-[#fff6f2] text-[#8b3d1f]"}`}>
              <Building2 size={16} className="shrink-0" />
              <span>{clientName || "Client name is missing from project information"}</span>
            </div>
            <HelpTip label="Controlled project information">Controlled by the Project Manager; the DCC cannot change it here.</HelpTip>
          </div>
          <Field name="recipientContact" label="Attention" placeholder="Client representative" optional />
          <Field name="recipientEmail" label="Recipient email" type="email" placeholder="representative@client.com" optional />
          <label className="sm:col-span-2">
            <span className="ev-label">Cover message (optional)</span>
            <textarea
              className="ev-input min-h-24 resize-y"
              name="message"
              maxLength={2000}
              placeholder="Please sign and date the enclosed acknowledgement and return it to the issuing Document Controller."
            />
          </label>
        </div>
      </section>

      <section className="ev-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4ebe7] px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-semibold">Ready for transmission <HelpTip label="Eligible transmittal revisions">Only the latest approved and securely prepared revision is selectable. Previously staged or transmitted revisions are excluded. Select up to 100 revisions per transmittal.</HelpTip></h2>

          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ev-button-secondary" onClick={() => router.refresh()}>
              <RefreshCw size={16} /> Refresh accepted list
            </button>
            <button
              type="button"
              className="ev-button-secondary"
              disabled={pending || !visibleRevisions.length}
              onClick={() => setSelected(allSelected ? [] : selectableIds)}
            >
              <CheckCheck size={16} /> {allSelected ? "Clear selection" : "Select visible (max 100)"}
            </button>
          </div>
        </div>
        {preparing.length > 0 && (
          <div className="border-b border-[#e4ebe7] bg-[#fffaf4] px-5 py-4 sm:px-6">
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 shrink-0 text-[#c36a2d]" size={18} />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-[#6f421f]">Recently accepted documents <HelpTip label="Latest accepted revisions">The latest accepted revision replaces older issues immediately. It becomes selectable as soon as secure preparation finishes.</HelpTip></h3>

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
          {visibleRevisions.map((revision) => (
            <label
              key={revision.id}
              className={`flex cursor-pointer gap-3 p-4 transition hover:bg-[#f8faf8] sm:px-6 ${
                selectedSet.has(revision.id) ? "bg-[#f2f8f5]" : ""
              }`}
            >
              <input
                type="checkbox"
                value={revision.id}
                aria-label={`Select ${revision.documentNumber} revision ${revision.revisionCode}`}
                disabled={pending || (!selectedSet.has(revision.id) && selectedSet.size >= 100)}
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
                  <span className="text-[10px] font-bold uppercase text-[#0c5b45]">Not yet transmitted</span>
                </span>
                <span className="mt-1 block text-sm font-medium text-[#24384f]">{revision.title}</span>
                <span className="mt-1 block text-xs text-[#617083]">
                  {revision.discipline} · {revision.documentType} · {revision.issueStatus}
                </span>
              </span>
            </label>
          ))}
          {!visibleRevisions.length && (
            <div className="p-10 text-center">
              <FileCheck2 className="mx-auto text-[#9aa7a1]" />
              <p className="mt-3 text-sm font-semibold">{eligible.length ? "No ready deliverables match these filters." : "No new approved documents are ready for transmission."}</p>
              <HelpTip label="No ready deliverables">Previously staged or transmitted revisions are kept in their separate lists below. Newly approved revisions appear here after secure preparation finishes.</HelpTip>
            </div>
          )}
        </div>
        <div className="border-t border-[#e4ebe7] bg-[#fbfcfb] p-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#0c5b45]">
              {selectedSet.size} document{selectedSet.size === 1 ? "" : "s"} selected
            </p>
            <button className="ev-button" disabled={pending || !selectedSet.size || !eligible.length || !clientConfigured}>
              <Send size={16} /> {pending ? "Freezing transmittal..." : "Create transmittal"}
            </button>
          </div>
          {state?.message && (
            <p className="mt-3 rounded-lg border border-[#f0c8b7] bg-[#fff6f2] p-3 text-xs leading-5 text-[#8b3d1f]" role="alert">
              {state.message}
            </p>
          )}
          {!clientConfigured && (
            <p className="mt-3 rounded-lg border border-[#f0c8b7] bg-[#fff6f2] p-3 text-xs leading-5 text-[#8b3d1f]" role="alert">
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
  return <details className="ev-card overflow-hidden">
    <summary className="cursor-pointer p-5 font-semibold">{title} ({total})</summary>
    <div className="max-h-[52vh] divide-y divide-[#edf1ef] overflow-y-auto border-t border-[#e4ebe7]">
      {[...items].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map((item) => <div key={`${item.packageId}-${item.revisionId}`} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
        <div className="min-w-0"><strong className="break-words text-sm">{item.documentNumber} · Rev {item.revisionCode}</strong><p className="text-xs text-[#617083]">{item.discipline} · {item.issueStatus}</p><p className="mt-1 text-xs text-[#617083]">Staged {new Date(item.createdAt).toISOString().slice(0,10)} · {item.packageState === 'ready' ? 'Transmittal generated' : item.packageState === 'failed' ? 'Generation failed — retry existing transmittal' : item.packageState === 'cancelled' ? 'Cancelled — retained in issue history' : 'Reserved in existing transmittal'}</p></div>
        <Link className="ev-button-secondary" href={`/app/${organisationId}/projects/${projectId}/work-packages/${item.packageId}`}>{item.transmittalNumber}</Link>
      </div>)}
      {!items.length && <p className="p-5 text-sm text-[#617083]">{total ? 'No matching deliverables.' : 'No deliverables in this category.'}</p>}
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
