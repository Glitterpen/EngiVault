"use client";

import {HelpTip} from "@/components/help-tip";
import {useActionState,useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {CalendarClock,FileChartColumnIncreasing,RefreshCw} from "lucide-react";
import {generateProjectReport,saveProjectReportSchedule,type ProjectReportActionState} from "@/app/app/project-report-actions";
import {REPORT_WEEKDAYS} from "@/lib/project-report";
import {formatReportTimestamp} from "@/lib/report-display-date";
import {PdfColorTemplateSelect} from "@/components/pdf-color-template-select";
import {pdfColorTemplate} from "@/lib/pdf-color-template";

type Props={organisationId:string;projectId:string;weekday:number;enabled:boolean;lastGeneratedAt:string|null;pdfColorTemplate?:unknown};

export function ProjectReportControls({organisationId,projectId,weekday,enabled,lastGeneratedAt,pdfColorTemplate:defaultTemplate="neutral"}:Props){
  const router=useRouter();
  const [selectedTemplate,setSelectedTemplate]=useState(()=>pdfColorTemplate(defaultTemplate).id);
  const [scheduleState,scheduleAction,schedulePending]=useActionState<ProjectReportActionState,FormData>(saveProjectReportSchedule,undefined);
  const [generationState,generationAction,generationPending]=useActionState<ProjectReportActionState,FormData>(generateProjectReport,undefined);
  const pending=schedulePending||generationPending;
  useEffect(()=>{if(generationState?.reportId)router.push(`/app/${organisationId}/projects/${projectId}/reports/${generationState.reportId}`)},[generationState?.reportId,organisationId,projectId,router]);
  return <div className="ev-card min-w-0">
    <form action={generationAction} aria-label="Generate current project report" aria-busy={generationPending} className="grid min-w-0 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,21rem)_auto] lg:items-center">
      <Hidden organisationId={organisationId} projectId={projectId}/>
      <div className="min-w-0">
        <h2 className="flex flex-wrap items-center gap-2 font-semibold text-[#10243e]">
          <FileChartColumnIncreasing className="shrink-0 text-[#b94d20]" size={20} aria-hidden="true"/>
          Generate report
          <HelpTip label="Generate a project report">Capture the current project position using the selected colour template. Existing reporting periods keep their original template.</HelpTip>
        </h2>
        <p className="mt-2 break-words text-xs leading-5 text-[#617083]">Last automatic or manual capture: {lastGeneratedAt?<time dateTime={lastGeneratedAt}>{formatReportTimestamp(lastGeneratedAt)}</time>:"No report generated yet"}</p>
      </div>
      <PdfColorTemplateSelect value={selectedTemplate} onValueChange={setSelectedTemplate} disabled={pending} description="Regenerating an existing reporting period keeps its original template."/>
      <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#b94d20] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#9e3e17] motion-reduce:transition-none disabled:opacity-50 lg:w-auto" disabled={pending}>
        {generationPending?<><RefreshCw className="shrink-0 animate-spin motion-reduce:animate-none" size={16} aria-hidden="true"/>Building report…</>:<><FileChartColumnIncreasing className="shrink-0" size={16} aria-hidden="true"/>Generate project report</>}
      </button>
      {generationState?.message?<div className="min-w-0 lg:col-span-3"><Status state={generationState}/></div>:null}
    </form>
    <form action={scheduleAction} aria-label="Weekly report schedule" aria-busy={schedulePending} className="min-w-0 rounded-b-[inherit] border-t border-[#d6e0ed] bg-[#f7f9fc] p-4 sm:p-5">
      <Hidden organisationId={organisationId} projectId={projectId}/>
      <input type="hidden" name="pdfColorTemplate" value={selectedTemplate}/>
      <div className="grid min-w-0 items-end gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(9rem,12rem)_minmax(0,1fr)_auto]">
        <h2 className="flex min-h-11 flex-wrap items-center gap-2 font-semibold text-[#10243e]">
          <CalendarClock className="shrink-0 text-[#617083]" size={19} aria-hidden="true"/>
          Report settings
          <HelpTip label="Weekly report schedule guidance">Choose the weekly capture day. Save report settings to apply the colour template selected above to future scheduled reports; generating a report does not save these settings.</HelpTip>
        </h2>
        <label className="block min-w-0"><span className="ev-label">Generate every</span><select className="ev-input" name="weekday" defaultValue={String(weekday)} disabled={pending}>{REPORT_WEEKDAYS.map(day=><option key={day.value} value={day.value}>{day.label}</option>)}</select></label>
        <div className="flex min-h-11 min-w-0 items-center gap-1">
          <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-3"><input type="checkbox" name="enabled" defaultChecked={enabled} disabled={pending} className="size-5 shrink-0 accent-[#10243e]"/><span className="min-w-0 break-words text-sm font-semibold text-[#24384f]">Automatic weekly generation</span></label>
          <HelpTip label="Automatic report timing">Runs after 06:00 UTC on the selected day and notifies project management.</HelpTip>
        </div>
        <button type="submit" className="ev-button-secondary min-h-11 w-full xl:w-auto" disabled={pending}>{schedulePending?"Saving report settings…":"Save report settings"}</button>
      </div>
      <Status state={scheduleState}/>
    </form>
  </div>;
}

function Hidden({organisationId,projectId}:{organisationId:string;projectId:string}){return <><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/></>}
function Status({state}:{state:ProjectReportActionState}){return state?.message?<p className="mt-3 break-words rounded-xl bg-[#eef3fa] p-3 text-xs text-[#10243e]" role={state.ok?"status":"alert"}>{state.message}</p>:null}
