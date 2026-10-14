import {HelpTip} from "@/components/help-tip";
import Link from "next/link";
import type {DocumentSchedule} from "@/lib/document-schedule";
import {DocumentIssueSchedule} from "@/components/document-issue-schedule";
import {AlertTriangle,ArrowLeft,CheckCircle2,Clock3,FileUp} from "lucide-react";
import {requireProject} from "@/lib/auth";
import {projectDeliveryStageLabel,projectTerminalIssueStatus,type ProjectDeliveryStage} from "@/lib/project-delivery-stage";
import {projectHomePath} from "@/lib/role-experience";

type Row=DocumentSchedule&{
  document_id:string;
  document_number:string;
  title:string;
  discipline:string;
  progress_weight:number;
  progress_credit:number;
  uploaded:boolean;
  overdue:boolean;
  issue_status:string|null;
  planned_submission_date:string|null;
  delivery_stage:ProjectDeliveryStage;
  terminal_issue_status:string;
};

export default async function ProgressPage({params}:{params:Promise<{organisationId:string;projectId:string}>}){
  const {organisationId,projectId}=await params;
  const {supabase,access}=await requireProject(organisationId,projectId);
  const {data,error}=await supabase.from("project_document_progress").select("*").eq("organisation_id",organisationId).eq("project_id",projectId).eq("lifecycle_status","active").order("discipline").order("document_number");
  if(error)throw new Error(`Progress unavailable: ${error.code}`);

  const rows=(data??[]) as Row[];
  const deliveryStage=rows[0]?.delivery_stage??"feed";
  const terminalIssueStatus=rows[0]?.terminal_issue_status??projectTerminalIssueStatus(deliveryStage);
  const totalWeight=rows.reduce((sum,row)=>sum+Number(row.progress_weight),0);
  const earned=rows.reduce((sum,row)=>sum+Number(row.progress_weight)*row.progress_credit/100,0);
  const overall=totalWeight?Math.round(earned/totalWeight*100):0;
  const uploaded=rows.filter(row=>row.uploaded).length;
  const stageAccepted=rows.filter(row=>row.progress_credit>0).length;
  const terminalIssued=rows.filter(row=>row.progress_credit===100).length;
  const overdue=rows.filter(row=>row.overdue).length;
  const disciplines=[...new Set(rows.map(row=>row.discipline))].sort();

  return <div className="mx-auto max-w-7xl">
    <Link href={projectHomePath(organisationId,projectId,String(access.role))} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45]"><ArrowLeft size={16}/> Role workspace</Link>
    <p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">Deliverables oversight</p>
    <h1 className="mt-2 text-3xl font-semibold">Project progress <HelpTip label="Stage-weighted progress">{projectDeliveryStageLabel(deliveryStage)} stage-weighted progress across every active MDR deliverable. A document earns 100% only at {terminalIssueStatus} after DCC acceptance.</HelpTip></h1>


    <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Metric label="Stage-weighted progress" value={`${overall}%`} icon={<Clock3/>}/>
      <Metric label="Planned scope" value={rows.length} icon={<Clock3/>}/>
      <Metric label="Files uploaded" value={uploaded} icon={<FileUp/>}/>
      <Metric label="Stage accepted" value={stageAccepted} icon={<CheckCircle2/>}/>
      <Metric label="Terminal-stage issued" value={terminalIssued} icon={<CheckCircle2/>}/>
      <Metric label="Overdue" value={overdue} icon={<AlertTriangle/>}/>
    </div>

    <section aria-label="Discipline progress" className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {disciplines.map(name=>{
        const scoped=rows.filter(row=>row.discipline===name);
        const weight=scoped.reduce((sum,row)=>sum+Number(row.progress_weight),0);
        const credit=weight?Math.round(scoped.reduce((sum,row)=>sum+Number(row.progress_weight)*row.progress_credit/100,0)/weight*100):0;
        return <article className="ev-card min-w-0 p-4" key={name}>
          <div className="flex items-start justify-between gap-3"><h2 className="min-w-0 font-semibold">{name}</h2><b className="shrink-0 text-[#0c5b45]">{credit}%</b></div>
          <div role="progressbar" aria-label={`${name} stage-weighted progress`} aria-valuenow={credit} aria-valuemin={0} aria-valuemax={100} className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#e4ebe7]"><div className="h-full bg-[#e8733f]" style={{width:`${credit}%`}}/></div>
          <p className="mt-2.5 text-xs leading-5 text-[#617083]">{scoped.filter(row=>row.progress_credit>0).length} of {scoped.length} stage-issued · {scoped.filter(row=>row.progress_credit===100).length} terminal-stage issued</p>
        </article>;
      })}
    </section>

    <details className="ev-card mt-5 min-w-0 overflow-hidden">
      <summary className="min-h-11 cursor-pointer px-4 py-3.5 font-semibold text-[#24384f] sm:px-5">Document progress <span className="ml-2 inline-block rounded-full bg-[#e8f1ed] px-2.5 py-1 text-xs text-[#0c5b45]">{rows.length} {rows.length===1?"document":"documents"}</span></summary>
      <div className="flex items-center justify-between gap-3 border-t border-[#e4e9ee] px-4 py-2 sm:px-5"><h2 className="text-sm font-semibold">Progress by deliverable</h2><HelpTip label="Document progress table guidance">On narrow screens, scroll horizontally to see all columns. Keyboard users can focus the table area and use the left and right arrow keys.</HelpTip></div>
      <div className="min-w-0 overflow-x-auto" role="region" aria-label="Document progress — scroll horizontally for all columns" tabIndex={0}>
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead className="border-b bg-[#f8faf8] text-xs uppercase text-[#617083]"><tr><th scope="col" className="p-4">Document</th><th scope="col">Discipline</th><th scope="col">DCC-accepted issue</th><th scope="col">Issue schedule</th><th scope="col">Earned progress</th></tr></thead>
        <tbody>{rows.map(row=><tr className="border-b last:border-0" key={row.document_id}><td className="p-4"><p className="font-bold text-[#0c5b45]">{row.document_number}</p><p className="mt-1">{row.title}</p></td><td>{row.discipline}</td><td>{row.issue_status??"No accepted revision"}</td><td className={row.overdue?"font-semibold text-[#a5452f]":""}><DocumentIssueSchedule schedule={row}/></td><td><b>{row.progress_credit}%</b></td></tr>)}</tbody>
      </table>
      </div>
    </details>
  </div>;
}

function Metric({label,value,icon}:{label:string;value:string|number;icon:React.ReactNode}){
  return <div className="ev-card min-w-0 p-4 sm:p-5"><span className="text-[#e8733f]">{icon}</span><p className="mt-2 text-2xl font-semibold sm:mt-3">{value}</p><p className="mt-1 text-xs leading-5 text-[#617083]">{label}</p></div>;
}
