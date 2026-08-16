import Link from "next/link";
import {ArrowLeft,ShieldCheck} from "lucide-react";
import {notFound} from "next/navigation";
import {requireProject} from "@/lib/auth";
import {ProjectGovernanceControls} from "@/components/project-governance-controls";

export default async function ProjectAdministrationPage({params}:{params:Promise<{organisationId:string;projectId:string}>}){
 const {organisationId,projectId}=await params;const {supabase,actualRole}=await requireProject(organisationId,projectId);if(actualRole!=="organisation_admin")notFound();
 const [{data:project},{data:policy},{data:backups},{data:connections}]=await Promise.all([
  supabase.from("projects").select("id,code,name,status").eq("organisation_id",organisationId).eq("id",projectId).single(),
  supabase.from("project_backup_policies").select("enabled,provider,connection_id,schedule_frequency,weekday,run_time,destination_path,next_run_at").eq("organisation_id",organisationId).eq("project_id",projectId).maybeSingle(),
  supabase.from("project_backups").select("id,provider,trigger_kind,state,byte_size,external_location,error_code,created_at,completed_at").eq("organisation_id",organisationId).eq("project_id",projectId).order("created_at",{ascending:false}).limit(20),
  supabase.from("cloud_delivery_connections").select("id,provider,display_name").eq("organisation_id",organisationId).eq("status","active").in("provider",["sharepoint","zoho_workdrive"]).order("display_name"),
 ]);
 if(!project)notFound();
 return <div className="mx-auto max-w-[1400px]"><Link href={`/app/${organisationId}/projects/${projectId}/overview`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45]"><ArrowLeft size={16}/> Project overview</Link><header className="mt-6 flex items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#10243e] text-white"><ShieldCheck size={22}/></span><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">Organisation administrator governance</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">{project.code} · Project controls</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#617083]">Control project lifecycle and backups, or inspect another role’s interface without taking operational control from the appointed team.</p></div></header><div className="mt-7"><ProjectGovernanceControls project={{id:project.id,organisationId,code:String(project.code),name:project.name,status:project.status,purgeAfter:null}} policy={policy} backups={backups??[]} connections={connections??[]}/></div></div>;
}
