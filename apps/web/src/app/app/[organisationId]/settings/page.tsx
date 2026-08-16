import Link from "next/link";
import {ArrowLeft} from "lucide-react";
import {notFound} from "next/navigation";
import {requireUser} from "@/lib/auth";
import {OrganisationAdminForm} from "@/components/record-admin-forms";
import {organisationLogoEndpoint} from "@/lib/organisation-branding";

export default async function OrganisationSettings({params}:{params:Promise<{organisationId:string}>}){
 const {organisationId}=await params;
 const {supabase}=await requireUser();
 const {data:orgData}=await supabase.rpc("get_my_organisations").eq("organisation_id",organisationId).maybeSingle();
 const access=orgData as {organisation_id:string;name:string;slug:string;role:string}|null;
 if(!access||access.role!=="organisation_admin")notFound();
 const {data:branding}=await supabase.from("organisations").select("status,settings,updated_at").eq("id",organisationId).maybeSingle();
 const settings=branding?.settings&&typeof branding.settings==="object"&&!Array.isArray(branding.settings)?branding.settings as Record<string,unknown>:{};
 const logoVersion=typeof settings.logo_updated_at==="string"?settings.logo_updated_at:String(branding?.updated_at??"");
 const org={id:access.organisation_id,name:access.name,status:String(branding?.status??"active"),slug:access.slug,logoUrl:organisationLogoEndpoint(organisationId,logoVersion)};
 return <div className="mx-auto max-w-3xl">
  <Link href={`/app/${organisationId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45]"><ArrowLeft size={16}/> Organisation</Link>
  <p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">Organisation administrator</p>
  <h1 className="mt-2 text-3xl font-semibold">Manage organisation</h1>
  <p className="mb-6 mt-2 text-sm text-[#617083]">Edit company identity, pause the workspace or remove it securely.</p>
  <OrganisationAdminForm record={org}/>
 </div>
}
