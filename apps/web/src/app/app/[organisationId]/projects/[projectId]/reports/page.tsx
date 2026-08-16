import Link from "next/link";
import {ArrowLeft,ArrowRight,CalendarDays,FileText} from "lucide-react";
import {requireProject} from "@/lib/auth";
import {can} from "@/lib/permissions";
import {projectHomePath} from "@/lib/role-experience";
import {DEFAULT_DISCIPLINE_REPORT_COLUMNS,projectReportNumber,reportWeekdayLabel,type DisciplineReportColumn} from "@/lib/project-report";
import {ProjectReportControls} from "@/components/project-report-controls";

type Setting={generation_weekday:number;enabled:boolean;last_generated_at:string|null;discipline_columns:DisciplineReportColumn[]|null};
type Report={id:string;report_number:number;period_start:string;period_end:string;generation_source:string;generated_at:string;snapshot:unknown};

export default async function ProjectReportsPage({params}:{params:Promise<{organisationId:string;projectId:string}>}){
  const {organisationId,projectId}=await params;
  const {supabase,access}=await requireProject(organisationId,projectId);
  const [{data:project},{data:setting},{data:reports,error}]=await Promise.all([
    supabase.from("projects").select("code,name").eq("organisation_id",organisationId).eq("id",projectId).single(),
    supabase.from("project_report_settings").select("generation_weekday,enabled,last_generated_at,discipline_columns").eq("organisation_id",organisationId).eq("project_id",projectId).maybeSingle(),
    supabase.from("project_weekly_reports").select("id,report_number,period_start,period_end,generation_source,generated_at,snapshot").eq("organisation_id",organisationId).eq("project_id",projectId).order("period_end",{ascending:false}),
  ]);
  if(error)throw new Error(`Project reports unavailable: ${error.code}`);
  const schedule=(setting as Setting|null)??{generation_weekday:5,enabled:false,last_generated_at:null,discipline_columns:null};
  const manageable=can(String(access.role),"project:manage");
  return <div className="mx-auto max-w-[1500px]">
    <Link href={projectHomePath(organisationId,projectId,String(access.role))} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45]"><ArrowLeft size={16}/> Project workspace</Link>
    <header className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">Management reporting</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Project reports</h1><p className="mt-2 text-sm text-[#617083]">{project?.code} · {project?.name} · A controlled weekly record of delivery progress, look-ahead and challenges.</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${schedule.enabled?"bg-[#e8f1ed] text-[#0c5b45]":"bg-[#eef1f4] text-[#617083]"}`}>{schedule.enabled?`Automatic · ${reportWeekdayLabel(schedule.generation_weekday)}`:"Automatic generation paused"}</span></header>
    {manageable?<section className="mt-6"><ProjectReportControls organisationId={organisationId} projectId={projectId} weekday={schedule.generation_weekday} enabled={schedule.enabled} lastGeneratedAt={schedule.last_generated_at??(reports?.[0] as Report|undefined)?.generated_at??null} disciplineColumns={schedule.discipline_columns?.length?schedule.discipline_columns:DEFAULT_DISCIPLINE_REPORT_COLUMNS}/></section>:<section className="ev-card mt-6 p-5 text-sm text-[#617083]">Reports are read-only for your role. Project administrators control the weekly schedule and report generation.</section>}
    <section className="mt-8"><div className="flex items-center justify-between gap-4"><div><p className="ev-label">Controlled history</p><h2 className="mt-1 text-xl font-semibold">Weekly report register</h2></div><span className="text-sm text-[#617083]">{reports?.length??0} report{reports?.length===1?"":"s"}</span></div>
      <div className="mt-4 grid gap-3">{reports?.length?(reports as Report[]).map(report=>{
        const summary=readSummary(report.snapshot);return <Link href={`/app/${organisationId}/projects/${projectId}/reports/${report.id}`} key={report.id} className="ev-card group flex flex-wrap items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:border-[#c8d4ce]">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#fff0e9] text-[#e8733f]"><FileText size={19}/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{projectReportNumber(report.report_number)}</h3><span className="rounded-full bg-[#eef4f1] px-2 py-1 text-[10px] font-bold uppercase text-[#0c5b45]">{report.generation_source}</span></div><p className="mt-1 flex items-center gap-1.5 text-xs text-[#617083]"><CalendarDays size={13}/>{formatDate(report.period_start)} to {formatDate(report.period_end)}</p></div><div className="grid min-w-24 place-items-end"><b className="text-xl text-[#0c5b45]">{summary.overall}%</b><span className="text-[10px] font-bold uppercase tracking-[.1em] text-[#617083]">Overall</span></div><div className="grid min-w-20 place-items-end"><b className={summary.overdue?"text-[#a5452f]":"text-[#24384f]"}>{summary.overdue}</b><span className="text-[10px] font-bold uppercase tracking-[.1em] text-[#617083]">Overdue</span></div><ArrowRight size={18} className="text-[#98a5b3] transition group-hover:translate-x-1 group-hover:text-[#e8733f]"/>
        </Link>;
      }):<div className="ev-card p-10 text-center"><FileText className="mx-auto text-[#b8c3cf]" size={30}/><h3 className="mt-4 font-semibold">No project report yet</h3><p className="mt-2 text-sm text-[#617083]">Generate the first report to establish the project baseline.</p></div>}</div>
    </section>
  </div>;
}

function readSummary(snapshot:unknown){
  const value=snapshot&&typeof snapshot==="object"?snapshot as {summary?:{overall_progress?:unknown;overdue_deliverables?:unknown}}:{};
  return {overall:Number(value.summary?.overall_progress??0),overdue:Number(value.summary?.overdue_deliverables??0)};
}
function formatDate(value:string){return new Date(`${value}T00:00:00`).toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"})}
