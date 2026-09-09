import {HelpTip} from "@/components/help-tip";
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
  <h1 className="mt-2 text-3xl font-semibold">Manage organisation <HelpTip label="Organisation settings">Edit company identity, pause the workspace or remove it securely.</HelpTip></h1>

  <OrganisationAdminForm record={org}/>
  <section className="ev-card mt-6 p-5"><h2 className="font-semibold">Executive access <HelpTip label="Executive Viewer role">Privately invite read-only executive viewers to see organisation and project status. They are hidden from ordinary users and project teams.</HelpTip></h2><Link className="ev-button-secondary" href={`/app/${organisationId}/settings/executives`}>Manage Executive Viewers</Link></section>
  <section className="ev-card mt-6 p-5"><h2 className="font-semibold">User account management <HelpTip label="Removed team accounts">Delete login accounts after their project-team appointments have been removed, while preserving project documents and audit history.</HelpTip></h2><Link className="ev-button-secondary" href={`/app/${organisationId}/settings/removed-accounts`}>Manage removed team accounts</Link></section>
 </div>
}
