"use client";

import {useActionState,useEffect} from "react";
import {useRouter} from "next/navigation";
import {CalendarClock,FileChartColumnIncreasing,RefreshCw} from "lucide-react";
import {generateProjectReport,saveProjectReportSchedule,type ProjectReportActionState} from "@/app/app/project-report-actions";
import {REPORT_WEEKDAYS} from "@/lib/project-report";

type Props={organisationId:string;projectId:string;weekday:number;enabled:boolean;lastGeneratedAt:string|null};

export function ProjectReportControls({organisationId,projectId,weekday,enabled,lastGeneratedAt}:Props){
  const router=useRouter();
  const [scheduleState,scheduleAction,schedulePending]=useActionState<ProjectReportActionState,FormData>(saveProjectReportSchedule,undefined);
  const [generationState,generationAction,generationPending]=useActionState<ProjectReportActionState,FormData>(generateProjectReport,undefined);
  useEffect(()=>{if(generationState?.reportId)router.push(`/app/${organisationId}/projects/${projectId}/reports/${generationState.reportId}`)},[generationState?.reportId,organisationId,projectId,router]);
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.7fr)]">
    <form action={scheduleAction} className="ev-card p-5 sm:p-6">
      <Hidden organisationId={organisationId} projectId={projectId}/>
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff0e9] text-[#e8733f]"><CalendarClock size={19}/></span><div><h2 className="font-semibold">Weekly report schedule</h2><p className="mt-1 text-xs leading-5 text-[#617083]">Choose the day EngiCite should preserve the weekly project position.</p></div></div>
      <label className="mt-5 block"><span className="ev-label">Generate every</span><select className="ev-input" name="weekday" defaultValue={String(weekday)}>{REPORT_WEEKDAYS.map(day=><option key={day.value} value={day.value}>{day.label}</option>)}</select></label>
      <label className="mt-4 flex items-start gap-3 rounded-xl border border-[#dfe7e3] bg-[#f8faf9] p-4 text-sm"><input className="mt-1" type="checkbox" name="enabled" defaultChecked={enabled}/><span><strong className="block text-[#24384f]">Automatic weekly generation</strong><span className="mt-1 block text-xs leading-5 text-[#617083]">Runs after 06:00 UTC on the selected day and notifies project management.</span></span></label>
      <p className="mt-3 text-xs text-[#617083]">Last automatic or manual capture: {lastGeneratedAt?formatDateTime(lastGeneratedAt):"No report generated yet"}</p>
      <Status state={scheduleState}/><button className="ev-button mt-5" disabled={schedulePending}>{schedulePending?"Saving report settings…":"Save report settings"}</button>
    </form>
    <form action={generationAction} className="ev-card flex flex-col justify-between bg-[linear-gradient(145deg,#10243e,#173a58)] p-5 text-white shadow-[0_18px_50px_rgba(16,36,62,.16)] sm:p-6">
      <Hidden organisationId={organisationId} projectId={projectId}/>
      <div><span className="grid size-11 place-items-center rounded-xl bg-white/10 text-[#ff9a6d]"><FileChartColumnIncreasing size={21}/></span><h2 className="mt-5 text-xl font-semibold">Generate the current report</h2><p className="mt-2 text-sm leading-6 text-white/65">Capture overall progress, discipline performance, weekly movement, next-week deliverables and active challenges now.</p></div>
      <div><Status state={generationState} inverted/><button className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#ed7138] px-5 text-sm font-semibold text-white transition hover:bg-[#db622c] disabled:opacity-50" disabled={generationPending}>{generationPending?<><RefreshCw className="animate-spin" size={16}/>Building report…</>:<><FileChartColumnIncreasing size={16}/>Generate project report</>}</button></div>
    </form>
  </div>;
}

function Hidden({organisationId,projectId}:{organisationId:string;projectId:string}){return <><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/></>}
function Status({state,inverted=false}:{state:ProjectReportActionState;inverted?:boolean}){return state?.message?<p className={`mt-4 rounded-xl p-3 text-xs ${inverted?"bg-white/10 text-white":"bg-[#f3f7f5] text-[#0c5b45]"}`} role={state.ok?"status":"alert"}>{state.message}</p>:null}
function formatDateTime(value:string){return new Date(value).toLocaleString(undefined,{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}
