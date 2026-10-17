import {HelpTip} from "@/components/help-tip";
import Link from "next/link";
import {ArrowLeft,ArrowRight,CalendarDays,FileText} from "lucide-react";
import {requireProject} from "@/lib/auth";
import {can} from "@/lib/permissions";
import {projectHomePath} from "@/lib/role-experience";
import {projectReportNumber,reportWeekdayLabel} from "@/lib/project-report";
import {ProjectReportControls} from "@/components/project-report-controls";
import {projectDeliveryStageLabel,projectTerminalIssueStatus} from "@/lib/project-delivery-stage";
import {formatReportDate as formatDate} from "@/lib/report-display-date";
import {BrowseNavigation} from "@/components/browse-navigation";
import {ReadUnavailable} from "@/components/read-unavailable";
import {browseHref,browsePage,browseSearch,readBrowseIndex,sliceBrowsePage,type BrowseQuery} from "@/lib/read-only-browse";

type Setting={generation_weekday:number;enabled:boolean;last_generated_at:string|null;pdf_color_template?:unknown};
type Report={id:string;report_number:number;period_start:string;period_end:string;generation_source:string;generated_at:string;snapshot:unknown};

export default async function ProjectReportsPage({params,searchParams}:{params:Promise<{organisationId:string;projectId:string}>;searchParams?:Promise<BrowseQuery>}){
  const {organisationId,projectId}=await params;
  const {supabase,access}=await requireProject(organisationId,projectId);
  const query=await searchParams??{},q=browseSearch(query.q),page=browsePage(query.page);
  const path=`/app/${organisationId}/projects/${projectId}/reports`,retryHref=browseHref(path,{q,page});
  let index:Omit<Report,"snapshot">[];
  let projectResult,settingResult;
  try{
  [projectResult,settingResult,index]=await Promise.all([
    supabase.from("projects").select("code,name,delivery_stage").eq("organisation_id",organisationId).eq("id",projectId).single(),
    supabase.from("project_report_settings").select("generation_weekday,enabled,last_generated_at,pdf_color_template").eq("organisation_id",organisationId).eq("project_id",projectId).maybeSingle(),
    readBrowseIndex<Omit<Report,"snapshot">>(async(start,end)=>{
      const result=await supabase.from("project_weekly_reports").select("id,report_number,period_start,period_end,generation_source,generated_at",{count:"exact"})
        .eq("organisation_id",organisationId).eq("project_id",projectId).order("period_end",{ascending:false}).order("id",{ascending:false}).range(start,end);
      return {...result,data:result.data as Omit<Report,"snapshot">[]|null};
    }),
  ]);
  }catch{return <ReadUnavailable title="Project reports are temporarily unavailable" href={retryHref}/>;}
  if(projectResult.error||settingResult.error||!projectResult.data)return <ReadUnavailable title="Project reporting information is temporarily unavailable" href={retryHref}/>;
  const project=projectResult.data,setting=settingResult.data;
  const term=q.toLocaleLowerCase(),filtered=index.filter(report=>`${projectReportNumber(report.report_number)} ${report.report_number} ${report.generation_source} ${report.period_start} ${report.period_end} ${formatDate(report.period_start)} ${formatDate(report.period_end)}`.toLocaleLowerCase().includes(term));
  const result=sliceBrowsePage(filtered,page);
  let reports:Report[]=[];
  if(result.items.length){
    const snapshots=await supabase.from("project_weekly_reports").select("id,report_number,period_start,period_end,generation_source,generated_at,snapshot")
      .eq("organisation_id",organisationId).eq("project_id",projectId).in("id",result.items.map(report=>report.id));
    if(snapshots.error||!Array.isArray(snapshots.data)||snapshots.data.length!==result.items.length)return <ReadUnavailable title="Report summaries are temporarily unavailable" href={retryHref}/>;
    const byId=new Map((snapshots.data as Report[]).map(report=>[report.id,report]));
    if(result.items.some(report=>!byId.has(report.id)))return <ReadUnavailable title="Report summaries are temporarily unavailable" href={retryHref}/>;
    reports=result.items.map(report=>byId.get(report.id)!);
  }
  const schedule=(setting as Setting|null)??{generation_weekday:5,enabled:false,last_generated_at:null};
  const manageable=can(String(access.role),"project:manage");
  return <div className="mx-auto min-w-0 max-w-[1500px]">
    <Link href={projectHomePath(organisationId,projectId,String(access.role))} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[#10243e]"><ArrowLeft size={16} aria-hidden="true"/> Project workspace</Link>
    <header className="mt-6 flex min-w-0 flex-wrap items-end justify-between gap-4"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#b94d20]">Management reporting</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Project reports</h1><p className="mt-2 break-words text-sm leading-6 text-[#617083]">{project?.code} · {project?.name} <HelpTip label="Project reporting guidance">A controlled weekly record of delivery progress, look-ahead and challenges.</HelpTip></p><p className="mt-2 break-words text-xs font-semibold text-[#10243e]">{projectDeliveryStageLabel(project?.delivery_stage)} · 100% completion milestone: {projectTerminalIssueStatus(project?.delivery_stage)}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${schedule.enabled?"bg-[#eef3fa] text-[#10243e]":"bg-[#eef1f4] text-[#617083]"}`}>{schedule.enabled?`Automatic · ${reportWeekdayLabel(schedule.generation_weekday)}`:"Automatic generation paused"}</span></header>
    {manageable?<section className="mt-6 min-w-0" aria-label="Report generation and settings"><ProjectReportControls organisationId={organisationId} projectId={projectId} weekday={schedule.generation_weekday} enabled={schedule.enabled} lastGeneratedAt={schedule.last_generated_at??index[0]?.generated_at??null} pdfColorTemplate={schedule.pdf_color_template}/></section>:<section className="ev-card mt-6 p-5 text-sm text-[#617083]">Reports are read-only for your role. Project administrators control the weekly schedule and report generation.</section>}
    <section className="mt-6" aria-labelledby="weekly-report-register"><div className="flex min-w-0 flex-wrap items-center justify-between gap-4"><h2 id="weekly-report-register" className="text-xl font-semibold">Weekly report register</h2><span className="text-sm text-[#617083]">{index.length} report{index.length===1?"":"s"}</span></div>
      <form data-preview-safe method="get" action={path} className="mt-4 flex min-w-0 flex-wrap items-end gap-3" aria-label="Search project reports"><label className="min-w-0 flex-1 basis-64"><span className="ev-label">Search reports</span><input name="q" type="search" maxLength={100} defaultValue={q} className="ev-input" placeholder="Report number, reporting date or manual / scheduled"/></label><button className="ev-button-secondary">Search</button>{q&&<Link href={path} className="ev-button-secondary">Clear search</Link>}</form>
      <BrowseNavigation path={path} query={{q}} {...result} count={reports.length} label="Reports"/>
      <div className="mt-4 grid gap-3">{reports?.length?(reports as Report[]).map(report=>{
        const summary=readSummary(report.snapshot);return <Link href={`/app/${organisationId}/projects/${projectId}/reports/${report.id}`} key={report.id} className="ev-card group grid min-w-0 grid-cols-2 items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-[#cad5e2] motion-reduce:transform-none motion-reduce:transition-none sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] sm:gap-4 sm:p-5">
          <span className="hidden size-11 shrink-0 place-items-center rounded-xl bg-[#fff0e9] text-[#b94d20] sm:grid"><FileText size={19} aria-hidden="true"/></span><div className="col-span-2 min-w-0 sm:col-span-1"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-semibold">{projectReportNumber(report.report_number)}</h3><span className="rounded-full bg-[#eef3fa] px-2 py-1 text-[10px] font-bold uppercase text-[#10243e]">{report.generation_source}</span></div><p className="mt-1 flex min-w-0 items-start gap-1.5 text-xs leading-5 text-[#617083]"><CalendarDays size={13} aria-hidden="true" className="mt-1 shrink-0"/><span className="min-w-0 break-words">{formatDate(report.period_start)} to {formatDate(report.period_end)}</span></p></div><div className="grid min-w-0 place-items-start sm:min-w-24 sm:place-items-end"><b className="text-xl text-[#10243e]">{summary.overall===null?"Not available":`${summary.overall}%`}</b><span className="text-[10px] font-bold uppercase tracking-[.1em] text-[#617083]">Overall</span></div><div className="grid min-w-0 place-items-end sm:min-w-20"><b className={summary.overdue?"text-[#a5452f]":"text-[#24384f]"}>{summary.overdue??"Not available"}</b><span className="text-[10px] font-bold uppercase tracking-[.1em] text-[#617083]">Overdue</span></div><ArrowRight size={18} aria-hidden="true" className="hidden text-[#617083] transition group-hover:translate-x-1 group-hover:text-[#b94d20] motion-reduce:transform-none motion-reduce:transition-none sm:block"/>
        </Link>;
      }):<div className="ev-card p-10 text-center"><FileText className="mx-auto text-[#b8c3cf]" size={30} aria-hidden="true"/><h3 className="mt-4 font-semibold">{q?"No reports match this search":"No project report yet"}</h3><p className="mt-2 text-sm text-[#617083]">{q?"Search by report number or reporting date, or clear the search to browse the register.":"Generate the first report to establish the project baseline."}</p></div>}</div>
    </section>
  </div>;
}

function readSummary(snapshot:unknown){
  const value=snapshot&&typeof snapshot==="object"?snapshot as {summary?:{overall_progress?:unknown;overdue_deliverables?:unknown}}:{};
  const metric=(input:unknown)=>typeof input==="number"&&Number.isFinite(input)&&input>=0?input:null;
  return {overall:metric(value.summary?.overall_progress),overdue:metric(value.summary?.overdue_deliverables)};
}
