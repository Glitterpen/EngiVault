import type {ReactNode} from "react";
import Link from "next/link";
import {ArrowLeft,Download,MessageSquare,Search} from "lucide-react";
import {HelpTip} from "@/components/help-tip";
import {MdrDisciplineFolders} from "@/components/mdr-discipline-folders";
import {MdrAssignmentDialog} from "@/components/mdr-assignment-dialog";
import {MdrActionToolbar} from "@/components/mdr-action-toolbar";
import type {MdrFilters,MdrDisciplineSummary} from "@/lib/mdr-register-types";
export type {MdrFilters,MdrDocument} from "@/lib/mdr-register-types";

type Props={
  organisationId:string;projectId:string;backHref:string;backLabel:string;filters:MdrFilters;
  disciplines:MdrDisciplineSummary[];initialDiscipline?:string;initialPage?:number;total:number;canManage:boolean;canSeeRemoved:boolean;canUseAi:boolean;
  refreshKey?:string;registerAction?:ReactNode;importAction?:ReactNode;assignmentPanel?:ReactNode;assignmentNotice?:ReactNode;notice?:ReactNode;
};
export function mdrFilterUrl(filters:MdrFilters,changes:Partial<MdrFilters>={}){
  const values={...filters,...changes};
  const query=new URLSearchParams(Object.entries({q:values.q,records:values.records}).filter((entry):entry is [string,string]=>Boolean(entry[1]))).toString();
  return query?`?${query}`:"?";
}
export function MdrRegisterWorkspace({organisationId,projectId,backHref,backLabel,filters,disciplines,initialDiscipline,initialPage,total,canManage,canSeeRemoved,canUseAi,refreshKey,registerAction,importAction,assignmentPanel,assignmentNotice,notice}:Props){
  const base=`/app/${organisationId}/projects/${projectId}`,archived=filters.records==="removed";
  const tab="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-[#617083] hover:bg-[#f4f7fb]";
  const active="bg-[#eef3fa] font-semibold text-[#10243e]";
  const download=<a href={`/api/v1/organisations/${organisationId}/projects/${projectId}/documents/export${archived?"?records=removed":""}`} className="ev-button-secondary"><Download size={16} aria-hidden="true"/>Download MDR</a>;
  return <div className="mx-auto min-w-0 max-w-[1400px] space-y-4">
    <header>
      <Link href={backHref} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#10243e]"><ArrowLeft size={16} aria-hidden="true"/>{backLabel}</Link>
      <div className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h1 className="flex min-w-0 flex-wrap items-center gap-x-2 break-words text-2xl font-semibold leading-tight tracking-tight text-[#10243e] sm:text-[1.75rem]">{archived?"Removed deliverables":"Master document register"}<HelpTip label="Master document register guidance">All disciplines with MDR documents appear as folders, collapsed by default. A discipline shortcut opens its folder without hiding the others. Open a folder to browse its documents, or search by document number, title, discipline or type. Each folder remembers its page while you browse. Back to MDR restores the folder, page and search you left. Due dates stay visible; the details icon holds schedule history and other metadata. Removed records retain revision and audit history.</HelpTip></h1>
      </div>
      <MdrActionToolbar primary={assignmentPanel?<MdrAssignmentDialog>{assignmentPanel}</MdrAssignmentDialog>:download}>
        {assignmentPanel?download:null}
        <Link href={`${base}/search`} className="ev-button-secondary"><Search size={16} aria-hidden="true"/>Engineering Search</Link>
        {canUseAi&&<Link href={`${base}/chat`} className="ev-button-secondary"><MessageSquare size={16} aria-hidden="true"/>Ask EngiCite</Link>}
        {registerAction}{importAction}
      </MdrActionToolbar>
    </header>
    {notice}
    {assignmentNotice}
    <form method="get" aria-label="Search the MDR" className="ev-card flex min-w-0 flex-wrap items-end gap-3 p-3 sm:p-4">
      {archived&&<input type="hidden" name="records" value="removed"/>}
      <label className="min-w-0 flex-1 basis-56"><span className="ev-label">Search the MDR</span><input className="ev-input" name="q" type="search" maxLength={100} defaultValue={filters.q??""} placeholder="Document number, title, discipline or type"/></label>
      <button className="ev-button-secondary"><Search size={16} aria-hidden="true"/>Search</button>
      {filters.q&&<Link href={mdrFilterUrl({records:filters.records})} className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-[#10243e]">Clear search</Link>}
    </form>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dfe6e9] pb-2">
      <nav aria-label="Register records" className="flex flex-wrap gap-1">
        <Link href={mdrFilterUrl(filters,{records:""})} aria-current={!archived?"page":undefined} className={`${tab} ${!archived?active:""}`}>Active MDR</Link>
        {canSeeRemoved&&<Link href={mdrFilterUrl(filters,{records:"removed"})} aria-current={archived?"page":undefined} className={`${tab} ${archived?active:""}`}>Removed deliverables</Link>}
      </nav>
      <p className="text-xs text-[#617083]">{total} {filters.q?"matching ":""}document{total===1?"":"s"} · {disciplines.length} discipline{disciplines.length===1?"":"s"}</p>
    </div>
    <MdrDisciplineFolders key={`${organisationId}:${projectId}:${archived}:${filters.q??""}:${initialDiscipline??""}`} organisationId={organisationId} projectId={projectId} disciplines={disciplines} initialDiscipline={initialDiscipline} initialPage={initialPage} search={filters.q??""} records={archived?"removed":""} canManage={canManage} refreshKey={refreshKey}/>
  </div>;
}
