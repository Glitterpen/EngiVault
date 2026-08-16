import Link from "next/link";
import {AlertTriangle,ArrowLeft,CheckCircle2,Clock3,FileUp} from "lucide-react";
import {requireProject} from "@/lib/auth";
import {projectDeliveryStageLabel,projectTerminalIssueStatus,type ProjectDeliveryStage} from "@/lib/project-delivery-stage";
import {projectHomePath} from "@/lib/role-experience";

type Row={
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
    <h1 className="mt-2 text-3xl font-semibold">Project progress</h1>
    <p className="mt-2 text-sm text-[#617083]">{projectDeliveryStageLabel(deliveryStage)} stage-weighted progress across every active MDR deliverable. A document earns 100% only at {terminalIssueStatus} after DCC acceptance.</p>

    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Metric label="Stage-weighted progress" value={`${overall}%`} icon={<Clock3/>}/>
      <Metric label="Planned scope" value={rows.length} icon={<Clock3/>}/>
      <Metric label="Files uploaded" value={uploaded} icon={<FileUp/>}/>
      <Metric label="Stage accepted" value={stageAccepted} icon={<CheckCircle2/>}/>
      <Metric label="Terminal-stage issued" value={terminalIssued} icon={<CheckCircle2/>}/>
      <Metric label="Overdue" value={overdue} icon={<AlertTriangle/>}/>
    </div>

    <section className="mt-6 grid gap-4 md:grid-cols-2">
      {disciplines.map(name=>{
        const scoped=rows.filter(row=>row.discipline===name);
        const weight=scoped.reduce((sum,row)=>sum+Number(row.progress_weight),0);
        const credit=weight?Math.round(scoped.reduce((sum,row)=>sum+Number(row.progress_weight)*row.progress_credit/100,0)/weight*100):0;
        return <article className="ev-card p-5" key={name}>
          <div className="flex justify-between"><h2 className="font-semibold">{name}</h2><b className="text-[#0c5b45]">{credit}%</b></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e4ebe7]"><div className="h-full bg-[#e8733f]" style={{width:`${credit}%`}}/></div>
          <p className="mt-3 text-xs text-[#617083]">{scoped.filter(row=>row.progress_credit>0).length} of {scoped.length} stage-issued · {scoped.filter(row=>row.progress_credit===100).length} terminal-stage issued</p>
        </article>;
      })}
    </section>

    <div className="ev-card mt-6 overflow-x-auto">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead className="border-b bg-[#f8faf8] text-xs uppercase text-[#617083]"><tr><th className="p-4">Document</th><th>Discipline</th><th>DCC-accepted issue</th><th>Final milestone date</th><th>Earned progress</th></tr></thead>
        <tbody>{rows.map(row=><tr className="border-b last:border-0" key={row.document_id}><td className="p-4"><p className="font-bold text-[#0c5b45]">{row.document_number}</p><p className="mt-1">{row.title}</p></td><td>{row.discipline}</td><td>{row.issue_status??"No accepted revision"}</td><td className={row.overdue?"font-semibold text-[#a5452f]":""}>{row.planned_submission_date??"Not planned"}</td><td><b>{row.progress_credit}%</b></td></tr>)}</tbody>
      </table>
    </div>
  </div>;
}

function Metric({label,value,icon}:{label:string;value:string|number;icon:React.ReactNode}){
  return <div className="ev-card p-5"><span className="text-[#e8733f]">{icon}</span><p className="mt-4 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs uppercase text-[#617083]">{label}</p></div>;
}
