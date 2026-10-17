"use client";

import {useState, useSyncExternalStore, type ReactNode} from "react";
import {ChevronLeft, ChevronRight} from "lucide-react";

const PAGE_SIZE = 8;
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Presentation-only paging: cards are already scoped and rendered by the server. */
export function EngineerSubmissionGroup({label, children}: {label: string; children: ReactNode[]}) {
  const [requestedPage, setPage] = useState(0);
  // Keep every authorised card usable if scripts fail or are disabled. Paging
  // progressively enhances the already-collapsed disclosure after hydration.
  const interactive = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const pages = Math.max(1, Math.ceil(children.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pages - 1);
  const start = page * PAGE_SIZE;

  return <details className="min-w-0 overflow-hidden rounded-2xl border border-[#dde4eb] bg-white">
    <summary className="min-h-11 cursor-pointer break-words bg-[#f6f8fa] px-4 py-3 text-sm font-semibold text-[#24384f] sm:px-5">
      {label} <span className="ml-2 inline-block text-xs font-normal text-[#526675]">{children.length} {children.length === 1 ? "deliverable" : "deliverables"}</span>
    </summary>
    {interactive && pages > 1 && <nav aria-label={`${label} deliverable pages`} className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 border-t border-[#e7ecef] px-3 py-1 sm:px-5">
      <p role="status" aria-live="polite" aria-atomic="true" className="text-xs leading-5 text-[#526675]">Showing {start + 1}–{Math.min(start + PAGE_SIZE, children.length)} of {children.length}</p>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" data-preview-safe aria-label={`Previous deliverables in ${label}`} disabled={page === 0} onClick={() => setPage(page - 1)} className="grid size-11 place-items-center rounded-lg text-[#10243e] hover:bg-[#eef3fa] disabled:opacity-40"><ChevronLeft size={18} aria-hidden="true"/></button>
        <span className="px-1 text-xs tabular-nums text-[#526675]">{page + 1} / {pages}</span>
        <button type="button" data-preview-safe aria-label={`Next deliverables in ${label}`} disabled={page === pages - 1} onClick={() => setPage(page + 1)} className="grid size-11 place-items-center rounded-lg text-[#10243e] hover:bg-[#eef3fa] disabled:opacity-40"><ChevronRight size={18} aria-hidden="true"/></button>
      </div>
    </nav>}
    <div className="min-w-0 divide-y divide-[#e7ecef]">{interactive ? children.slice(start, start + PAGE_SIZE) : children}</div>
  </details>;
}
