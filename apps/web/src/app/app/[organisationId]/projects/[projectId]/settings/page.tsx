import Link from "next/link";
import {ArrowLeft} from "lucide-react";
import {notFound} from "next/navigation";
import {requireProject} from "@/lib/auth";
import {ProjectAdminForm} from "@/components/record-admin-forms";

export default async function ProjectSettings({params}:{params:Promise<{organisationId:string;projectId:string}>}){
  const {organisationId,projectId}=await params;
  const {supabase,access}=await requireProject(organisationId,projectId);
  if(String(access.role)!=="project_admin")notFound();
  const {data:project}=await supabase.from("projects").select("id,organisation_id,code,name,description,status,client_name,facility_location,client_logo_paths").eq("organisation_id",organisationId).eq("id",projectId).maybeSingle();
  if(!project)notFound();
  return <div className="mx-auto max-w-3xl"><Link href={`/app/${organisationId}/projects/${projectId}/overview`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45]"><ArrowLeft size={16}/> Project overview</Link><p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">Project Manager control</p><h1 className="mb-6 mt-2 text-3xl font-semibold">Project information</h1><ProjectAdminForm record={project as {id:string;organisation_id:string;code:string;name:string;description:string|null;status:string;client_name:string|null;facility_location:string|null;client_logo_paths:string[]}}/></div>;
}
