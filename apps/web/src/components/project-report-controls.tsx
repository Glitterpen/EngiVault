"use client";

import {HelpTip} from "@/components/help-tip";
import {useActionState,useEffect} from "react";
import {useRouter} from "next/navigation";
import {CalendarClock,FileChartColumnIncreasing,RefreshCw} from "lucide-react";
import {generateProjectReport,saveProjectReportSchedule,type ProjectReportActionState} from "@/app/app/project-report-actions";
import {REPORT_WEEKDAYS} from "@/lib/project-report";
import {formatReportTimestamp} from "@/lib/report-display-date";
import {PdfColorTemplateSelect} from "@/components/pdf-color-template-select";

type Props={organisationId:string;projectId:string;weekday:number;enabled:boolean;lastGeneratedAt:string|null;pdfColorTemplate?:unknown};

export function ProjectReportControls({organisationId,projectId,weekday,enabled,lastGeneratedAt,pdfColorTemplate="neutral"}:Props){
  const router=useRouter();
  const [scheduleState,scheduleAction,schedulePending]=useActionState<ProjectReportActionState,FormData>(saveProjectReportSchedule,undefined);
  const [generationState,generationAction,generationPending]=useActionState<ProjectReportActionState,FormData>(generateProjectReport,undefined);
  useEffect(()=>{if(generationState?.reportId)router.push(`/app/${organisationId}/projects/${projectId}/reports/${generationState.reportId}`)},[generationState?.reportId,organisationId,projectId,router]);
  return <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.7fr)]">
    <form action={scheduleAction} aria-label="Weekly report schedule" className="ev-card min-w-0 p-4 sm:p-6">
      <Hidden organisationId={organisationId} projectId={projectId}/>
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff0e9] text-[#b94d20]"><CalendarClock size={19} aria-hidden="true"/></span><div className="min-w-0"><h2 className="break-words font-semibold">Weekly report schedule <HelpTip label="Weekly report schedule guidance">Choose the day EngiCite should preserve the weekly project position.</HelpTip></h2></div></div>
      <label className="mt-5 block"><span className="ev-label">Generate every</span><select className="ev-input" name="weekday" defaultValue={String(weekday)}>{REPORT_WEEKDAYS.map(day=><option key={day.value} value={day.value}>{day.label}</option>)}</select></label>
      <div className="mt-4"><PdfColorTemplateSelect defaultValue={pdfColorTemplate} disabled={schedulePending} label="Scheduled report colour template" description="Used for new scheduled reports. Previously captured reports keep their saved template."/></div>
      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-1 rounded-xl border border-[#d6e0ed] bg-[#f4f7fb] px-3 py-2 text-sm"><label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-3"><input type="checkbox" name="enabled" defaultChecked={enabled} className="size-5 shrink-0 accent-[#10243e]"/><strong className="min-w-0 break-words text-[#24384f]">Automatic weekly generation</strong></label><HelpTip label="Automatic report timing">Runs after 06:00 UTC on the selected day and notifies project management.</HelpTip></div>
      <p className="mt-3 break-words text-xs leading-5 text-[#617083]">Last automatic or manual capture: {lastGeneratedAt?<time dateTime={lastGeneratedAt}>{formatReportTimestamp(lastGeneratedAt)}</time>:"No report generated yet"}</p>
      <Status state={scheduleState}/><button className="ev-button mt-5 w-full sm:w-auto" disabled={schedulePending}>{schedulePending?"Saving report settings…":"Save report settings"}</button>
    </form>
    <form action={generationAction} aria-label="Generate current project report" className="ev-card flex min-w-0 flex-col justify-between bg-[linear-gradient(145deg,#10243e,#173a58)] p-4 text-white shadow-[0_18px_50px_rgba(16,36,62,.16)] [--focus:#ffffff] sm:p-6">
      <Hidden organisationId={organisationId} projectId={projectId}/>
      <div><span className="grid size-11 place-items-center rounded-xl bg-white/10 text-[#ff9a6d]"><FileChartColumnIncreasing size={21} aria-hidden="true"/></span><h2 className="mt-5 break-words text-xl font-semibold">Generate the current report <HelpTip label="Generate a project report">Capture overall progress, discipline performance, weekly movement, next-week deliverables and active challenges now.</HelpTip></h2></div>
      <div><div className="mt-5"><PdfColorTemplateSelect defaultValue={pdfColorTemplate} disabled={generationPending} label="Report colour template" description="Used for a new report. Regenerating an existing reporting period keeps its original template."/></div><Status state={generationState} inverted/><button className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#b94d20] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#9e3e17] motion-reduce:transition-none disabled:opacity-50" disabled={generationPending}>{generationPending?<><RefreshCw className="shrink-0 animate-spin motion-reduce:animate-none" size={16} aria-hidden="true"/>Building report…</>:<><FileChartColumnIncreasing className="shrink-0" size={16} aria-hidden="true"/>Generate project report</>}</button></div>
    </form>
  </div>;
}

function Hidden({organisationId,projectId}:{organisationId:string;projectId:string}){return <><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/></>}
function Status({state,inverted=false}:{state:ProjectReportActionState;inverted?:boolean}){return state?.message?<p className={`mt-4 rounded-xl p-3 text-xs ${inverted?"bg-white/10 text-white":"bg-[#f4f7fb] text-[#10243e]"}`} role={state.ok?"status":"alert"}>{state.message}</p>:null}
