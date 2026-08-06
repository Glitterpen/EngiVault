import Link from "next/link";
import { ArrowRight, ClipboardList, CreditCard, FolderKanban } from "lucide-react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ProjectCreateForm } from "@/components/project-create-form";

export default async function OrganisationPage({params}:{params:Promise<{organisationId:string}>}){
  const {organisationId}=await params;
  const {supabase}=await requireUser();
  const {data:orgData}=await supabase.rpc("get_my_organisations").eq("organisation_id",organisationId).maybeSingle();
  const org=orgData as {organisation_id:string;name:string;role:string}|null;
  if(!org)notFound();
  const {data:projectData}=await supabase.rpc("get_accessible_projects",{target_org:organisationId});
  const projects=(projectData??[]) as Array<{project_id:string;code:string;name:string;role:string}>;
  const canCreate=org.role==="organisation_admin";
  return <div className="mx-auto max-w-6xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">Organisation</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">{org.name}</h1><p className="mt-2 text-[#617083]">Projects available through your active membership.</p></div>{canCreate&&<div className="flex gap-2"><Link className="ev-button-secondary" href={`/app/${organisationId}/audit`}><ClipboardList size={16}/> Audit log</Link><Link className="ev-button-secondary" href={`/app/${organisationId}/subscription`}><CreditCard size={16}/> Plan & usage</Link></div>}</div><div className={`mt-8 grid gap-5 ${canCreate?"lg:grid-cols-[1fr_360px]":""}`}><section className="grid content-start gap-3">{projects?.length?projects.map(p=><Link href={`/app/${organisationId}/projects/${p.project_id}/documents`} key={p.project_id} className="ev-card flex items-center gap-4 p-5"><span className="grid size-12 place-items-center rounded-xl bg-[#fff0e9] text-[#e8733f]"><FolderKanban/></span><div className="flex-1"><p className="text-xs font-bold text-[#e8733f]">{p.code}</p><h2 className="mt-1 font-semibold">{p.name}</h2><p className="mt-1 text-xs text-[#617083]">{String(p.role).replaceAll("_"," ")}</p></div><ArrowRight size={18}/></Link>):<div className="ev-card p-10 text-center text-[#617083]">No authorised projects yet.</div>}</section>{canCreate&&<ProjectCreateForm organisationId={organisationId}/>}</div></div>
}
