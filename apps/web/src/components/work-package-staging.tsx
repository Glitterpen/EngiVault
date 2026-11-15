"use client";

import {startTransition, useActionState, useId, useMemo, useState} from "react";
import {ChevronDown, FolderOpen} from "lucide-react";
import {saveWorkPackageStaging} from "@/app/app/work-package-staging-action";
import {WorkPackageGenerate} from "@/components/work-package-generate";
import {DOCUMENT_ISSUE_STATUS_VALUES} from "@/lib/document-issue-status";
import type {WorkPackageStagingData} from "@/lib/work-package-staging";

type StagedDocument = WorkPackageStagingData["documents"][number];
type Revision = StagedDocument["revisions"][number];
type Choice = {revisionId: string; included: boolean};
type Choices = Map<string, Choice>;

const purposeAliases = new Map<string, string>();
for (const status of DOCUMENT_ISSUE_STATUS_VALUES) {
  const [full, label, code] = status.toLowerCase().match(/^(.+) \(([a-z0-9]+)\)$/) ?? [];
  if (full) {
    purposeAliases.set(label, full);
    purposeAliases.set(code, full);
  }
}

function purposeKey(status: string | null) {
  const key = (status ?? "").trim().toLowerCase();
  return purposeAliases.get(key) ?? key;
}

function revisionLabel(revision: Revision) {
  return `Rev ${revision.revision_code} · ${revision.issue_status?.trim() || "Issue purpose not specified"}`;
}

function initialChoices(documents: StagedDocument[]): Choices {
  const choices: Choices = new Map();
  for (const document of documents) {
    const saved = document.inclusion_state === "included"
      ? document.revisions.find(revision => revision.id === document.revision_id)
      : undefined;
    const revisionId = saved?.id ?? document.revisions[0]?.id;
    if (revisionId) choices.set(document.id, {revisionId, included: Boolean(saved)});
  }
  return choices;
}

export function WorkPackageStaging({organisationId, projectId, packageId, staging, generateEndpoint}: {
  organisationId: string;
  projectId: string;
  packageId: string;
  staging: WorkPackageStagingData;
  generateEndpoint?: string;
}) {
  const id = useId();
  const [saved] = useState(() => initialChoices(staging.documents));
  const [choices, setChoices] = useState(saved);
  const [state, action, pending] = useActionState(saveWorkPackageStaging, undefined);
  const groups = useMemo(() => {
    const sorted = new Map<string, StagedDocument[]>();
    for (const document of staging.documents) {
      const discipline = document.discipline.trim() || "Unspecified discipline";
      if (!sorted.has(discipline)) sorted.set(discipline, []);
      sorted.get(discipline)!.push(document);
    }
    return Array.from(sorted);
  }, [staging.documents]);
  const initialOpen = groups.find(([, documents]) => documents.some(document =>
    document.inclusion_state !== "excluded" && !saved.get(document.id)?.included
  ))?.[0] ?? groups[0]?.[0];
  let includedCount = 0;
  let dirty = false;
  const selection: {item_id: string; revision_id: string | null}[] = [];
  for (const document of staging.documents) {
    const choice = choices.get(document.id);
    const previous = saved.get(document.id);
    const revisionId = choice?.included ? choice.revisionId : null;
    if (revisionId) includedCount++;
    if (revisionId !== (previous?.included ? previous.revisionId : null)) dirty = true;
    selection.push({item_id: document.id, revision_id: revisionId});
  }
  const excludedCount = staging.documents.length - includedCount;

  function applyRevisions(revisions: Map<string, Revision>) {
    setChoices(previous => {
      const next = new Map(previous);
      for (const [itemId, revision] of revisions) next.set(itemId, {revisionId: revision.id, included: true});
      return next;
    });
  }

  function setChoice(itemId: string, update: Partial<Choice>) {
    setChoices(previous => {
      const value = previous.get(itemId);
      return value ? new Map(previous).set(itemId, {...value, ...update}) : previous;
    });
  }

  return (
    <section id="package-staging" aria-labelledby={`${id}-heading`} className="ev-card mt-4 min-w-0 scroll-mt-24 overflow-hidden">
      <header className="border-b border-[#dce5ef] px-4 py-4 sm:px-5">
        <h2 id={`${id}-heading`} className="text-base font-semibold text-[#10243e]">Stage package documents</h2>
        <p className="mt-1 text-sm leading-6 text-[#526675]">Choose an accepted revision for each document to include. Unchecked documents are left out of the ZIP when you save.</p>
      </header>
      {staging.documents.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[#526675] sm:px-5">No documents are staged for this package.</p>
      ) : (
        <form action={action} aria-labelledby={`${id}-heading`} aria-busy={pending} onSubmit={event => {
          // Dispatch without React's automatic form reset on an action returning an error.
          event.preventDefault();
          if (pending || includedCount === 0) return;
          const data = new FormData(event.currentTarget);
          startTransition(() => action(data));
        }}>
          <input type="hidden" name="organisationId" value={organisationId} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="packageId" value={packageId} />
          <input type="hidden" name="updatedAt" value={staging.updated_at} />
          <input type="hidden" name="selection" value={JSON.stringify(selection)} />
          <fieldset disabled={pending} className="min-w-0 divide-y divide-[#dce5ef]">
            <legend className="sr-only">Document and revision choices by discipline</legend>
            {groups.map(([discipline, documents]) => (
              <DisciplineSelection key={discipline} discipline={discipline} documents={documents}
                initiallyOpen={discipline === initialOpen} preferredStatus={staging.preferred_status}
                choices={choices} setChoice={setChoice} applyRevisions={applyRevisions} />
            ))}
          </fieldset>
          <div className="space-y-3 border-t border-[#dce5ef] px-4 py-4 sm:px-5">
            <p className="text-sm font-medium text-[#10243e]" role="status">{includedCount} selected · {excludedCount} excluded</p>
            {state?.message && <p role="alert" className="break-words rounded-lg border border-[#efd1c1] bg-[#fff8f3] px-3 py-2 text-sm leading-6 text-[#8b3d1f]">{state.message}</p>}
            {includedCount === 0 ? (
              <p className="text-sm text-[#526675]">Select at least one accepted revision to save this package.</p>
            ) : dirty && generateEndpoint ? (
              <p className="text-sm text-[#526675]">Save your changes before generating the ZIP.</p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button type="submit" className="ev-button min-h-11 w-full sm:w-auto" disabled={pending || includedCount === 0}>
                {pending ? "Saving selection…" : "Save package selection"}
              </button>
              {generateEndpoint && !dirty && !pending && includedCount > 0 && (
                <WorkPackageGenerate endpoint={generateEndpoint} />
              )}
            </div>
          </div>
        </form>
      )}
    </section>
  );
}

function DisciplineSelection({discipline, documents, initiallyOpen, preferredStatus, choices, setChoice, applyRevisions}: {
  discipline: string;
  documents: StagedDocument[];
  initiallyOpen: boolean;
  preferredStatus: string | null;
  choices: Choices;
  setChoice: (id: string, update: Partial<Choice>) => void;
  applyRevisions: (revisions: Map<string, Revision>) => void;
}) {
  const id = useId();
  const [preferred, setPreferred] = useState(() => purposeKey(preferredStatus));
  const [feedback, setFeedback] = useState("");
  const selected = documents.filter(document => choices.get(document.id)?.included).length;
  const {purposes, eligibleCount} = useMemo(() => {
    const purposes = new Map<string, string>();
    let eligibleCount = 0;
    for (const document of documents) {
      if (document.revisions.length) eligibleCount++;
      for (const revision of document.revisions) {
        const key = purposeKey(revision.issue_status);
        if (key && revision.issue_status && !purposes.has(key)) purposes.set(key, revision.issue_status);
      }
    }
    return {purposes: Array.from(purposes, ([key, label]) => ({
      key, label: DOCUMENT_ISSUE_STATUS_VALUES.find(status => status.toLowerCase() === key) ?? label,
    })).sort((a, b) => a.label.localeCompare(b.label)), eligibleCount};
  }, [documents]);

  function applyPreference() {
    const matches = new Map<string, Revision>();
    for (const document of documents) {
      const revision = preferred
        ? document.revisions.find(candidate => purposeKey(candidate.issue_status) === preferred)
        : document.revisions[0];
      if (revision) matches.set(document.id, revision);
    }
    if (matches.size) {
      applyRevisions(matches);
      setFeedback(`${matches.size} document${matches.size === 1 ? "" : "s"} selected. Choices for documents without a match were left unchanged.`);
    } else {
      setFeedback("No documents match this issue purpose. No selections changed.");
    }
  }

  return (
    <details open={initiallyOpen || undefined} className="group/discipline min-w-0">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm focus-visible:outline-offset-[-3px] sm:px-5 [&::-webkit-details-marker]:hidden">
        <FolderOpen size={18} aria-hidden="true" className="shrink-0 text-[#244b73]" />
        <span className="min-w-0 flex-1">
          <span className="block break-words font-semibold text-[#10243e]">{discipline}</span>
          <span className="mt-1 block text-xs text-[#526675]">{selected} of {documents.length} selected</span>
        </span>
        <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-[#526675] transition-transform group-open/discipline:rotate-180 motion-reduce:transition-none" />
      </summary>
      {eligibleCount > 0 && <div className="space-y-2 border-t border-[#dce5ef] bg-[#f7f9fc] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block min-w-0 max-w-full sm:w-80">
            <span className="ev-label">Preferred issue purpose</span>
            <select className="ev-input min-w-0" value={preferred} aria-label={`Preferred issue purpose for ${discipline}`}
              onChange={event => {setPreferred(event.target.value); setFeedback("");}}>
              <option value="">Latest accepted revision</option>
              {preferred && !purposes.some(purpose => purpose.key === preferred) &&
                <option value={preferred}>{preferredStatus} (no matches)</option>}
              {purposes.map(({key, label}) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <button type="button" onClick={applyPreference} className="ev-button-secondary min-h-11 justify-center"
            aria-label={`Apply preference to ${discipline}`} aria-describedby={`${id}-help`}>Apply to discipline</button>
        </div>
        <p id={`${id}-help`} className="text-xs leading-5 text-[#526675]">Includes the latest matching revision for each document. Other choices stay unchanged.</p>
        {feedback && <p role="status" className="text-xs font-medium leading-5 text-[#10243e]">{feedback}</p>}
      </div>}
      <ul aria-label={`${discipline} package choices`} className="min-w-0 divide-y divide-[#e7ecef] border-t border-[#dce5ef]">
        {documents.map(document => {
          const choice = choices.get(document.id);
          return (
            <li key={document.id} className="grid min-w-0 gap-x-4 gap-y-2 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
              <div className="min-w-0">
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input type="checkbox" className="size-4 shrink-0 accent-[#10243e]" checked={choice?.included ?? false}
                    disabled={!choice} aria-label={`Include ${document.document_number} in package`}
                    onChange={event => setChoice(document.id, {included: event.target.checked})} />
                  <span className="min-w-0 text-sm font-semibold text-[#10243e] [overflow-wrap:anywhere]">{document.document_number}</span>
                </label>
                <p className="pl-7 text-xs leading-5 text-[#526675] [overflow-wrap:anywhere]">{document.document_type}</p>
              </div>
              {choice ? (
                <div className="min-w-0">
                  <label className="block min-w-0">
                    <span className="ev-label">Revision</span>
                    <select className="ev-input min-w-0" value={choice.revisionId} aria-label={`Revision for ${document.document_number}`}
                      aria-describedby={choice.included ? undefined : `${id}-excluded-${document.id}`}
                      onChange={event => setChoice(document.id, {revisionId: event.target.value})}>
                      {document.revisions.map(revision => <option key={revision.id} value={revision.id}>{revisionLabel(revision)}</option>)}
                    </select>
                  </label>
                  {!choice.included && <p id={`${id}-excluded-${document.id}`} className="mt-1 text-xs leading-5 text-[#526675]">Excluded unless checked.</p>}
                </div>
              ) : (
                <p className="self-center text-sm leading-6 text-[#526675]">No eligible revision. Excluded from ZIP.</p>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
