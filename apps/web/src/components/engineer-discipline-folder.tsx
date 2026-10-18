import type {ReactNode} from "react";
import {ChevronDown, Folder} from "lucide-react";

export type EngineerDisciplineFolderProps = {
  discipline: string;
  totalCount: number;
  matchCount: number;
  actionCount: number;
  acceptedPercent: number;
  children: ReactNode;
  defaultOpen?: boolean;
};

/** Native disclosure keeps each discipline navigable without client scripts. */
export function EngineerDisciplineFolder({discipline, totalCount, matchCount, actionCount, acceptedPercent, children, defaultOpen = false}: EngineerDisciplineFolderProps) {
  const accepted = Number.isFinite(acceptedPercent) ? Math.max(0, Math.min(100, Math.round(acceptedPercent))) : 0;
  return <details open={defaultOpen} aria-label={`${discipline} deliverables`} className="group/discipline min-w-0 overflow-hidden rounded-2xl border border-[#dce3ec] bg-white">
    <summary className="grid min-h-16 min-w-0 cursor-pointer list-none grid-cols-[2.75rem_minmax(0,1fr)_1.125rem] items-center gap-3 px-4 py-4 text-[#10243e] transition-colors hover:bg-[#f5f7fb] focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#c44d20] motion-reduce:transition-none sm:grid-cols-[2.75rem_minmax(0,1fr)_auto_1.125rem] sm:px-5 [&::-webkit-details-marker]:hidden">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#d9e3f0] bg-[#eef3fa] text-[#244b73]"><Folder size={22} aria-hidden="true" /></span>
      <span className="min-w-0">
        <span className="block break-words text-base font-semibold leading-6">{discipline}</span>
        <span className="mt-0.5 block text-xs leading-5 text-[#526675]">{totalCount} {totalCount === 1 ? "deliverable" : "deliverables"}{matchCount !== totalCount ? ` · ${matchCount} matching` : ""}</span>
      </span>
      <span className="col-span-3 row-start-2 flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs leading-5 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:justify-end sm:gap-x-5">
        {actionCount > 0 && <span className="rounded-full border border-[#f1d0be] bg-[#fff4ec] px-2.5 py-0.5 font-medium text-[#9b3d18]">{actionCount} {actionCount===1?"needs":"need"} attention</span>}
        <span className="tabular-nums text-[#526675]"><span className="font-semibold text-[#10243e]">{accepted}%</span> accepted progress</span>
      </span>
      <ChevronDown size={18} aria-hidden="true" className="col-start-3 row-start-1 text-[#526675] transition-transform group-open/discipline:rotate-180 motion-reduce:transition-none sm:col-start-4" />
    </summary>
    <div className="min-w-0 space-y-3 border-t border-[#e4e9ef] bg-[#f7f9fc] p-3 sm:p-4">{children}</div>
  </details>;
}
