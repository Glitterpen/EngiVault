"use client";

import {useId, useState} from "react";
import {ChevronDown, FileText, Folder, Search} from "lucide-react";

export type WorkPackageDocument = {
  id: string;
  document_number: string;
  discipline: string;
  document_type: string;
  revision_code: string | null;
  issue_status: string | null;
  inclusion_state: string;
};

export function WorkPackageDocuments({items}: {items: WorkPackageDocument[]}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const visible = items.filter(item => [item.document_number, item.discipline, item.document_type,
    item.revision_code, item.issue_status, inclusionLabel(item.inclusion_state)].join(" ").toLocaleLowerCase().includes(query));
  const groups = new Map<string, WorkPackageDocument[]>();
  // Keep the frozen list's existing order within each discipline.
  for (const item of visible) {
    const discipline = item.discipline.trim() || "Unspecified discipline";
    const group = groups.get(discipline) ?? [];
    group.push(item);
    groups.set(discipline, group);
  }

  return <section aria-labelledby={`${id}-heading`} className="ev-card mt-4 min-w-0 overflow-hidden">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dce5ef] px-4 py-4 sm:px-5">
      <h2 id={`${id}-heading`} className="text-base font-semibold text-[#10243e]">Package documents</h2>
      <span className="text-xs text-[#526675]">{items.length} document{items.length === 1 ? "" : "s"}</span>
    </header>
    {items.length > 0 ? <>
      <div data-preview-safe className="space-y-2 border-b border-[#dce5ef] px-4 py-3 sm:px-5">
        <label htmlFor={`${id}-search`} className="ev-label">Find a package document</label>
        <div className="relative min-w-0">
          <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 text-[#526675]" />
          <input id={`${id}-search`} type="search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Document number, discipline, revision or issue purpose" className="ev-input min-w-0 pl-10" />
        </div>
        <p role="status" className="text-xs text-[#526675]">{visible.length} of {items.length} documents · {groups.size} discipline{groups.size === 1 ? "" : "s"}</p>
      </div>
      <div data-preview-safe className="divide-y divide-[#dce5ef]">
        {Array.from(groups, ([discipline, documents]) => {
          const exceptions = documents.filter(item => item.inclusion_state !== "included").length;
          return <details key={`${discipline}:${query}`} open={query ? true : undefined} className="group/discipline min-w-0">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm sm:px-5 [&::-webkit-details-marker]:hidden">
              <Folder size={18} aria-hidden="true" className="shrink-0 text-[#244b73]" />
              <span className="min-w-0 flex-1">
                <span className="block break-words font-semibold text-[#10243e]">{discipline}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#526675]">
                  <span>{documents.length} document{documents.length === 1 ? "" : "s"}</span>
                  {exceptions > 0 && <span className="rounded-md bg-[#fff2ed] px-2 py-0.5 font-semibold text-[#93402d]">{exceptions} exception{exceptions === 1 ? "" : "s"}</span>}
                </span>
              </span>
              <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-[#526675] transition-transform group-open/discipline:rotate-180 motion-reduce:transition-none" />
            </summary>
            <ul aria-label={`${discipline} package documents`} className="divide-y divide-[#e7ecef] border-t border-[#dce5ef]">
              {documents.map(item => <li key={item.id} className="min-w-0 px-4 py-3 sm:px-5">
                <article className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
                    <h3 className="flex min-w-0 items-start gap-2 text-sm font-semibold leading-6 text-[#10243e]"><FileText size={16} aria-hidden="true" className="mt-1 shrink-0 text-[#617083]" /><span className="min-w-0 break-all">{item.document_number}</span></h3>
                    <span className={`max-w-full rounded-md px-2 py-1 text-xs font-semibold leading-5 ${item.inclusion_state === "included" ? "bg-[#eef3fa] text-[#10243e]" : "bg-[#fff2ed] text-[#93402d]"}`}>{inclusionLabel(item.inclusion_state)}</span>
                  </div>
                  <dl className="mt-2 grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,0.6fr)_minmax(0,1.5fr)]">
                    <DocumentDetail label="Type" value={item.document_type} />
                    <DocumentDetail label="Revision" value={item.revision_code ?? "—"} />
                    <DocumentDetail label="Issue purpose" value={item.issue_status ?? "—"} className="col-span-2 sm:col-span-1" />
                  </dl>
                </article>
              </li>)}
            </ul>
          </details>;
        })}
      </div>
      {visible.length === 0 && <div className="px-4 py-6 text-center sm:px-5">
        <p className="text-sm text-[#526675]">No package documents match your search.</p>
        <button type="button" data-preview-safe onClick={() => setSearch("")} className="ev-button-secondary mt-3 min-h-11">Clear search</button>
      </div>}
    </> : <p className="px-4 py-8 text-sm text-[#526675] sm:px-5">No documents are recorded in this package.</p>}
  </section>;
}

function inclusionLabel(state: string) {
  if (state === "included") return "Included in package";
  if (state === "missing_revision") return "Revision unavailable";
  if (state === "status_mismatch") return "Issue purpose does not match";
  const label = state.replaceAll("_", " ");
  return label ? label[0].toUpperCase() + label.slice(1) : "Status unavailable";
}

function DocumentDetail({label, value, className = ""}: {label: string; value: string; className?: string}) {
  return <div className={`min-w-0 ${className}`}><dt className="text-[#526675]">{label}</dt><dd className="mt-0.5 break-words font-medium leading-5 text-[#10243e]">{value}</dd></div>;
}
